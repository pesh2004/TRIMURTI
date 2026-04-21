-- 0006_multi_entity: finish the row-level multi-entity foundation.
-- Phase 0 landed `companies` + `company_id` on business tables but left
-- two gaps: per-company business config (currency, timezone, fiscal
-- year, VAT/WHT) has to live somewhere, and users need a way to belong
-- to more than one company so the session can carry an active company.
--
-- `default_company_id` is deliberately NULL-able. Migrations run before
-- seed on fresh DBs, so forcing NOT NULL now would either fail or
-- require sequencing tricks. The seeder + session middleware treat a
-- NULL as "fall back to the user's first membership".

BEGIN;

-- ---------- companies: business-config fields ----------
ALTER TABLE companies
    ADD COLUMN currency                TEXT        NOT NULL DEFAULT 'THB',
    ADD COLUMN timezone                TEXT        NOT NULL DEFAULT 'Asia/Bangkok',
    ADD COLUMN fiscal_year_start_month SMALLINT    NOT NULL DEFAULT 1
        CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    ADD COLUMN vat_rate                NUMERIC(5,2) NOT NULL DEFAULT 7.00,
    ADD COLUMN wht_rate                NUMERIC(5,2) NOT NULL DEFAULT 3.00,
    ADD COLUMN website                 TEXT;

-- ---------- user_companies: membership join ----------
CREATE TABLE user_companies (
    user_id    BIGINT      NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    company_id BIGINT      NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    is_default BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, company_id)
);

-- At most one default per user — partial unique index is idiomatic.
CREATE UNIQUE INDEX uq_user_companies_one_default
    ON user_companies (user_id) WHERE is_default;

-- Reverse lookup for "who belongs to this company" (company switcher, admin UI).
CREATE INDEX idx_user_companies_company ON user_companies (company_id);

-- ---------- users.default_company_id ----------
ALTER TABLE users
    ADD COLUMN default_company_id BIGINT REFERENCES companies(id);

COMMIT;
