package hr

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/audit"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
)

// Integration tests run only when DATABASE_URL is populated (CI backend test
// job, or any dev box with `make up` running). They assume migrations have
// already been applied — the CI workflow runs `go run ./cmd/migrate up`
// immediately before `go test`.

const piiTestKey = "test-pii-key-for-integration-only"

// echoTestValidator mirrors cmd/api/main.go's setup so request-level
// `c.Validate(&req)` calls succeed inside tests.
type echoTestValidator struct{ v *validator.Validate }

func (ev *echoTestValidator) Validate(i any) error { return ev.v.Struct(i) }

type testFixture struct {
	pool       *pgxpool.Pool
	handler    *EmployeesHandler
	writer     *audit.Writer
	e          *echo.Echo
	companyID  int64
	deptID     int64
	positionID int64
}

// setupFixture truncates the hr/audit tables and seeds a minimal org tree
// (1 company + 1 department + 1 position). Each test is expected to call
// this to start from a known state.
func setupFixture(t *testing.T) *testFixture {
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

	// Truncate in FK-safe order. RESTART IDENTITY keeps employee_code
	// sequences deterministic across tests.
	if _, err := pool.Exec(ctx, `
		TRUNCATE employees, employee_code_sequences, departments, positions, companies,
		         audit_log_2026
		RESTART IDENTITY CASCADE
	`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	var companyID, deptID, positionID int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO companies (code, name_th, name_en) VALUES ('TMT', 'ทดสอบ', 'Test') RETURNING id
	`).Scan(&companyID); err != nil {
		t.Fatalf("seed company: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO departments (company_id, code, name_th, name_en)
		VALUES ($1, 'ENG', 'วิศวกรรม', 'Engineering') RETURNING id
	`, companyID).Scan(&deptID); err != nil {
		t.Fatalf("seed department: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO positions (code, name_th, name_en, level)
		VALUES ('DEV', 'นักพัฒนา', 'Developer', 3) RETURNING id
	`).Scan(&positionID); err != nil {
		t.Fatalf("seed position: %v", err)
	}

	writer := audit.NewWriter(pool)
	handler := NewEmployeesHandler(pool, writer, piiTestKey)

	e := echo.New()
	e.Validator = &echoTestValidator{v: validator.New()}

	return &testFixture{
		pool: pool, handler: handler, writer: writer, e: e,
		companyID: companyID, deptID: deptID, positionID: positionID,
	}
}

// ctxWithSession builds an echo.Context whose request context carries a
// fake session with the given permission codes.
func (f *testFixture) ctxWithSession(method, path, body string, perms ...string) (echo.Context, *httptest.ResponseRecorder) {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	sess := &auth.Session{UserID: 1, Email: "test@example.com", Permissions: perms}
	req = req.WithContext(auth.WithSession(req.Context(), sess))
	rec := httptest.NewRecorder()
	return f.e.NewContext(req, rec), rec
}

// countAuditRowsFor returns how many audit_log rows are tagged with the given
// action for the given entity_id. Lets tests assert "audit actually fired".
func (f *testFixture) countAuditRowsFor(t *testing.T, action, entityID string) int {
	t.Helper()
	var n int
	if err := f.pool.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM audit_log WHERE action=$1 AND entity_id=$2
	`, action, entityID).Scan(&n); err != nil {
		t.Fatalf("count audit: %v", err)
	}
	return n
}

// -----------------------------------------------------------------------------
// Create
// -----------------------------------------------------------------------------

func TestIntegration_Create_HappyPath_WritesAudit(t *testing.T) {
	f := setupFixture(t)

	body := fmt.Sprintf(`{
		"company_id": %d, "department_id": %d, "position_id": %d,
		"first_name_th": "สมชาย", "last_name_th": "ใจดี",
		"gender": "M", "birthdate": "1990-05-15",
		"employment_type": "fulltime", "hired_at": "2022-01-03",
		"national_id": "1234567890121"
	}`, f.companyID, f.deptID, f.positionID)

	c, rec := f.ctxWithSession(http.MethodPost, "/api/v1/hr/employees", body)
	if err := f.handler.Create(c); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var out Employee
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.EmployeeCode == "" {
		t.Error("employee_code should be auto-generated")
	}
	// PII was present in the request but caller lacked reveal_pii → should be masked.
	if out.NationalID == nil || !strings.Contains(*out.NationalID, "•") {
		t.Errorf("expected masked NID, got %v", out.NationalID)
	}

	if n := f.countAuditRowsFor(t, "hr_employees.create", fmt.Sprint(out.ID)); n != 1 {
		t.Errorf("expected 1 create audit row, got %d", n)
	}
}

func TestIntegration_Create_BadNID_Rejected(t *testing.T) {
	f := setupFixture(t)

	body := fmt.Sprintf(`{
		"company_id": %d, "department_id": %d, "position_id": %d,
		"first_name_th": "สมชาย", "last_name_th": "ใจดี",
		"gender": "M", "birthdate": "1990-05-15",
		"employment_type": "fulltime", "hired_at": "2022-01-03",
		"national_id": "1234567890123"
	}`, f.companyID, f.deptID, f.positionID)

	c, _ := f.ctxWithSession(http.MethodPost, "/api/v1/hr/employees", body)
	err := f.handler.Create(c)
	if err == nil {
		t.Fatal("expected error for bad NID checksum")
	}
	he, ok := err.(*echo.HTTPError)
	if !ok || he.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %v", err)
	}
}

