-- 0005_password_reset: single-use, time-boxed tokens for self-service
-- password recovery. Storing only the SHA-256 hash of the token means a
-- stolen DB dump doesn't yield working reset links.

BEGIN;

CREATE TABLE password_reset_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,       -- hex SHA-256 of the raw token
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,       -- 15 minutes after creation
    used_at     TIMESTAMPTZ,                -- NULL until the token is consumed
    ip_address  INET,
    user_agent  TEXT
);

-- Find active tokens for a user quickly (used during rate limiting).
CREATE INDEX idx_prt_user_active ON password_reset_tokens (user_id)
    WHERE used_at IS NULL;

-- Lookup by the hash in the confirm path.
CREATE INDEX idx_prt_hash ON password_reset_tokens (token_hash);

COMMIT;
