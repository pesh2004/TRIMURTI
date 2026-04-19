-- 0003_hr_encrypt: field-level encryption of national_id and salary.
--
-- Strategy: DROP the plaintext columns and re-create them as BYTEA.
-- Any existing rows lose their national_id / salary values and will need
-- re-entry through the UI — acceptable because:
--   a) this migration must land before real users sign up (per SECURITY.md),
--   b) demo seed data has at most a handful of test employees,
--   c) alternatives (dual-write, current_setting-based key passing) add
--      complexity the phase 1A scope doesn't warrant.
--
-- Encryption/decryption happens via pgp_sym_encrypt / pgp_sym_decrypt
-- (pgcrypto). The symmetric key lives in PII_ENCRYPTION_KEY (env var on
-- backend pod → AWS Secrets Manager in prod) and is passed as a query
-- parameter from the Go handlers — never stored in the database.

BEGIN;

-- pgcrypto should already be enabled by infra/postgres/init/01-extensions.sql;
-- this is a belt-and-braces guard.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE employees DROP COLUMN IF EXISTS national_id;
ALTER TABLE employees DROP COLUMN IF EXISTS salary;

ALTER TABLE employees ADD COLUMN national_id BYTEA;
ALTER TABLE employees ADD COLUMN salary      BYTEA;

COMMENT ON COLUMN employees.national_id IS 'pgp_sym_encrypt(plain, $PII_KEY) — decrypt with pgp_sym_decrypt';
COMMENT ON COLUMN employees.salary      IS 'pgp_sym_encrypt(plain_text_decimal, $PII_KEY) — decimal stored as text';

COMMIT;
