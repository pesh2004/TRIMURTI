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

// Check pings every downstream dependency we need to serve traffic and
// returns 503 if any fail. UptimeRobot + the deploy smoke-test hit this,
// so "green" actually means "the system can talk to its data tier",
// not just "the process is alive".
//
// We skip the internal error details in the fail branch — the response is
// returned to an anonymous caller and leaking pgx error strings into a
// 503 body is reconnaissance signal for an attacker probing the stack.
func (h *Handler) Check(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 2*time.Second)
	defer cancel()

	resp := echo.Map{"status": "ok", "checks": echo.Map{}}
	checks := resp["checks"].(echo.Map)
	ok := true

	if err := h.pool.Ping(ctx); err != nil {
		checks["database"] = echo.Map{"status": "fail"}
		ok = false
	} else {
		checks["database"] = echo.Map{"status": "ok"}
	}

	if err := h.rdb.Ping(ctx).Err(); err != nil {
		checks["redis"] = echo.Map{"status": "fail"}
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
	// Both paths run the same deep check. /readyz stays as a k8s-style
	// alias so anything that currently polls it (if added later) still
	// works without a rename.
	//
	// HEAD is registered alongside GET so uptime-monitoring tools (which
	// default to HEAD because it's cheaper — no body transferred) work
	// without forcing the operator onto a paid tier that lets them
	// switch the probe method. Go's net/http discards the body on HEAD
	// responses automatically, so the handler logic stays identical.
	g.GET("/healthz", h.Check)
	g.HEAD("/healthz", h.Check)
	g.GET("/readyz", h.Check)
	g.HEAD("/readyz", h.Check)
}