func TestIntegration_Create_BirthdateAfterHire_Rejected(t *testing.T) {
	f := setupFixture(t)

	body := fmt.Sprintf(`{
		"company_id": %d, "department_id": %d, "position_id": %d,
		"first_name_th": "a", "last_name_th": "b",
		"gender": "M", "birthdate": "2030-01-01",
		"employment_type": "fulltime", "hired_at": "2022-01-03"
	}`, f.companyID, f.deptID, f.positionID)

	c, _ := f.ctxWithSession(http.MethodPost, "/api/v1/hr/employees", body)
	err := f.handler.Create(c)
	if err == nil {
		t.Fatal("expected error when birthdate ≥ hired_at")
	}
}

// -----------------------------------------------------------------------------
// Get + PII masking
// -----------------------------------------------------------------------------

func TestIntegration_Get_MasksPIIForNonRevealer(t *testing.T) {
	f := setupFixture(t)
	id := f.createBasicEmployee(t, "1234567890121", "45000.00")

	c, rec := f.ctxWithSession(http.MethodGet, "/api/v1/hr/employees/"+fmt.Sprint(id), "", "hr_employees.read")
	c.SetParamNames("id")
	c.SetParamValues(fmt.Sprint(id))
	if err := f.handler.Get(c); err != nil {
		t.Fatalf("Get: %v", err)
	}

	var out Employee
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.NationalID == nil || !strings.HasSuffix(*out.NationalID, "0121") || !strings.HasPrefix(*out.NationalID, "•") {
		t.Errorf("NID not masked: %v", out.NationalID)
	}
	if out.Salary == nil || *out.Salary != "•••••" {
		t.Errorf("salary not masked: %v", out.Salary)
	}
	// No reveal audit when reveal_pii absent.
	if n := f.countAuditRowsFor(t, "hr_employees.reveal_pii", fmt.Sprint(id)); n != 0 {
		t.Errorf("reveal audit wrote %d rows without permission", n)
	}
}

func TestIntegration_Get_RevealsAndAudits(t *testing.T) {
	f := setupFixture(t)
	id := f.createBasicEmployee(t, "1234567890121", "45000.00")

	c, rec := f.ctxWithSession(http.MethodGet, "/api/v1/hr/employees/"+fmt.Sprint(id), "",
		"hr_employees.read", "hr_employees.reveal_pii")
	c.SetParamNames("id")
	c.SetParamValues(fmt.Sprint(id))
	if err := f.handler.Get(c); err != nil {
		t.Fatalf("Get: %v", err)
	}

	var out Employee
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.NationalID == nil || *out.NationalID != "1234567890121" {
		t.Errorf("NID not revealed: %v", out.NationalID)
	}
	if out.Salary == nil || *out.Salary != "45000.00" {
		t.Errorf("salary not revealed: %v", out.Salary)
	}
	// Reveal must produce exactly one audit row.
	if n := f.countAuditRowsFor(t, "hr_employees.reveal_pii", fmt.Sprint(id)); n != 1 {
		t.Errorf("expected 1 reveal_pii audit row, got %d", n)
	}
}

