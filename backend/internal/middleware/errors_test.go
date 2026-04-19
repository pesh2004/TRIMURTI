package middleware

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestInternalError_HidesDetailsFromResponse(t *testing.T) {
	// The helper must return exactly "internal error" to the client,
	// regardless of how juicy the underlying error is. This is the
	// property an attacker probes against; we pin it in a test.
	rootCauses := []error{
		errors.New(`pq: duplicate key value violates unique constraint "users_email_key"`),
		errors.New(`pgx: failed to connect to "host=postgres user=trimurti": server error`),
		errors.New(`dial tcp 10.0.0.42:5432: connect: connection refused`),
	}
	for _, e := range rootCauses {
		he := InternalError(e)
		if he.Code != http.StatusInternalServerError {
			t.Errorf("want 500, got %d", he.Code)
		}
		msg, _ := he.Message.(string)
		if msg != "internal error" {
			t.Errorf("leaked message: %q", msg)
		}
		// Detail must still be available via .Internal for server-side logs.
		if he.Internal == nil || he.Internal.Error() != e.Error() {
			t.Errorf("Internal should carry %q, got %v", e.Error(), he.Internal)
		}
	}
}

func TestInternalError_ResponseBodyLeaksNothing(t *testing.T) {
	// The HTTP response body echo writes is he.Message (not he.Error() —
	// that's the logs path and is allowed to carry the internal). Confirm
	// the client-facing Message never contains the pgx detail.
	he := InternalError(errors.New("pq: relation \"users\" does not exist"))
	msg, _ := he.Message.(string)
	if strings.Contains(msg, "relation") || strings.Contains(msg, "users\"") {
		t.Errorf("response body leaks internals: %q", msg)
	}
	if msg != "internal error" {
		t.Errorf("response body must be opaque; got %q", msg)
	}
}

// Sanity: passing nil must not panic — handlers occasionally funnel a
// nil through "err := ...; if err != nil { return InternalError(err) }"
// in refactors, and we don't want a panic in the error path.
func TestInternalError_NilDoesNotPanic(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("InternalError(nil) panicked: %v", r)
		}
	}()
	he := InternalError(nil)
	if he.Code != http.StatusInternalServerError {
		t.Errorf("still want 500 even with nil internal, got %d", he.Code)
	}
}

var _ = echo.HTTPError{} // keep the echo import pinned for future tests
