package settings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/audit"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/config"
)

// Integration tests run only when DATABASE_URL is populated (CI backend
// test job, or any dev box with `make up` running). They assume
// migrations have already been applied — the CI workflow runs
// `go run ./cmd/migrate up` immediately before `go test`.

type echoTestValidator struct{ v *validator.Validate }

func (ev *echoTestValidator) Validate(i any) error { return ev.v.Struct(i) }

type settingsFixture struct {
	pool     *pgxpool.Pool
	handler  *Handler
	e        *echo.Echo
	userID   int64
	companyA int64
	companyB int64
}

// setupSettingsFixture primes two companies, a throwaway user, and
// memberships in both so switch-company scope tests have somewhere to
// land. Each test should call this; TRUNCATE keeps runs independent.
func setupSettingsFixture(t *testing.T) *settingsFixture {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set — skipping integration test")
	}
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `
		TRUNCATE users, user_companies, employees, employee_code_sequences,
		         departments, positions, companies, audit_log_2026
		RESTART IDENTITY CASCADE
	`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	var userID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO users (email, username, password_hash, display_name)
		VALUES ('integration@test.local', 'integration', 'stub-not-a-real-hash', 'Integration Test')
		RETURNING id
	`).Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	var a, b int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO companies (code, name_th, name_en, tax_id)
		VALUES ('AAA', 'อัลฟ่า', 'Alpha', NULL) RETURNING id`).Scan(&a); err != nil {
		t.Fatalf("seed company A: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO companies (code, name_th, name_en, tax_id)
		VALUES ('BBB', 'บราโว่', 'Bravo', NULL) RETURNING id`).Scan(&b); err != nil {
		t.Fatalf("seed company B: %v", err)
	}
	for _, cid := range []int64{a, b} {
		if _, err := pool.Exec(ctx, `
			INSERT INTO user_companies (user_id, company_id, is_default)
			VALUES ($1, $2, $3)`, userID, cid, cid == a); err != nil {
			t.Fatalf("seed membership: %v", err)
		}
	}

	writer := audit.NewWriter(pool)
	cfg := &config.Config{SMTPHost: "smtp.example.com", SMTPPort: 587, SMTPFrom: "no-reply@x"}
	h := New(pool, writer, cfg)

	e := echo.New()
	e.Validator = &echoTestValidator{v: validator.New()}

	return &settingsFixture{
		pool: pool, handler: h, e: e,
		userID: userID, companyA: a, companyB: b,
	}
}

func (f *settingsFixture) ctxFor(activeCompany int64, method, path, body string, perms ...string) (echo.Context, *httptest.ResponseRecorder) {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	sess := &auth.Session{
		UserID:          f.userID,
		Email:           "integration@test.local",
		Permissions:     perms,
		ActiveCompanyID: activeCompany,
	}
	req = req.WithContext(auth.WithSession(req.Context(), sess))
	rec := httptest.NewRecorder()
	return f.e.NewContext(req, rec), rec
}

func (f *settingsFixture) countAuditRows(t *testing.T, action, entityID string) int {
	t.Helper()
	var n int
	if err := f.pool.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM audit_log WHERE action=$1 AND entity_id=$2
	`, action, entityID).Scan(&n); err != nil {
		t.Fatalf("count audit: %v", err)
	}
	return n
}

