package audit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
)

// Writer persists audit entries synchronously via pgx. A background queue is a
// future optimisation (not wired today); under load the synchronous write adds
// one round-trip to each mutation handler.
type Writer struct {
	pool *pgxpool.Pool
}

func NewWriter(pool *pgxpool.Pool) *Writer {
	return &Writer{pool: pool}
}

type Entry struct {
	RequestID uuid.UUID
	IP        string
	UserAgent string
	Action    string
	Entity    string
	EntityID  string
	Before    any
	After     any
}

// Write persists one audit entry with a forward-chained hash. If the session is
// anonymous (nil in context) user_id is stored as NULL.
func (w *Writer) Write(ctx context.Context, e Entry) error {
	var userID *int64
	if s := auth.FromContext(ctx); s != nil {
		userID = &s.UserID
	}
	beforeJSON, err := marshalNullable(e.Before)
	if err != nil {
		return fmt.Errorf("marshalling before: %w", err)
	}
	afterJSON, err := marshalNullable(e.After)
	if err != nil {
		return fmt.Errorf("marshalling after: %w", err)
	}

	var prevHash *string
	err = w.pool.QueryRow(ctx, `SELECT row_hash FROM audit_log ORDER BY ts DESC, id DESC LIMIT 1`).Scan(&prevHash)
	if err != nil && err.Error() != "no rows in result set" {
		// Best-effort: continue without chain if we truly cannot read.
		prevHash = nil
	}
	rowHash := computeHash(prevHash, e.Action, e.Entity, e.EntityID, beforeJSON, afterJSON)

	var reqID *uuid.UUID
	if e.RequestID != uuid.Nil {
		reqID = &e.RequestID
	}
	_, err = w.pool.Exec(ctx, `
		INSERT INTO audit_log (
			user_id, request_id, ip_address, user_agent,
			action, entity, entity_id, before_json, after_json,
			prev_hash, row_hash
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		userID, reqID, nullIfEmpty(e.IP), nullIfEmpty(e.UserAgent),
		e.Action, e.Entity, nullIfEmpty(e.EntityID),
		beforeJSON, afterJSON,
		prevHash, rowHash,
	)
	if err != nil {
		return fmt.Errorf("inserting audit row: %w", err)
	}
	return nil
}

func marshalNullable(v any) ([]byte, error) {
	if v == nil {
		return nil, nil
	}
	return json.Marshal(v)
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func computeHash(prev *string, action, entity, entityID string, before, after []byte) string {
	h := sha256.New()
	if prev != nil {
		h.Write([]byte(*prev))
	}
	h.Write([]byte(action))
	h.Write([]byte(entity))
	h.Write([]byte(entityID))
	h.Write(before)
	h.Write(after)
	return hex.EncodeToString(h.Sum(nil))
}
