import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc/channels';
import { isTrustedRendererUrl } from '../windows/mainWindow';

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
};
