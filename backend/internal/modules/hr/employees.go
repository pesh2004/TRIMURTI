package hr

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/audit"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
)

const (
	PermRevealPII = "hr_employees.reveal_pii"
	salaryMasked  = "•••••"
)

type EmployeesHandler struct {
	pool   *pgxpool.Pool
	audit  *audit.Writer
	piiKey string
}

func NewEmployeesHandler(pool *pgxpool.Pool, auditWriter *audit.Writer, piiKey string) *EmployeesHandler {
	return &EmployeesHandler{pool: pool, audit: auditWriter, piiKey: piiKey}
}

// -----------------------------------------------------------------------------
// List
// -----------------------------------------------------------------------------

func (h *EmployeesHandler) List(c echo.Context) error {
	ctx := c.Request().Context()

	limit := parseIntDefault(c.QueryParam("limit"), 25)
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	offset := parseIntDefault(c.QueryParam("offset"), 0)
	if offset < 0 {
		offset = 0
	}

	var (
		conds []string
		args  []any
	)
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "$$", "$"+strconv.Itoa(len(args))))
	}

	if v := c.QueryParam("company_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			add("e.company_id = $$", id)
		}
	}
	if v := c.QueryParam("department_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			add("e.department_id = $$", id)
		}
	}
	if v := c.QueryParam("position_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			add("e.position_id = $$", id)
		}
	}
	if v := c.QueryParam("employment_type"); v != "" {
		add("e.employment_type = $$", v)
	}
	if v := c.QueryParam("status"); v != "" {
		add("e.status = $$", v)
	}
	if v := c.QueryParam("hired_from"); v != "" {
		add("e.hired_at >= $$", v)
	}
	if v := c.QueryParam("hired_to"); v != "" {
		add("e.hired_at <= $$", v)
	}
	if q := strings.TrimSpace(c.QueryParam("q")); q != "" {
		// Use trigram similarity index for fuzzy search across names + code.
		add("(e.first_name_th || ' ' || e.last_name_th || ' ' || coalesce(e.first_name_en,'') || ' ' || coalesce(e.last_name_en,'') || ' ' || coalesce(e.nickname,'') || ' ' || e.employee_code) ILIKE '%' || $$ || '%'", q)
	}

	where := ""
	if len(conds) > 0 {
		where = "WHERE " + strings.Join(conds, " AND ")
	}

	// Total count (same filter, no limit/offset)
	var total int
	if err := h.pool.QueryRow(ctx, "SELECT COUNT(*) FROM employees e "+where, args...).Scan(&total); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "count employees: "+err.Error())
	}

	args = append(args, limit, offset)
	limitPlaceholder := "$" + strconv.Itoa(len(args)-1)
	offsetPlaceholder := "$" + strconv.Itoa(len(args))

	rows, err := h.pool.Query(ctx, fmt.Sprintf(`
		SELECT e.id, e.employee_code,
		       e.first_name_th, e.last_name_th, e.first_name_en, e.last_name_en, e.nickname,
		       e.company_id, co.name_en, co.name_th,
		       e.department_id, d.name_en, d.name_th,
		       e.position_id, p.name_en, p.name_th,
		       e.employment_type, e.hired_at, e.terminated_at, e.status
		FROM employees e
		JOIN companies   co ON co.id = e.company_id
		JOIN departments d  ON d.id  = e.department_id
		JOIN positions   p  ON p.id  = e.position_id
		%s
		ORDER BY e.employee_code DESC
		LIMIT %s OFFSET %s`, where, limitPlaceholder, offsetPlaceholder),
		args...)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "list employees: "+err.Error())
	}
	defer rows.Close()

	items := []EmployeeListItem{}
	for rows.Next() {
		var it EmployeeListItem
		if err := rows.Scan(
			&it.ID, &it.EmployeeCode,
			&it.FirstNameTH, &it.LastNameTH, &it.FirstNameEN, &it.LastNameEN, &it.Nickname,
			&it.CompanyID, &it.CompanyNameEN, &it.CompanyNameTH,
			&it.DepartmentID, &it.DepartmentNameEN, &it.DepartmentNameTH,
			&it.PositionID, &it.PositionNameEN, &it.PositionNameTH,
			&it.EmploymentType, &it.HiredAt, &it.TerminatedAt, &it.Status,
		); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		items = append(items, it)
	}

	return c.JSON(http.StatusOK, EmployeeListResponse{
		Items: items, Total: total, Limit: limit, Offset: offset,
	})
}

