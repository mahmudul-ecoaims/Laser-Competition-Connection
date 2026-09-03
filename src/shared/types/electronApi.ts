import type { BleDeviceInfo } from './ble';
import type { SipSyncKind } from './commands';
import type { DeviceMessage, DeviceStatusEvent, DeviceTransportKind } from './device';
import type { SerialPortInfo } from './serial';
import type { DeviceSettings } from './settings';

export interface ElectronAPI {
  getAppVersion: () => Promise<string>;

  ble: {
    startScan: () => Promise<void>;
    stopScan: () => Promise<void>;
    connect: (deviceId: string) => Promise<void>;
    onDeviceDiscovered: (callback: (device: BleDeviceInfo) => void) => () => void;
  };

  serial: {
    listPorts: () => Promise<SerialPortInfo[]>;
    connect: (path: string, baudRate?: number) => Promise<void>;
  };

  // BLE and serial can both be connected at once, so every generic action
  // says which transport it applies to.
  device: {
    writeCommand: (transport: DeviceTransportKind, data: Uint8Array) => Promise<void>;
    writeSip: (transport: DeviceTransportKind, kind: SipSyncKind) => Promise<void>;
    writeInfo: (transport: DeviceTransportKind) => Promise<void>;
    writeSettings: (transport: DeviceTransportKind, settings: Partial<DeviceSettings>) => Promise<DeviceSettings>;
    disconnect: (transport: DeviceTransportKind) => Promise<void>;
    onStatusChanged: (callback: (status: DeviceStatusEvent) => void) => () => void;
    onMessage: (callback: (message: DeviceMessage) => void) => () => void;
  };
}
