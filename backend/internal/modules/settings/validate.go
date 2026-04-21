package settings

import (
	"errors"
	"math"
	"strconv"
	"strings"
)

// allowedCurrencies is the starter allowlist. Intentionally short — the
// business explicitly asked for THB-first with a path to SGD/VND for
// multi-entity. Anything exotic is a conscious code change, not a user-
// supplied free-text field.
var allowedCurrencies = map[string]struct{}{
	"THB": {}, "USD": {}, "SGD": {}, "VND": {}, "EUR": {}, "JPY": {}, "CNY": {}, "HKD": {},
}

// allowedTimezones mirrors the regions the construction group currently
// operates in. IANA database string — stored as-is so downstream code can
// pass it straight into date-fns-tz / time.LoadLocation.
var allowedTimezones = map[string]struct{}{
	"Asia/Bangkok":    {},
	"Asia/Singapore":  {},
	"Asia/Tokyo":      {},
	"Asia/Hong_Kong":  {},
	"Asia/Ho_Chi_Minh": {},
	"UTC":             {},
}

// ValidateCurrency rejects anything outside the allowlist to keep the
// monetary code-paths honest. Empty input is treated as "no change", to
// be gated by the caller's nil check.
func ValidateCurrency(s string) error {
	if s == "" {
		return nil
	}
	if _, ok := allowedCurrencies[strings.ToUpper(s)]; !ok {
		return errors.New("currency not supported")
	}
	return nil
}

func ValidateTimezone(s string) error {
	if s == "" {
		return nil
	}
	if _, ok := allowedTimezones[s]; !ok {
		return errors.New("timezone not supported")
	}
	return nil
}

// ValidateRatePct parses a percentage rate and enforces 0 ≤ rate ≤ 100
// with at most two decimals (matches NUMERIC(5,2)). Returns the cleaned
// canonical form so the handler can pass it verbatim to pgx.
func ValidateRatePct(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", errors.New("rate is required")
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
		return "", errors.New("rate must be a decimal number")
	}
	if f < 0 || f > 100 {
		return "", errors.New("rate must be between 0 and 100")
	}
	return strconv.FormatFloat(f, 'f', 2, 64), nil
}

// ValidateFiscalMonth mirrors the DB CHECK constraint.
func ValidateFiscalMonth(m int16) error {
	if m < 1 || m > 12 {
		return errors.New("fiscal_year_start_month must be between 1 and 12")
	}
	return nil
}
