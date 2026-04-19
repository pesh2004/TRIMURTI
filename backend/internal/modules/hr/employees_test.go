package hr

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
)

// withSession builds an echo.Context whose request carries the given session.
// Used throughout applyPIIMask tests.
func withSession(t *testing.T, s *auth.Session) echo.Context {
	t.Helper()
	req := httptest.NewRequest("GET", "/", nil)
	ctx := req.Context()
	if s != nil {
		ctx = auth.WithSession(ctx, s)
	}
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()
	return echo.New().NewContext(req, rec)
}

func strPtr(s string) *string { return &s }

func TestApplyPIIMask_NilEmployeeIsNoOp(t *testing.T) {
	// Guard clause: must not panic on nil input.
	applyPIIMask(withSession(t, nil), nil)
}

func TestApplyPIIMask_AnonymousSessionMasksBoth(t *testing.T) {
	e := &Employee{
		NationalID: strPtr("1234567890123"),
		Salary:     strPtr("45000.00"),
	}
	applyPIIMask(withSession(t, nil), e)

	if got := *e.NationalID; got != strings.Repeat("•", 9)+"0123" {
		t.Errorf("NationalID = %q, want 9 bullets + last-4", got)
	}
	if got := *e.Salary; got != salaryMasked {
		t.Errorf("Salary = %q, want masked", got)
	}
}

func TestApplyPIIMask_WithoutRevealPermissionMasksBoth(t *testing.T) {
	sess := &auth.Session{Permissions: []string{"hr_employees.read"}} // no reveal_pii
	e := &Employee{
		NationalID: strPtr("1234567890123"),
		Salary:     strPtr("45000.00"),
	}
	applyPIIMask(withSession(t, sess), e)

	if !strings.HasPrefix(*e.NationalID, "•") || !strings.HasSuffix(*e.NationalID, "0123") {
		t.Errorf("NationalID not masked: %q", *e.NationalID)
	}
	if *e.Salary != salaryMasked {
		t.Errorf("Salary not masked: %q", *e.Salary)
	}
}

func TestApplyPIIMask_WithRevealPermissionLeavesValuesIntact(t *testing.T) {
	sess := &auth.Session{Permissions: []string{"hr_employees.read", PermRevealPII}}
	e := &Employee{
		NationalID: strPtr("1234567890123"),
		Salary:     strPtr("45000.00"),
	}
	applyPIIMask(withSession(t, sess), e)

	if *e.NationalID != "1234567890123" {
		t.Errorf("NationalID mutated: %q", *e.NationalID)
	}
	if *e.Salary != "45000.00" {
		t.Errorf("Salary mutated: %q", *e.Salary)
	}
}

func TestApplyPIIMask_ShortNationalIDMasksEntirely(t *testing.T) {
	// Short NID (<= 4 chars) can't expose "last 4" without revealing the
	// full value, so the mask blankets the whole string.
	e := &Employee{NationalID: strPtr("1234")}
	applyPIIMask(withSession(t, nil), e)

	if got := *e.NationalID; got != "••••" {
		t.Errorf("NationalID = %q, want all-bullets", got)
	}
}

func TestApplyPIIMask_NilFieldsAreLeftAlone(t *testing.T) {
	e := &Employee{} // both pointers nil
	applyPIIMask(withSession(t, nil), e)

	if e.NationalID != nil || e.Salary != nil {
		t.Error("nil PII fields should stay nil after masking")
	}
}

func TestApplyPIIMask_EmptyStringNationalIDIsLeftAlone(t *testing.T) {
	// An empty string is not the same as "hidden value" — preserve it as-is
	// so callers can distinguish "not provided" from "masked".
	empty := ""
	e := &Employee{NationalID: &empty}
	applyPIIMask(withSession(t, nil), e)

	if *e.NationalID != "" {
		t.Errorf("empty NationalID mutated to %q", *e.NationalID)
	}
}

func TestParseDate(t *testing.T) {
	cases := []struct {
		in      string
		wantErr bool
	}{
		{"2026-04-19", false},
		{"2026-12-31", false},
		{"", true},
		{"not-a-date", true},
		{"2026/04/19", true}, // wrong separator
		{"26-04-19", true},   // 2-digit year
	}
	for _, tc := range cases {
		_, err := parseDate(tc.in)
		if (err != nil) != tc.wantErr {
			t.Errorf("parseDate(%q) err=%v, wantErr=%v", tc.in, err, tc.wantErr)
		}
	}

	// Round-trip sanity: parsed time must serialize back to the same date.
	got, _ := parseDate("2026-04-19")
	if got.Format("2006-01-02") != "2026-04-19" {
		t.Errorf("parseDate roundtrip: %v", got)
	}
	if _, offset := got.Zone(); offset != 0 {
		t.Errorf("parseDate should produce UTC, got offset=%d", offset)
	}
}

func TestParseIntDefault(t *testing.T) {
	cases := []struct {
		in   string
		def  int
		want int
	}{
		{"", 25, 25},
		{"10", 25, 10},
		{"abc", 25, 25},
		{"-5", 25, -5},
		{"0", 25, 0},
	}
	for _, tc := range cases {
		if got := parseIntDefault(tc.in, tc.def); got != tc.want {
			t.Errorf("parseIntDefault(%q, %d) = %d, want %d", tc.in, tc.def, got, tc.want)
		}
	}
}

func TestMarshalAddress(t *testing.T) {
	// nil → nil bytes, no error
	b, err := marshalAddress(nil)
	if err != nil || b != nil {
		t.Errorf("nil input: got (%v, %v)", b, err)
	}

	// map → valid JSON
	b, err = marshalAddress(map[string]string{"city": "Bangkok"})
	if err != nil {
		t.Fatalf("map input: %v", err)
	}
	if !strings.Contains(string(b), "Bangkok") {
		t.Errorf("marshalled address lost content: %q", b)
	}

	// unmarshallable type → error
	_, err = marshalAddress(make(chan int))
	if err == nil {
		t.Error("expected error for unmarshallable type")
	}
}

// Ensures the Employee struct still carries the time fields the handler expects.
// Cheap safety net: if someone renames these the test fails loudly.
func TestEmployee_HasExpectedTimeFields(t *testing.T) {
	e := Employee{
		HiredAt:   time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if e.HiredAt.IsZero() || e.CreatedAt.IsZero() || e.UpdatedAt.IsZero() {
		t.Error("expected populated time fields")
	}
}