// -----------------------------------------------------------------------------
// Update — Bug A regression: un-terminating must clear terminated_at/reason
// -----------------------------------------------------------------------------

func TestIntegration_Update_UnTerminateClearsMetadata(t *testing.T) {
	f := setupFixture(t)
	id := f.createBasicEmployee(t, "", "")

	// Terminate first so there's metadata to clear.
	c, _ := f.ctxWithSession(http.MethodPost, fmt.Sprintf("/api/v1/hr/employees/%d/terminate", id),
		`{"terminated_at":"2026-01-01","terminated_reason":"left"}`,
		"hr_employees.terminate")
	c.SetParamNames("id")
	c.SetParamValues(fmt.Sprint(id))
	if err := f.handler.Terminate(c); err != nil {
		t.Fatalf("Terminate: %v", err)
	}

	// Flip back to active via Update.
	c2, _ := f.ctxWithSession(http.MethodPatch, fmt.Sprintf("/api/v1/hr/employees/%d", id),
		`{"status":"active"}`, "hr_employees.write")
	c2.SetParamNames("id")
	c2.SetParamValues(fmt.Sprint(id))
	if err := f.handler.Update(c2); err != nil {
		t.Fatalf("Update un-terminate: %v", err)
	}

	// Assert the DB row actually has the metadata cleared.
	var termAt *time.Time
	var termReason *string
	if err := f.pool.QueryRow(context.Background(), `
		SELECT terminated_at, terminated_reason FROM employees WHERE id=$1
	`, id).Scan(&termAt, &termReason); err != nil {
		t.Fatalf("load row: %v", err)
	}
	if termAt != nil || termReason != nil {
		t.Errorf("expected terminated_at + reason to be NULL, got %v / %v", termAt, termReason)
	}
}

// -----------------------------------------------------------------------------
// List filters
// -----------------------------------------------------------------------------

func TestIntegration_List_FilterByStatus(t *testing.T) {
	f := setupFixture(t)
	f.createBasicEmployee(t, "", "")
	id2 := f.createBasicEmployee(t, "", "")

	// Terminate the second one.
	c, _ := f.ctxWithSession(http.MethodPost, fmt.Sprintf("/api/v1/hr/employees/%d/terminate", id2),
		`{"terminated_at":"2026-01-01","terminated_reason":"x"}`, "hr_employees.terminate")
	c.SetParamNames("id")
	c.SetParamValues(fmt.Sprint(id2))
	if err := f.handler.Terminate(c); err != nil {
		t.Fatalf("Terminate: %v", err)
	}

	// Filter active only.
	c2, rec := f.ctxWithSession(http.MethodGet, "/api/v1/hr/employees?status=active", "", "hr_employees.read")
	if err := f.handler.List(c2); err != nil {
		t.Fatalf("List: %v", err)
	}

	var out struct {
		Items []EmployeeListItem `json:"items"`
		Total int                `json:"total"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.Total != 1 {
		t.Errorf("status=active total: want 1, got %d", out.Total)
	}
	if len(out.Items) != 1 || out.Items[0].Status != "active" {
		t.Errorf("unexpected items: %+v", out.Items)
	}
}

// helper: insert an employee with optional PII + return id.
func (f *testFixture) createBasicEmployee(t *testing.T, nid, salary string) int64 {
	t.Helper()
	body := fmt.Sprintf(`{
		"company_id": %d, "department_id": %d, "position_id": %d,
		"first_name_th": "a", "last_name_th": "b",
		"gender": "M", "birthdate": "1990-05-15",
		"employment_type": "fulltime", "hired_at": "2022-01-03"%s%s
	}`, f.companyID, f.deptID, f.positionID,
		jsonField("national_id", nid),
		jsonField("salary", salary),
	)
	c, rec := f.ctxWithSession(http.MethodPost, "/api/v1/hr/employees", body, "hr_employees.write")
	if err := f.handler.Create(c); err != nil {
		t.Fatalf("createBasicEmployee: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("createBasicEmployee status %d: %s", rec.Code, rec.Body.String())
	}
	var out Employee
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return out.ID
}

func jsonField(name, value string) string {
	if value == "" {
		return ""
	}
	return fmt.Sprintf(`, "%s": "%s"`, name, value)
}
