/**
 * Pubblica una release dell'app:
 *   npm run release -- 1.1.0 "Note di rilascio opzionali"
 *
 * 1. bump version in package.json
 * 2. build sito + exe Windows (dist:win)
 * 3. gh release create con gli exe (repo privata albion-craft-app)
 * 4. aggiorna public/app-version.json nel sito + commit/push
 *    → Cloudflare Pages pubblica il manifest → le app installate mostrano il prompt
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

const run = (cmd, cwd = APP_DIR) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

// 1. bump version
const pkgPath = path.join(APP_DIR, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✓ version → ${version}`);

// 2. build
run('npm run dist:win');

// 3. release GitHub con gli exe
const assets = [
  `release/Albion Crafting ${version}.exe`,
  `release/Albion Crafting Setup ${version}.exe`,
]
  .filter((f) => fs.existsSync(path.join(APP_DIR, f)))
  .map((f) => `"${f}"`)
  .join(' ');
run(
  `gh release create v${version} ${assets} --repo ${REPO} --title "Albion Crafting ${version}" --notes "${notes}"`,
);

// 4. manifest sul sito → prompt di update nelle app
const manifestPath = path.join(SITE_DIR, 'public', 'app-version.json');
fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    { version, url: `https://github.com/${REPO}/releases/latest`, notes },
    null,
    2,
  ) + '\n',
);
run(`git add public/app-version.json && git commit -m "app-version ${version}" && git push`, SITE_DIR);

// commit del bump nell'app repo
run(`git add package.json && git commit -m "v${version}" && git push`);

console.log(`\n✓ Release v${version} pubblicata. Le app mostreranno il prompt di aggiornamento.`);
