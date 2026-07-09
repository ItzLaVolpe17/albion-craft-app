# Albion Crafting — Desktop app (Windows)

Shell Electron per [albion-craft-site](https://github.com/ItzLaVolpe17/albion-craft-site): calcolatore di crafting per Albion Online con prezzi live (AODP).

> Tool esterno conforme alla policy SBI: nessun overlay, nessuna lettura del client di gioco — solo dati pubblici in una finestra separata.

## Requisiti

La cartella del sito deve stare **accanto** a questa:

```
Dev/Albion/
├── albion-craft-site/   ← clone di ItzLaVolpe17/albion-craft-site
└── albion-craft-app/    ← questa repo
```

## Comandi

| Comando | Descrizione |
|---|---|
| `npm install` | dipendenze (Electron scarica il binario: approva gli script se richiesto) |
| `npm run electron:dev` | sviluppo: avvia il dev server del sito + Electron |
| `npm run dist:win` | builda il sito e genera portable + installer in `release/` |
| `npm run build-icon` | rigenera `build/icon.ico` da `../albion-craft-site/public/logo.svg` |
| `npm run release -- 1.1.0 "note"` | bump + build + GitHub release + aggiorna il manifest del sito |

## Aggiornamenti dell'app

All'avvio (e ogni 4 ore) l'app legge `app-version.json` dal sito pubblicato su Cloudflare Pages;
se c'è una versione più recente mostra il prompt **"Update available"** con il link al download.

Dopo il deploy del sito su Cloudflare Pages, aggiorna `APP_VERSION_URL` in
[electron/main.mjs](electron/main.mjs) con l'URL reale (default: `https://albion-craft-site.pages.dev/app-version.json`).

Per testare il prompt: `APP_VERSION_URL=http://localhost:8080/fake.json npm run electron:preview`
con un json `{ "version": "9.9.9", "url": "..." }`.
