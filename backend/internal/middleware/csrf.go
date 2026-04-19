package middleware

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
)

// CSRFCookieName is the non-HttpOnly cookie that JS reads to fill the
// X-CSRF-Token header on mutations. Kept as a single constant so the
// handler (which issues the cookie) and the middleware (which enforces it)
// can't drift.
const CSRFCookieName = "trimurti_csrf"

// CSRF enforces the double-submit-cookie pattern on state-changing
// requests. The session cookie is HttpOnly + SameSite=Lax (which already
// blocks most cross-origin POSTs in modern browsers); the CSRF check is
// defense-in-depth for the cases SameSite alone doesn't cover (top-level
// nav edge cases, cross-subdomain, old browsers).
//
// Flow:
//  1. After a successful login, the server issues a random value in the
//     `trimurti_csrf` cookie, flagged non-HttpOnly so same-origin JS can
//     read it.
//  2. The frontend `api.ts` wrapper mirrors that value into the
//     X-CSRF-Token header on every POST/PUT/PATCH/DELETE.
//  3. This middleware verifies the two values match in constant time.
//
// An attacker on a different origin cannot read our cookie (same-origin
// policy prevents it), so they can't set the header, so their cross-origin
// POST fails closed.
//
// GET/HEAD/OPTIONS are passed through — they don't change state and
// requiring a header would break CORS preflight.
func CSRF() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			m := c.Request().Method
			if m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions {
				return next(c)
			}
			cookie, err := c.Cookie(CSRFCookieName)
			if err != nil || cookie.Value == "" {
				return echo.NewHTTPError(http.StatusForbidden, "csrf cookie missing — re-login to refresh")
			}
			header := c.Request().Header.Get("X-CSRF-Token")
			if header == "" {
				return echo.NewHTTPError(http.StatusForbidden, "csrf header missing")
			}
			if subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) != 1 {
				return echo.NewHTTPError(http.StatusForbidden, "csrf mismatch")
			}
			return next(c)
		}
	}
}

// IssueCSRFCookieIfMissing is a no-op when a valid CSRF cookie already
// exists; otherwise it generates a fresh random token and sets the cookie.
// Called from /auth/me so existing sessions that predate Session-4
// auto-upgrade on the first authenticated request.
func IssueCSRFCookieIfMissing(c echo.Context, cookieDomain string, secure bool) {
	if cookie, err := c.Cookie(CSRFCookieName); err == nil && cookie.Value != "" {
		return
	}
	IssueCSRFCookie(c, cookieDomain, secure)
}

// IssueCSRFCookie unconditionally sets a fresh CSRF cookie. Called on
// successful login so every new session starts with a known-good token.
func IssueCSRFCookie(c echo.Context, cookieDomain string, secure bool) {
	c.SetCookie(&http.Cookie{
		Name:     CSRFCookieName,
		Value:    newCSRFToken(),
		Path:     "/",
		Domain:   cookieDomain,
		HttpOnly: false, // JS must be able to read this
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearCSRFCookie removes the CSRF cookie. Called on logout.
func ClearCSRFCookie(c echo.Context, cookieDomain string, secure bool) {
	c.SetCookie(&http.Cookie{
		Name:     CSRFCookieName,
		Value:    "",
		Path:     "/",
		Domain:   cookieDomain,
		HttpOnly: false,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

func newCSRFToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand.Read only fails on fatal OS errors; returning an
		// empty string would let the CSRF check pass accidentally, and
		// continuing is unrecoverable either way.
		panic(errors.New("csrf: crypto/rand unavailable"))
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// RateLimitByUser buckets the rate-limit key on the authenticated user id
// rather than the source IP. Falls back to the IP when there is no session
// in context so the middleware is safe to place above Auth if needed.
//
// Typical use: guard mutation endpoints that are benign at low volume but
// expensive or abuse-prone if hammered by a single logged-in client
// (terminating employees, creating bulk records, requesting PII reveals).
func RateLimitByUser(rdb *redis.Client, prefix string, limit int, window time.Duration) echo.MiddlewareFunc {
	return RateLimit(rdb, prefix, limit, window, func(c echo.Context) string {
		if s := auth.FromContext(c.Request().Context()); s != nil {
			return "u:" + strconv.FormatInt(s.UserID, 10)
		}
		return c.RealIP()
	})
}
