import type { BleDeviceInfo } from './ble';
import type { DeviceMessage, DeviceStatusEvent } from './device';
import type { SerialPortInfo } from './serial';
import type { DeviceSettings } from './settings';

export interface ElectronAPI {
  getAppVersion: () => Promise<string>;

  ble: {
    startScan: () => Promise<void>;
    stopScan: () => Promise<void>;
    connect: (deviceId: string) => Promise<void>;
    writeSettings: (settings: Partial<DeviceSettings>) => Promise<DeviceSettings>;
    onDeviceDiscovered: (callback: (device: BleDeviceInfo) => void) => () => void;
  };

  serial: {
    listPorts: () => Promise<SerialPortInfo[]>;
    connect: (path: string, baudRate?: number) => Promise<void>;
  };

  device: {
    writeCommand: (data: Uint8Array) => Promise<void>;
    disconnect: () => Promise<void>;
    onStatusChanged: (callback: (status: DeviceStatusEvent) => void) => () => void;
    onMessage: (callback: (message: DeviceMessage) => void) => () => void;
  };
}
