package hr

import "testing"

func TestValidateThaiNationalID(t *testing.T) {
	// "" is allowed — required-ness is enforced elsewhere.
	if err := ValidateThaiNationalID(""); err != nil {
		t.Errorf("empty should be allowed, got %v", err)
	}

	// Known-valid 13-digit IDs (constructed via the checksum rule).
	valid := []string{
		"1234567890121",  // sum=1*13+2*12+3*11+4*10+5*9+6*8+7*7+8*6+9*5+0*4+1*3+2*2 = 13+24+33+40+45+48+49+48+45+0+3+4 = 352; 352%11=0; check=(11-0)%10=1 ✓
		"1-2345-67890-12-1", // dashed form — same digits
	}
	for _, s := range valid {
		if err := ValidateThaiNationalID(s); err != nil {
			t.Errorf("ValidateThaiNationalID(%q) = %v, want nil", s, err)
		}
	}

	// Invalid cases.
	cases := []struct {
		in     string
		reason string
	}{
		{"1234567890123", "wrong checksum"},
		{"123", "too short"},
		{"12345678901234", "too long"},
		{"abcdefghijklm", "non-digit"},
		{"0000000000000", "checksum mismatch (all zeros has check=1)"},
	}
	for _, tc := range cases {
		if err := ValidateThaiNationalID(tc.in); err == nil {
			t.Errorf("ValidateThaiNationalID(%q) = nil, want error (%s)", tc.in, tc.reason)
		}
	}
}
