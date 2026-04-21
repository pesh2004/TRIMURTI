package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type Session struct {
	ID          string    `json:"id"`
	UserID      int64     `json:"user_id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Roles       []string  `json:"roles"`
	Permissions []string  `json:"permissions"`
	IP          string    `json:"ip"`
	UserAgent   string    `json:"user_agent"`
	CreatedAt   time.Time `json:"created_at"`
	LastSeenAt  time.Time `json:"last_seen_at"`

	// ActiveCompanyID is the company the session is currently scoped to.
	// Populated at login from users.default_company_id; topbar switcher
	// rewrites it via POST /auth/switch-company. Sessions created before
	// this field existed are lazily back-filled by the Auth middleware,
	// so a deploy does not force re-login.
	ActiveCompanyID int64 `json:"active_company_id"`
}

var ErrSessionNotFound = errors.New("auth: session not found")

type Store struct {
	rdb *redis.Client
	ttl time.Duration
}

func NewStore(rdb *redis.Client, ttl time.Duration) *Store {
	return &Store{rdb: rdb, ttl: ttl}
}

func (s *Store) key(id string) string { return "sess:" + id }

func (s *Store) Create(ctx context.Context, sess Session) (string, error) {
	if sess.ID == "" {
		sess.ID = uuid.NewString()
	}
	now := time.Now().UTC()
	sess.CreatedAt = now
	sess.LastSeenAt = now
	data, err := json.Marshal(sess)
	if err != nil {
		return "", fmt.Errorf("marshalling session: %w", err)
	}
	if err := s.rdb.Set(ctx, s.key(sess.ID), data, s.ttl).Err(); err != nil {
		return "", fmt.Errorf("writing session to redis: %w", err)
	}
	return sess.ID, nil
}

func (s *Store) Get(ctx context.Context, id string) (*Session, error) {
	if id == "" {
		return nil, ErrSessionNotFound
	}
	raw, err := s.rdb.Get(ctx, s.key(id)).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, ErrSessionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading session: %w", err)
	}
	var sess Session
	if err := json.Unmarshal(raw, &sess); err != nil {
		return nil, fmt.Errorf("unmarshalling session: %w", err)
	}
	return &sess, nil
}

// Touch extends the TTL and updates last_seen_at. Called on every authenticated request.
func (s *Store) Touch(ctx context.Context, id string) error {
	sess, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	sess.LastSeenAt = time.Now().UTC()
	data, err := json.Marshal(sess)
	if err != nil {
		return err
	}
	return s.rdb.Set(ctx, s.key(id), data, s.ttl).Err()
}

func (s *Store) Revoke(ctx context.Context, id string) error {
	return s.rdb.Del(ctx, s.key(id)).Err()
}

// Put overwrites an existing session with the supplied payload and resets
// the TTL. Used by the Auth middleware to persist a lazily back-filled
// ActiveCompanyID, and by the switch-company handler to land a new active
// company. Callers are expected to have fetched the session first via Get.
func (s *Store) Put(ctx context.Context, sess *Session) error {
	if sess == nil || sess.ID == "" {
		return fmt.Errorf("put session: missing id")
	}
	data, err := json.Marshal(sess)
	if err != nil {
		return fmt.Errorf("marshalling session: %w", err)
	}
	if err := s.rdb.Set(ctx, s.key(sess.ID), data, s.ttl).Err(); err != nil {
		return fmt.Errorf("writing session to redis: %w", err)
	}
	return nil
}
