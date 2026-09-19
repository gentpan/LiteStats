package main

import "testing"

func TestParsePing(t *testing.T) {
	for _, tc := range []struct {
		output        string
		latency, loss float64
		valid         bool
	}{
		{"3 packets transmitted, 3 received, 0% packet loss\nrtt min/avg/max/mdev = 0.1/0.235/0.4/0.1 ms", 0.235, 0, true},
		{"3 packets transmitted, 2 packets received, 33.3% packet loss\nround-trip min/avg/max/stddev = 8/12.5/17/4.5 ms", 12.5, 33.3, true},
		{"3 packets transmitted, 0 received, 100% packet loss", -1, 100, true},
		{"ping: Operation not permitted", 0, 0, false},
	} {
		latency, loss, valid := parsePing(tc.output)
		if latency != tc.latency || loss != tc.loss || valid != tc.valid {
			t.Fatalf("unexpected result: %v %v %v", latency, loss, valid)
		}
	}
}

func TestMemoryMB(t *testing.T) {
	total, used := memoryMB()
	if total <= 0 {
		t.Fatalf("expected total > 0, got %d", total)
	}
	if used < 0 || used > total {
		t.Fatalf("expected 0 <= used <= total (%d), got %d", total, used)
	}
	t.Logf("memoryMB: total = %d MB, used = %d MB (%.1f%%)", total, used, float64(used)*100/float64(total))
}
