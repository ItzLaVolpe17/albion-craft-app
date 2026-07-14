/**
 * Pubblica una release dell'app con auto-update:
 *   npm run release -- 1.1.0 "Note di rilascio opzionali"
 *
 * 1. bump version in package.json
 * 2. build sito + exe Windows e PUBBLICA su GitHub (electron-builder --publish always).
 *    Questo carica anche latest.yml + .blockmap: sono i file che electron-updater
 *    legge nelle app installate per scaricare e installare l'aggiornamento da solo.
 * 3. aggiorna le note della release
 * 4. aggiorna public/app-version.json nel sito (Download page) + commit/push
 * 5. commit/push del bump nell'app repo
 *
 * Richiede GH_TOKEN (viene preso da `gh auth token` se assente).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = path.resolve(APP_DIR, '..', 'albion-craft-site');
const REPO = 'ItzLaVolpe17/albion-craft-app';

const version = process.argv[2];
const notes = process.argv[3] ?? `Release ${version}`;
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Uso: npm run release -- <x.y.z> ["note"]');
  process.exit(1);
}

// token per la pubblicazione (electron-builder usa GH_TOKEN)
const ghToken =
  process.env.GH_TOKEN || execSync('gh auth token', { encoding: 'utf8' }).trim();

const run = (cmd, cwd = APP_DIR, extraEnv = {}) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
};

// 1. bump version
const pkgPath = path.join(APP_DIR, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✓ version → ${version}`);

// 2. build + publish (crea la release vGIT e carica exe, latest.yml, blockmap)
run('npm run publish:win', APP_DIR, { GH_TOKEN: ghToken });

// 3. note della release
try {
  run(`gh release edit v${version} --repo ${REPO} --title "Albion Crafting ${version}" --notes ${JSON.stringify(notes)}`);
} catch {
  console.warn('⚠ impossibile aggiornare le note della release (procedo comunque)');
}

// 4. manifest sul sito (Download page + fallback per le app 1.0.0)
fs.writeFileSync(
  path.join(SITE_DIR, 'public', 'app-version.json'),
  JSON.stringify(
    { version, url: `https://github.com/${REPO}/releases/latest`, notes },
    null,
    2,
  ) + '\n',
);
// rigenera la build del sito (dist committata per Cloudflare Pages) e pubblica
run('npm run build', SITE_DIR);
run(
  `git add public/app-version.json dist && git commit -m "app-version ${version}" && git push`,
  SITE_DIR,
);

// 5. commit del bump nell'app repo
run(`git add package.json package-lock.json && git commit -m "v${version}" && git push`);

console.log(
  `\n✓ Release v${version} pubblicata. Le app installate la scaricheranno e installeranno da sole.`,
);
