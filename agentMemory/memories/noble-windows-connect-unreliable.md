---
name: noble-windows-connect-unreliable
description: On Windows, LT700_40 nominally "connects" but shows as Unknown device, never delivers notify data, and writes eventually fail with "Disconnected unknown" — LT600_01 works fine on the same machine
tags: [ble, windows, bug, unresolved]
---

**Status as of 2026-09-07: UNRESOLVED. Start here if you're picking this
up on a Windows machine. This corrects an earlier, less precise write-up
— an in-progress note briefly described this as a "connect() hangs
forever" bug before the full symptom was known; it does not hang.**

## Exact symptom (user-reported, real Windows hardware)

Both `LT600_01` and `LT700_40` reach `status: 'connected'` in the app —
`connectAsync()` does resolve for both, unlike the (separately fixed, see
[[noble-mac-connect-hang-fix]]) macOS bug where it never resolved at all.
But after that:

- **`LT600_01`**: shows correctly (paired/known) in Windows' own
  Bluetooth device list. Incoming notify messages appear in the app's
  terminal normally. Works end-to-end.
- **`LT700_40`**: shows as **"Unknown device"** in Windows' Bluetooth
  settings (this is the *same visible symptom* that originally motivated
  the [[noble-windows-fork-migration]] away from `@abandonware/noble` —
  it's back, but now only for this one device, after already switching
  libraries). No incoming/notify messages ever appear in the terminal —
  not just SIP replies, *nothing* arrives from the device. Writing a SIP
  command sends without an immediate error but gets no response.
  Pressing Disconnect sometimes throws (surfaces in the renderer as):
  `Error invoking remote method 'device:write-sip': Error: Disconnected unknown`

## What that error actually means (traced, not guessed)

`Error: Disconnected unknown` is thrown by `@stoprocent/noble` itself —
`node_modules/@stoprocent/noble/lib/noble.js`, `_withDisconnectHandler()`
(~line 917): it races every characteristic operation (write/read/
subscribe) against a `disconnect:${peripheralId}` event, and if a
disconnect fires mid-operation it rejects with `Disconnected ${reason}`.
`reason` here is `"unknown"` — meaning **the peripheral disconnected (or
was already effectively disconnected) while the SIP write was in
flight**, not that the write call itself failed for some other reason.
This — plus zero notify data ever arriving, plus "Unknown device" in
Windows' own UI — points at the GATT connection to `LT700_40` never being
*fully*/properly established at the Windows Bluetooth-stack level, even
though the app-visible `connect` event fired and `status` shows
`connected`. `LT600_01` presumably has a prior OS-level pairing
relationship (exactly the theory that explained the macOS bug — see
[[noble-mac-connect-hang-fix]] for how that was confirmed there via
`system_profiler SPBluetoothDataType`); `LT700_40` likely doesn't, and
Windows/WinRT may be silently limiting or dropping the connection because
of that (rather than macOS's failure mode of never calling back
`connect()` at all).

**Do not assume this is caused by the exact same code path as the mac
fix** — Windows uses a completely different binding
(`lib/win/src/*`, WinRT-based `Windows.Devices.Bluetooth`, not
CoreBluetooth), written by different people, with its own connect/GATT
implementation. The *shape* — devices lacking prior OS pairing behave
unreliably — rhymes strongly, but the actual native code responsible for
notify subscriptions silently not delivering data, and for the spurious
mid-operation disconnect, is very likely different code than the mac
fix's `didDiscoverPeripheral:`/`self.peripherals` issue. Read the real
Windows binding source before touching anything.

## How the macOS bug was actually found (repeat this method on Windows)

1. Reproduced outside Electron entirely: installed `@stoprocent/noble` in
   an isolated scratch npm project (`npm init -y && npm install
   @stoprocent/noble`, elsewhere, not inside this repo's `node_modules`)
   and wrote a small script that scans, connects, subscribes to notify,
   writes, and logs every event/timestamp/state — bare Node, no
   Electron, no app code. This isolates library/OS behavior from
   anything Electron- or app-specific. Do the same here: reproduce the
   "connects but no notify data + eventual spurious disconnect" pattern
   with `LT700_40` standalone before touching any project code.
2. Compare against Windows' own Bluetooth settings / paired-device state
   for both devices (the mac equivalent was `system_profiler
   SPBluetoothDataType`, which showed `LT600_01` had a real cached MAC
   address/pairing entry and `LT700_40` had none) — on Windows, check
   Settings → Bluetooth & devices, and `Get-PnpDevice -Class Bluetooth`
   in PowerShell, for both devices. Confirm or rule out the "no prior
   pairing relationship" theory directly.
3. Once a plausible native-code cause is found by actually reading
   `node_modules/@stoprocent/noble/lib/win/src/*` (not guessing from
   docs/README — that's exactly how the mac bug was found: read
   `ble_manager.mm`'s actual `didDiscoverPeripheral:`/`connect:` methods
   line by line), verify a fix two ways before touching this repo: (a)
   patch the source in `node_modules` directly, run `node-gyp rebuild`
   by hand inside `lib/win` (needs a working native build toolchain —
   Visual Studio Build Tools with the "Desktop development with C++"
   workload, since this is a Windows native addon; check `binding.gyp`
   in `lib/win/` for exact requirements), and re-run the standalone
   script against the real device; (b) *then* confirm electron-forge's
   existing `rebuildConfig`/`AutoUnpackNativesPlugin` pipeline actually
   force-rebuilds this native module from source on Windows too (it does
   on mac — confirmed by checking that
   `node_modules/@stoprocent/noble/build/Release/*.node` gets freshly
   regenerated, with today's timestamp and a size matching a real
   compile rather than a copy of the shipped prebuilt, after `npm
   start`) — if so, a `patch-package` patch to the source is sufficient
   and no custom rebuild script is needed, same as the mac fix.
4. If a fix is found, add it to the *same*
   `patches/@stoprocent+noble+<version>.patch` file — `npx patch-package
   @stoprocent/noble` regenerates it from whatever's currently patched in
   `node_modules`, so it naturally captures both platforms' fixes in one
   diff as long as the mac patch is already applied when you regenerate
   it. Don't hand-merge patch files. Then fold this file's content into a
   corrected `-fix` writeup (mirroring
   [[noble-mac-connect-hang-fix]]'s shape) and update
   [[noble-windows-fork-migration]] and `PROJECT.md`'s Known gaps to say
   Windows is fully resolved.

## Where to look

- `node_modules/@stoprocent/noble/lib/win/src/` — the actual WinRT C++
  binding source; `lib/win/bindings.js` is the thin JS wrapper
  (analogous to `lib/mac/bindings.js`).
- `node_modules/@stoprocent/noble/lib/noble.js` — shared JS layer,
  platform-agnostic; `_withDisconnectHandler` (~line 917),
  `connect()`/`connectAsync()`/`_onConnect()` (~lines 380-430),
  `subscribeAsync`/notify wiring. Same file/code regardless of platform —
  only the native binding differs.
- `src/electron/main/services/bleService.ts` —
  `subscribeToNotifications()` and `writeGenericCommand()` are where the
  app-level symptoms (no notify data, the SIP write failing) actually
  surface; not where the bug lives, but useful for adding temporary
  diagnostic logging while investigating.
- Upstream `stoprocent/noble` GitHub issues — search "windows", "WinRT",
  "notify", "disconnect" specifically. The search done for the mac bug
  found several *already-fixed* connection-queue-deadlock issues on the
  HCI binding (e.g. #112/#116/#119) that turned out to be irrelevant —
  don't assume a similarly-titled closed issue is this bug without
  reading its actual diff.