// TestIntegration_UpdateCompany_ScopesToActiveCompany asserts that the
// PUT updates exactly the session's active company — never the other
// one the user happens to belong to. This is the core multi-entity
// invariant: the request body cannot target an arbitrary company id.
func TestIntegration_UpdateCompany_ScopesToActiveCompany(t *testing.T) {
	f := setupSettingsFixture(t)

	// Session active = company A. Update name_en.
	body := `{"name_en": "Alpha Edited"}`
	c, rec := f.ctxFor(f.companyA, http.MethodPut, "/api/v1/settings/company", body, "settings.write")
	if err := f.handler.UpdateCompany(c); err != nil {
		t.Fatalf("UpdateCompany: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	// Verify only A was touched.
	ctx := context.Background()
	var nameA, nameB string
	_ = f.pool.QueryRow(ctx, `SELECT name_en FROM companies WHERE id=$1`, f.companyA).Scan(&nameA)
	_ = f.pool.QueryRow(ctx, `SELECT name_en FROM companies WHERE id=$1`, f.companyB).Scan(&nameB)
	if nameA != "Alpha Edited" {
		t.Errorf("A name_en = %q, want 'Alpha Edited'", nameA)
	}
	if nameB != "Bravo" {
		t.Errorf("B should be untouched but name_en = %q", nameB)
	}

	// Audit row must land with full before/after payload.
	got := f.countAuditRows(t, "settings.company.update", "")
	// entity_id uses fmt.Sprintf("%d", companyA); count matching explicitly.
	var n int
	_ = f.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM audit_log
		WHERE action='settings.company.update' AND entity_id = $1
	`, fmtInt(f.companyA)).Scan(&n)
	if n != 1 {
		t.Errorf("expected 1 audit row for company A, got %d (generic count %d)", n, got)
	}
}

// TestIntegration_UpdateCompany_RejectsInvalidTaxID is the regression
// cage around the "attacker submits a 13-digit string with no valid
// Luhn checksum" case. The handler must 400; no DB write; no audit.
func TestIntegration_UpdateCompany_RejectsInvalidTaxID(t *testing.T) {
	f := setupSettingsFixture(t)

	// 13 digits but wrong checksum — typical Luhn-bypass attempt.
	body := `{"tax_id": "1111111111111"}`
	c, rec := f.ctxFor(f.companyA, http.MethodPut, "/api/v1/settings/company", body, "settings.write")
	err := f.handler.UpdateCompany(c)

	// The handler returns an *echo.HTTPError, which isn't serialised to
	// the recorder without Echo's error handler. Assert the HTTPError
	// directly so the test doesn't depend on recorder state.
	he, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("expected *echo.HTTPError, got %T: %v (rec.Code=%d)", err, err, rec.Code)
	}
	if he.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d (%v)", he.Code, he.Message)
	}

	// Either way, the DB should be untouched.
	var taxID *string
	_ = f.pool.QueryRow(context.Background(), `SELECT tax_id FROM companies WHERE id=$1`, f.companyA).Scan(&taxID)
	if taxID != nil {
		t.Errorf("tax_id should still be NULL after rejected update, got %v", *taxID)
	}
	if n := f.countAuditRows(t, "settings.company.update", fmtInt(f.companyA)); n != 0 {
		t.Errorf("rejected update must not write audit, got %d rows", n)
	}
}

// TestIntegration_GetIntegrations_NoSecretsLeak confirms SMTP password
// and user credentials never show up in the response — only the bits
// that are safe for a settings.read caller to see.
func TestIntegration_GetIntegrations_NoSecretsLeak(t *testing.T) {
	f := setupSettingsFixture(t)
	// Inject a fake password on the cfg to confirm it never appears.
	f.handler.cfg.SMTPPass = "super-secret-password"
	f.handler.cfg.SMTPUser = "smtp-user-account"

	c, rec := f.ctxFor(f.companyA, http.MethodGet, "/api/v1/settings/integrations", "", "settings.read")
	if err := f.handler.GetIntegrations(c); err != nil {
		t.Fatalf("GetIntegrations: %v", err)
	}
	body := rec.Body.String()
	if strings.Contains(body, "super-secret-password") {
		t.Error("SMTP password leaked into /settings/integrations response")
	}
	if strings.Contains(body, "smtp-user-account") {
		t.Error("SMTP user leaked into /settings/integrations response")
	}
	// The response must still be valid JSON with the shape we advertised.
	var s IntegrationsStatus
	if err := json.Unmarshal(rec.Body.Bytes(), &s); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !s.SMTP.Configured {
		t.Error("SMTP should be reported as configured when host is set")
	}
}

func fmtInt(v int64) string {
	// Mirror the fmt.Sprintf("%d", ...) used in the handler for entity_id.
	b := []byte{}
	if v == 0 {
		return "0"
	}
	for v > 0 {
		b = append([]byte{byte('0' + v%10)}, b...)
		v /= 10
	}
	return string(b)
}
