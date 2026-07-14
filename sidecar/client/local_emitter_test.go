package client

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"testing"
)

// captureStdout esegue fn con os.Stdout rediretto su una pipe e ne ritorna l'output.
func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	orig := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w
	done := make(chan string)
	go func() {
		var out []byte
		buf := bufio.NewReader(r)
		for {
			b, err := buf.ReadBytes('\n')
			out = append(out, b...)
			if err == io.EOF {
				break
			}
			if err != nil {
				break
			}
		}
		done <- string(out)
	}()
	fn()
	w.Close()
	os.Stdout = orig
	return <-done
}

func TestEmitLocal_NDJSONFormat(t *testing.T) {
	prev := ConfigGlobal.NDJSON
	ConfigGlobal.NDJSON = true
	defer func() { ConfigGlobal.NDJSON = prev }()

	out := captureStdout(t, func() {
		emitLocal("marketorders.ingest", map[string]any{"ItemID": "T4_BAG", "Price": 1234})
	})

	var line ndjsonLine
	if err := json.Unmarshal([]byte(out), &line); err != nil {
		t.Fatalf("output is not valid NDJSON: %v (%q)", err, out)
	}
	if line.Topic != "marketorders.ingest" {
		t.Errorf("topic = %q, want marketorders.ingest", line.Topic)
	}
	if line.Ts <= 0 {
		t.Errorf("ts = %d, want a positive epoch-millis timestamp", line.Ts)
	}
	data, ok := line.Data.(map[string]any)
	if !ok || data["ItemID"] != "T4_BAG" {
		t.Errorf("data not round-tripped: %+v", line.Data)
	}
}

func TestEmitLocal_SilentWhenDisabled(t *testing.T) {
	prev := ConfigGlobal.NDJSON
	ConfigGlobal.NDJSON = false
	defer func() { ConfigGlobal.NDJSON = prev }()

	out := captureStdout(t, func() {
		emitLocal("marketorders.ingest", map[string]any{"ItemID": "T4_BAG"})
	})
	if out != "" {
		t.Errorf("expected no output when NDJSON disabled, got %q", out)
	}
}
