/**
 * Rasterizza public/logo.svg in build/icon.png (256×256, sfondo trasparente)
 * usando Electron come renderer. Eseguire con: npx electron scripts/rasterize-logo.mjs
 */
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(
  path.join(ROOT, '..', 'albion-craft-site', 'public', 'logo.svg'),
  'utf8',
);
const html = `<!doctype html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="256" height="256" ')}</body>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
  });
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), img.toPNG());
  console.log('✓ build/icon.png generato da public/logo.svg');
  app.quit();
});
