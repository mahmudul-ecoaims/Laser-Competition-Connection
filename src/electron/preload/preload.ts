import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc/channels';
import type { ElectronAPI } from '../../shared/types/electronApi';

const electronAPI: ElectronAPI = {
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appGetVersion),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
