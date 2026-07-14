/**
 * Compila il sidecar Go (fork di albiondata-client) per Windows x64.
 *
 * gopacket/pcap su Windows carica wpcap.dll via syscall (LazyDLL), quindi non
 * serve cgo né una toolchain mingw: si cross-compila da qualunque OS con
 * CGO_ENABLED=0. Il binario finisce in sidecar/bin/albion-sidecar.exe ed è
 * incluso nell'app via extraResources (vedi package.json).
 *
 *   node scripts/build-sidecar.mjs           # windows/amd64 (default)
 *   node scripts/build-sidecar.mjs darwin    # per test locale su macOS
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIDECAR_DIR = path.join(APP_DIR, 'sidecar');
const target = process.argv[2] ?? 'windows';

const outName = target === 'windows' ? 'albion-sidecar.exe' : 'albion-sidecar';
const outPath = path.join(SIDECAR_DIR, 'bin', outName);
fs.mkdirSync(path.join(SIDECAR_DIR, 'bin'), { recursive: true });

const goos = target;
const goarch = target === 'darwin' ? process.arch === 'arm64' ? 'arm64' : 'amd64' : 'amd64';
// su darwin serve cgo (libpcap di sistema); su windows no (wpcap via syscall)
const cgo = target === 'darwin' ? '1' : '0';

const env = { ...process.env, GOOS: goos, GOARCH: goarch, CGO_ENABLED: cgo };
console.log(`Building sidecar → ${goos}/${goarch} (CGO=${cgo})`);
execSync(`go build -ldflags "-s -w" -o ${JSON.stringify(outPath)} .`, {
  cwd: SIDECAR_DIR,
  stdio: 'inherit',
  env,
});
console.log(`✓ ${outPath}`);
