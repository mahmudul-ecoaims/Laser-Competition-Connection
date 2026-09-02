export const IPC_CHANNELS = {
  appGetVersion: 'app:get-version',

  // BLE-specific (renderer -> main)
  bleStartScan: 'ble:start-scan',
  bleStopScan: 'ble:stop-scan',
  bleConnect: 'ble:connect',
  bleWriteSettings: 'ble:write-settings',

  // Serial-specific (renderer -> main)
  serialListPorts: 'serial:list-ports',
  serialConnect: 'serial:connect',

  // Generic device control (renderer -> main) — routes to whichever
  // transport is currently active, so the renderer doesn't need to know
  // which one that is.
  deviceWriteCommand: 'device:write-command',
  deviceDisconnect: 'device:disconnect',

  // Main -> renderer (push events)
  bleDeviceDiscovered: 'ble:device-discovered',
  deviceStatusChanged: 'device:status-changed',
  deviceMessageReceived: 'device:message-received',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
