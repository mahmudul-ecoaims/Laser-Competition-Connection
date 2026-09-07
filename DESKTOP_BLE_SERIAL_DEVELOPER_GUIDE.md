# Desktop BLE and Serial Developer Guide

**Project:** Laser Competition Target  
**Scope:** Electron + React + TypeScript desktop implementation  
**Status:** Current accepted implementation, 04 September 2026

This guide explains how to implement, connect, read, and write through BLE and
serial in this desktop application. It documents the current code contract,
including INFO and SIP request/response behavior.

## Architecture rule

Native communication runs only in the Electron main process:

```text
React renderer
  -> typed window.electronAPI preload bridge
  -> validated Electron IPC
  -> deviceManager
  -> bleService or serialService
  -> target hardware

target hardware
  -> BLE notification or serial data event
  -> MessageFramer
  -> deviceManager event broadcast
  -> preload subscription
  -> React state / terminal
```

Keep `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
Never import Noble, SerialPort, Node, or Electron APIs into React components.

## 1. Coding prerequisites

### Software and packages

- Node.js/npm compatible with Electron 44 and Electron Forge 7.
- `@stoprocent/noble` for BLE central communication (native CoreBluetooth
  bindings on macOS, native WinRT bindings on Windows).
- `serialport` and `@serialport/bindings-cpp` for USB/serial communication.
- Electron preload/IPC bridge for renderer-to-main communication.

Install and start the project:

```bash
npm install
npm start
```

Validation commands:

```bash
npm run typecheck
npm run lint
```

### Native-module requirements

- Noble, `serialport`, and `@serialport/bindings-cpp` must remain external in
  `vite.main.config.ts`. Bundling them breaks platform-specific native loading.
- `forge.config.ts` uses `rebuildConfig: {}` so Electron Forge rebuilds native
  modules for Electron's ABI during start/package/make.
- `AutoUnpackNativesPlugin` must remain enabled because native `.node` files
  cannot execute from inside the asar archive.

### BLE requirements

- Bluetooth adapter powered on and permission granted to the application.
- On macOS packages, keep `NSBluetoothAlwaysUsageDescription` and
  `NSBluetoothPeripheralUsageDescription` in `forge.config.ts`.
- Target advertises this service:
  `0bd51666-e7cb-469b-8e4d-2742f1ba77cc`.
- Command characteristic:
  `e7add780-b042-4876-aae1-11285535f821`.
- Settings characteristic:
  `e7add780-b042-4876-aae1-11285535f721`.

### Serial requirements

- Target connected through a visible USB/serial port.
- Correct port path and baud rate.
- The application default is `115200`; the UI also supports `9600`, `19200`,
  `38400`, `57600`, and `230400`.
- Serial protocol commands require `\r\n`. Raw byte writes do not add it
  automatically.

### Source ownership

| Responsibility | Source |
|---|---|
| BLE scan/connect/read/write | `src/electron/main/services/bleService.ts` |
| Serial list/connect/read/write | `src/electron/main/services/serialService.ts` |
| Transport selection and event broadcast | `src/electron/main/services/deviceManager.ts` |
| CR/LF message framing | `src/electron/main/services/messageFramer.ts` |
| INFO/SIP encoding | `src/electron/main/services/deviceCommandProtocol.ts` |
| FU1/FU2/FUK encoding and FUK parsing | `src/electron/main/services/deviceSettingsProtocol.ts` |
| IPC handlers | `src/electron/main/ipc/registerHandlers.ts` |
| Safe renderer bridge | `src/electron/preload/preload.ts` |
| Renderer connection/message/settings state | `src/renderer/features/device/useDevice.ts` |

## 2. Connection process

BLE and serial are independent. They may be connected simultaneously, but only
one device is allowed per transport. Connecting another BLE target disconnects
the existing BLE target; connecting another serial port closes the existing
serial port.

### BLE connection

Renderer usage:

```ts
const unsubscribe = window.electronAPI.ble.onDeviceDiscovered((device) => {
  console.log(device.id, device.name, device.rssi);
});

await window.electronAPI.ble.startScan();
await window.electronAPI.ble.connect(selectedDeviceId);

