package client

import (
	"encoding/json"
	"testing"
)

func TestNumCoercion(t *testing.T) {
	cases := []struct {
		in   interface{}
		want int64
	}{
		{int8(5), 5}, {int16(300), 300}, {int32(70000), 70000},
		{int64(9), 9}, {uint8(200), 200}, {float64(4.9), 4}, {float32(2.0), 2},
		{"nope", 0}, {nil, 0},
	}
	for _, c := range cases {
		if got := numToInt(c.in); got != c.want {
			t.Errorf("numToInt(%v[%T]) = %d, want %d", c.in, c.in, got, c.want)
		}
	}
}

func TestHarvestFinished_Emits(t *testing.T) {
	prev := ConfigGlobal.NDJSON
	ConfigGlobal.NDJSON = true
	defer func() { ConfigGlobal.NDJSON = prev }()

	state := &albionState{LocationId: "1002", LocalPlayerObjectID: -1}
	ev := eventHarvestFinished{
		ItemIndex: int32(842),
		Standard:  int8(2),
		Collector: int8(1),
		Premium:   int8(1),
	}
	out := captureStdout(t, func() { ev.Process(state) })

	var line ndjsonLine
	if err := json.Unmarshal([]byte(out), &line); err != nil {
		t.Fatalf("not NDJSON: %v (%q)", err, out)
	}
	if line.Topic != topicGathering {
		t.Errorf("topic = %q, want %q", line.Topic, topicGathering)
	}
	data := line.Data.(map[string]any)
	if data["amount"].(float64) != 4 {
		t.Errorf("amount = %v, want 4 (2+1+1)", data["amount"])
	}
	if data["itemIndex"].(float64) != 842 {
		t.Errorf("itemIndex = %v, want 842", data["itemIndex"])
	}
}

func TestHealthUpdate_AttributesToLocalPlayer(t *testing.T) {
	prev := ConfigGlobal.NDJSON
	ConfigGlobal.NDJSON = true
	defer func() { ConfigGlobal.NDJSON = prev }()

	// senza object id locale: niente output
	silent := captureStdout(t, func() {
		eventHealthUpdate{Target: 10, HealthChange: -50.0, CauserID: 7}.Process(&albionState{LocalPlayerObjectID: -1})
	})
	if silent != "" {
		t.Errorf("expected no output without local player id, got %q", silent)
	}

	// causer = giocatore locale, danno negativo → evento damage
	state := &albionState{LocalPlayerObjectID: 7}
	out := captureStdout(t, func() {
		eventHealthUpdate{Target: 10, HealthChange: -50.0, CauserID: 7}.Process(state)
	})
	var line ndjsonLine
	if err := json.Unmarshal([]byte(out), &line); err != nil {
		t.Fatalf("not NDJSON: %v (%q)", err, out)
	}
	data := line.Data.(map[string]any)
	if data["kind"] != "damage" || data["amount"].(float64) != 50 {
		t.Errorf("got %+v, want damage/50", data)
	}
}

func TestNewCharacter_SetsLocalObjectId(t *testing.T) {
	state := &albionState{CharacterName: "LaVolpe", LocalPlayerObjectID: -1}
	eventNewCharacterLocal{ObjectID: int32(42), Name: "LaVolpe"}.Process(state)
	if state.LocalPlayerObjectID != 42 {
		t.Errorf("LocalPlayerObjectID = %d, want 42", state.LocalPlayerObjectID)
	}
	// un altro personaggio non deve sovrascrivere
	eventNewCharacterLocal{ObjectID: int32(99), Name: "Someone"}.Process(state)
	if state.LocalPlayerObjectID != 42 {
		t.Errorf("LocalPlayerObjectID overwritten to %d, want 42", state.LocalPlayerObjectID)
	}
}
