/**
 * Data client: gestisce il sidecar Go (fork di albiondata-client) che sniffa
 * passivamente i pacchetti Photon del gioco e li decodifica.
 *
 * - spawn/stop del processo figlio con i flag giusti (-ndjson -headless);
 * - parsing dell'NDJSON su stdout, un evento per riga;
 * - i dati personali (gathering/fame/combat/mail) vengono persistiti in
 *   append su file JSONL in userData/dataclient/ (solo locale);
 * - i prezzi di mercato/oro vengono inoltrati live al renderer;
 * - upload verso AODP DISATTIVATO di default (flag -d), attivabile opt-in.
 *
 * Nessun overlay, nessuna interazione col client di gioco: solo lettura passiva
 * del traffico di rete, come i client AODP/SAT (policy SBI tollerata).
 */
import { spawn } from 'node:child_process';
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// topic NDJSON → categoria persistita (i topic non elencati non si salvano)
const PERSONAL_FILES = {
  'personal.gathering': 'gathering',
  'personal.fame': 'fame',
  'personal.combat': 'combat',
  'personal.loot': 'loot',
  // notifiche di mercato dalle mail (vendite/scadenze) = trades
  'marketnotifications.ingest': 'trades',
  'marketnotifications.deduped': 'trades',
};

// topic di prezzo → inoltrati live al renderer (non persistiti come storico)
const PRICE_TOPICS = new Set([
  'marketorders.ingest',
  'marketorders.deduped',
  'goldprices.ingest',
  'goldprices.deduped',
]);

/** Percorso del binario del sidecar (extraResources in produzione, build in dev). */
function sidecarPath() {
  const exe = process.platform === 'win32' ? 'albion-sidecar.exe' : 'albion-sidecar';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'sidecar', exe);
  }
  // in dev: binario compilato in albion-craft-app/sidecar/bin/
  return path.join(__dirname, '..', 'sidecar', 'bin', exe);
}

export class DataClient {
  /** @param {(payload: any) => void} onEvent callback verso il renderer */
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.proc = null;
    this.state = 'stopped'; // stopped | running | error
    this.lastError = null;
    this.dir = path.join(app.getPath('userData'), 'dataclient');
    fs.mkdirSync(this.dir, { recursive: true });
    this.settings = this.loadSettings();
  }

  settingsPath() {
    return path.join(this.dir, 'settings.json');
  }

  loadSettings() {
    // default sicuro: solo prezzi di mercato; niente log personali/combat, niente upload
    const defaults = { uploadAodp: false, personalLogging: false, combatLogging: false };
    try {
      return { ...defaults, ...JSON.parse(fs.readFileSync(this.settingsPath(), 'utf8')) };
    } catch {
      return defaults;
    }
  }

  saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    fs.writeFileSync(this.settingsPath(), JSON.stringify(this.settings, null, 2));
    return this.settings;
  }

  status() {
    return {
      state: this.state,
      error: this.lastError,
      platform: process.platform,
      uploadAodp: !!this.settings.uploadAodp,
      personalLogging: !!this.settings.personalLogging,
      combatLogging: !!this.settings.combatLogging,
      binaryPresent: fs.existsSync(sidecarPath()),
    };
  }

  start() {
    if (this.proc) return this.status();
    const bin = sidecarPath();
    if (!fs.existsSync(bin)) {
      this.state = 'error';
      this.lastError = 'sidecar binary not found';
      return this.status();
    }

    // -ndjson: canale dati su stdout · -headless: nessun systray/updater
    // -d: upload disattivato (a meno di opt-in) · -i noop: nessun ingest pubblico
    const args = ['-ndjson', '-headless'];
    if (!this.settings.uploadAodp) {
      args.push('-d', '-i', 'noop');
    }

    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;
    this.state = 'running';
    this.lastError = null;

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => this.handleLine(line));

    proc.stderr.on('data', (d) => {
      const msg = String(d);
      // Npcap mancante o permessi: segnala al renderer per l'onboarding
      if (/npcap|pcap|permission|administrator/i.test(msg)) {
        this.onEvent({ topic: 'dataclient.log', data: { level: 'warn', message: msg.trim() } });
      }
    });

    proc.on('exit', (code) => {
      this.proc = null;
      if (this.state !== 'stopped') {
        this.state = code === 0 ? 'stopped' : 'error';
        if (code !== 0) this.lastError = `sidecar exited with code ${code}`;
      }
      this.onEvent({ topic: 'dataclient.status', data: this.status() });
    });

    return this.status();
  }

  stop() {
    if (this.proc) {
      this.state = 'stopped';
      this.proc.kill();
      this.proc = null;
    }
    return this.status();
  }

  handleLine(line) {
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      return; // riga non-JSON (non dovrebbe capitare in modalità ndjson)
    }
    const { topic } = evt;

    // prezzi: inoltra live al renderer (aggiornano i calcolatori)
    if (PRICE_TOPICS.has(topic)) {
      this.onEvent(evt);
      return;
    }

    // dati personali: solo se l'utente ha attivato l'opt-in (default OFF).
    // Il combat ha un opt-in dedicato: è la categoria più sensibile.
    const kind = PERSONAL_FILES[topic];
    if (kind) {
      if (kind === 'combat' ? !this.settings.combatLogging : !this.settings.personalLogging) {
        return; // non abilitato: né persistito né inoltrato
      }
      this.appendHistory(kind, evt);
      this.onEvent(evt);
    }
  }

  appendHistory(kind, evt) {
    const file = path.join(this.dir, `${kind}.jsonl`);
    try {
      fs.appendFileSync(file, JSON.stringify({ ts: evt.ts, data: evt.data }) + os.EOL);
    } catch {
      /* non bloccare la pipeline per un errore di scrittura */
    }
  }

  /** Ritorna le ultime `limit` righe di storico per una categoria. */
  getHistory(kind, limit = 5000) {
    const file = path.join(this.dir, `${kind}.jsonl`);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    const slice = lines.slice(-limit);
    const out = [];
    for (const l of slice) {
      try {
        out.push(JSON.parse(l));
      } catch {
        /* salta righe corrotte */
      }
    }
    return out;
  }

  clearHistory(kind) {
    const file = path.join(this.dir, `${kind}.jsonl`);
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* ignore */
    }
    return true;
  }
}
