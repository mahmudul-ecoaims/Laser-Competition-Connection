import type { ElectronAPI } from '../../shared/types/electronApi';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
