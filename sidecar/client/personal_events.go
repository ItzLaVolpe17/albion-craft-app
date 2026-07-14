package client

// Decoder personali del fork: gathering, fame, combat, loot.
// Non vengono MAI caricati verso ingest pubblici o privati: sono emessi solo
// in locale via NDJSON per l'app Electron.
//
// Indici dei parametri portati dagli handler di Statistics Analysis Tool
// (github.com/Triky313/AlbionOnline-StatisticsAnalysis). Gli indici e i codici
// evento cambiano con le patch del gioco: sono raccolti qui per aggiornarli
// facilmente seguendo le release di SAT.

import (
	"github.com/ao-data/albiondata-client/log"
)

// Topic NDJSON dei dati personali (namespace "personal." per distinguerli
// dai topic AODP di mercato/oro).
const (
	topicGathering = "personal.gathering"
	topicFame      = "personal.fame"
	topicCombat    = "personal.combat"
	topicLoot      = "personal.loot"
)

// numToFloat/numToInt coercono i numeri Photon (int8/16/32/64, uint*, float*)
// verso un tipo unico. I tipi sul filo variano tra le patch: la coercizione
// tollerante evita errori di decodifica e lascia calibrare sui dati reali.
func numToFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int8:
		return float64(n)
	case int16:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	case uint8:
		return float64(n)
	case uint16:
		return float64(n)
	case uint32:
		return float64(n)
	case uint64:
		return float64(n)
	default:
		return 0
	}
}

func numToInt(v interface{}) int64 {
	return int64(numToFloat(v))
}

// ---- NewCharacter: cattura l'object id del giocatore locale ----
// SAT: 0=objectId, 1=name, 7=characterGuid(uuid)

type eventNewCharacterLocal struct {
	ObjectID interface{} `mapstructure:"0"`
	Name     string      `mapstructure:"1"`
}

func (e eventNewCharacterLocal) Process(state *albionState) {
	// combacia col nostro personaggio? allora questo è il nostro object id runtime
	if state.CharacterName != "" && e.Name == state.CharacterName {
		id := numToInt(e.ObjectID)
		if state.LocalPlayerObjectID != id {
			state.LocalPlayerObjectID = id
			log.Debugf("Local player object id set to %d", id)
		}
	}
}

// ---- HarvestFinished: risorsa raccolta ----
// SAT: 4=itemIndex, 5=standardAmount, 6=collectorBonus, 7=premiumBonus

type eventHarvestFinished struct {
	ItemIndex interface{} `mapstructure:"4"`
	Standard  interface{} `mapstructure:"5"`
	Collector interface{} `mapstructure:"6"`
	Premium   interface{} `mapstructure:"7"`
}

func (e eventHarvestFinished) Process(state *albionState) {
	total := numToInt(e.Standard) + numToInt(e.Collector) + numToInt(e.Premium)
	if total <= 0 {
		return
	}
	emitLocal(topicGathering, map[string]interface{}{
		"itemIndex":  numToInt(e.ItemIndex),
		"amount":     total,
		"standard":   numToInt(e.Standard),
		"collector":  numToInt(e.Collector),
		"premium":    numToInt(e.Premium),
		"locationId": state.LocationId,
	})
}

// ---- UpdateFame: fame guadagnata ----
// SAT: 1=totalFame, 2=fameWithZone, 3=zoneFameGained, 5=premiumFlag

type eventUpdateFame struct {
	Total     interface{} `mapstructure:"1"`
	ZoneGain  interface{} `mapstructure:"3"`
	IsPremium interface{} `mapstructure:"5"`
}

func (e eventUpdateFame) Process(state *albionState) {
	gained := numToFloat(e.ZoneGain) / 10000.0 // i valori fame sono ×10000 sul filo
	if gained <= 0 {
		return
	}
	premium := false
	if b, ok := e.IsPremium.(bool); ok {
		premium = b
	}
	emitLocal(topicFame, map[string]interface{}{
		"gained":     gained,
		"total":      numToFloat(e.Total) / 10000.0,
		"premium":    premium,
		"locationId": state.LocationId,
	})
}

// ---- HealthUpdate: danno/cura, attribuito al giocatore locale ----
// SAT: 0=target, 2=healthChange, 6=causerId

type eventHealthUpdate struct {
	Target       interface{} `mapstructure:"0"`
	HealthChange interface{} `mapstructure:"2"`
	CauserID     interface{} `mapstructure:"6"`
}

func (e eventHealthUpdate) Process(state *albionState) {
	// senza l'object id locale non possiamo attribuire nulla a noi: ignora,
	// altrimenti emetteremmo ogni scambio di colpi della zona.
	if state.LocalPlayerObjectID < 0 {
		return
	}
	causer := numToInt(e.CauserID)
	target := numToInt(e.Target)
	change := numToFloat(e.HealthChange)

	if causer == state.LocalPlayerObjectID && change < 0 {
		// danno che infliggiamo (healthChange negativo sul bersaglio)
		emitLocal(topicCombat, map[string]interface{}{
			"kind":     "damage",
			"amount":   -change,
			"targetId": target,
		})
	} else if causer == state.LocalPlayerObjectID && change > 0 {
		// cura che eroghiamo
		emitLocal(topicCombat, map[string]interface{}{
			"kind":     "heal",
			"amount":   change,
			"targetId": target,
		})
	}
}