// Later
unsubscribe();
```

Main-process sequence:

1. Wait until Noble reports `poweredOn`; reject `unauthorized` or `unsupported`.
2. Clear old discoveries and scan only for the target service UUID.
3. Publish each discovered `{ id, name, rssi }` to the renderer.
4. Stop scanning when the user selects a device.
5. Disconnect the previous BLE peripheral, if present.
6. Call `peripheral.connectAsync()`.
7. Discover the target service and both known characteristics.
8. Require the Command characteristic. Keep the Settings characteristic when
   found.
9. Subscribe to every characteristic that supports `notify` or `indicate`.
10. Register BLE in `deviceManager` and publish `connected` status.

BLE scanning stops automatically after 15 seconds.

### Serial connection

Renderer usage:

```ts
const ports = await window.electronAPI.serial.listPorts();
await window.electronAPI.serial.connect(ports[0].path, 115200);
```

Main-process sequence:

1. Call `SerialPort.list()` and return the available port metadata.
2. Close the previous serial port, if one is open.
3. Reset the serial framer, idle timer, and in-memory settings.
4. Open `new SerialPort({ path, baudRate })`.
5. Attach `data`, `close`, and `error` handlers.
6. Register serial in `deviceManager` and publish `connected` status.

On close, serial unregisters itself and returns to `idle` status. BLE uses a
short `disconnected` state when its peripheral disconnects.

## 3. Reading data through BLE

BLE data arrives through characteristic notifications. Do not assume one BLE
notification equals one protocol message; notifications may contain fragments.

Simplified main-process pattern:

```ts
const framer = getFramer(source); // one framer per characteristic

characteristic.on('data', (chunk: Buffer) => {
  for (const line of framer.push(chunk)) {
    const text = line.toString('utf8');

    deviceManager.publishMessage({
      transport: 'ble',
      source,
      direction: 'in',
      text,
      hex: line.toString('hex'),
      // id and timestamp omitted here for brevity
    });

    const settings = parseFukMessage(text);
    if (settings) {
      currentSettings = settings;
      deviceManager.publishSettings({ transport: 'ble', settings });
      fukEvents.emit('fuk', settings);
    }
  }
});

await characteristic.subscribeAsync();
```

Important BLE read rules:

- Use a separate `MessageFramer` for each characteristic so fragments from
  Command and Settings never mix.
- Split on either CR (`0x0d`) or LF (`0x0a`). The target often sends CR first
  and a delayed standalone LF.
- Publish every complete line with `transport`, `source`, `direction`, `text`,
  and `hex`.
- FUK normally arrives on the Command characteristic, but parse it from either
  subscribed characteristic.
- Every valid BLE FUK updates the BLE terminal, main-process settings, and React
  `bleSettings`, even when no write is pending.

Renderer subscription:

```ts
const offMessages = window.electronAPI.device.onMessage((message) => {
  if (message.transport === 'ble') {
    // Append to the BLE terminal state.
  }
});

const offSettings = window.electronAPI.device.onSettingsChanged((event) => {
  if (event.transport === 'ble') {
    // Replace BLE settings with event.settings.
  }
});
```

## 4. Reading data through serial

Serial is one continuous byte stream. A `data` event can contain a partial line,
one line, or several lines.

Simplified main-process pattern:

```ts
port.on('data', (chunk: Buffer) => {
  for (const line of framer.push(chunk)) {
    handleIncomingLine(line);
  }

  clearTimeout(idleFlushTimer);
  idleFlushTimer = setTimeout(() => {
    const finalLine = framer.flush();
    if (finalLine) handleIncomingLine(finalLine);
  }, 200);
});
```

`handleIncomingLine()`:

1. Decode UTF-8 text.
2. Publish a `DeviceMessage` with `transport: 'serial'`, `source: 'serial'`, and
   `direction: 'in'`.
3. Parse FUK.
4. For valid FUK, replace serial `currentSettings`, publish
   `{ transport: 'serial', settings }`, and emit the FUK confirmation event.

Serial read rules:

- Split on CR or LF using the same `MessageFramer` used by BLE.
- Reset the 200 ms idle-flush timer after every chunk. This releases a final
  response that arrives without a line terminator.
- Keep serial messages and settings separate from BLE state.
- Every valid serial FUK updates the serial terminal and `serialSettings`, even
  when no write is pending.

## 5. Writing data through BLE and serial

Use the typed preload API from the renderer. Always pass the target transport:

```ts
const bytes = new TextEncoder().encode('RAW_COMMAND');
await window.electronAPI.device.writeCommand('ble', bytes);
await window.electronAPI.device.writeCommand('serial', bytes);

