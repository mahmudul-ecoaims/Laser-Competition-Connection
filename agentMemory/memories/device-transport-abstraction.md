---
name: device-transport-abstraction
description: BLE and serial/USB are two switchable transports to the same device, unified behind deviceManager
tags: [architecture, decision, ble, serial]
---

The target device can be reached two ways: BLE (`bleService.ts`, via
[[ble-architecture-decision]]) or a wired serial/USB connection
(`serialService.ts`, via the `serialport` package). Only one is active at a
time — connecting one way disconnects the other; there's no simultaneous
dual-link. This was a deliberate choice, not a limitation to work around.

Both transports emit the exact same shapes
(`DeviceStatusEvent`/`DeviceMessage`, in `src/shared/types/device.ts`) so the
renderer's `useDevice` hook and `DeviceTerminal` don't know or care which
transport is live. This is enforced by two things:

1. `deviceManager.ts` (`src/electron/main/services/`) holds the single
   "active transport" (`{ kind, write, disconnect }`) — whichever service
   connected last registers itself there. Generic IPC calls
   (`device:write-command`, `device:disconnect`) go through it rather than
   through BLE- or serial-specific channels.
2. `MessageFramer` (`messageFramer.ts`) is the one piece of code that turns
   raw bytes into a message, used identically by both services. It splits
   on `\r` or `\n` — see [[ble-cr-only-line-endings]] for why both are
   needed (BLE-specific framing quirk that plain-`\n` splitting missed).

Renderer side: `useDevice.ts` holds a `mode: 'ble' | 'serial'` for which tab
is showing, `DevicePanel.tsx` renders BLE scan UI or serial port + baud-rate
UI depending on it, and `DeviceTerminal.tsx` renders whatever's in
`messages` regardless of transport (see [[ble-terminal-protocol]]).
