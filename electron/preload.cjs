/**
 * Preload: espone al sito (renderer) un piccolo ponte sicuro verso il main
 * process per gli aggiornamenti. Disponibile come window.albionDesktop solo
 * dentro l'app desktop; nel browser è undefined (la sezione update si nasconde).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('albionDesktop', {
  // versione dell'app installata
  getVersion: () => ipcRenderer.invoke('app:version'),
  // avvia un controllo aggiornamenti (scarica in automatico se disponibile)
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  // riavvia e installa l'aggiornamento già scaricato
  quitAndInstall: () => ipcRenderer.invoke('updates:install'),
  // sottoscrive lo stato dell'updater; ritorna la funzione per disiscriversi
  onStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('updates:status', handler);
    return () => ipcRenderer.removeListener('updates:status', handler);
  },
});

/**
 * Ponte verso il data client di rete (sidecar Photon). Disponibile solo
 * nell'app desktop: nel browser è undefined e le sezioni relative si nascondono
 * o mostrano "disponibile nell'app desktop".
 */
contextBridge.exposeInMainWorld('albionDataClient', {
  status: () => ipcRenderer.invoke('dataclient:status'),
  start: () => ipcRenderer.invoke('dataclient:start'),
  stop: () => ipcRenderer.invoke('dataclient:stop'),
  getHistory: (kind, limit) => ipcRenderer.invoke('dataclient:history', kind, limit),
  clearHistory: (kind) => ipcRenderer.invoke('dataclient:clear', kind),
  getSettings: () => ipcRenderer.invoke('dataclient:settings'),
  setSettings: (patch) => ipcRenderer.invoke('dataclient:settings', patch),
  // eventi live (prezzi + dati personali); ritorna la funzione per disiscriversi
  onEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('dataclient:event', handler);
    return () => ipcRenderer.removeListener('dataclient:event', handler);
  },
});
