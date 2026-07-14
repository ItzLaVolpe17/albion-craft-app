# Sidecar data client (fork)

Fork di [ao-data/albiondata-client](https://github.com/ao-data/albiondata-client)
(licenza MIT, vedi `LICENSE`) al commit `ab72e2c527678d27dc92cf7e43ffdc952bc741b3`.

Modifiche rispetto a upstream:

- `-ndjson`: ogni payload decodificato viene emesso su stdout come NDJSON
  (`{"topic": ..., "ts": ..., "data": ...}`), indipendentemente dall'upload.
  È il canale di comunicazione con l'app Electron (Albion Crafting).
- `-headless`: niente systray e niente auto-updater — il processo è gestito
  come figlio dall'app Electron.
- Nuovi decoder personali (loot, gathering, combat, trades) emessi SOLO in
  locale via NDJSON, mai caricati verso ingest pubblici o privati.

L'upload verso AODP resta quello upstream ed è **disattivato di default**
dall'app (flag `-d`); si abilita dai Settings (opt-in).

Per riallineare a upstream: confrontare `client/events.go` /
`client/operations.go` (gli enum dei codici cambiano con le patch del gioco).
