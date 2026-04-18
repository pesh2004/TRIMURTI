package authmod

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/audit"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
)

type Handler struct {
	pool         *pgxpool.Pool
	sessions     *auth.Store
	audit        *audit.Writer
	cookieName   string
	cookieDomain string
	cookieSecure bool
	sessionTTL   time.Duration
}

func New(pool *pgxpool.Pool, sessions *auth.Store, auditWriter *audit.Writer, cookieName, cookieDomain string, cookieSecure bool, ttl time.Duration) *Handler {
	return &Handler{
		pool:         pool,
		sessions:     sessions,
		audit:        auditWriter,
		cookieName:   cookieName,
		cookieDomain: cookieDomain,
		cookieSecure: cookieSecure,
		sessionTTL:   ttl,
	}
}

type loginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
}

type meResponse struct {
	ID          int64    `json:"id"`
	Email       string   `json:"email"`
	Username    string   `json:"username"`
	DisplayName string   `json:"display_name"`
	Roles       []string `json:"roles"`
	Permissions []string `json:"permissions"`
}

func (h *Handler) Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid json")
	}
	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email and password required")
	}

	ctx := c.Request().Context()

	var (
		userID        int64
		passwordHash  string
		displayName   string
		username      string
		isActive      bool
		lockedUntil   *time.Time
		failedLogins  int
	)
	err := h.pool.QueryRow(ctx, `
		SELECT id, password_hash, display_name, username, is_active, locked_until, failed_login_attempts
		FROM users WHERE email = $1`, req.Email).
		Scan(&userID, &passwordHash, &displayName, &username, &isActive, &lockedUntil, &failedLogins)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Constant-time-ish response to avoid email enumeration.
			_ = auth.Verify(req.Password, "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "login failed")
	}
	if !isActive {
		return echo.NewHTTPError(http.StatusUnauthorized, "account disabled")
	}
	if lockedUntil != nil && lockedUntil.After(time.Now()) {
		return echo.NewHTTPError(http.StatusTooManyRequests, "account temporarily locked")
	}

	if err := auth.Verify(req.Password, passwordHash); err != nil {
		_, _ = h.pool.Exec(ctx, `
			UPDATE users
			SET failed_login_attempts = failed_login_attempts + 1,
			    locked_until = CASE WHEN failed_login_attempts + 1 >= 5
			                        THEN NOW() + INTERVAL '15 minutes'
			                        ELSE locked_until END
			WHERE id = $1`, userID)
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	roles, err := loadRoles(ctx, h.pool, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "role lookup failed")
	}
	perms, err := loadPermissions(ctx, h.pool, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "permission lookup failed")
	}

	sess := auth.Session{
		UserID:      userID,
		Email:       req.Email,
		DisplayName: displayName,
		Roles:       roles,
		Permissions: perms,
		IP:          c.RealIP(),
		UserAgent:   c.Request().UserAgent(),
	}
	sid, err := h.sessions.Create(ctx, sess)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create session")
	}

	_, _ = h.pool.Exec(ctx, `UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1`, userID)

	c.SetCookie(&http.Cookie{
		Name:     h.cookieName,
		Value:    sid,
		Path:     "/",
		Domain:   h.cookieDomain,
		Expires:  time.Now().Add(h.sessionTTL),
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})

	// Audit: login success. Before = nil (no prior state), After = session summary.
	_ = h.audit.Write(ctx, audit.Entry{
		IP:        c.RealIP(),
		UserAgent: c.Request().UserAgent(),
		Action:    "auth.login",
		Entity:    "session",
		EntityID:  sid,
		After:     map[string]any{"user_id": userID, "email": req.Email},
	})

	return c.JSON(http.StatusOK, meResponse{
		ID: userID, Email: req.Email, Username: username, DisplayName: displayName,
		Roles: roles, Permissions: perms,
	})
}

func (h *Handler) Logout(c echo.Context) error {
	ctx := c.Request().Context()
	cookie, err := c.Cookie(h.cookieName)
	if err == nil && cookie.Value != "" {
		_ = h.sessions.Revoke(ctx, cookie.Value)
		_ = h.audit.Write(ctx, audit.Entry{
			IP: c.RealIP(), UserAgent: c.Request().UserAgent(),
			Action: "auth.logout", Entity: "session", EntityID: cookie.Value,
		})
	}
	c.SetCookie(&http.Cookie{
		Name: h.cookieName, Value: "", Path: "/", Domain: h.cookieDomain,
		Expires: time.Unix(0, 0), HttpOnly: true, Secure: h.cookieSecure,
		SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
	return c.NoContent(http.StatusNoContent)
}

func (h *Handler) Me(c echo.Context) error {
	sess := auth.FromContext(c.Request().Context())
	if sess == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}
	var username string
	if err := h.pool.QueryRow(c.Request().Context(), `SELECT username FROM users WHERE id = $1`, sess.UserID).Scan(&username); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "user lookup failed")
	}
	return c.JSON(http.StatusOK, meResponse{
		ID:          sess.UserID,
		Email:       sess.Email,
		Username:    username,
		DisplayName: sess.DisplayName,
		Roles:       sess.Roles,
		Permissions: sess.Permissions,
	})
}

func loadRoles(ctx context.Context, pool *pgxpool.Pool, userID int64) ([]string, error) {
	rows, err := pool.Query(ctx, `
		SELECT r.code FROM roles r
		JOIN user_roles ur ON ur.role_id = r.id
		WHERE ur.user_id = $1
		ORDER BY r.code`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		out = append(out, code)
	}
	return out, rows.Err()
}

func loadPermissions(ctx context.Context, pool *pgxpool.Pool, userID int64) ([]string, error) {
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT p.code FROM permissions p
		JOIN role_permissions rp ON rp.permission_id = p.id
		JOIN user_roles ur ON ur.role_id = rp.role_id
		WHERE ur.user_id = $1
		ORDER BY p.code`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		out = append(out, code)
	}
	return out, rows.Err()
}
