import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc/channels';
import type { ElectronAPI } from '../../shared/types/electronApi';
import type { BleDeviceInfo } from '../../shared/types/ble';
import type { DeviceMessage, DeviceStatusEvent } from '../../shared/types/device';

const subscribe = <T>(channel: string, callback: (payload: T) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const electronAPI: ElectronAPI = {
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appGetVersion),

  ble: {
    startScan: () => ipcRenderer.invoke(IPC_CHANNELS.bleStartScan),
    stopScan: () => ipcRenderer.invoke(IPC_CHANNELS.bleStopScan),
    connect: (deviceId) => ipcRenderer.invoke(IPC_CHANNELS.bleConnect, deviceId),
    writeSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.bleWriteSettings, settings),
    onDeviceDiscovered: (callback) =>
      subscribe<BleDeviceInfo>(IPC_CHANNELS.bleDeviceDiscovered, callback),
  },

  serial: {
    listPorts: () => ipcRenderer.invoke(IPC_CHANNELS.serialListPorts),
    connect: (path, baudRate) => ipcRenderer.invoke(IPC_CHANNELS.serialConnect, path, baudRate),
  },

  device: {
    writeCommand: (transport, data) => ipcRenderer.invoke(IPC_CHANNELS.deviceWriteCommand, transport, data),
    writeSip: (transport, kind) => ipcRenderer.invoke(IPC_CHANNELS.deviceWriteSip, transport, kind),
    writeInfo: (transport) => ipcRenderer.invoke(IPC_CHANNELS.deviceWriteInfo, transport),
    disconnect: (transport) => ipcRenderer.invoke(IPC_CHANNELS.deviceDisconnect, transport),
    onStatusChanged: (callback) =>
      subscribe<DeviceStatusEvent>(IPC_CHANNELS.deviceStatusChanged, callback),
    onMessage: (callback) => subscribe<DeviceMessage>(IPC_CHANNELS.deviceMessageReceived, callback),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
