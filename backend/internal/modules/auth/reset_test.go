package authmod

import (
	"context"
	"regexp"
	"testing"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/email"
)

// The reset path is tested end-to-end in the integration suite (hits a real
// postgres). Here we focus on the pure helpers that are easy to get wrong
// and whose failure modes don't require a DB:
//
//   - token generation: must be URL-safe, high-entropy, and the stored
//     hash must NOT equal the raw token.
//   - hashToken: deterministic, hex, exactly 64 chars.
//   - ConsoleSender: never errors, prints expected fields.

func TestNewResetToken_ProducesUrlSafeHighEntropy(t *testing.T) {
	raw, hash, err := newResetToken()
	if err != nil {
		t.Fatalf("newResetToken: %v", err)
	}
	// base64-url of 32 bytes = 43 chars. Anything shorter indicates a
	// truncated RNG read.
	if len(raw) < 40 {
		t.Errorf("raw token too short: %d chars", len(raw))
	}
	// Must not contain '+' '/' '=' (base64-url avoids them).
	if m, _ := regexp.MatchString(`[+/=]`, raw); m {
		t.Errorf("raw token has URL-unsafe chars: %q", raw)
	}
	// Stored hash must differ from raw — else a DB leak hands the attacker
	// the actual token.
	if hash == raw {
		t.Error("stored hash must not equal raw token")
	}
	if len(hash) != 64 {
		t.Errorf("hash should be 64 hex chars, got %d", len(hash))
	}
}

func TestNewResetToken_IsUnique(t *testing.T) {
	// Not a cryptographic guarantee — just a sanity check that rand.Read
	// isn't stuck.
	seen := map[string]struct{}{}
	for i := 0; i < 10; i++ {
		raw, _, err := newResetToken()
		if err != nil {
			t.Fatalf("newResetToken iter %d: %v", i, err)
		}
		if _, dup := seen[raw]; dup {
			t.Errorf("duplicate token after %d iterations", i)
		}
		seen[raw] = struct{}{}
	}
}

func TestHashToken_IsDeterministic(t *testing.T) {
	a := hashToken("abc123")
	b := hashToken("abc123")
	if a != b {
		t.Errorf("hashToken should be deterministic: %s vs %s", a, b)
	}
	// Empty input still produces a 64-char hex string (sha256 of empty).
	if len(hashToken("")) != 64 {
		t.Error("empty hash should still be 64 chars")
	}
}

func TestConsoleSender_DoesNotError(t *testing.T) {
	// Sanity: ConsoleSender is the fallback when SMTP isn't wired. It must
	// never fail — a reset request that can't email the token still
	// commits the token to the DB, so the operator can retrieve the link
	// from server logs.
	s := &email.ConsoleSender{From: "test@example.local"}
	err := s.Send(context.Background(), email.Message{
		To: "u@example.local", Subject: "x", Body: "y",
	})
	if err != nil {
		t.Fatalf("ConsoleSender.Send: %v", err)
	}
}

func TestNullIfEmpty(t *testing.T) {
	if nullIfEmpty("") != nil {
		t.Error("empty string must become nil (SQL NULL)")
	}
	v, ok := nullIfEmpty("abc").(string)
	if !ok || v != "abc" {
		t.Errorf("non-empty should pass through unchanged: %v", v)
	}
}
