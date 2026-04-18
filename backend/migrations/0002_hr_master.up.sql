-- 0002_hr_master: Companies, Departments, Positions, Employees.
-- Encryption of national_id and salary is deferred to 0003_hr_encrypt
-- (pgcrypto) — MUST land before real users go live. See SECURITY.md.

BEGIN;

-- ---------- COMPANIES ----------
CREATE TABLE companies (
    id           BIGSERIAL PRIMARY KEY,
    code         TEXT NOT NULL UNIQUE,
    name_th      TEXT NOT NULL,
    name_en      TEXT NOT NULL,
    tax_id       TEXT,
    address_json JSONB,
    phone        TEXT,
    email        CITEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- DEPARTMENTS ----------
CREATE TABLE departments (
    id               BIGSERIAL PRIMARY KEY,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code             TEXT NOT NULL,
    name_th          TEXT NOT NULL,
    name_en          TEXT NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    head_employee_id BIGINT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_departments_company ON departments (company_id) WHERE is_active;

-- ---------- POSITIONS (global, cross-company) ----------
CREATE TABLE positions (
    id         BIGSERIAL PRIMARY KEY,
    code       TEXT NOT NULL UNIQUE,
    name_th    TEXT NOT NULL,
    name_en    TEXT NOT NULL,
    level      SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 10),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- EMPLOYEE CODE SEQUENCE (per company + year) ----------
CREATE TABLE employee_code_sequences (
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    year       SMALLINT NOT NULL,
    last_seq   INT NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, year)
);

-- Atomic generator — concurrent callers can't collide because of
-- ON CONFLICT ... DO UPDATE's row lock.
CREATE OR REPLACE FUNCTION generate_employee_code(p_company_id BIGINT) RETURNS TEXT AS $$
DECLARE
    v_full_year  SMALLINT := EXTRACT(YEAR FROM NOW())::SMALLINT;
    v_short_year SMALLINT := v_full_year % 100;
    v_company    TEXT;
    v_seq        INT;
BEGIN
    SELECT code INTO v_company FROM companies WHERE id = p_company_id;
    IF v_company IS NULL THEN
        RAISE EXCEPTION 'company % not found', p_company_id;
    END IF;

    INSERT INTO employee_code_sequences (company_id, year, last_seq)
    VALUES (p_company_id, v_full_year, 1)
    ON CONFLICT (company_id, year)
    DO UPDATE SET last_seq = employee_code_sequences.last_seq + 1
    RETURNING last_seq INTO v_seq;

    RETURN format('EMP-%s-%s-%s', v_company, LPAD(v_short_year::TEXT, 2, '0'), LPAD(v_seq::TEXT, 6, '0'));
END;
$$ LANGUAGE plpgsql;

-- ---------- EMPLOYEES ----------
CREATE TABLE employees (
    id                BIGSERIAL PRIMARY KEY,
    employee_code     TEXT NOT NULL UNIQUE,
    company_id        BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id     BIGINT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    position_id       BIGINT NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
    first_name_th     TEXT NOT NULL,
    last_name_th      TEXT NOT NULL,
    first_name_en     TEXT,
    last_name_en      TEXT,
    nickname          TEXT,
    gender            CHAR(1) NOT NULL CHECK (gender IN ('M','F','O')),
    birthdate         DATE NOT NULL,
    national_id       TEXT,               -- TODO 0003: pgcrypto encrypt
    phone             TEXT,
    email             CITEXT,
    address_json      JSONB,
    employment_type   TEXT NOT NULL CHECK (employment_type IN ('fulltime','contract','daily','parttime')),
    hired_at          DATE NOT NULL,
    terminated_at     DATE,
    terminated_reason TEXT,
    salary            NUMERIC(14,2),      -- TODO 0003: pgcrypto encrypt
    status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','terminated','on_leave')),
    user_id           BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_employees_company        ON employees (company_id);
CREATE INDEX idx_employees_department     ON employees (department_id);
CREATE INDEX idx_employees_position       ON employees (position_id);
CREATE INDEX idx_employees_status_active  ON employees (status) WHERE status <> 'terminated';
CREATE INDEX idx_employees_hired_at       ON employees (hired_at);
CREATE INDEX idx_employees_search_trgm    ON employees USING gin (
    (first_name_th || ' ' || last_name_th || ' ' ||
     coalesce(first_name_en,'') || ' ' || coalesce(last_name_en,'') || ' ' ||
     coalesce(nickname,'') || ' ' || employee_code) gin_trgm_ops
);

-- Complete the circular FK: department head must be an employee that exists.
ALTER TABLE departments ADD CONSTRAINT fk_departments_head
    FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

COMMIT;
