BEGIN;

ALTER TABLE employees DROP COLUMN IF EXISTS national_id;
ALTER TABLE employees DROP COLUMN IF EXISTS salary;

ALTER TABLE employees ADD COLUMN national_id TEXT;
ALTER TABLE employees ADD COLUMN salary      NUMERIC(14,2);

COMMIT;
