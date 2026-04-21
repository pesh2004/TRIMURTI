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
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/email"
	mw "github.com/ama-bmgpesh/trimurti-erp/backend/internal/middleware"
	authmod "github.com/ama-bmgpesh/trimurti-erp/backend/internal/modules/auth"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/modules/health"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/modules/hr"
	meMod "github.com/ama-bmgpesh/trimurti-erp/backend/internal/modules/me"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/modules/settings"
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
	defer func() { _ = rdb.Close() }()
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
	mailer := email.NewFromEnv(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPFrom, cfg.SMTPUser, cfg.SMTPPass)
	resetHandler := authmod.NewResetHandler(authHandler, mailer, cfg.FrontendBaseURL)
	api.POST("/auth/login",
		authHandler.Login,
		mw.RateLimit(rdb, "login", cfg.LoginRateLimit, 15*time.Minute, func(c echo.Context) string {
			return c.RealIP()
		}),
	)
	api.POST("/auth/logout", authHandler.Logout)
	// Password reset — rate-limit the request endpoint so it can't be used
	// as an email-bombing or user-enumeration oracle. Confirm rate-limits
	// by token hash lookup naturally (invalid tokens return 400).
	api.POST("/auth/password-reset/request",
		resetHandler.RequestReset,
		mw.RateLimit(rdb, "password_reset", 5, 15*time.Minute, func(c echo.Context) string {
			return c.RealIP()
		}),
	)
	api.POST("/auth/password-reset/confirm", resetHandler.ConfirmReset)

	// Authenticated group. CSRF guards every mutation (GET/HEAD/OPTIONS pass
	// through untouched); see middleware.CSRF for the double-submit pattern.
	authed := api.Group("")
	authed.Use(mw.Auth(sessions, cfg.CookieName, pool))
	authed.Use(mw.CSRF())
	authed.GET("/auth/me", authHandler.Me)
	authed.POST("/auth/switch-company", authHandler.SwitchCompany)

	// --- /me/* — self-service endpoints (PDPA data export lives here) ---
	meHandler := meMod.New(pool, auditWriter, cfg.PIIEncryptionKey)
	authed.GET("/me/export", meHandler.Export)

	// --- HR master (read-only dropdowns) ---
	hrMaster := hr.NewMasterHandler(pool)
	hrRead := mw.RequirePermission("hr_master.read")
	authed.GET("/hr/companies", hrMaster.ListCompanies, hrRead)
	authed.GET("/hr/departments", hrMaster.ListDepartments, hrRead)
	authed.GET("/hr/positions", hrMaster.ListPositions, hrRead)

	// --- HR employees ---
	// Per-user rate limits on the mutation endpoints — a single logged-in
	// session shouldn't be able to, say, terminate hundreds of employees
	// in a minute. Create/Update are generous (bulk imports are legitimate);
	// Terminate is tight because it's business-sensitive.
	hrEmp := hr.NewEmployeesHandler(pool, auditWriter, cfg.PIIEncryptionKey)
	rlEmpWrite := mw.RateLimitByUser(rdb, "hr_employees_write", 100, time.Hour)
	rlEmpTerm := mw.RateLimitByUser(rdb, "hr_employees_terminate", 10, time.Hour)
	authed.GET("/hr/employees", hrEmp.List, mw.RequirePermission("hr_employees.read"))
	authed.GET("/hr/employees/:id", hrEmp.Get, mw.RequirePermission("hr_employees.read"))
	authed.POST("/hr/employees", hrEmp.Create, mw.RequirePermission("hr_employees.write"), rlEmpWrite)
	authed.PATCH("/hr/employees/:id", hrEmp.Update, mw.RequirePermission("hr_employees.write"), rlEmpWrite)
	authed.POST("/hr/employees/:id/terminate", hrEmp.Terminate, mw.RequirePermission("hr_employees.terminate"), rlEmpTerm)

	// --- Settings (company profile + integrations status) ---
	// Write endpoint rate-limited per user because bulk company-profile
	// churn isn't a legitimate workflow and a runaway form would otherwise
	// spam audit rows.
	settingsH := settings.New(pool, auditWriter, cfg)
	rlSettingsWrite := mw.RateLimitByUser(rdb, "settings_write", 30, time.Hour)
	authed.GET("/settings/company", settingsH.GetCompany, mw.RequirePermission("settings.read"))
	authed.PUT("/settings/company", settingsH.UpdateCompany, mw.RequirePermission("settings.write"), rlSettingsWrite)
	authed.GET("/settings/integrations", settingsH.GetIntegrations, mw.RequirePermission("settings.read"))

	// TODO Phase 1 additions: dashboard, gov_rbac, audit, approval.

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
