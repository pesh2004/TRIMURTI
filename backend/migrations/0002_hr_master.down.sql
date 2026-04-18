BEGIN;

ALTER TABLE IF EXISTS departments DROP CONSTRAINT IF EXISTS fk_departments_head;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
DROP TRIGGER IF EXISTS trg_positions_updated_at ON positions;
DROP TRIGGER IF EXISTS trg_departments_updated_at ON departments;
DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;

DROP FUNCTION IF EXISTS generate_employee_code(BIGINT);

DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS employee_code_sequences;
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS companies;

COMMIT;
