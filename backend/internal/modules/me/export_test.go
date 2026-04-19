package me

import "testing"

// Pure helper: the loadUser path appends to nil-initialised slices and
// the response JSON must not emit `null` for Roles/Permissions. nonNil
// is the guard — exercise it without a DB.
func TestNonNil_TurnsNilIntoEmpty(t *testing.T) {
	if got := nonNil(nil); got == nil {
		t.Error("nonNil(nil) must return non-nil empty slice so JSON is []")
	}
	if got := nonNil([]string{"a", "b"}); len(got) != 2 || got[0] != "a" {
		t.Errorf("passthrough failed: %v", got)
	}
}

// Smoke-check the maxAuditRowsPerExport constant is sane. Too low and a
// real user with normal activity loses legitimate trail from their PDPA
// export; too high and we risk blowing memory on a malicious repeated
// call.
func TestAuditCap_IsReasonable(t *testing.T) {
	if maxAuditRowsPerExport < 100 {
		t.Errorf("cap too tight: %d", maxAuditRowsPerExport)
	}
	if maxAuditRowsPerExport > 10_000 {
		t.Errorf("cap too loose: %d (risks OOM on repeated export)", maxAuditRowsPerExport)
	}
}
