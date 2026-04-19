// Package me handles self-service endpoints about the authenticated user.
// Today that's just the PDPA-mandated data export; future additions
// (avatar upload, notification prefs, personal API keys) will land here so
// a caller can find everything-about-me in one place.
package me

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/audit"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
	mw "github.com/ama-bmgpesh/trimurti-erp/backend/internal/middleware"
)

const maxAuditRowsPerExport = 1000

type Handler struct {
	pool   *pgxpool.Pool
	audit  *audit.Writer
	piiKey string
}

func New(pool *pgxpool.Pool, auditWriter *audit.Writer, piiKey string) *Handler {
	return &Handler{pool: pool, audit: auditWriter, piiKey: piiKey}
}

// Payload the endpoint returns. Kept intentionally flat + typed so a
// consuming client (or PDPA reviewer) can tell at a glance what fields
// are included.
type ExportResponse struct {
	GeneratedAt time.Time           `json:"generated_at"`
	User        userExport          `json:"user"`
	Employee    *employeeExport     `json:"employee,omitempty"`
	AuditTrail  []auditActionExport `json:"audit_trail,omitempty"`
	Meta        exportMeta          `json:"meta"`
}

type userExport struct {
	ID                int64      `json:"id"`
	Email             string     `json:"email"`
	Username          string     `json:"username"`
	DisplayName       string     `json:"display_name"`
	DisplayNameTH     *string    `json:"display_name_th,omitempty"`
	AvatarURL         *string    `json:"avatar_url,omitempty"`
	IsActive          bool       `json:"is_active"`
	MFAEnabled        bool       `json:"mfa_enabled"`
	LastLoginAt       *time.Time `json:"last_login_at,omitempty"`
	PasswordChangedAt time.Time  `json:"password_changed_at"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
	Roles             []string   `json:"roles"`
	Permissions       []string   `json:"permissions"`
}

type employeeExport struct {
	EmployeeCode   string     `json:"employee_code"`
	CompanyNameEN  string     `json:"company_name_en"`
	CompanyNameTH  string     `json:"company_name_th"`
	DepartmentEN   string     `json:"department_name_en"`
	DepartmentTH   string     `json:"department_name_th"`
	PositionEN     string     `json:"position_name_en"`
	PositionTH     string     `json:"position_name_th"`
	FirstNameTH    string     `json:"first_name_th"`
	LastNameTH     string     `json:"last_name_th"`
	FirstNameEN    *string    `json:"first_name_en,omitempty"`
	LastNameEN     *string    `json:"last_name_en,omitempty"`
	Nickname       *string    `json:"nickname,omitempty"`
	Gender         string     `json:"gender"`
	Birthdate      time.Time  `json:"birthdate"`
	NationalID     *string    `json:"national_id,omitempty"` // plaintext — user owns this
	Phone          *string    `json:"phone,omitempty"`
	Address        any        `json:"address,omitempty"`
	EmploymentType string     `json:"employment_type"`
	HiredAt        time.Time  `json:"hired_at"`
	TerminatedAt   *time.Time `json:"terminated_at,omitempty"`
	Salary         *string    `json:"salary,omitempty"` // plaintext — user owns this
	Status         string     `json:"status"`
}

type auditActionExport struct {
	Timestamp time.Time `json:"timestamp"`
	Action    string    `json:"action"`
	Entity    string    `json:"entity"`
	EntityID  *string   `json:"entity_id,omitempty"`
	IP        *string   `json:"ip_address,omitempty"`
}

type exportMeta struct {
	AuditTrailTruncatedAt int    `json:"audit_trail_truncated_at"`
	Note                  string `json:"note"`
}

// Export is the PDPA-mandated "data subject access" path — the
// authenticated user asks the system for a copy of everything it holds
// about them. Response is one JSON file with:
//   - the user row (including role + permission expansion)
//   - the matching employee row if the user's email is on file, with
//     national_id and salary decrypted (the user is the data subject, so
//     they always own their own PII in this view — no reveal_pii
//     permission required)
//   - the most recent audit_log entries authored by this user
//
// Every export writes its own audit row so ops can reconstruct which
// user exercised their access right, when.
func (h *Handler) Export(c echo.Context) error {
	sess := auth.FromContext(c.Request().Context())
	if sess == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}
	ctx := c.Request().Context()

	out := ExportResponse{
		GeneratedAt: time.Now().UTC(),
		Meta: exportMeta{
			AuditTrailTruncatedAt: maxAuditRowsPerExport,
			Note: "This file contains everything the system holds about you. " +
				"Keep it secret — it includes your national ID and salary in plaintext.",
		},
	}

	userRow, err := h.loadUser(ctx, sess.UserID)
	if err != nil {
		return mw.InternalError(err)
	}
	out.User = userRow

	if emp, err := h.loadEmployee(ctx, sess.Email); err != nil {
		return mw.InternalError(err)
	} else if emp != nil {
		out.Employee = emp
	}

	audits, err := h.loadAuditActions(ctx, sess.UserID)
	if err != nil {
		return mw.InternalError(err)
	}
	out.AuditTrail = audits

	_ = h.audit.Write(ctx, audit.Entry{
		IP:        c.RealIP(),
		UserAgent: c.Request().UserAgent(),
		Action:    "me.data_export",
		Entity:    "user",
		EntityID:  strconv.FormatInt(sess.UserID, 10),
		After:     map[string]any{"audit_rows": len(audits), "included_employee": out.Employee != nil},
	})

	c.Response().Header().Set(
		"Content-Disposition",
		fmt.Sprintf(`attachment; filename="trimurti-export-user-%d-%s.json"`,
			sess.UserID, time.Now().UTC().Format("20060102T150405Z")),
	)
	return c.JSON(http.StatusOK, out)
}

func (h *Handler) loadUser(ctx context.Context, id int64) (userExport, error) {
	var u userExport
	err := h.pool.QueryRow(ctx, `
		SELECT id, email, username, display_name, display_name_th, avatar_url,
		       is_active, mfa_enabled, last_login_at, password_changed_at,
		       created_at, updated_at
		  FROM users
		 WHERE id = $1`, id).Scan(
		&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.DisplayNameTH, &u.AvatarURL,
		&u.IsActive, &u.MFAEnabled, &u.LastLoginAt, &u.PasswordChangedAt,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return userExport{}, err
	}

	rows, err := h.pool.Query(ctx, `
		SELECT r.code FROM roles r
		JOIN user_roles ur ON ur.role_id = r.id
		WHERE ur.user_id = $1 ORDER BY r.code`, id)
	if err != nil {
		return userExport{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return userExport{}, err
		}
		u.Roles = append(u.Roles, code)
	}
	u.Roles = nonNil(u.Roles)

	permRows, err := h.pool.Query(ctx, `
		SELECT DISTINCT p.code FROM permissions p
		JOIN role_permissions rp ON rp.permission_id = p.id
		JOIN user_roles ur ON ur.role_id = rp.role_id
		WHERE ur.user_id = $1 ORDER BY p.code`, id)
	if err != nil {
		return userExport{}, err
	}
	defer permRows.Close()
	for permRows.Next() {
		var code string
		if err := permRows.Scan(&code); err != nil {
			return userExport{}, err
		}
		u.Permissions = append(u.Permissions, code)
	}
	u.Permissions = nonNil(u.Permissions)

	return u, nil
}

// loadEmployee returns the employee row matching the user's email, or nil
// when no match exists (not every user is also an employee — admins, for
// instance, typically aren't). PII columns are decrypted here because the
// viewer is the data subject, so the reveal_pii permission check that
// protects other handlers doesn't apply.
func (h *Handler) loadEmployee(ctx context.Context, email string) (*employeeExport, error) {
	var e employeeExport
	err := h.pool.QueryRow(ctx, `
		SELECT e.employee_code,
		       c.name_en, c.name_th,
		       d.name_en, d.name_th,
		       p.name_en, p.name_th,
		       e.first_name_th, e.last_name_th, e.first_name_en, e.last_name_en,
		       e.nickname, e.gender, e.birthdate,
		       CASE WHEN e.national_id IS NULL THEN NULL ELSE pgp_sym_decrypt(e.national_id, $2) END,
		       e.phone, e.address_json,
		       e.employment_type, e.hired_at, e.terminated_at,
		       CASE WHEN e.salary IS NULL THEN NULL ELSE pgp_sym_decrypt(e.salary, $2) END,
		       e.status
		  FROM employees e
		  JOIN companies    c ON c.id = e.company_id
		  JOIN departments  d ON d.id = e.department_id
		  JOIN positions    p ON p.id = e.position_id
		 WHERE e.email = $1`,
		email, h.piiKey,
	).Scan(
		&e.EmployeeCode,
		&e.CompanyNameEN, &e.CompanyNameTH,
		&e.DepartmentEN, &e.DepartmentTH,
		&e.PositionEN, &e.PositionTH,
		&e.FirstNameTH, &e.LastNameTH, &e.FirstNameEN, &e.LastNameEN,
		&e.Nickname, &e.Gender, &e.Birthdate,
		&e.NationalID,
		&e.Phone, &e.Address,
		&e.EmploymentType, &e.HiredAt, &e.TerminatedAt,
		&e.Salary,
		&e.Status,
	)
	if err != nil {
		// no-rows is a totally normal case (user isn't an employee).
		// pgx's typed sentinel value is checked at the caller by type.
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	return &e, nil
}

func (h *Handler) loadAuditActions(ctx context.Context, userID int64) ([]auditActionExport, error) {
	rows, err := h.pool.Query(ctx, `
		SELECT ts, action, entity, entity_id, host(ip_address)
		  FROM audit_log
		 WHERE user_id = $1
		 ORDER BY ts DESC
		 LIMIT $2`, userID, maxAuditRowsPerExport)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []auditActionExport{}
	for rows.Next() {
		var a auditActionExport
		if err := rows.Scan(&a.Timestamp, &a.Action, &a.Entity, &a.EntityID, &a.IP); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
