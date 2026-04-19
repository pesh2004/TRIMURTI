package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv           string
	AppPort          int
	AppBaseURL       string
	FrontendBaseURL  string
	LogLevel         string
	TZ               string
	DatabaseURL      string
	RedisAddr        string
	RedisPassword    string
	RedisDB          int
	SessionSecret    string
	SessionTTL       time.Duration
	CookieName       string
	CookieDomain     string
	CookieSecure     bool
	Argon2MemoryKB   uint32
	Argon2Iterations uint32
	Argon2Parallel   uint8
	PIIEncryptionKey string
	SMTPHost         string
	SMTPPort         int
	SMTPFrom         string
	SMTPUser         string
	SMTPPass         string
	CORSOrigins      []string
	RateLimitPerMin  int
	LoginRateLimit   int
}

func Load() (*Config, error) {
	c := &Config{
		AppEnv:           getEnv("APP_ENV", "development"),
		AppPort:          getEnvInt("APP_PORT", 8080),
		AppBaseURL:       getEnv("APP_BASE_URL", "http://localhost:8080"),
		FrontendBaseURL:  getEnv("FRONTEND_BASE_URL", "http://localhost:5173"),
		LogLevel:         getEnv("LOG_LEVEL", "info"),
		TZ:               getEnv("TZ", "Asia/Bangkok"),
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		RedisAddr:        getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:    getEnv("REDIS_PASSWORD", ""),
		RedisDB:          getEnvInt("REDIS_DB", 0),
		SessionSecret:    getEnv("SESSION_SECRET", ""),
		SessionTTL:       time.Duration(getEnvInt("SESSION_TTL_MINUTES", 30)) * time.Minute,
		CookieName:       getEnv("SESSION_COOKIE_NAME", "trimurti_sess"),
		CookieDomain:     getEnv("SESSION_COOKIE_DOMAIN", "localhost"),
		CookieSecure:     getEnvBool("SESSION_COOKIE_SECURE", false),
		Argon2MemoryKB:   uint32(getEnvInt("ARGON2_MEMORY_KB", 65536)),
		Argon2Iterations: uint32(getEnvInt("ARGON2_ITERATIONS", 3)),
		Argon2Parallel:   uint8(getEnvInt("ARGON2_PARALLELISM", 4)),
		PIIEncryptionKey: getEnv("PII_ENCRYPTION_KEY", ""),
		SMTPHost:         getEnv("SMTP_HOST", ""),
		SMTPPort:         getEnvInt("SMTP_PORT", 587),
		SMTPFrom:         getEnv("SMTP_FROM", "no-reply@trimurti.local"),
		SMTPUser:         getEnv("SMTP_USER", ""),
		SMTPPass:         getEnv("SMTP_PASS", ""),
		CORSOrigins:      splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),
		RateLimitPerMin:  getEnvInt("RATE_LIMIT_PER_MINUTE", 100),
		LoginRateLimit:   getEnvInt("LOGIN_RATE_LIMIT_PER_15MIN", 5),
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if err := validateSecret("SESSION_SECRET", c.SessionSecret); err != nil {
		return nil, err
	}
	if err := validateSecret("PII_ENCRYPTION_KEY", c.PIIEncryptionKey); err != nil {
		return nil, err
	}
	return c, nil
}

// placeholderSecrets is the set of values that ship in .env.example templates
// or the old dev fallback — never valid at runtime in any environment. Kept
// package-level so tests can assert against the same list.
var placeholderSecrets = map[string]struct{}{
	"CHANGE_ME":                            {},
	"CHANGEME":                             {},
	"changeme":                             {},
	"CHANGE_ME_32_BYTES_HEX":               {},
	"CHANGE_ME_openssl_rand_hex_32":        {},
	"CHANGE_ME_strong_random_24_bytes":     {},
	"dev-pii-key-do-not-use-in-production": {}, // the old fallback; refuse if it leaked into a real .env
}

// validateSecret enforces that production-critical secrets are (a) set and
// (b) not one of the well-known template/placeholder values. Hard-fails in
// every environment including development — we used to allow a dev fallback
// for PII_ENCRYPTION_KEY, but the threat model (prod quietly inheriting a
// known key if APP_ENV is wrong) was too big to leave in. Devs generate
// their own key the same way prod does: `openssl rand -hex 32`.
func validateSecret(name, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required — generate with `openssl rand -hex 32` and put it in .env", name)
	}
	if _, isPlaceholder := placeholderSecrets[value]; isPlaceholder {
		return fmt.Errorf("%s looks like a placeholder (%q) — replace with a real secret before starting", name, value)
	}
	return nil
}

func (c *Config) IsProd() bool { return strings.EqualFold(c.AppEnv, "production") }

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
