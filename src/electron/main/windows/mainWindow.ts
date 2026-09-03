import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const MIN_WINDOW_WIDTH = 760;
const MIN_WINDOW_HEIGHT = 520;
const MAX_WINDOW_WIDTH = 1200;
const MAX_WINDOW_HEIGHT = 800;
const INITIAL_WINDOW_SCREEN_RATIO = 0.85;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getInitialWindowSize = () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  return {
    width: clamp(
      Math.round(width * INITIAL_WINDOW_SCREEN_RATIO),
      MIN_WINDOW_WIDTH,
      MAX_WINDOW_WIDTH,
    ),
    height: clamp(
      Math.round(height * INITIAL_WINDOW_SCREEN_RATIO),
      MIN_WINDOW_HEIGHT,
      MAX_WINDOW_HEIGHT,
    ),
  };
};

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
  const initialWindowSize = getInitialWindowSize();

  const mainWindow = new BrowserWindow({
    width: initialWindowSize.width,
    height: initialWindowSize.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
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
