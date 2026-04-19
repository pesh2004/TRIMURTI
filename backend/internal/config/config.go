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
		SMTPHost:         getEnv("SMTP_HOST", "localhost"),
		SMTPPort:         getEnvInt("SMTP_PORT", 1025),
		SMTPFrom:         getEnv("SMTP_FROM", "no-reply@trimurti.local"),
		CORSOrigins:      splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),
		RateLimitPerMin:  getEnvInt("RATE_LIMIT_PER_MINUTE", 100),
		LoginRateLimit:   getEnvInt("LOGIN_RATE_LIMIT_PER_15MIN", 5),
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if c.SessionSecret == "" || c.SessionSecret == "CHANGE_ME_32_BYTES_HEX" {
		if c.AppEnv != "development" {
			return nil, fmt.Errorf("SESSION_SECRET must be set to a real value outside development")
		}
	}
	if c.PIIEncryptionKey == "" {
		if c.AppEnv != "development" {
			return nil, fmt.Errorf("PII_ENCRYPTION_KEY is required in production (generate with: openssl rand -hex 32)")
		}
		// Dev default: deterministic but clearly non-prod.
		c.PIIEncryptionKey = "dev-pii-key-do-not-use-in-production"
	}
	return c, nil
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
