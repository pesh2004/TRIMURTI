package auth

import (
	"testing"
)

func TestHashVerifyRoundTrip(t *testing.T) {
	h, err := Hash("correct horse battery staple", DefaultParams)
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	if err := Verify("correct horse battery staple", h); err != nil {
		t.Errorf("Verify matching: %v", err)
	}
	if err := Verify("wrong password", h); err == nil {
		t.Error("Verify mismatching: expected error, got nil")
	}
}

func TestVerifyInvalidHash(t *testing.T) {
	for _, bad := range []string{
		"",
		"not-a-hash",
		"$argon2i$v=19$m=65536,t=3,p=4$AAAA$BBBB", // wrong algo
		"$argon2id$v=99$m=65536,t=3,p=4$AAAA$BBBB", // wrong version
	} {
		if err := Verify("x", bad); err == nil {
			t.Errorf("Verify(%q): expected error, got nil", bad)
		}
	}
}

func TestHashUniquePerCall(t *testing.T) {
	a, _ := Hash("same", DefaultParams)
	b, _ := Hash("same", DefaultParams)
	if a == b {
		t.Error("two hashes of the same password must differ (salt randomness)")
	}
}
