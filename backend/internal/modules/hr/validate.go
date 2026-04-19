package hr

import (
	"errors"
	"strings"
	"unicode"
)

// ValidateThaiNationalID returns nil when s is a syntactically valid 13-digit
// Thai national ID including the trailing checksum digit. Empty input is
// treated as valid (callers enforce required-ness separately) so this helper
// can be reused on optional fields.
//
// Spec: first 12 digits are multiplied by weights 13..2 respectively; the
// check digit equals (11 - sum mod 11) mod 10.
func ValidateThaiNationalID(s string) error {
	if s == "" {
		return nil
	}
	// Accept dash-formatted IDs (N-NNNN-NNNNN-NN-N) by stripping separators.
	cleaned := strings.Map(func(r rune) rune {
		if r == '-' || unicode.IsSpace(r) {
			return -1
		}
		return r
	}, s)
	if len(cleaned) != 13 {
		return errors.New("national_id must be 13 digits")
	}
	digits := make([]int, 13)
	for i, r := range cleaned {
		if r < '0' || r > '9' {
			return errors.New("national_id must contain only digits")
		}
		digits[i] = int(r - '0')
	}
	sum := 0
	for i := 0; i < 12; i++ {
		sum += digits[i] * (13 - i)
	}
	check := (11 - sum%11) % 10
	if check != digits[12] {
		return errors.New("national_id checksum does not match")
	}
	return nil
}
