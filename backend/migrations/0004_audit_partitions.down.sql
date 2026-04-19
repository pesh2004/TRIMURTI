-- 0004_audit_partitions down — drop the management functions.
-- Intentionally does **not** drop the partitions themselves: down-migrating
-- this after inserts happened would lose audit data, and audit retention is
-- a legal requirement.

BEGIN;

DROP FUNCTION IF EXISTS ensure_audit_log_partitions();
DROP FUNCTION IF EXISTS create_audit_log_partition(integer);

COMMIT;
