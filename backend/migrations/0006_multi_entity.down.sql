BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS default_company_id;

DROP INDEX IF EXISTS idx_user_companies_company;
DROP INDEX IF EXISTS uq_user_companies_one_default;
DROP TABLE IF EXISTS user_companies;

ALTER TABLE companies
    DROP COLUMN IF EXISTS website,
    DROP COLUMN IF EXISTS wht_rate,
    DROP COLUMN IF EXISTS vat_rate,
    DROP COLUMN IF EXISTS fiscal_year_start_month,
    DROP COLUMN IF EXISTS timezone,
    DROP COLUMN IF EXISTS currency;

COMMIT;
