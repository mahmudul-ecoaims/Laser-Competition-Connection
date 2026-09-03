export const IPC_CHANNELS = {
  appGetVersion: 'app:get-version',

  // BLE-specific (renderer -> main)
  bleStartScan: 'ble:start-scan',
  bleStopScan: 'ble:stop-scan',
  bleConnect: 'ble:connect',

  // Serial-specific (renderer -> main)
  serialListPorts: 'serial:list-ports',
  serialConnect: 'serial:connect',

  // Generic device control (renderer -> main) — BLE and serial can both be
  // connected at once, so these all take an explicit transport argument
  // saying which one to act on.
  deviceWriteCommand: 'device:write-command',
  deviceWriteSip: 'device:write-sip',
  deviceWriteInfo: 'device:write-info',
  deviceWriteSettings: 'device:write-settings',
  deviceDisconnect: 'device:disconnect',

  // Main -> renderer (push events)
  bleDeviceDiscovered: 'ble:device-discovered',
  deviceStatusChanged: 'device:status-changed',
  deviceMessageReceived: 'device:message-received',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
