package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/audit"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/config"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/db"
	mw "github.com/ama-bmgpesh/trimurti-erp/backend/internal/middleware"
	authmod "github.com/ama-bmgpesh/trimurti-erp/backend/internal/modules/auth"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/modules/health"
)

type echoValidator struct{ v *validator.Validate }

func (ev *echoValidator) Validate(i any) error { return ev.v.Struct(i) }

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config: %v\n", err)
		os.Exit(1)
	}

	// Logger
	level, _ := zerolog.ParseLevel(cfg.LogLevel)
	if level == zerolog.NoLevel {
		level = zerolog.InfoLevel
	}
	zerolog.TimeFieldFormat = time.RFC3339
	logger := zerolog.New(os.Stdout).Level(level).With().Timestamp().Str("svc", "api").Logger()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// DB + Redis
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Fatal().Err(err).Msg("database connection failed")
	}
	defer pool.Close()

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		logger.Fatal().Err(err).Msg("redis connection failed")
	}

	sessions := auth.NewStore(rdb, cfg.SessionTTL)
	auditWriter := audit.NewWriter(pool)

	// Echo
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.Validator = &echoValidator{v: validator.New()}

	e.Use(mw.RequestID())
	e.Use(mw.Logger(logger))
	e.Use(mw.Recover(logger))

	// CORS — simple strict allowlist for the frontend origin.
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			origin := c.Request().Header.Get("Origin")
			for _, allowed := range cfg.CORSOrigins {
				if origin == allowed {
					c.Response().Header().Set("Access-Control-Allow-Origin", origin)
					c.Response().Header().Set("Access-Control-Allow-Credentials", "true")
					c.Response().Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Request-ID, X-CSRF-Token")
					c.Response().Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
					c.Response().Header().Set("Vary", "Origin")
					break
				}
			}
			if c.Request().Method == http.MethodOptions {
				return c.NoContent(http.StatusNoContent)
			}
			return next(c)
		}
	})

	// ---- Routes ----
	health.New(pool, rdb).Register(e.Group(""))

	api := e.Group("/api/v1")

	// Global rate limit per IP (fail-open on redis outage).
	api.Use(mw.RateLimit(rdb, "ip", cfg.RateLimitPerMin, time.Minute, func(c echo.Context) string {
		return c.RealIP()
	}))

	// Auth module — public routes
	authHandler := authmod.New(pool, sessions, auditWriter, cfg.CookieName, cfg.CookieDomain, cfg.CookieSecure, cfg.SessionTTL)
	api.POST("/auth/login",
		authHandler.Login,
		mw.RateLimit(rdb, "login", cfg.LoginRateLimit, 15*time.Minute, func(c echo.Context) string {
			return c.RealIP()
		}),
	)
	api.POST("/auth/logout", authHandler.Logout)

	// Authenticated group
	authed := api.Group("")
	authed.Use(mw.Auth(sessions, cfg.CookieName))
	authed.GET("/auth/me", authHandler.Me)

	// TODO Phase 1 modules: dashboard, settings, hr_employees, gov_rbac, audit, approval.
	// Each module registers its routes on `authed` and wraps mutations with RequirePermission.

	// ---- Server ----
	srv := &http.Server{
		Addr:              ":" + strconv.Itoa(cfg.AppPort),
		Handler:           e,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	go func() {
		logger.Info().Int("port", cfg.AppPort).Str("env", cfg.AppEnv).Msg("api listening")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal().Err(err).Msg("server crashed")
		}
	}()

	<-ctx.Done()
	logger.Info().Msg("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("graceful shutdown failed")
	}
}
