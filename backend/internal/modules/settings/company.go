package settings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/audit"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/modules/hr"
)

// GetCompany returns the full profile of the session's active company.
// 404 is only possible if the session is pointing at a company that has
// since been deleted — shouldn't happen because companies are
// ON DELETE RESTRICT from user_companies.
func (h *Handler) GetCompany(c echo.Context) error {
	ctx := c.Request().Context()
	companyID := auth.ActiveCompanyFromContext(ctx)
	if companyID == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no active company on session")
	}
	cp, err := loadCompany(ctx, h.pool, companyID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "company not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "company lookup failed")
	}
	return c.JSON(http.StatusOK, cp)
}

// UpdateCompany applies a sparse patch to the active company. Every
// request writes exactly one audit row with the full before/after snapshot
// so the change history is reconstructable field-by-field.
func (h *Handler) UpdateCompany(c echo.Context) error {
	ctx := c.Request().Context()
	companyID := auth.ActiveCompanyFromContext(ctx)
	if companyID == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no active company on session")
	}

	var req UpdateCompanyRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid json")
	}
	if err := validatePatch(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	before, err := loadCompany(ctx, h.pool, companyID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "company lookup failed")
	}

	set, args, err := buildUpdateSet(&req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if set == "" {
		// Empty patch is a no-op but still returns the current state so
		// the client doesn't need a separate branch for "unchanged".
		return c.JSON(http.StatusOK, before)
	}
	args = append(args, companyID)
	query := fmt.Sprintf(`UPDATE companies SET %s, updated_at = NOW() WHERE id = $%d`, set, len(args))
	if _, err := h.pool.Exec(ctx, query, args...); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "company update failed")
	}

	after, err := loadCompany(ctx, h.pool, companyID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "company reload failed")
	}

	_ = h.audit.Write(ctx, audit.Entry{
		IP:        c.RealIP(),
		UserAgent: c.Request().UserAgent(),
		Action:    "settings.company.update",
		Entity:    "company",
		EntityID:  fmt.Sprintf("%d", companyID),
		Before:    before,
		After:     after,
	})
	return c.JSON(http.StatusOK, after)
}