await window.electronAPI.device.writeSettings('ble', { brightness: 4 });
await window.electronAPI.device.writeSettings('serial', { brightness: 4 });
```

### Raw writes

| Transport | Destination | Byte behavior |
|---|---|---|
| BLE | Command characteristic | Exact bytes, GATT write with response, no terminator added |
| Serial | Open serial port | Exact bytes, no terminator added |

For serial line protocols, include `\r\n` yourself or use the dedicated
INFO/SIP/settings methods, which apply the correct framing.

### Settings writes

BLE sends two ASCII messages to the Settings characteristic with no terminator:

```text
FU1:01:0<brightness>:00:<mode>:0<shootingArea>
FU2:0<shotsHeat>:<secondsHeat>:<HH:mm>
```

Serial sends one FUK-shaped ASCII line and drains the port:

```text
FUK:01:0<brightness>:00:<mode>:0<shootingArea>:0<shotsHeat>:<secondsHeat>:0000000\r\n
```

Common settings-write behavior:

1. Merge the partial update into that transport's latest FUK-derived settings.
2. Skip the write when nothing changed.
3. Send the transport-specific format.
4. Wait up to 10 seconds for the next valid FUK from that transport.
5. Resolve with device-reported settings, not the requested values.
6. Reject on timeout or disconnect.

Settings writes are Standby-only. The UI exposes settings only when the selected
transport has confirmed SIP mode `S`.

Incoming FUK format for both transports:

```text
FUK:<targetNumber>:<brightness>:<battery>:<mode>:<shootingArea>:<shotsHeat>:<secondsHeat>:<timestamp>
```

The desktop stores brightness, mode, shooting area, shots per heat, and heat
seconds. Target number, battery, and timestamp remain in the raw terminal line.

## 6. INFO and SIP commands and responses

INFO and SIP share one high-level path:

```text
React method
  -> preload ipcRenderer.invoke(...)
  -> validated ipcMain handler
  -> deviceManager.writeInfo/writeSip
  -> encode command
  -> deviceManager.writeLine
  -> transport writeGenericCommand
```

### Command formats

```text
INFO01
SIP:01:<S|L>:hhmmsscc
```

- Lane/target is currently fixed to `01`.
- SIP `S` or `L` is the requested sync kind.
- `hhmmsscc` is the current local time: hours, minutes, seconds, and
  centiseconds, zero-padded to eight digits.

Renderer calls:

```ts
await window.electronAPI.device.writeInfo('ble');
await window.electronAPI.device.writeInfo('serial');

await window.electronAPI.device.writeSip('ble', 'S');
await window.electronAPI.device.writeSip('serial', 'L');
```

### Outgoing transport behavior

| Command | BLE | Serial |
|---|---|---|
| INFO | Write `INFO01` to Settings characteristic; no terminator | Write `INFO01\r\n` to serial port |
| SIP | Write `SIP:01:<kind>:hhmmsscc` to Settings characteristic; no terminator | Write the same command plus `\r\n` to serial port |

Do not send INFO or SIP to the BLE Command characteristic. The target listens
for both on the BLE Settings characteristic.

`writeInfo()` and `writeSip()` are fire-and-forget: their promises resolve after
the command bytes are written and the outgoing terminal message is published.
They do not wait for a device reply.

### SIP response path

Observed shape:

```text
Request:  SIP:01:L:08263283
Response: SIP:01:L:08263283:11714
```

- BLE response arrives through a subscribed characteristic notification.
- Serial response arrives through `port.on('data')`.
- Both pass through `MessageFramer` and are published to the terminal.
- Renderer regex `^SIP:\d+:([SL]):` extracts the confirmed kind.
- Confirmed `S` enables Standby settings; `L` represents Live mode.
- The final response field (`11714` above) is device-defined and currently not
  interpreted.

### INFO response path

Observed shape:

```text
Request: INFO01
Replies: IN0:95:88:91:70
         IN1:100:93:-1:84
```

- BLE replies arrive through notifications; serial replies through the serial
  data event.
- Both use the common framer and terminal event path.
- `IN<rowIndex>:<value1>:<value2>:...` identifies one discovery row.
- Documented row indexes are 0-9.
- `parseMasterDiscoveryRow()` converts numeric values and normalizes invalid or
  empty values to `-1`.
- The current UI recognizes/highlights `IN<number>` replies but does not store
  them in a discovery table.

## Implementation checklist

- Keep Noble and SerialPort in the Electron main process.
- Keep native modules external in Vite and unpacked from asar.
- Route BLE raw commands to Command; route BLE settings, INFO, and SIP to
  Settings.
- Never append serial line endings to BLE messages.
- Append `\r\n` to serial protocol lines.
- Buffer incoming chunks and split complete messages on either CR or LF.
- Use the serial 200 ms idle flush for an unterminated final reply.
- Publish each complete incoming line to the correct terminal.
- Update only the originating transport's Settings state for every valid FUK.
- Treat INFO/SIP responses asynchronously; their send calls do not await them.
- Unsubscribe renderer event listeners during React effect cleanup.
- Preserve `contextIsolation`, sandboxing, trusted-sender validation, and the
  preload API boundary.
