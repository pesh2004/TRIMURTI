package health

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
}

func New(pool *pgxpool.Pool, rdb *redis.Client) *Handler {
	return &Handler{pool: pool, rdb: rdb}
}

// Liveness is a cheap check — the process is up and can serve HTTP.
func (h *Handler) Liveness(c echo.Context) error {
	return c.JSON(http.StatusOK, echo.Map{"status": "ok"})
}

// Readiness checks downstream dependencies. Returns 503 when any are unhealthy so
// load balancers / k8s can route traffic away.
func (h *Handler) Readiness(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 2*time.Second)
	defer cancel()

	resp := echo.Map{"status": "ok", "checks": echo.Map{}}
	checks := resp["checks"].(echo.Map)
	ok := true

	if err := h.pool.Ping(ctx); err != nil {
		checks["database"] = echo.Map{"status": "fail", "error": err.Error()}
		ok = false
	} else {
		checks["database"] = echo.Map{"status": "ok"}
	}

	if err := h.rdb.Ping(ctx).Err(); err != nil {
		checks["redis"] = echo.Map{"status": "fail", "error": err.Error()}
		ok = false
	} else {
		checks["redis"] = echo.Map{"status": "ok"}
	}

	if !ok {
		resp["status"] = "degraded"
		return c.JSON(http.StatusServiceUnavailable, resp)
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *Handler) Register(g *echo.Group) {
	g.GET("/healthz", h.Liveness)
	g.GET("/readyz", h.Readiness)
}
