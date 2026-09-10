---
name: noble-windows-connect-unreliable
description: On Windows, LT700_40 nominally "connects" but shows as Unknown device, never delivers notify data, and writes eventually fail with "Disconnected unknown" — LT600_01 works fine on the same machine
tags: [ble, windows, bug, unresolved]
---

**Status as of 2026-09-07: RESOLVED and confirmed on real `LT700_40`
hardware** — `BLEManager::OnPaired: pairing result status=Paired`, device
connects, and works exactly as expected end-to-end. Two independent bugs
were involved (see below); both are fixed. This file is kept as the full
investigation trail — start here if a similar Windows BLE issue recurs on
a new device, since the debugging method (reproduce, decode the real ATT/
pairing error instead of trusting the library's surface-level one,
research the WinRT API's known limitations) generalizes even if the exact
fix doesn't.

## Patch applied

`OnWrite`, `OnNotify`, `OnWriteValue`, `OnWriteHandle` in
`node_modules/@stoprocent/noble/lib/win/src/ble_manager.cc` now use
`CHECK_STATUS_AND_RESULT` exactly like the read paths, so a real
`GattCommunicationStatus` failure will actually surface instead of being
reported as success. Captured in `patches/@stoprocent+noble+2.8.0.patch`
alongside the existing mac patch (regenerated via `npx patch-package
@stoprocent/noble`, which now produces a 2-file diff:
`lib/mac/src/ble_manager.mm` + `lib/win/src/ble_manager.cc`).

**Important, newly discovered gotcha**: `@stoprocent/noble`'s own
`install` script is `node-gyp-build`, and the package ships prebuilt
N-API binaries in `prebuilds/win32-x64/node.napi.node` (and every other
platform/arch). `node-gyp-build` prefers a real `build/Release/*.node`
over the shipped prebuild, but **`npx electron-rebuild -f -w
@stoprocent/noble` alone did NOT trigger a real compile** — it exited
"Rebuild Complete" instantly with no `build/Release` output at all,
meaning without extra care native changes here can silently never take
effect (this is exactly the failure mode the mac patch's writeup already
warned to watch for). The fix: pass **`--build-from-source`** explicitly:

```
npx electron-rebuild -f --build-from-source -w @stoprocent/noble -v <electron version>
```

This produced a genuine fresh compile (`build/Release/binding.node`,
freshly timestamped, `ble_manager.obj` rebuilt from the patched source —
confirmed 2026-09-07). **Do not assume electron-forge's
`rebuildConfig`/`AutoUnpackNativesPlugin` pipeline forces
`--build-from-source` on Windows the same way it apparently does on
mac** (mac's writeup confirmed a fresh compile via plain `npm start`,
Windows was not independently re-verified here) — if a future `npm
start`/`make`/`package` on Windows stops showing a freshly-timestamped
`build/Release/binding.node` after installing/patching, this is why: it
silently fell back to the unpatched prebuilt binary. If that happens,
rerun the `electron-rebuild --build-from-source` command above by hand,
or ideally get `--build-from-source` wired into the project's install
flow so this doesn't depend on memory.

Two `.node` files land in `build/Release/` (`binding.node` — the actual
WinRT addon, `lib/win/binding.gyp`'s target — and `noble.node`, an empty
aggregator from the root `binding.gyp`, sources-less on Windows).
`node-gyp-build` resolves to whichever sorts first in that directory's
listing, which is `binding.node` — the correct one. Not a new risk
introduced by this patch, just documenting it since it looks alarming
when you `ls` the directory.

**2026-09-07, confirmed on real `LT700_40` hardware: the masking bug was
real.** With the patch applied, connecting now throws instead of
silently "succeeding":
`Error occurred in handler for 'ble:connect': [Error: Protocol error]`
— this fires from `subscribeToNotifications()`'s `characteristic
.subscribeAsync()` in `bleService.ts` (the CCCD write for the command
characteristic), exactly as predicted.

`GattCommunicationStatus::ProtocolError` alone doesn't say *which* ATT
error caused it, so `gattStatusToString` couldn't distinguish
"needs pairing" from anything else. Added a second layer: WinRT exposes
the actual single-byte ATT error code via a separate nullable
`GattWriteResult.ProtocolError()` property; added `attErrorCodeToString()`
(maps the standard Bluetooth Core Spec ATT error codes, flagging 0x05/
0x08/0x0F specifically as "device likely requires pairing/bonding") and
a `gattWriteStatusToString()` helper, wired through a new
`CHECK_WRITE_STATUS_AND_RESULT` macro (mirrors `CHECK_STATUS_AND_RESULT`
but decodes the ATT code) used by all 4 write-path handlers. Patched,
rebuilt from source, and captured in the same
`patches/@stoprocent+noble+2.8.0.patch`.

**2026-09-07, confirmed on real hardware: the decoded error was**
`Protocol error: Insufficient Authentication (device likely requires
pairing/bonding)` — ATT code 0x05. This nails down the root cause
completely: `LT700_40`'s command characteristic requires a
paired/authenticated link, the app never established one, and (before
the `CHECK_WRITE_STATUS_AND_RESULT` fix above) the native binding hid
that failure entirely.

## Fix applied: `bleService.ts` now pairs on Windows before subscribing

Added `BleService.pairIfNeeded()` in `src/electron/main/services/bleService.ts`,
called right after `peripheral.connectAsync()` and before
service/characteristic discovery. Windows-only (`process.platform ===
'win32'`) since `@stoprocent/noble`'s mac/linux bindings reject
`pairAsync()` outright with "Pairing is not supported on this platform"
— calling it unconditionally would have broken the already-working mac
flow. Uses `peripheral.pairAsync()` with library defaults
(`DevicePairingKinds.ConfirmOnly` + `DevicePairingProtectionLevel
.Encryption`) — Windows' `Custom Pairing` API lets the native binding
`Accept()` the ceremony itself (see `Pair()`'s `PairingRequested`
handler in `ble_manager.cc`), so this does not pop any visible OS dialog
for a "Just Works"-style peripheral.

Deliberately **best-effort and non-fatal**: wrapped in try/catch, only
logs a warning on failure, never throws. This matters because
`LT600_01` doesn't need pairing — native `Pair()` returns success
immediately if already paired, or fails if `CanPair()` is false, and
either way must not block `LT600_01`'s connect flow, which already
worked before this change. If a device genuinely needs pairing and it
fails here, the exact same decoded ATT error still surfaces moments
later from `subscribeToNotifications()`, so this call can only help, not
regress anything.

**2026-09-07, first real-hardware test of the pairing fix failed, but
usefully**: log showed
`BLEManager::OnPaired: pairing result status=RequiredHandlerNotRegistered`,
then `pairAsync failed`, then connect ultimately threw `Error:
Disconnected unknown` (the peripheral dropped the link after the failed
pairing attempt, races the in-flight operation — same
`_withDisconnectHandler` mechanism documented above). Root cause of
*this* failure: `pairIfNeeded()` called `peripheral.pairAsync()` with no
`kind` argument, so `noble.js` defaulted to `DevicePairingKinds
.ConfirmOnly` only. `DevicePairingResultStatus.RequiredHandlerNotRegistered`
fires when `DeviceInformationCustomPairing.PairAsync(kinds, ...)`
determines the ceremony Windows/the peripheral actually negotiate isn't
covered by the `kinds` bitmask we passed — it fails immediately, before
our native `PairingRequested` handler ever runs (no "pairing requested,
kind=" log line appeared, confirming this).

**Fix**: `pairIfNeeded()` now requests every ceremony kind the native
binding is willing to auto-accept without real secret input —
`DevicePairingKinds.ConfirmOnly | DisplayPin | ConfirmPinMatch` (`ble_manager.cc`'s
`Pair()` only refuses `ProvidePin`/`ProvidePassword`/`ConfirmPassword`,
which need a UI this app doesn't have) — so whichever kind actually gets
negotiated is covered instead of guessing one.

**2026-09-07, second real-hardware attempt (broadened `kinds` to
`ConfirmOnly | DisplayPin | ConfirmPinMatch`) failed identically** —
same `RequiredHandlerNotRegistered`, and critically the native
`PairingRequested` handler's "pairing requested, kind=" log line *still
never appeared*, proving this was never about which `DevicePairingKinds`
we advertised. Windows was rejecting the Custom-pairing ceremony before
ever asking our handler to accept anything, for either kind set.

Researched externally (see sources below) and found this matches a
known, Microsoft-confirmed limitation: `DeviceInformationCustomPairing`
(the `.Custom()` path, which is what `ble_manager.cc`'s `Pair()` always
used) can fail to route a peripheral's actual negotiated ceremony into
any app-supplied `DevicePairingKinds` mask at all, on some
peripheral/Windows-version combinations — regardless of which kinds the
app requests — while the plain, ceremony-agnostic
`DeviceInformationPairing::PairAsync(protectionLevel)` overload (no
`.Custom()`, no `PairingRequested` handler, no `kinds` — Windows owns
the entire pairing UI/ceremony itself) succeeds where Custom pairing
does not. This is literally Microsoft's own posted fix for a
near-identical "UWP BLE not working for authenticated attributes"
report.
- [BLE pairing without bonding – Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/633780/ble-pairing-without-bonding) — also confirms, separately, that Windows' Bluetooth stack does not support *unbonded* encrypted LE links at all ("by design" per Microsoft engineers); if a peripheral truly refuses to bond, no app-side fix exists — relevant if the plain-PairAsync fix below still doesn't work.
- [UWP BLE not working for authenticated attributes – Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/1848957/uwp-ble-not-working-for-authenticated-attributes) — the exact "avoid Custom pairing, use `DeviceInformationPairing.PairAsync(protectionLevel)` instead" fix this was based on.

## Fix applied: switched `Pair()` off Custom pairing entirely

Rewrote `BLEManager::Pair()`/`OnPaired()` in `ble_manager.cc` (+ the
`OnPaired` declaration in `ble_manager.h`) to call
`device.DeviceInformation().Pairing().PairAsync(protectionLevel)`
directly instead of going through `.Custom()`. Removed the
`PairingRequested` handler, the `kinds`-matching logic, and the
PIN/password `unsupportedKinds` rejection entirely — none of that
machinery is reachable anymore since Windows now owns the ceremony
end-to-end (it can even prompt the user for a PIN itself if a device
genuinely needs one, which is a capability the removed Custom-pairing
code explicitly could not offer). The `kinds` parameter is still
accepted in `Pair()`'s signature (for JS API / cross-platform
compatibility — `bleService.ts`'s call site is unchanged) but is now
unused on Windows. Patched, rebuilt from source (confirmed fresh
`build/Release/binding.node`, smaller than before matching the removed
code), captured in `patches/@stoprocent+noble+2.8.0.patch` (now 3 files:
mac `.mm`, win `.cc`, win `.h`).

**2026-09-07, CONFIRMED FIXED on real `LT700_40` hardware**:
`BLEManager::OnPaired: pairing result status=Paired`, device connects,
notify data and writes work end-to-end, exactly as expected. No
reconnect-after-pair cycle was needed — discovery/subscribe happening
*after* `pairIfNeeded()` in `bleService.ts`'s existing `connect()` order
was sufficient.

## Summary of the two bugs fixed (for anyone landing here fresh)

1. **`@stoprocent/noble`'s Windows binding silently swallowed real GATT
   write/notify failures.** Every write-path completion handler
   (`OnWrite`, `OnNotify`, `OnWriteValue`, `OnWriteHandle` in
   `lib/win/src/ble_manager.cc`) checked only whether the WinRT async
   call completed, never the actual `GattCommunicationStatus` — unlike
   every read-path handler, which already did. Fixed by routing all four
   through a new `CHECK_WRITE_STATUS_AND_RESULT` macro (mirrors the
   existing `CHECK_STATUS_AND_RESULT`), plus ATT-error-code decoding
   (`attErrorCodeToString`) so a `ProtocolError` names the real reason
   (e.g. "Insufficient Authentication") instead of a bare status name.
   This alone didn't fix connectivity — it turned a silent failure into
   a visible, diagnosable one, which is what led to bug #2.
2. **`LT700_40` needs a real Windows-level paired/bonded link that the
   app never established.** `bleService.ts` never called
   `pair()`/`pairAsync()` at all. Added `BleService.pairIfNeeded()`
   (Windows-only, best-effort/non-fatal), called right after
   `connectAsync()`. Getting the *pairing call itself* to succeed took
   two more iterations: the native `Pair()` originally used
   `DeviceInformationCustomPairing` (`.Custom()`), which reliably failed
   with `RequiredHandlerNotRegistered` against this device regardless of
   which `DevicePairingKinds` were requested; switched to the plain
   `DeviceInformationPairing.PairAsync(protectionLevel)` overload
   (Microsoft's own documented fix for the same symptom elsewhere),
   which succeeded.

## Platform impact — Windows-only, mac unaffected

Every part of this fix is scoped so it cannot touch macOS:
- The `CHECK_WRITE_STATUS_AND_RESULT` fix and the `Pair()`/`OnPaired()`
  rewrite are both entirely inside `lib/win/src/ble_manager.cc` /
  `ble_manager.h` — files macOS's binding (`lib/mac/src/ble_manager.mm`)
  doesn't share or include.
- `bleService.ts`'s `pairIfNeeded()` starts with `if (process.platform
  !== 'win32') return;` — a no-op on mac/linux by construction, not just
  by the library rejecting pairing.
- The mac patch (from [[noble-mac-connect-hang-fix]]) was not touched
  this session; it's still in `patches/@stoprocent+noble+2.8.0.patch`
  unchanged, alongside the new Windows-only hunks.

## Not yet re-verified

Only dev (`npm start`) was tested, on both platforms historically. Packaged
(`npm run make`/`package`) builds have not been re-verified since these
fixes — the same `electron-rebuild --build-from-source` caveat documented
below applies to whatever native-rebuild step packaging uses too; confirm
a freshly-timestamped `build/Release/binding.node` actually ships inside
a packaged build before considering Windows fully done end-to-end.

## Root cause (found in `node_modules/@stoprocent/noble/lib/win/src/ble_manager.cc`, v2.8.0)

Every *read*-style GATT completion handler in this file
(`OnGetServices`, `OnGetIncludedServices`, `OnGetCharacteristics`,
`OnReadValue`, `OnGetDescriptors`, descriptor `OnReadValue`,
`OnReadHandle` — lines 675/726/777/827/1042/1090/1171) goes through the
`CHECK_STATUS_AND_RESULT` macro (line 85), which correctly checks *two*
things: the WinRT `AsyncStatus` (did the async operation itself
complete/error/cancel) **and** the real `GattCommunicationStatus` from
`asyncOp.GetResults().Status()` (did the GATT operation itself succeed —
`Success` vs `Unreachable`/`ProtocolError`/`AccessDenied`).

Every *write*-style completion handler — `OnWrite` (~874, plain
characteristic writes), **`OnNotify` (~970, the CCCD
subscribe/unsubscribe write that `characteristic.subscribeAsync()` in
`noble.js` depends on)**, `OnWriteValue` (~1136, descriptor writes), and
`OnWriteHandle` (~1196) — only checks `AsyncStatus == Completed` and, if
so, unconditionally emits success. **None of them ever call
`asyncOp.GetResults().Status()`.** So if the WinRT async operation
completes but the actual GATT write returned a non-`Success`
`GattCommunicationStatus` (most plausibly `AccessDenied` — the standard
WinRT result when a characteristic/descriptor requires pairing or an
encrypted link that hasn't been established — or `Unreachable`), this
binding reports it to JS as an unconditional success.

This exactly explains every observed `LT700_40` symptom:

- **Notify "succeeds" but nothing ever arrives**: `Notify(uuid, ...,
  true)` fires (so `subscribeAsync()` in `noble.js` resolves, the app
  believes it's subscribed) even though the CCCD write to the real
  device may have come back `AccessDenied`. The characteristic's
  Client Characteristic Configuration Descriptor was never actually
  written on the peripheral, so it never sends notifications — matches
  "no incoming/notify messages ever appear... not just SIP replies,
  nothing arrives".
- **SIP write "sends without an immediate error but gets no response"**:
  same masking bug in `OnWrite` — the write call can resolve successfully
  in the app even if the underlying GATT write failed.
- **Eventual `Error: Disconnected unknown`**: consistent with a GATT
  link that was never properly authenticated/secured; Windows or the
  peripheral itself tears down a connection that isn't doing anything
  functional, and the next in-flight operation races the real
  `disconnect` event in `noble.js`'s `_withDisconnectHandler`
  (~line 917) — see prior write-up below, still accurate.
- **"Unknown device" in Windows' Bluetooth settings**: consistent with
  `LT700_40` never completing a real OS-level pairing/bonding —
  `BLEManager::Connect` (line ~303) goes straight to
  `BluetoothLEDevice::FromBluetoothAddressAsync`, with **no pairing step
  at any point** — `BLEManager::Pair()` (line 391) is a fully separate
  method, and `bleService.ts` never calls `noble`'s `pair`/`pairAsync` at
  all. If `LT700_40`'s GATT server requires an encrypted/authenticated
  link for its notify characteristic (unlike `LT600_01`, which
  presumably doesn't require it, or already has some prior OS
  relationship), the app has no path today that would ever establish
  that — and even if it silently failed to, this binding wouldn't tell
  it.

## Why this wasn't caught by the "no prior pairing" theory alone

The original theory (see [[noble-mac-connect-hang-fix]] for the mac
analog) was right in spirit — `LT700_40` likely needs a real paired/
bonded link that it doesn't have — but the reason it manifests as
*silent* data loss rather than a visible error is this separate,
independent bug: the Windows binding's write-path handlers don't surface
`GattCommunicationStatus` failures at all. Both are real and both should
be addressed:

1. The binding bug (masking real GATT failures on every write path) —
   fixable purely in `ble_manager.cc`, low risk, mirrors the existing
   `CHECK_STATUS_AND_RESULT` pattern already proven correct for every
   read path.
2. Whatever actually causes `LT700_40`'s writes to fail at the GATT
   level in the first place (most likely: needs pairing this app never
   requests) — only knowable *after* fix #1 stops masking the real
   error. Fix #1 first; it will very likely turn the current silent
   failure into a visible `AccessDenied` (or similar) that confirms or
   rules out the pairing theory directly, without any guessing.

## Suggested fix (not yet applied — apply and verify before closing this out)

In `node_modules/@stoprocent/noble/lib/win/src/ble_manager.cc`, change
`OnWrite`, `OnNotify`, `OnWriteValue`, and `OnWriteHandle` to use the same
`CHECK_STATUS_AND_RESULT(status, result, emit)` macro the read paths use
— i.e. call `asyncOp.GetResults()` and check `.Status()` before reporting
success, same shape as e.g. `OnReadHandle` (~1161-1184). Then:

1. Regenerate `patches/@stoprocent+noble+2.8.0.patch` via `npx
   patch-package @stoprocent/noble` (this already has the mac patch
   applied in `node_modules` — regenerating naturally captures both
   platforms in one diff, per the existing project convention; don't
   hand-merge patch files).
2. Rebuild the native module from source on Windows (needs Visual Studio
   Build Tools, "Desktop development with C++" — this repo's
   electron-forge `rebuildConfig`/`AutoUnpackNativesPlugin` should do
   this automatically on `npm start`, same as confirmed for mac; verify
   the `.node` binary's timestamp/size actually changes) and re-test
   against real `LT700_40` hardware.
3. If the now-surfaced error is `AccessDenied` (or similar
   security/auth-related status), that confirms the missing-pairing
   theory — the real fix is then to call `noble`'s `pair`/`pairAsync`
   (already implemented in `lib/win/src/ble_manager.cc`'s `Pair()` and
   exposed via `noble.js`'s `pair()`/`pairAsync()`, just never invoked
   anywhere in this app) as part of the Windows BLE connect flow in
   `bleService.ts`, most likely before `subscribeToNotifications()`.
   That would be a `bleService.ts` change in this repo, not another
   noble patch.
4. If the error is something else (`Unreachable`, `ProtocolError`), that
   rules out pairing and points elsewhere — re-open investigation from
   there rather than assuming pairing is the answer.

Not yet done: the actual patch, the native rebuild, and hardware
re-verification. Do all three before declaring Windows fixed, and fold
the confirmed fix into a `-fix`-named write-up (mirroring
[[noble-mac-connect-hang-fix]]'s shape) plus updates to
[[noble-windows-fork-migration]] and `PROJECT.md`'s Known gaps, exactly
as this file already asked for prior to this update.

## Original exact symptom (still accurate, kept for reference)

Both `LT600_01` and `LT700_40` reach `status: 'connected'` in the app —
`connectAsync()` does resolve for both, unlike the (separately fixed, see
[[noble-mac-connect-hang-fix]]) macOS bug where it never resolved at all.

- **`LT600_01`**: shows correctly (paired/known) in Windows' own
  Bluetooth device list. Incoming notify messages appear in the app's
  terminal normally. Works end-to-end.
- **`LT700_40`**: shows as "Unknown device" in Windows' Bluetooth
  settings. No incoming/notify messages ever appear in the terminal.
  Writing a SIP command sends without an immediate error but gets no
  response. Pressing Disconnect sometimes throws (surfaces in the
  renderer as): `Error invoking remote method 'device:write-sip': Error:
  Disconnected unknown`.

`Error: Disconnected unknown` is thrown by `@stoprocent/noble` itself —
`node_modules/@stoprocent/noble/lib/noble.js`, `_withDisconnectHandler()`
(~line 917): it races every characteristic operation (write/read/
subscribe) against a `disconnect:${peripheralId}` event, and if a
disconnect fires mid-operation it rejects with `Disconnected ${reason}`.
`reason` here is `"unknown"`.

## Where to look

- `node_modules/@stoprocent/noble/lib/win/src/ble_manager.cc` — root
  cause is here: `OnWrite` (~874), `OnNotify` (~970), `OnWriteValue`
  (~1136), `OnWriteHandle` (~1196) vs. the correct `CHECK_STATUS_AND_RESULT`
  pattern (~85, used by every read-path handler). `Pair()` (~391) is the
  never-called pairing entry point.
- `node_modules/@stoprocent/noble/lib/noble.js` — shared JS layer;
  `_withDisconnectHandler` (~917), `pair`/`pairAsync` (~439/519,
  unused by this app), `subscribeAsync`/notify wiring.
- `src/electron/main/services/bleService.ts` —
  `subscribeToNotifications()` (~121) and `writeGenericCommand()` (~255)
  are where the app-level symptoms surface; never calls `pair`/
  `pairAsync`. This is where a pairing-theory fix (step 3 above) would
  go, but only after confirming via step 1-2 that `AccessDenied` is
  actually the surfaced error.