// -----------------------------------------------------------------------------
// Get
// -----------------------------------------------------------------------------

func (h *EmployeesHandler) Get(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}

	emp, err := h.loadEmployee(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "employee not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	applyPIIMask(c, emp)
	return c.JSON(http.StatusOK, emp)
}

// -----------------------------------------------------------------------------
// Create
// -----------------------------------------------------------------------------

func (h *EmployeesHandler) Create(c echo.Context) error {
	var req CreateEmployeeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid json")
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	birthdate, err := parseDate(req.Birthdate)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "birthdate: "+err.Error())
	}
	hiredAt, err := parseDate(req.HiredAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "hired_at: "+err.Error())
	}

	addrJSON, err := marshalAddress(req.AddressJSON)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "address: "+err.Error())
	}

	ctx := c.Request().Context()

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Verify department belongs to the selected company; catches bad combos early.
	var deptCompanyID int64
	if err := tx.QueryRow(ctx, `SELECT company_id FROM departments WHERE id = $1`, req.DepartmentID).Scan(&deptCompanyID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return echo.NewHTTPError(http.StatusBadRequest, "department_id not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if deptCompanyID != req.CompanyID {
		return echo.NewHTTPError(http.StatusBadRequest, "department does not belong to the selected company")
	}

	// Atomic employee_code from the sequence function.
	var empCode string
	if err := tx.QueryRow(ctx, `SELECT generate_employee_code($1)`, req.CompanyID).Scan(&empCode); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "generate code: "+err.Error())
	}

	var newID int64
	// national_id + salary are encrypted at rest via pgp_sym_encrypt; NULLs pass through.
	err = tx.QueryRow(ctx, `
		INSERT INTO employees (
			employee_code, company_id, department_id, position_id,
			first_name_th, last_name_th, first_name_en, last_name_en, nickname,
			gender, birthdate, national_id, phone, email, address_json,
			employment_type, hired_at, salary
		) VALUES (
			$1,$2,$3,$4,
			$5,$6,$7,$8,$9,
			$10,$11,
			CASE WHEN $12::TEXT IS NULL THEN NULL ELSE pgp_sym_encrypt($12::TEXT, $19) END,
			$13,$14,$15,
			$16,$17,
			CASE WHEN $18::TEXT IS NULL THEN NULL ELSE pgp_sym_encrypt($18::TEXT, $19) END
		) RETURNING id`,
		empCode, req.CompanyID, req.DepartmentID, req.PositionID,
		req.FirstNameTH, req.LastNameTH, req.FirstNameEN, req.LastNameEN, req.Nickname,
		req.Gender, birthdate, req.NationalID, req.Phone, req.Email, addrJSON,
		req.EmploymentType, hiredAt, req.Salary,
		h.piiKey,
	).Scan(&newID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "insert employee: "+err.Error())
	}

	if err := tx.Commit(ctx); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	emp, err := h.loadEmployee(ctx, newID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	_ = h.audit.Write(ctx, audit.Entry{
		IP:        c.RealIP(),
		UserAgent: c.Request().UserAgent(),
		Action:    "hr_employees.create",
		Entity:    "employee",
		EntityID:  strconv.FormatInt(newID, 10),
		After:     emp,
	})

	applyPIIMask(c, emp)
	return c.JSON(http.StatusCreated, emp)
}

// -----------------------------------------------------------------------------
// Update
// -----------------------------------------------------------------------------

