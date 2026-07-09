/**
 * Albion Crafting — companion app desktop.
 * Una sola finestra standard: nessun overlay, nessun always-on-top e nessuna
 * interazione con il client di gioco (policy SBI: gli overlay sono vietati).
 */
import { app, BrowserWindow, dialog, shell } from 'electron';
import serve from 'electron-serve';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

/**
 * Check aggiornamenti: legge un piccolo manifest pubblicato dal sito
 * (Cloudflare Pages). Aggiorna l'URL dopo il deploy del sito, oppure
 * override con la env APP_VERSION_URL per i test.
 */
const APP_VERSION_URL =
  process.env.APP_VERSION_URL ?? 'https://albion-craft-site.pages.dev/app-version.json';
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// In produzione l'app è servita dallo scheme app:// sulla cartella dist,
// così i fetch relativi (data/recipes.json) e le chiamate HTTPS funzionano.
const loadApp = DEV_URL ? null : serve({ directory: path.join(__dirname, '..', 'dist') });

function isNewer(remote, local) {
  const r = String(remote).split('.').map(Number);
  const l = String(local).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

let updatePromptShown = false;

async function checkForUpdates(win) {
  try {
    const res = await fetch(APP_VERSION_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const manifest = await res.json();
    if (!manifest?.version || !isNewer(manifest.version, app.getVersion())) return;
    if (updatePromptShown) return;
    updatePromptShown = true;
    console.log(`[update] new version available: ${manifest.version} (current ${app.getVersion()})`);

    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update available',
      message: `Albion Crafting ${manifest.version} is available`,
      detail: `${manifest.notes ? manifest.notes + '\n\n' : ''}You are running version ${app.getVersion()}.`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      shell.openExternal(
        manifest.url ?? 'https://github.com/ItzLaVolpe17/albion-craft-app/releases/latest',
      );
    }
  } catch {
    /* offline o sito non ancora deployato: silenzio */
  }
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
  const win = createWindow();
  checkForUpdates(win);
  setInterval(() => checkForUpdates(win), UPDATE_CHECK_INTERVAL_MS);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
