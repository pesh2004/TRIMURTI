// Package settings implements the company-profile + integrations read-only
// endpoints backing the Settings UI. It is also the first consumer of the
// row-level multi-entity helpers — every handler reads the active company
// from the session via auth.ActiveCompanyFromContext.
package settings

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/audit"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/config"
)

type Handler struct {
	pool  *pgxpool.Pool
	audit *audit.Writer
	cfg   *config.Config
}

func New(pool *pgxpool.Pool, auditWriter *audit.Writer, cfg *config.Config) *Handler {
	return &Handler{pool: pool, audit: auditWriter, cfg: cfg}
}
