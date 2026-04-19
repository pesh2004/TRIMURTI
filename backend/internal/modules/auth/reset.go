package authmod

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/audit"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/email"
)

// ResetTTL is how long a fresh reset token is valid. Matches what the
// frontend tells the user ("expires in 15 minutes").
const ResetTTL = 15 * time.Minute

// ResetHandler owns the password-reset request/confirm path. Kept
// separate from the login/me Handler so the email dependency stays out
// of the hot authenticated path.
type ResetHandler struct {
	base *Handler // reuses pool / audit / cookie settings
	mail email.Sender
	// baseURL is the public URL the reset link points at, e.g.
	// https://trimurti-demo.example — combined with /password-reset?token=X.
	baseURL string
}

func NewResetHandler(base *Handler, mail email.Sender, baseURL string) *ResetHandler {
	return &ResetHandler{base: base, mail: mail, baseURL: strings.TrimRight(baseURL, "/")}
}

// -----------------------------------------------------------------------------
// Request: POST /api/v1/auth/password-reset/request
// -----------------------------------------------------------------------------

type resetRequestIn struct {
	Email string `json:"email" validate:"required,email"`
}

// RequestReset always returns 200 regardless of whether the email exists.
// Leaking "user not found" would turn this endpoint into an account
// enumerator. Rate limiting lives in the middleware layer.
func (h *ResetHandler) RequestReset(c echo.Context) error {
	var req resetRequestIn
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid json")
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email required")
	}

	ctx := c.Request().Context()

	var userID int64
	err := h.base.pool.QueryRow(ctx,
		`SELECT id FROM users WHERE email=$1 AND is_active`, email).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Silent no-op for non-existent email — same response shape + timing.
			return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	token, tokenHash, err := newResetToken()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	expiresAt := time.Now().Add(ResetTTL).UTC()
	if _, err := h.base.pool.Exec(ctx, `
		INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
		VALUES ($1,$2,$3,$4,$5)`,
		userID, tokenHash, expiresAt, nullIfEmpty(c.RealIP()), nullIfEmpty(c.Request().UserAgent()),
	); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	resetURL := fmt.Sprintf("%s/password-reset?token=%s", h.baseURL, token)
	if err := h.sendResetMail(ctx, email, resetURL); err != nil {
		// Don't leak the failure to the caller (would enable oracle attacks);
		// audit + log and return 200.
		_ = h.base.audit.Write(ctx, audit.Entry{
			IP:        c.RealIP(),
			UserAgent: c.Request().UserAgent(),
			Action:    "auth.password_reset_request_mail_failed",
			Entity:    "user",
			EntityID:  fmt.Sprintf("%d", userID),
			After:     map[string]any{"error": err.Error()},
		})
	}

	_ = h.base.audit.Write(ctx, audit.Entry{
		IP:        c.RealIP(),
		UserAgent: c.Request().UserAgent(),
		Action:    "auth.password_reset_requested",
		Entity:    "user",
		EntityID:  fmt.Sprintf("%d", userID),
		After:     map[string]any{"expires_at": expiresAt},
	})

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// -----------------------------------------------------------------------------
// Confirm: POST /api/v1/auth/password-reset/confirm
// -----------------------------------------------------------------------------

type resetConfirmIn struct {
	Token       string `json:"token" validate:"required"`
	NewPassword string `json:"new_password" validate:"required,min=8,max=200"`
}

// ConfirmReset consumes a token, sets a new password, and resets lockout
// state. Known limitation: existing sessions for the user keep working
// until they expire naturally. Session 4 hardening introduces a
// `password_changed_at` check in the middleware to invalidate them
// immediately.
func (h *ResetHandler) ConfirmReset(c echo.Context) error {
	var req resetConfirmIn
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid json")
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ctx := c.Request().Context()
	tokenHash := hashToken(req.Token)

	tx, err := h.base.pool.Begin(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var tokID, userID int64
	var expiresAt time.Time
	var usedAt *time.Time
	err = tx.QueryRow(ctx, `
		SELECT id, user_id, expires_at, used_at
		  FROM password_reset_tokens
		 WHERE token_hash=$1
		 FOR UPDATE`, tokenHash).Scan(&tokID, &userID, &expiresAt, &usedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid or expired token")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if usedAt != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "token already used")
	}
	if time.Now().After(expiresAt) {
		return echo.NewHTTPError(http.StatusBadRequest, "token expired")
	}

	hash, err := auth.Hash(req.NewPassword, auth.DefaultParams)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if _, err := tx.Exec(ctx, `
		UPDATE users
		   SET password_hash = $1,
		       password_changed_at = NOW(),
		       failed_login_attempts = 0,
		       locked_until = NULL
		 WHERE id = $2`, hash, userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if _, err := tx.Exec(ctx, `
		UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, tokID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if err := tx.Commit(ctx); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	_ = h.base.audit.Write(ctx, audit.Entry{
		IP:        c.RealIP(),
		UserAgent: c.Request().UserAgent(),
		Action:    "auth.password_reset_confirmed",
		Entity:    "user",
		EntityID:  fmt.Sprintf("%d", userID),
	})

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// newResetToken returns (raw token for the URL, hex SHA-256 hash for the DB).
// The caller never stores the raw token; a DB leak therefore doesn't yield
// working reset links.
func newResetToken() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", fmt.Errorf("reset token entropy: %w", err)
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	hash = hashToken(raw)
	return raw, hash, nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func (h *ResetHandler) sendResetMail(ctx context.Context, to, url string) error {
	subject := "TRIMURTI — password reset"
	body := fmt.Sprintf(
		"Someone (hopefully you) requested a password reset for this email.\n"+
			"\n"+
			"Open this link within the next %d minutes to choose a new password:\n"+
			"\n"+
			"    %s\n"+
			"\n"+
			"If you didn't request this, you can safely ignore the email — the link\n"+
			"expires on its own and no change happens until someone uses it.\n",
		int(ResetTTL/time.Minute), url,
	)
	return h.mail.Send(ctx, email.Message{To: to, Subject: subject, Body: body})
}
