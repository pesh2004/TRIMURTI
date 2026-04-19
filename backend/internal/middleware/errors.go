package middleware

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

// InternalError wraps err in a 500 response whose body is always the
// opaque string "internal error", with the original error preserved in
// the HTTPError.Internal field so the Logger middleware can emit it into
// structured logs. The client never sees raw database messages, pgx
// error codes, or stack-trace-ish content — all of which would be
// reconnaissance signal for an attacker.
//
// Use this helper from any handler where the error is an I/O / DB /
// serialisation failure the caller cannot act on. Keep `err.Error()`
// for validation messages the user needs (e.g. "birthdate: invalid
// format").
func InternalError(err error) *echo.HTTPError {
	return echo.NewHTTPError(http.StatusInternalServerError, "internal error").SetInternal(err)
}
