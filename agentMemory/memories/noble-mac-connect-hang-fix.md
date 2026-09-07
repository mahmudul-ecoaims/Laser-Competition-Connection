---
name: noble-mac-connect-hang-fix
description: @stoprocent/noble's macOS binding silently hangs connect() for peripherals with no prior OS bonding; fixed via a patch-package patch
tags: [ble, macos, bug, patch-package]
---

Symptom: on macOS, some BLE peripherals connect instantly via `bleService.ts`
while others (same app, same session, same service UUID — e.g. discovered
fine, name/RSSI shown) get stuck in `status: 'connecting'` forever. No
error, no `disconnect`, no timeout — `peripheral.state` just stays
`'connecting'`. Reproduced identically outside Electron (bare Node) and
with the old `@abandonware/noble` too, which ruled out both Electron and
the [[noble-windows-fork-migration]] as the cause.

Root cause (found by reading `@stoprocent/noble@2.8.0`'s actual mac binding
source, `lib/mac/src/ble_manager.mm`, both the installed copy and upstream
`main` — bug is present in both, not fixed as of 2026-09-07): the
`didDiscoverPeripheral:` delegate never caches the live `CBPeripheral`
reference into `self.peripherals`. So every `connect:` call falls back to
`[self.centralManager retrievePeripheralsWithIdentifiers:@[identifier]]` —
which is unreliable for a peripheral macOS has no prior OS-level
bonding/pairing relationship with (confirmed via `system_profiler
SPBluetoothDataType`: the peripheral that failed to connect had no entry
there at all; one from the same vendor that connected fine did, from being
manually connected via System Settings once). When that lookup comes back
empty, `BLEManager.connect:` (ObjC, returns `BOOL`) returns `NO` — and the
N-API wrapper (`NobleMac::Connect` in `noble_mac.mm`) discards that return
value with zero error propagation to JS. `connectAsync()`'s promise is
left waiting on a `connect:${id}` event that will now never fire.

Fix: `patches/@stoprocent+noble+2.8.0.patch` (applied via `patch-package`,
wired into `postinstall`) adds two lines to `didDiscoverPeripheral:` in
`ble_manager.mm` — set `peripheral.delegate = self` and cache the
peripheral into `self.peripherals` right when CoreBluetooth first hands it
to the app, exactly like `connect:`'s fallback already does, just done
proactively instead of relying on a later re-lookup. This makes `connect:`
find the peripheral directly for every device that was ever discovered via
scan in the current session, without touching the flaky
`retrievePeripheralsWithIdentifiers:` path at all. Verified against real
hardware: the specific peripheral that hung before now connects in
~500ms and discovers services/characteristics normally.

Rebuild mechanics: **no custom rebuild step was needed.** electron-forge's
existing `rebuildConfig: {}` + `AutoUnpackNativesPlugin` (see
[[electron-forge-native-rebuild]]) already force a real from-source
`node-gyp` compile of `@stoprocent/noble`'s mac binding on every `npm
start`/`package`/`make` (confirmed: it produces a genuine fresh
`node_modules/@stoprocent/noble/build/Release/binding.node`, not a copy of
the shipped prebuilt) — so it automatically picks up the patched source.
Building this locally requires Xcode Command Line Tools on macOS (already
implicitly required for native-module work on this platform).

Not yet re-verified inside the packaged (`npm run make`) app — only dev
(`npm start`). If `make`/`package` ever stops rebuilding natives from
source (e.g. an N-API-aware rebuild tool starts skipping the mac binding
because N-API is ABI-stable), this patch would silently stop applying at
runtime even though `patch-package` still patches the source — watch for
that if this regresses.
