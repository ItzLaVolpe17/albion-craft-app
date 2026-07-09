/**
 * Genera build/icon.ico per electron-builder da build/icon.png
 * (creato da scripts/rasterize-logo.mjs a partire da public/logo.svg).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = path.join(ROOT, 'build');
const src = path.join(BUILD_DIR, 'icon.png');

if (!fs.existsSync(src)) {
  console.error('build/icon.png mancante: esegui prima "npx electron scripts/rasterize-logo.mjs"');
  process.exit(1);
}

const ico = await pngToIco(fs.readFileSync(src));
fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), ico);
console.log(`✓ build/icon.ico (${(ico.length / 1024).toFixed(0)} kB) generato da build/icon.png`);
