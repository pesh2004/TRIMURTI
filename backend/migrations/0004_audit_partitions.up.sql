-- 0004_audit_partitions: idempotent functions + forward-seeded audit_log
-- partitions through year N+4.
--
-- Why: migration 0001 only created audit_log_2026. Without this migration,
-- the first INSERT on 2027-01-01 fails with "no partition of relation
-- "audit_log" found for row" — and every mutation in the system depends on
-- audit.Write succeeding. Partition management becomes a silent time bomb.
--
-- The cron in deploy/backup.cron calls ensure_audit_log_partitions()
-- weekly. This migration seeds 5 years ahead so a cron outage doesn't
-- brick the system immediately.

BEGIN;

-- create_audit_log_partition(year) — no-op if the partition exists.
CREATE OR REPLACE FUNCTION create_audit_log_partition(p_year integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    partition_name text := format('audit_log_%s', p_year);
    start_date     date := make_date(p_year, 1, 1);
    end_date       date := make_date(p_year + 1, 1, 1);
BEGIN
    IF to_regclass(partition_name) IS NOT NULL THEN
        RETURN;
    END IF;
    EXECUTE format(
        'CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
END;
$$;

-- ensure_audit_log_partitions() — keeps partitions for the current year and
-- the next two years in place. Safe to run repeatedly; called by cron.
CREATE OR REPLACE FUNCTION ensure_audit_log_partitions()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    yr integer := extract(year FROM NOW())::integer;
BEGIN
    PERFORM create_audit_log_partition(yr);
    PERFORM create_audit_log_partition(yr + 1);
    PERFORM create_audit_log_partition(yr + 2);
END;
$$;

-- Forward-seed partitions: cover current + 4 years ahead at migrate time.
-- Re-runs of the cron only bump up to current + 2, but the initial migration
-- gives extra runway so we can't get stuck with "ran migrations once in
-- 2026, forgot the cron, woke up bricked in 2027".
DO $$
DECLARE
    yr integer := extract(year FROM NOW())::integer;
    i  integer;
BEGIN
    FOR i IN 0..4 LOOP
        PERFORM create_audit_log_partition(yr + i);
    END LOOP;
END;
$$;

COMMIT;
