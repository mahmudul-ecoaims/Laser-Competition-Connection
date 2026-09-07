---
name: noble-windows-fork-migration
description: Switched BLE from @abandonware/noble to @stoprocent/noble because abandonware's only Windows path breaks the OS Bluetooth stack
tags: [ble, windows, build, decision]
---

Symptom: on Windows, the target device showed up as "Unknown device" in
Settings → Bluetooth, and BLE never worked properly (macOS was fine).

Root cause: `@abandonware/noble` uses native `CoreBluetooth` bindings on
macOS but has **no native Windows binding** — its only Windows path is the
raw HCI-socket backend (`@abandonware/bluetooth-hci-socket`), which talks
directly to the Bluetooth radio and requires the adapter's driver be
replaced with WinUSB (e.g. via Zadig) to bypass the Windows Bluetooth
stack entirely. Once that happens Windows can no longer see the adapter as
a normal Bluetooth device (hence "Unknown device"), and it also breaks any
other Bluetooth peripheral sharing that radio. Not viable to ship to end
users.

Fix: replaced the dependency with `@stoprocent/noble` (the actively
maintained fork/successor now that `noble/noble` is archived). It has real
native bindings on both platforms — `CoreBluetooth` on macOS, `WinRT`
(`Windows.Devices.Bluetooth`) on Windows — selected automatically via the
same `os.platform()` branching noble always used
(`lib/resolve-bindings.js`), no driver replacement needed. API is
compatible with `@abandonware/noble` (`Peripheral`/`Characteristic`
classes, `startScanningAsync`, `discover`/`stateChange` events, etc.); the
only source change needed in `bleService.ts` was the import specifier and
`noble._state` → `noble.state` (the public, typed getter — `@stoprocent`
doesn't type the private `_state` field `@abandonware` exposed).

Also carried over: the same eager-`require()`-in-bundled-CJS problem
documented in [[noble-vite-bundling-bug]] applies identically to
`@stoprocent/noble`'s `lib/resolve-bindings.js` (a `switch` with
per-platform `require()`s) — it must stay external in
`vite.main.config.ts` too.

Not yet verified against real Windows hardware — only reasoned from the
package's documented architecture (native WinRT bindings, no WinUSB/Zadig
step) and its TypeScript definitions. Verify the "Unknown device" symptom
is actually gone on a real Windows machine before considering this closed;
see [[ble-architecture-decision]] and `PROJECT.md`'s Known gaps.

macOS also turned out to need a fix after this migration — see
[[noble-mac-connect-hang-fix]] for a real (still-unfixed-upstream as of
2026-09-07) connect-hang bug found in `@stoprocent/noble`'s mac binding,
patched locally via `patch-package`.