func (h *EmployeesHandler) Update(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var req UpdateEmployeeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid json")
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ctx := c.Request().Context()

	before, err := h.loadEmployee(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "employee not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	// Build a dynamic UPDATE; only supplied fields change.
	sets := []string{}
	args := []any{}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	// addEncrypted stores a value through pgp_sym_encrypt; uses an appended
	// PII-key argument for every encrypt call (cheap, key is short).
	addEncrypted := func(col string, v any) {
		args = append(args, v)
		valArg := len(args)
		args = append(args, h.piiKey)
		keyArg := len(args)
		sets = append(sets, fmt.Sprintf(
			"%s = CASE WHEN $%d::TEXT IS NULL THEN NULL ELSE pgp_sym_encrypt($%d::TEXT, $%d) END",
			col, valArg, valArg, keyArg,
		))
	}
	if req.DepartmentID != nil {
		add("department_id", *req.DepartmentID)
	}
	if req.PositionID != nil {
		add("position_id", *req.PositionID)
	}
	if req.FirstNameTH != nil {
		add("first_name_th", *req.FirstNameTH)
	}
	if req.LastNameTH != nil {
		add("last_name_th", *req.LastNameTH)
	}
	if req.FirstNameEN != nil {
		add("first_name_en", *req.FirstNameEN)
	}
	if req.LastNameEN != nil {
		add("last_name_en", *req.LastNameEN)
	}
	if req.Nickname != nil {
		add("nickname", *req.Nickname)
	}
	if req.Gender != nil {
		add("gender", *req.Gender)
	}
	if req.Birthdate != nil {
		bd, err := parseDate(*req.Birthdate)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "birthdate: "+err.Error())
		}
		add("birthdate", bd)
	}
	if req.NationalID != nil {
		addEncrypted("national_id", *req.NationalID)
	}
	if req.Phone != nil {
		add("phone", *req.Phone)
	}
	if req.Email != nil {
		add("email", *req.Email)
	}
	if req.AddressJSON != nil {
		b, err := marshalAddress(req.AddressJSON)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "address: "+err.Error())
		}
		add("address_json", b)
	}
	if req.EmploymentType != nil {
		add("employment_type", *req.EmploymentType)
	}
	if req.Salary != nil {
		addEncrypted("salary", *req.Salary)
	}
	if req.Status != nil {
		add("status", *req.Status)
		// If the row is currently terminated and the client is moving it back
		// to an active state (validator already rejects 'terminated' here), drop
		// the termination metadata so the record stays internally consistent.
		if before.Status == "terminated" && *req.Status != "terminated" {
			sets = append(sets, "terminated_at = NULL", "terminated_reason = NULL")
		}
	}

	if len(sets) == 0 {
		applyPIIMask(c, before)
		return c.JSON(http.StatusOK, before)
	}

	args = append(args, id)
	idPlaceholder := "$" + strconv.Itoa(len(args))

	if _, err := h.pool.Exec(ctx, fmt.Sprintf(`UPDATE employees SET %s WHERE id = %s`, strings.Join(sets, ", "), idPlaceholder), args...); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "update: "+err.Error())
	}

	after, err := h.loadEmployee(ctx, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	_ = h.audit.Write(ctx, audit.Entry{
		IP:        c.RealIP(),
		UserAgent: c.Request().UserAgent(),
		Action:    "hr_employees.update",
		Entity:    "employee",
		EntityID:  strconv.FormatInt(id, 10),
		Before:    before,
		After:     after,
	})

	applyPIIMask(c, after)
	return c.JSON(http.StatusOK, after)
}

// -----------------------------------------------------------------------------
// Terminate (soft delete)
// -----------------------------------------------------------------------------

