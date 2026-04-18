package hr

import (
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

// Master — read-only endpoints for dropdowns (companies, departments, positions).
// Full CRUD lives with the settings module; that's the correct cycle boundary.

type MasterHandler struct {
	pool *pgxpool.Pool
}

func NewMasterHandler(pool *pgxpool.Pool) *MasterHandler {
	return &MasterHandler{pool: pool}
}

func (h *MasterHandler) ListCompanies(c echo.Context) error {
	rows, err := h.pool.Query(c.Request().Context(), `
		SELECT id, code, name_th, name_en, is_active
		FROM companies
		WHERE is_active
		ORDER BY name_en`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "listing companies: "+err.Error())
	}
	defer rows.Close()
	out := []Company{}
	for rows.Next() {
		var co Company
		if err := rows.Scan(&co.ID, &co.Code, &co.NameTH, &co.NameEN, &co.IsActive); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		out = append(out, co)
	}
	return c.JSON(http.StatusOK, echo.Map{"items": out})
}

func (h *MasterHandler) ListDepartments(c echo.Context) error {
	// Optional company_id filter — most UIs will scope to current company.
	q := `SELECT id, company_id, code, name_th, name_en, is_active
	      FROM departments WHERE is_active`
	args := []any{}
	if cid := c.QueryParam("company_id"); cid != "" {
		id, err := strconv.ParseInt(cid, 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid company_id")
		}
		q += " AND company_id = $1"
		args = append(args, id)
	}
	q += " ORDER BY name_en"

	rows, err := h.pool.Query(c.Request().Context(), q, args...)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []Department{}
	for rows.Next() {
		var d Department
		if err := rows.Scan(&d.ID, &d.CompanyID, &d.Code, &d.NameTH, &d.NameEN, &d.IsActive); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		out = append(out, d)
	}
	return c.JSON(http.StatusOK, echo.Map{"items": out})
}

func (h *MasterHandler) ListPositions(c echo.Context) error {
	rows, err := h.pool.Query(c.Request().Context(), `
		SELECT id, code, name_th, name_en, level, is_active
		FROM positions
		WHERE is_active
		ORDER BY level DESC, name_en`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []Position{}
	for rows.Next() {
		var p Position
		if err := rows.Scan(&p.ID, &p.Code, &p.NameTH, &p.NameEN, &p.Level, &p.IsActive); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		out = append(out, p)
	}
	return c.JSON(http.StatusOK, echo.Map{"items": out})
}
