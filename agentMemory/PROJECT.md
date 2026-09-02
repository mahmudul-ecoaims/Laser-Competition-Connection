# Project Context — laser-competition (Electron desktop app)

## What this is

Electron + React + TypeScript desktop app (electron-forge + Vite) that
connects to the laser-competition target hardware — over BLE or a wired
serial/USB connection, one at a time (see
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
- `@abandonware/noble` for BLE, `serialport` for USB/serial — both native modules, both run in the main process only

## Folder map

- `src/electron/main/` — main process
  - `main.ts` — app lifecycle, wires IPC handlers, creates the window
  - `windows/mainWindow.ts` — BrowserWindow creation + trusted-origin checks for navigation/IPC
  - `ipc/registerHandlers.ts` — every `ipcMain.handle(...)`; validates the sender before each one
  - `services/deviceManager.ts` — tracks the single active transport (BLE or serial) and dispatches generic write/disconnect/broadcast to it
  - `services/messageFramer.ts` — buffers raw bytes into complete messages; the one place that defines message framing (see [[message-framing-unconfirmed]])
  - `services/bleService.ts` — noble wrapper: scan/connect/disconnect/write, subscribes to notify/indicate characteristics
  - `services/serialService.ts` — serialport wrapper: list ports/connect/disconnect/write
- `src/electron/preload/preload.ts` — the only bridge into the renderer; exposes `window.electronAPI` via `contextBridge`
- `src/shared/` — code shared by main + renderer (must stay Node/browser agnostic)
  - `ipc/channels.ts` — canonical IPC channel name strings
  - `types/` — `electronApi.ts` (the `window.electronAPI` contract), `device.ts` (transport-agnostic status/message types), `ble.ts` (BLE scan-result type), `serial.ts` (serial port info type)
  - `constants/ble.ts` — the three BLE UUIDs; `constants/serial.ts` — default baud rate + common rates for the UI
- `src/renderer/` — React UI
  - `App.tsx` — owns the single `useDevice()` call; renders `DevicePanel` and, once connected, `DeviceTerminal` beside it
  - `features/device/` — `useDevice.ts` (hook: mode/devices/ports/status/messages + actions), `DevicePanel.tsx` (BLE-scan or serial-port UI depending on mode), `DeviceTerminal.tsx` (live incoming-message log, transport-agnostic)
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

- No UI wired to send actual commands (`writeCommand`) or edit settings (`writeSettings`) yet — only scan/connect/disconnect/read exist in the UI.
- Message framing (newline-delimited) and serial baud rate are unconfirmed assumptions — see [[message-framing-unconfirmed]].
- No auto-reconnect on unexpected disconnect, for either transport.
- Windows support (noble and serialport) is untested; only macOS has been verified. Neither transport has been exercised against real hardware yet.
- Packaged build (`make`/`package`) has not been tested end-to-end.

For decisions, bugs-and-fixes, and other non-obvious facts, see [`MEMORY.md`](MEMORY.md) in this folder.