func (h *EmployeesHandler) Terminate(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var req TerminateEmployeeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid json")
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	termDate, err := parseDate(req.TerminatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "terminated_at: "+err.Error())
	}

	ctx := c.Request().Context()

	before, err := h.loadEmployee(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "employee not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if before.Status == "terminated" {
		return echo.NewHTTPError(http.StatusBadRequest, "employee already terminated")
	}

	if _, err := h.pool.Exec(ctx, `
		UPDATE employees
		SET status = 'terminated', terminated_at = $1, terminated_reason = $2
		WHERE id = $3`, termDate, req.TerminatedReason, id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	after, err := h.loadEmployee(ctx, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	_ = h.audit.Write(ctx, audit.Entry{
		IP:        c.RealIP(),
		UserAgent: c.Request().UserAgent(),
		Action:    "hr_employees.terminate",
		Entity:    "employee",
		EntityID:  strconv.FormatInt(id, 10),
		Before:    before,
		After:     after,
	})

	applyPIIMask(c, after)
	return c.JSON(http.StatusOK, after)
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

func (h *EmployeesHandler) loadEmployee(ctx context.Context, id int64) (*Employee, error) {
	var e Employee
	var addr []byte
	err := h.pool.QueryRow(ctx, `
		SELECT e.id, e.employee_code,
		       e.company_id, co.name_en, co.name_th,
		       e.department_id, d.name_en, d.name_th,
		       e.position_id, p.name_en, p.name_th,
		       e.first_name_th, e.last_name_th, e.first_name_en, e.last_name_en, e.nickname,
		       e.gender, e.birthdate,
		       CASE WHEN e.national_id IS NULL THEN NULL ELSE pgp_sym_decrypt(e.national_id, $2) END,
		       e.phone, e.email, e.address_json,
		       e.employment_type, e.hired_at, e.terminated_at, e.terminated_reason,
		       CASE WHEN e.salary IS NULL THEN NULL ELSE pgp_sym_decrypt(e.salary, $2) END,
		       e.status, e.created_at, e.updated_at
		FROM employees e
		JOIN companies   co ON co.id = e.company_id
		JOIN departments d  ON d.id  = e.department_id
		JOIN positions   p  ON p.id  = e.position_id
		WHERE e.id = $1`, id, h.piiKey).
		Scan(&e.ID, &e.EmployeeCode,
			&e.CompanyID, &e.CompanyNameEN, &e.CompanyNameTH,
			&e.DepartmentID, &e.DepartmentNameEN, &e.DepartmentNameTH,
			&e.PositionID, &e.PositionNameEN, &e.PositionNameTH,
			&e.FirstNameTH, &e.LastNameTH, &e.FirstNameEN, &e.LastNameEN, &e.Nickname,
			&e.Gender, &e.Birthdate, &e.NationalID, &e.Phone, &e.Email, &addr,
			&e.EmploymentType, &e.HiredAt, &e.TerminatedAt, &e.TerminatedReason, &e.Salary,
			&e.Status, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if len(addr) > 0 {
		var a any
		if err := json.Unmarshal(addr, &a); err == nil {
			e.AddressJSON = a
		}
	}
	return &e, nil
}

// applyPIIMask mutates the given Employee in place, masking national_id + salary
// when the caller's session lacks the `hr_employees.reveal_pii` permission.
func applyPIIMask(c echo.Context, e *Employee) {
	if e == nil {
		return
	}
	sess := auth.FromContext(c.Request().Context())
	if sess == nil || !sess.HasPermission(PermRevealPII) {
		if e.NationalID != nil && *e.NationalID != "" {
			s := *e.NationalID
			if len(s) > 4 {
				masked := strings.Repeat("•", len(s)-4) + s[len(s)-4:]
				e.NationalID = &masked
			} else {
				masked := strings.Repeat("•", len(s))
				e.NationalID = &masked
			}
		}
		if e.Salary != nil {
			m := salaryMasked
			e.Salary = &m
		}
	}
}

func parseIntDefault(s string, d int) int {
	if s == "" {
		return d
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return d
	}
	return n
}

func parseDate(s string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", s, time.UTC)
}

func marshalAddress(v any) ([]byte, error) {
	if v == nil {
		return nil, nil
	}
	return json.Marshal(v)
}
