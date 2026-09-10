# Project Context — laser-competition (Electron desktop app)

## What this is

Electron + React + TypeScript desktop app (electron-forge + Vite) that
connects to the laser-competition target hardware — over BLE and/or a wired
serial/USB connection, both at once, each capped at one device (see
[[device-transport-abstraction]]) — and exchanges commands/telemetry with
it. It's a companion to an existing React Native mobile app (not in this
repo) that talks to the same device over BLE — `docs/constants/index.ts` is
a copied reference of that app's constants (BLE UUIDs, API URLs, OAuth
config). Most of it (Dimensions/DeviceInfo/Orientation/auth) is mobile-only
and NOT used here. Only the BLE UUIDs were carried over, into
`src/shared/constants/ble.ts`.

## Stack

- Electron 44, electron-forge 7 (Vite plugin, Squirrel/zip/deb/rpm makers, Fuses plugin)
- React 19 + TypeScript, strict mode
- `@stoprocent/noble` for BLE, `serialport` for USB/serial — both native modules, both run in the main process only. See [[noble-windows-fork-migration]] for why noble is the `@stoprocent` fork, not `@abandonware`. Its mac binding carries a local `patch-package` fix — see [[noble-mac-connect-hang-fix]].

## Folder map

- `src/electron/main/` — main process
  - `main.ts` — app lifecycle, wires IPC handlers, creates the window
  - `windows/mainWindow.ts` — BrowserWindow creation + trusted-origin checks for navigation/IPC
  - `ipc/registerHandlers.ts` — every `ipcMain.handle(...)`; validates the sender before each one
  - `services/deviceManager.ts` — tracks one active-transport slot per kind (BLE and serial can both be connected) and dispatches generic write/disconnect/broadcast to whichever kind the caller specifies
  - `services/messageFramer.ts` — buffers raw bytes into complete messages; the one place that defines message framing (splits on `\r` or `\n`, see [[ble-cr-only-line-endings]])
  - `services/bleService.ts` — noble wrapper: scan/connect/disconnect/write, subscribes to notify/indicate characteristics
  - `services/serialService.ts` — serialport wrapper: list ports/connect/disconnect/write
- `src/electron/preload/preload.ts` — the only bridge into the renderer; exposes `window.electronAPI` via `contextBridge`
- `src/shared/` — code shared by main + renderer (must stay Node/browser agnostic)
  - `ipc/channels.ts` — canonical IPC channel name strings
  - `types/` — `electronApi.ts` (the `window.electronAPI` contract), `device.ts` (transport-agnostic status/message types), `ble.ts` (BLE scan-result type), `serial.ts` (serial port info type), `settings.ts` (shared `DeviceSettings`/`DeviceSettingsEvent` shapes for BLE and serial, see [[settings-write-implementation]])
  - `constants/ble.ts` — the three BLE UUIDs; `constants/serial.ts` — default baud rate + common rates for the UI; `constants/settings.ts` — `DEFAULT_DEVICE_SETTINGS` + the selectable-value list per settings field
- `src/renderer/` — React UI
  - `App.tsx` — owns the single `useDevice()` call; renders `DevicePanel` plus the visible transport's `DeviceSettingsPanel` after Standby is confirmed, and, once connected, `DeviceTerminal` beside them
  - `features/device/` — `useDevice.ts` (hook: independent BLE/serial status, messages, settings, SIP mode + actions), `DevicePanel.tsx` (BLE-scan or serial-port UI depending on mode), `DeviceSettingsPanel.tsx` (shared brightness/mode/shootingArea/shotsHeat/secondsHeat controls for the visible BLE or serial transport, see [[settings-write-implementation]]), `DeviceTerminal.tsx` (live message log, transport-agnostic, incoming and outgoing)
  - `styles/app.css` — single global stylesheet, dark theme

## Security posture (don't relax without asking)

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` in `mainWindow.ts`
- Every IPC handler calls `validateIpcSender(event)` first (checks `senderFrame.url` against the trusted renderer origin)
- The renderer never touches noble/Node APIs directly — only through `window.electronAPI`

## Conventions for adding a new IPC-backed feature

1. Add the channel name to `src/shared/ipc/channels.ts`
2. Implement the main-process logic in a `services/*.ts` file (or extend `bleService.ts`)
3. Wire `ipcMain.handle(...)` in `registerHandlers.ts` (with `validateIpcSender`)
4. Expose it on `window.electronAPI` in both `shared/types/electronApi.ts` and `preload.ts`
5. Consume it from a renderer hook, not directly from components

## Commands

- `npm start` — dev (electron-forge start, hot reload)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — eslint over `.ts`/`.tsx`
- `npm run package` / `npm run make` — build distributables

## Known gaps (as of writing)

- No UI wired to send actual commands (`writeCommand`) yet. Settings
  (`writeSettings`) now has UI and waits for the device's `FUK` reply to
  confirm each write — see [[settings-write-implementation]]. Its in-memory
  state still resets to hardcoded defaults on connect because no explicit
  settings-read request is sent, but every valid incoming `FUK` now replaces
  both the main-process and renderer Settings state for its own transport —
  see [[ble-fuk-live-settings-sync]] and
  [[serial-fuk-live-settings-sync]].
- Serial baud rate default (115200) is an unconfirmed assumption. Message framing was confirmed by direct capture and fixed — see [[ble-cr-only-line-endings]].
- No auto-reconnect on unexpected disconnect, for either transport.
- The current BLE FU1/FU2 settings flow, serial FUK settings flow, and live
  FUK-to-Settings synchronization are the user-accepted working hardware
  standard as of 2026-09-03. Windows support for serialport remains
  untested; BLE switched from `@abandonware/noble` to `@stoprocent/noble` on
  2026-09-07 specifically to fix Windows (see
  [[noble-windows-fork-migration]]). The same 2026-09-07 change also
  surfaced and fixed a real macOS-only connect hang (see
  [[noble-mac-connect-hang-fix]]), verified against real hardware
  (`LT700_40`) in dev (`npm start`); not yet re-verified in a packaged
  (`npm run make`) build. **Windows: fully resolved and confirmed on real
  hardware as of 2026-09-07** — both `LT600_01` and `LT700_40` now connect
  and work end-to-end in dev (`npm start`). `LT700_40` needed a real
  Windows pairing step the app never did, plus a `@stoprocent/noble`
  Windows-binding bug that was silently hiding the real GATT error; see
  [[noble-windows-connect-unreliable]] for the full trail before touching
  Windows BLE again (in particular the `electron-rebuild
  --build-from-source` requirement — a plain rebuild silently no-ops on
  Windows and any future native-side edit needs it). Not yet re-verified
  in a packaged (`npm run make`) Windows build, and the OS-level "Unknown
  device" label for `LT700_40` in Windows' own Bluetooth settings UI was
  still open as of the fix landing — under investigation next.
- Packaged build (`make`/`package`) has not been tested end-to-end.

For decisions, bugs-and-fixes, and other non-obvious facts, see [`MEMORY.md`](MEMORY.md) in this folder.
