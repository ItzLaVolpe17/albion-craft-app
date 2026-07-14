package client

import (
	"encoding/json"
	"os"
	"sync"
	"time"

	"github.com/ao-data/albiondata-client/log"
)

// Emette su stdout gli eventi decodificati come NDJSON, una riga per evento:
// {"topic":"...","ts":1234567890123,"data":{...}}
// È il canale di comunicazione con l'app Electron (attivo solo con -ndjson).

var ndjsonMu sync.Mutex

type ndjsonLine struct {
	Topic string      `json:"topic"`
	Ts    int64       `json:"ts"`
	Data  interface{} `json:"data"`
}

func emitLocal(topic string, data interface{}) {
	if !ConfigGlobal.NDJSON {
		return
	}
	line, err := json.Marshal(ndjsonLine{Topic: topic, Ts: time.Now().UnixMilli(), Data: data})
	if err != nil {
		log.Errorf("ndjson: could not marshal payload for %v: %v", topic, err)
		return
	}
	ndjsonMu.Lock()
	defer ndjsonMu.Unlock()
	os.Stdout.Write(append(line, '\n'))
}
