---
name: device-transport-abstraction
description: BLE and serial/USB are two independent transports to the same device, connectable at the same time, unified behind deviceManager
tags: [architecture, decision, ble, serial]
---

The target device can be reached two ways: BLE (`bleService.ts`, via
[[ble-architecture-decision]]) or a wired serial/USB connection
(`serialService.ts`, via the `serialport` package). **Both can be connected
at the same time** — connecting one does not disconnect the other. Each
service still enforces at most one device of its own kind at a time
(connecting a second BLE device drops the first; `serialService.connect`
does the same for serial ports) — the cap is per transport kind, not global.

Both transports emit the exact same shapes
(`DeviceStatusEvent`/`DeviceMessage`, in `src/shared/types/device.ts`) so the
renderer's `useDevice` hook and `DeviceTerminal` don't know or care which
transport a given status/message came from — they tell BLE and serial apart
by the `transport` field already on every event. This is enforced by two
things:

1. `deviceManager.ts` (`src/electron/main/services/`) holds one "active
   transport" slot per kind (`Record<DeviceTransportKind, ActiveDeviceTransport | null>`)
   — `bleService`/`serialService` each register into their own slot on
   connect. Generic IPC calls (`device:write-command`, `device:disconnect`,
   `device:write-sip`, `device:write-info`) all take an explicit
   `transport: DeviceTransportKind` argument now, since there's no longer a
   single implicit "the" active transport.
2. `MessageFramer` (`messageFramer.ts`) is the one piece of code that turns
   raw bytes into a message, used identically by both services. It splits
   on `\r` or `\n` — see [[ble-cr-only-line-endings]] for why both are
   needed (BLE-specific framing quirk that plain-`\n` splitting missed).

**Renderer side:** `useDevice.ts` keeps one full slice of state per
transport (`bleStatus`/`serialStatus`, `bleMessages`/`serialMessages`,
`bleSipMode`/`serialSipMode`, `bleSettings`/`serialSettings`) — both keep
updating from the main process regardless of what's on screen. `mode`
(renamed conceptually, field name unchanged) is *only* which screen
`App.tsx` currently shows — the BLE and Serial screens (`DevicePanel.tsx` +
`DeviceTerminal.tsx`, reached via `ConnectionChoiceScreen.tsx` and a back
button, navigation unchanged) — not which transport is connected. Switching
screens never disconnects anything; a transport only disconnects when its
own screen's Disconnect button is pressed. Navigating back shows the
messages, status, and latest FUK-derived settings accumulated for that
transport. The shared `DeviceSettingsPanel` acts only on the currently
visible transport after its SIP state confirms Standby; see
[[settings-write-implementation]].