func loadCompany(ctx context.Context, pool *pgxpool.Pool, id int64) (*CompanyProfile, error) {
	var (
		cp      CompanyProfile
		addrRaw []byte
	)
	err := pool.QueryRow(ctx, `
		SELECT id, code, name_th, name_en, tax_id, phone, email, website, address_json,
		       currency, timezone, fiscal_year_start_month, vat_rate::TEXT, wht_rate::TEXT,
		       is_active, created_at, updated_at
		FROM companies WHERE id = $1`, id).Scan(
		&cp.ID, &cp.Code, &cp.NameTH, &cp.NameEN,
		&cp.TaxID, &cp.Phone, &cp.Email, &cp.Website, &addrRaw,
		&cp.Currency, &cp.Timezone, &cp.FiscalYearStartMonth,
		&cp.VatRate, &cp.WhtRate,
		&cp.IsActive, &cp.CreatedAt, &cp.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(addrRaw) > 0 {
		var addr Address
		if err := json.Unmarshal(addrRaw, &addr); err == nil {
			cp.Address = &addr
		}
	}
	return &cp, nil
}

// Per-field length caps. Chosen to comfortably fit any legitimate input
// while keeping a rogue PUT from bloating the row (and thus every audit
// log entry) to megabytes. Matched client-side with maxLength where the
// input component supports it.
const (
	maxNameLen      = 200
	maxTaxIDLen     = 30
	maxPhoneLen     = 30
	maxEmailLen     = 200
	maxWebsiteLen   = 300
	maxAddressLines = 10
	maxAddressLine  = 200
	maxCountryLen   = 8
)

// emailPattern is a deliberately loose "has an @ and a dot" shape check.
// Real deliverability checks happen at SMTP send time; this pattern is
// here only to catch obvious garbage ("not an email") before it reaches
// the DB. Full RFC 5322 matching is intentionally avoided.
var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

// validatePatch runs the lightweight checks that don't need DB access.
// Field-level rules mirror the DB constraints + the business rules
// documented in validate.go.
func validatePatch(req *UpdateCompanyRequest) error {
	if req.NameTH != nil {
		if strings.TrimSpace(*req.NameTH) == "" {
			return errors.New("name_th cannot be empty")
		}
		if len(*req.NameTH) > maxNameLen {
			return fmt.Errorf("name_th exceeds %d chars", maxNameLen)
		}
	}
	if req.NameEN != nil {
		if strings.TrimSpace(*req.NameEN) == "" {
			return errors.New("name_en cannot be empty")
		}
		if len(*req.NameEN) > maxNameLen {
			return fmt.Errorf("name_en exceeds %d chars", maxNameLen)
		}
	}
	if req.TaxID != nil {
		if len(*req.TaxID) > maxTaxIDLen {
			return fmt.Errorf("tax_id exceeds %d chars", maxTaxIDLen)
		}
		if err := hr.ValidateThaiNationalID(*req.TaxID); err != nil {
			return fmt.Errorf("tax_id: %w", err)
		}
	}
	if req.Phone != nil && len(*req.Phone) > maxPhoneLen {
		return fmt.Errorf("phone exceeds %d chars", maxPhoneLen)
	}
	if req.Email != nil {
		if len(*req.Email) > maxEmailLen {
			return fmt.Errorf("email exceeds %d chars", maxEmailLen)
		}
		trimmed := strings.TrimSpace(*req.Email)
		if trimmed != "" && !emailPattern.MatchString(trimmed) {
			return errors.New("email format looks invalid")
		}
	}
	if req.Website != nil {
		if len(*req.Website) > maxWebsiteLen {
			return fmt.Errorf("website exceeds %d chars", maxWebsiteLen)
		}
		trimmed := strings.TrimSpace(*req.Website)
		if trimmed != "" && !(strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://")) {
			return errors.New("website must start with http:// or https://")
		}
	}
	if req.Address != nil {
		if len(req.Address.Lines) > maxAddressLines {
			return fmt.Errorf("address exceeds %d lines", maxAddressLines)
		}
		for _, line := range req.Address.Lines {
			if len(line) > maxAddressLine {
				return fmt.Errorf("address line exceeds %d chars", maxAddressLine)
			}
		}
		if req.Address.Country != nil && len(*req.Address.Country) > maxCountryLen {
			return fmt.Errorf("address.country exceeds %d chars", maxCountryLen)
		}
	}
	if req.Currency != nil {
		if err := ValidateCurrency(*req.Currency); err != nil {
			return err
		}
	}
	if req.Timezone != nil {
		if err := ValidateTimezone(*req.Timezone); err != nil {
			return err
		}
	}
	if req.FiscalYearStartMonth != nil {
		if err := ValidateFiscalMonth(*req.FiscalYearStartMonth); err != nil {
			return err
		}
	}
	if req.VatRate != nil {
		cleaned, err := ValidateRatePct(*req.VatRate)
		if err != nil {
			return fmt.Errorf("vat_rate: %w", err)
		}
		req.VatRate = &cleaned
	}
	if req.WhtRate != nil {
		cleaned, err := ValidateRatePct(*req.WhtRate)
		if err != nil {
			return fmt.Errorf("wht_rate: %w", err)
		}
		req.WhtRate = &cleaned
	}
	return nil
}

// buildUpdateSet turns the sparse request into a parameterised SET
// clause. Kept deliberately boring — no interface{} gymnastics, just one
// conditional branch per column. Column order matters only for diff-ing
// in tests, so the list follows the struct's declaration order.
func buildUpdateSet(req *UpdateCompanyRequest) (string, []any, error) {
	parts := []string{}
	args := []any{}
	add := func(col string, v any) {
		args = append(args, v)
		parts = append(parts, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if req.NameTH != nil {
		add("name_th", strings.TrimSpace(*req.NameTH))
	}
	if req.NameEN != nil {
		add("name_en", strings.TrimSpace(*req.NameEN))
	}
	if req.TaxID != nil {
		add("tax_id", normalizeOptional(*req.TaxID))
	}
	if req.Phone != nil {
		add("phone", normalizeOptional(*req.Phone))
	}
	if req.Email != nil {
		add("email", normalizeOptional(*req.Email))
	}
	if req.Website != nil {
		add("website", normalizeOptional(*req.Website))
	}
	if req.Address != nil {
		raw, err := json.Marshal(req.Address)
		if err != nil {
			return "", nil, errors.New("address could not be encoded")
		}
		add("address_json", raw)
	}
	if req.Currency != nil {
		add("currency", strings.ToUpper(*req.Currency))
	}
	if req.Timezone != nil {
		add("timezone", *req.Timezone)
	}
	if req.FiscalYearStartMonth != nil {
		add("fiscal_year_start_month", *req.FiscalYearStartMonth)
	}
	if req.VatRate != nil {
		add("vat_rate", *req.VatRate)
	}
	if req.WhtRate != nil {
		add("wht_rate", *req.WhtRate)
	}
	return strings.Join(parts, ", "), args, nil
}

// normalizeOptional turns an empty-string request into a SQL NULL so the
// UI's "clear this field" flow actually clears the column instead of
// storing a zero-length string.
func normalizeOptional(s string) any {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}
