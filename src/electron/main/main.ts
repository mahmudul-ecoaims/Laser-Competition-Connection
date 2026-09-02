import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc/registerHandlers';
import { createMainWindow } from './windows/mainWindow';

if (started) {
  app.quit();
}

const createApplicationWindow = () => {
  const mainWindow = createMainWindow();
  return mainWindow;
};

app.whenReady().then(() => {
  registerIpcHandlers();
  createApplicationWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createApplicationWindow();
  }
});
