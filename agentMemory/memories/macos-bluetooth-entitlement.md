---
name: macos-bluetooth-entitlement
description: Packaged macOS builds need Bluetooth usage-description entries or the OS silently denies noble BLE access
tags: [ble, macos, packaging]
---

`forge.config.ts` → `packagerConfig.extendInfo` sets
`NSBluetoothAlwaysUsageDescription` and `NSBluetoothPeripheralUsageDescription`.
Without these, a packaged (not dev) macOS build gets silently denied
Bluetooth access by the OS instead of prompting the user — noble just never
finds devices, no error surfaced. Also `AutoUnpackNativesPlugin` is required
in the forge plugins list so noble's `.node` binding is unpacked from asar
(native code can't execute from inside asar).

Not yet verified end-to-end against an actual `npm run make` build — only
reasoned from Electron/macOS packaging requirements. Verify this before
shipping a packaged build.
