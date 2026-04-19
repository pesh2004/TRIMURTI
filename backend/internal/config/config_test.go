package config

import (
	"strings"
	"testing"
)

// withEnv sets env vars for the duration of a test and restores the previous
// values afterwards. Keeps tests hermetic despite the fact that config.Load()
// reads directly from os.Getenv.
func withEnv(t *testing.T, kv map[string]string) {
	t.Helper()
	for k, v := range kv {
		t.Setenv(k, v)
	}
}

// baseValidEnv returns the minimum set of env vars for config.Load() to succeed.
func baseValidEnv() map[string]string {
	return map[string]string{
		"APP_ENV":            "development",
		"DATABASE_URL":       "postgres://trimurti:pw@localhost:5432/trimurti?sslmode=disable",
		"SESSION_SECRET":     "feedface" + strings.Repeat("0", 56), // 64 hex chars
		"PII_ENCRYPTION_KEY": "decafbad" + strings.Repeat("1", 56),
	}
}

func TestLoad_HappyPath(t *testing.T) {
	withEnv(t, baseValidEnv())
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.AppEnv != "development" {
		t.Errorf("AppEnv: got %q", cfg.AppEnv)
	}
	if cfg.SessionSecret == "" || cfg.PIIEncryptionKey == "" {
		t.Error("expected populated secrets")
	}
}

func TestLoad_MissingDatabaseURL(t *testing.T) {
	env := baseValidEnv()
	env["DATABASE_URL"] = ""
	withEnv(t, env)
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Errorf("expected DATABASE_URL error, got %v", err)
	}
}

func TestLoad_MissingSessionSecret(t *testing.T) {
	env := baseValidEnv()
	env["SESSION_SECRET"] = ""
	withEnv(t, env)
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "SESSION_SECRET") {
		t.Errorf("expected SESSION_SECRET required error, got %v", err)
	}
}

func TestLoad_MissingPIIKey(t *testing.T) {
	env := baseValidEnv()
	env["PII_ENCRYPTION_KEY"] = ""
	withEnv(t, env)
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "PII_ENCRYPTION_KEY") {
		t.Errorf("expected PII_ENCRYPTION_KEY required error, got %v", err)
	}
}

// Regression guard: the old behaviour silently fell back to a known key in
// dev mode. That path is gone — every env, including dev, must provide a
// real key. A test that hands in the old dev fallback string must fail.
func TestLoad_DevFallbackRejected(t *testing.T) {
	env := baseValidEnv()
	env["PII_ENCRYPTION_KEY"] = "dev-pii-key-do-not-use-in-production"
	withEnv(t, env)
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "placeholder") {
		t.Errorf("expected placeholder rejection for old dev fallback, got %v", err)
	}
}

// Guard against copy-paste from .env.example — each literal that ships in
// that file must be recognised as a placeholder.
func TestLoad_PlaceholderLiteralsRejected(t *testing.T) {
	literals := []string{
		"CHANGE_ME",
		"CHANGE_ME_32_BYTES_HEX",
		"CHANGE_ME_openssl_rand_hex_32",
		"CHANGE_ME_strong_random_24_bytes",
	}
	for _, lit := range literals {
		env := baseValidEnv()
		env["SESSION_SECRET"] = lit
		withEnv(t, env)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "placeholder") {
			t.Errorf("SESSION_SECRET=%q should be rejected as placeholder; got %v", lit, err)
		}
	}
}

func TestLoad_WhitespaceSecretRejected(t *testing.T) {
	env := baseValidEnv()
	env["SESSION_SECRET"] = "   \t  "
	withEnv(t, env)
	if _, err := Load(); err == nil {
		t.Error("whitespace-only SESSION_SECRET should fail")
	}
}

// placeholderSecrets is the same set validateSecret uses; this test pins
// the contract so a future drive-by addition doesn't accidentally exclude
// a known leak-vector.
func TestPlaceholderSetContainsKnownLeaks(t *testing.T) {
	required := []string{
		"CHANGE_ME",
		"CHANGE_ME_32_BYTES_HEX",
		"dev-pii-key-do-not-use-in-production",
	}
	for _, k := range required {
		if _, ok := placeholderSecrets[k]; !ok {
			t.Errorf("placeholderSecrets missing %q — known leak-vector must be blocked", k)
		}
	}
}
