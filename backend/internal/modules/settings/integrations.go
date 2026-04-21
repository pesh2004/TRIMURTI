package settings

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

// GetIntegrations reports the runtime status of every external system
// the backend is wired to. Everything here is env-driven — nothing lives
// in the DB — so the endpoint is purely computed at request time and
// requires no mutation path. Secrets (SMTP password, future API keys)
// are never included.
func (h *Handler) GetIntegrations(c echo.Context) error {
	status := IntegrationsStatus{
		SMTP: IntegrationSMTP{
			Configured: h.cfg.SMTPHost != "",
			Host:       h.cfg.SMTPHost,
			Port:       h.cfg.SMTPPort,
			From:       h.cfg.SMTPFrom,
		},
		Storage: IntegrationStorage{
			Mode: "local",
		},
		Payment: IntegrationPlanned{
			Configured: false,
			Provider:   "",
			Note:       "Planned — lands with fin_ar/fin_ap",
		},
		ETax: IntegrationPlanned{
			Configured: false,
			Provider:   "",
			Note:       "Planned — Phase 7 fin_etax",
		},
	}
	return c.JSON(http.StatusOK, status)
}
