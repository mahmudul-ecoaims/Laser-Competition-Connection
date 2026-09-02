import { BrowserWindow } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const getRendererUrl = () => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return MAIN_WINDOW_VITE_DEV_SERVER_URL;
  }

  return pathToFileURL(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  ).toString();
};

export const isTrustedRendererUrl = (targetUrl: string) => {
  try {
    const rendererUrl = getRendererUrl();

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return new URL(targetUrl).origin === new URL(rendererUrl).origin;
    }

    return targetUrl === rendererUrl;
  } catch {
    return false;
  }
};

export const createMainWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 760,
    minHeight: 520,
    title: 'laser-competition',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: 'deny',
  }));

  const rendererUrl = getRendererUrl();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
};
