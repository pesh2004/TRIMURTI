package auth

import (
	"context"
)

type ctxKey struct{}

var sessionKey = ctxKey{}

// WithSession stores the authenticated session in the context.
func WithSession(ctx context.Context, s *Session) context.Context {
	return context.WithValue(ctx, sessionKey, s)
}

// FromContext returns the authenticated session, or nil when the request is anonymous.
func FromContext(ctx context.Context) *Session {
	s, _ := ctx.Value(sessionKey).(*Session)
	return s
}

// ActiveCompanyFromContext returns the active company id from the session,
// or 0 when the request is anonymous. Handlers scoping data to the active
// company should prefer this helper over reaching into the Session struct
// so that a future middleware-level enforcement can intercept here.
func ActiveCompanyFromContext(ctx context.Context) int64 {
	if s := FromContext(ctx); s != nil {
		return s.ActiveCompanyID
	}
	return 0
}

// HasPermission returns true when the session grants the given permission code.
func (s *Session) HasPermission(code string) bool {
	if s == nil {
		return false
	}
	for _, p := range s.Permissions {
		if p == code {
			return true
		}
	}
	return false
}

// HasRole returns true when the session carries the given role code.
func (s *Session) HasRole(code string) bool {
	if s == nil {
		return false
	}
	for _, r := range s.Roles {
		if r == code {
			return true
		}
	}
	return false
}
