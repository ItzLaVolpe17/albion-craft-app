/**
 * Albion Crafting — companion app desktop.
 * Una sola finestra standard: nessun overlay, nessun always-on-top e nessuna
 * interazione con il client di gioco (policy SBI: gli overlay sono vietati).
 *
 * Aggiornamenti: electron-updater scarica e installa automaticamente le nuove
 * release da GitHub (repo pubblica). Controlla a ogni avvio e su richiesta dai Settings.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import serve from 'electron-serve';
import electronUpdater from 'electron-updater';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataClient } from './dataclient.mjs';

const { autoUpdater } = electronUpdater;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// In produzione l'app è servita dallo scheme app:// sulla cartella dist,
// così i fetch relativi (data/recipes.json) e le chiamate HTTPS funzionano.
const loadApp = DEV_URL ? null : serve({ directory: path.join(__dirname, '..', 'dist') });

// Scarica da solo l'aggiornamento e lo installa alla chiusura dell'app,
// così non serve mai reinstallare a mano.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;
let downloadedVersion = null;
let dataClient = null;

/** Inoltra lo stato dell'updater al renderer (sezione Settings del sito). */
function sendStatus(payload) {
  mainWindow?.webContents.send('updates:status', payload);
}

function wireAutoUpdater() {
  autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    sendStatus({ state: 'available', version: info?.version }),
  );
  autoUpdater.on('update-not-available', () =>
    sendStatus({ state: 'not-available', version: app.getVersion() }),
  );
  autoUpdater.on('download-progress', (p) =>
    sendStatus({ state: 'downloading', percent: Math.round(p?.percent ?? 0) }),
  );
  autoUpdater.on('error', (err) =>
    sendStatus({ state: 'error', message: String(err?.message ?? err) }),
  );
  autoUpdater.on('update-downloaded', async (info) => {
    downloadedVersion = info?.version ?? null;
    sendStatus({ state: 'downloaded', version: downloadedVersion });
    // avviso non invasivo: si può riavviare ora o rimandare (installa comunque alla chiusura)
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: `Albion Crafting ${downloadedVersion} has been downloaded`,
      detail: 'Restart now to install it, or keep working — it will install automatically when you close the app.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
}

/** Controllo aggiornamenti; in dev o su build non impacchettata non fa nulla. */
async function checkForUpdates() {
  if (!app.isPackaged) {
    sendStatus({ state: 'dev' });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    sendStatus({ state: 'error', message: String(err?.message ?? err) });
  }
}

function registerIpc() {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('updates:check', async () => {
    await checkForUpdates();
    return app.getVersion();
  });
  ipcMain.handle('updates:install', () => {
    if (downloadedVersion) autoUpdater.quitAndInstall();
  });

  // ---- data client (sidecar di rete) ----
  dataClient = new DataClient((payload) => {
    mainWindow?.webContents.send('dataclient:event', payload);
  });
  ipcMain.handle('dataclient:status', () => dataClient.status());
  ipcMain.handle('dataclient:start', () => dataClient.start());
  ipcMain.handle('dataclient:stop', () => dataClient.stop());
  ipcMain.handle('dataclient:history', (_e, kind, limit) => dataClient.getHistory(kind, limit));
  ipcMain.handle('dataclient:clear', (_e, kind) => dataClient.clearHistory(kind));
  ipcMain.handle('dataclient:settings', (_e, patch) =>
    patch ? dataClient.saveSettings(patch) : dataClient.settings,
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Albion Crafting',
    backgroundColor: '#14141a',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // I link esterni (GitHub, AODP...) si aprono nel browser di sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else loadApp(win);

  return win;
}

app.whenReady().then(() => {
  wireAutoUpdater();
  registerIpc();
  mainWindow = createWindow();
  // controllo a ogni avvio (dopo che la finestra è pronta a ricevere lo stato)
  mainWindow.webContents.once('did-finish-load', () => checkForUpdates());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('before-quit', () => {
  dataClient?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
