package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

// passthroughHandler is the handler the middleware wraps in tests.
func passthroughHandler(c echo.Context) error { return c.String(http.StatusOK, "ok") }

// buildCtx creates an echo.Context for a given method / cookie / header.
func buildCtx(method, cookieVal, headerVal string) (echo.Context, *httptest.ResponseRecorder) {
	req := httptest.NewRequest(method, "/api/v1/x", nil)
	if cookieVal != "" {
		req.AddCookie(&http.Cookie{Name: CSRFCookieName, Value: cookieVal})
	}
	if headerVal != "" {
		req.Header.Set("X-CSRF-Token", headerVal)
	}
	rec := httptest.NewRecorder()
	return echo.New().NewContext(req, rec), rec
}

func TestCSRF_PassesGet(t *testing.T) {
	mw := CSRF()
	c, _ := buildCtx(http.MethodGet, "", "")
	if err := mw(passthroughHandler)(c); err != nil {
		t.Errorf("GET must pass unchecked, got %v", err)
	}
}

func TestCSRF_PassesOptions(t *testing.T) {
	mw := CSRF()
	c, _ := buildCtx(http.MethodOptions, "", "")
	if err := mw(passthroughHandler)(c); err != nil {
		t.Errorf("OPTIONS must pass (CORS preflight), got %v", err)
	}
}

func TestCSRF_RejectsMutationWithoutCookie(t *testing.T) {
	mw := CSRF()
	c, _ := buildCtx(http.MethodPost, "", "some-token")
	err := mw(passthroughHandler)(c)
	if he, ok := err.(*echo.HTTPError); !ok || he.Code != http.StatusForbidden {
		t.Errorf("want 403 cookie-missing, got %v", err)
	}
}

func TestCSRF_RejectsMutationWithoutHeader(t *testing.T) {
	mw := CSRF()
	c, _ := buildCtx(http.MethodPost, "some-token", "")
	err := mw(passthroughHandler)(c)
	if he, ok := err.(*echo.HTTPError); !ok || he.Code != http.StatusForbidden {
		t.Errorf("want 403 header-missing, got %v", err)
	}
}

func TestCSRF_RejectsMismatch(t *testing.T) {
	mw := CSRF()
	c, _ := buildCtx(http.MethodPost, "aaaaaa", "bbbbbb")
	err := mw(passthroughHandler)(c)
	if he, ok := err.(*echo.HTTPError); !ok || he.Code != http.StatusForbidden {
		t.Errorf("want 403 mismatch, got %v", err)
	}
	// Sanity: error message mentions mismatch so ops can distinguish it
	// from the missing-cookie / missing-header case in logs.
	if he, _ := err.(*echo.HTTPError); he != nil {
		msg, _ := he.Message.(string)
		if !strings.Contains(msg, "mismatch") {
			t.Errorf("expected mismatch in error, got %q", msg)
		}
	}
}

func TestCSRF_AcceptsMatchingPair(t *testing.T) {
	mw := CSRF()
	c, rec := buildCtx(http.MethodPost, "same-token", "same-token")
	if err := mw(passthroughHandler)(c); err != nil {
		t.Fatalf("matching pair should pass, got %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 from passthrough, got %d", rec.Code)
	}
}

func TestIssueCSRFCookie_SetsNonHttpOnly(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	IssueCSRFCookie(c, "example.com", true)

	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("want 1 cookie, got %d", len(cookies))
	}
	k := cookies[0]
	if k.Name != CSRFCookieName {
		t.Errorf("name = %q", k.Name)
	}
	if k.HttpOnly {
		t.Error("CSRF cookie must be readable from JS — HttpOnly is wrong")
	}
	if !k.Secure {
		t.Error("Secure must pass through")
	}
	if k.Value == "" {
		t.Error("value must not be empty")
	}
}

func TestIssueCSRFCookieIfMissing_NoopWhenPresent(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: CSRFCookieName, Value: "existing-token"})
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	IssueCSRFCookieIfMissing(c, "example.com", true)

	if cookies := rec.Result().Cookies(); len(cookies) != 0 {
		t.Errorf("existing cookie should prevent issuance; got %d new cookies", len(cookies))
	}
}

func TestIssueCSRFCookieIfMissing_IssuesWhenAbsent(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	IssueCSRFCookieIfMissing(c, "example.com", true)

	if cookies := rec.Result().Cookies(); len(cookies) != 1 {
		t.Errorf("want 1 new cookie, got %d", len(cookies))
	}
}

func TestNewCSRFToken_UniqueAndUrlSafe(t *testing.T) {
	seen := map[string]struct{}{}
	for i := 0; i < 20; i++ {
		tok := newCSRFToken()
		if tok == "" {
			t.Fatal("empty token")
		}
		if strings.ContainsAny(tok, "+/=") {
			t.Errorf("token %q must be url-safe base64", tok)
		}
		if _, dup := seen[tok]; dup {
			t.Errorf("duplicate after %d iterations", i)
		}
		seen[tok] = struct{}{}
	}
}
