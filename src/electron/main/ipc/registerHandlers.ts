import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc/channels';
import { isTrustedRendererUrl } from '../windows/mainWindow';
import { bleService } from '../services/bleService';
import { serialService } from '../services/serialService';
import { deviceManager } from '../services/deviceManager';

const validateIpcSender = (event: IpcMainInvokeEvent) => {
  const senderUrl = event.senderFrame?.url;

  if (!senderUrl || !isTrustedRendererUrl(senderUrl)) {
    throw new Error('Rejected IPC request from an untrusted renderer.');
  }
};

export const registerIpcHandlers = () => {
  ipcMain.handle(IPC_CHANNELS.appGetVersion, (event) => {
    validateIpcSender(event);
    return app.getVersion();
  });

  // BLE
  ipcMain.handle(IPC_CHANNELS.bleStartScan, (event) => {
    validateIpcSender(event);
    return bleService.startScan();
  });

  ipcMain.handle(IPC_CHANNELS.bleStopScan, (event) => {
    validateIpcSender(event);
    return bleService.stopScan();
  });

  ipcMain.handle(IPC_CHANNELS.bleConnect, (event, deviceId: string) => {
    validateIpcSender(event);
    return bleService.connect(deviceId);
  });

  ipcMain.handle(IPC_CHANNELS.bleWriteSettings, (event, data: Uint8Array) => {
    validateIpcSender(event);
    return bleService.writeSettings(data);
  });

  // Serial
  ipcMain.handle(IPC_CHANNELS.serialListPorts, (event) => {
    validateIpcSender(event);
    return serialService.listPorts();
  });

  ipcMain.handle(IPC_CHANNELS.serialConnect, (event, path: string, baudRate?: number) => {
    validateIpcSender(event);
    return serialService.connect(path, baudRate);
  });

  // Generic — routes to whichever transport is currently active
  ipcMain.handle(IPC_CHANNELS.deviceWriteCommand, (event, data: Uint8Array) => {
    validateIpcSender(event);
    return deviceManager.writeCommand(data);
  });

  ipcMain.handle(IPC_CHANNELS.deviceDisconnect, (event) => {
    validateIpcSender(event);
    return deviceManager.disconnectActive();
  });
};
