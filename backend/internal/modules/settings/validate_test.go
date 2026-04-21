package settings

import "testing"

func TestValidateCurrency(t *testing.T) {
	for _, ok := range []string{"THB", "thb", "USD", ""} {
		if err := ValidateCurrency(ok); err != nil {
			t.Errorf("ValidateCurrency(%q) unexpectedly errored: %v", ok, err)
		}
	}
	for _, bad := range []string{"XXX", "BTC", "123"} {
		if err := ValidateCurrency(bad); err == nil {
			t.Errorf("ValidateCurrency(%q) should have errored", bad)
		}
	}
}

func TestValidateTimezone(t *testing.T) {
	for _, ok := range []string{"Asia/Bangkok", "UTC", "Asia/Tokyo", ""} {
		if err := ValidateTimezone(ok); err != nil {
			t.Errorf("ValidateTimezone(%q) unexpectedly errored: %v", ok, err)
		}
	}
	for _, bad := range []string{"Mars/Olympus_Mons", "asia/bangkok", "GMT+7"} {
		if err := ValidateTimezone(bad); err == nil {
			t.Errorf("ValidateTimezone(%q) should have errored", bad)
		}
	}
}

func TestValidateRatePct_HappyPath(t *testing.T) {
	cases := map[string]string{
		"0":      "0.00",
		"7":      "7.00",
		"7.0":    "7.00",
		"7.50":   "7.50",
		"100":    "100.00",
		"  3.5 ": "3.50",
	}
	for input, want := range cases {
		got, err := ValidateRatePct(input)
		if err != nil {
			t.Errorf("ValidateRatePct(%q) errored: %v", input, err)
			continue
		}
		if got != want {
			t.Errorf("ValidateRatePct(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestValidateRatePct_Rejects(t *testing.T) {
	for _, bad := range []string{"", "abc", "-1", "101", "NaN"} {
		if _, err := ValidateRatePct(bad); err == nil {
			t.Errorf("ValidateRatePct(%q) should have errored", bad)
		}
	}
}

func TestValidateFiscalMonth(t *testing.T) {
	for m := int16(1); m <= 12; m++ {
		if err := ValidateFiscalMonth(m); err != nil {
			t.Errorf("ValidateFiscalMonth(%d) errored: %v", m, err)
		}
	}
	for _, bad := range []int16{0, -1, 13, 99} {
		if err := ValidateFiscalMonth(bad); err == nil {
			t.Errorf("ValidateFiscalMonth(%d) should have errored", bad)
		}
	}
}
