---
name: ble-architecture-decision
description: Why BLE uses noble in the main process instead of Web Bluetooth
tags: [ble, architecture, decision]
---

Two ways to do BLE from Electron were considered: Chromium's Web Bluetooth API
(renderer-side, zero native deps) vs. Node's `@abandonware/noble` running in
the main process. Noble was chosen because it fits the existing
main/services + shared/ipc architecture, gives full programmatic control
(auto-scan/connect by service UUID, no native OS device-picker dialog), and
avoids Windows Web-Bluetooth pairing-handler complexity.

Trade-off accepted: noble is a native Node module, so it needs rebuilding
per-platform/per-Electron-ABI (handled automatically by electron-forge's
`rebuildConfig`, see [[electron-forge-native-rebuild]]) and macOS packaging
needs Bluetooth usage-description entries (see
[[macos-bluetooth-entitlement]]).

See [[noble-vite-bundling-bug]] for a bundling gotcha this choice introduced,
and [[noble-windows-fork-migration]] for why the noble dependency is
`@stoprocent/noble` rather than `@abandonware/noble`.
