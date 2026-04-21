package middleware

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
)

// RequestID attaches a UUID to each request, reading X-Request-ID when present
// so upstream load balancers / clients can correlate.
func RequestID() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			id := c.Request().Header.Get("X-Request-ID")
			if id == "" {
				id = uuid.NewString()
			}
			c.Set("request_id", id)
			c.Response().Header().Set("X-Request-ID", id)
			return next(c)
		}
	}
}

// Logger emits one structured log line per request, with latency + status + user.
func Logger(logger zerolog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			err := next(c)
			latency := time.Since(start)

			status := c.Response().Status
			reqID, _ := c.Get("request_id").(string)
			userID := int64(0)
			if s := auth.FromContext(c.Request().Context()); s != nil {
				userID = s.UserID
			}

			ev := logger.Info()
			if err != nil || status >= 500 {
				ev = logger.Error().Err(err)
				// Surface the underlying cause when handlers wrap it via
				// middleware.InternalError — the public message is
				// intentionally opaque, but ops need the real error for
				// debugging.
				if he, ok := err.(*echo.HTTPError); ok && he.Internal != nil {
					ev = ev.AnErr("internal_err", he.Internal)
				}
			} else if status >= 400 {
				ev = logger.Warn()
			}
			ev.Str("request_id", reqID).
				Str("method", c.Request().Method).
				Str("path", c.Path()).
				Str("uri", c.Request().RequestURI).
				Int("status", status).
				Dur("latency", latency).
				Str("ip", c.RealIP()).
				Int64("user_id", userID).
				Msg("http")
			return err
		}
	}
}

// Recover captures panics in handlers. Middleware chain already has request_id set.
func Recover(logger zerolog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) (err error) {
			defer func() {
				if r := recover(); r != nil {
					reqID, _ := c.Get("request_id").(string)
					logger.Error().Interface("panic", r).Str("request_id", reqID).Msg("handler panic")
					err = echo.NewHTTPError(http.StatusInternalServerError, "internal error")
				}
			}()
			return next(c)
		}
	}
}

// Auth validates the session cookie and injects the session into context.
// Rejects anonymous requests with 401.
//
// The pool argument is used to lazily back-fill ActiveCompanyID on sessions
// that were created before the multi-entity migration landed. This way an
// ops rollout does not force every existing user to re-login. When the
// session already carries a value, no DB query happens.
func Auth(store *auth.Store, cookieName string, pool *pgxpool.Pool) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cookie, err := c.Cookie(cookieName)
			if err != nil || cookie.Value == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
			}
			ctx := c.Request().Context()
			sess, err := store.Get(ctx, cookie.Value)
			if err != nil {
				if errors.Is(err, auth.ErrSessionNotFound) {
					return echo.NewHTTPError(http.StatusUnauthorized, "session expired")
				}
				return echo.NewHTTPError(http.StatusInternalServerError, "session lookup failed")
			}
			if sess.ActiveCompanyID == 0 && pool != nil {
				backfillActiveCompany(ctx, pool, store, sess)
			}
			_ = store.Touch(ctx, sess.ID)
			c.SetRequest(c.Request().WithContext(auth.WithSession(ctx, sess)))
			return next(c)
		}
	}
}

// backfillActiveCompany picks an active company for a session that predates
// the multi-entity feature. Prefers users.default_company_id; falls back to
// the first membership row so a user with NULL default but real memberships
// is not left stuck. Best-effort — errors are swallowed so a transient DB
// hiccup never blocks an authenticated request.
func backfillActiveCompany(ctx context.Context, pool *pgxpool.Pool, store *auth.Store, sess *auth.Session) {
	var cid int64
	err := pool.QueryRow(ctx, `SELECT default_company_id FROM users WHERE id = $1`, sess.UserID).Scan(&cid)
	if err == nil && cid > 0 {
		sess.ActiveCompanyID = cid
		_ = store.Put(ctx, sess)
		return
	}
	// Fallback: first company this user belongs to, preferring is_default.
	err = pool.QueryRow(ctx, `
		SELECT company_id FROM user_companies
		WHERE user_id = $1
		ORDER BY is_default DESC, company_id
		LIMIT 1`, sess.UserID).Scan(&cid)
	if err == nil && cid > 0 {
		sess.ActiveCompanyID = cid
		_ = store.Put(ctx, sess)
	}
}

// RequirePermission rejects requests whose session lacks the permission.
func RequirePermission(code string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			sess := auth.FromContext(c.Request().Context())
			if sess == nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
			}
			if !sess.HasPermission(code) {
				return echo.NewHTTPError(http.StatusForbidden, "missing permission: "+code)
			}
			return next(c)
		}
	}
}

// RateLimit enforces a fixed-window counter per key in Redis. Returns 429 on breach.
// keyFn lets the caller choose the rate-limit key (e.g. IP, user ID, email).
func RateLimit(rdb *redis.Client, prefix string, limit int, window time.Duration, keyFn func(c echo.Context) string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			k := "rl:" + prefix + ":" + keyFn(c)
			ctx := c.Request().Context()
			n, err := rdb.Incr(ctx, k).Result()
			if err != nil {
				return next(c) // fail-open: don't block traffic on redis outage
			}
			if n == 1 {
				_ = rdb.Expire(ctx, k, window).Err()
			}
			if n > int64(limit) {
				return echo.NewHTTPError(http.StatusTooManyRequests, "rate limit exceeded")
			}
			return next(c)
		}
	}
}
