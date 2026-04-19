# Restore runbook

Companion to `deploy/backup.sh`. Tested end-to-end on the droplet **before**
real customer data lands. Record the last tested date at the bottom of this
file so an auditor can see it's proven, not theoretical.

## When to use each path

| Scenario | Path |
|---|---|
| Data corrupted / migration botched — restore *in place* | [Full restore](#full-restore-destructive) |
| Need to inspect yesterday's data without touching prod | [Sandbox restore](#sandbox-restore-non-destructive) |
| Verify the nightly backup actually works | [Sandbox restore](#sandbox-restore-non-destructive), monthly |

> **Full restore is destructive.** It drops every row in the live database and
> replaces it with the dump. Make the operator say yes twice before running.

---

## Prerequisites

- SSH access to the droplet as `trimurti`.
- `.env` present at `/srv/trimurti/.env` (the backup script reads
  `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` from there).
- A dump file — either a local copy under `/srv/trimurti-backups/` or a
  download from the off-box Spaces bucket (`s3://$SPACES_BUCKET/db/…`).

---

## Full restore (destructive)

Use this only when the live DB is beyond saving.

```bash
ssh trimurti@<DROPLET_IP>
cd /srv/trimurti
set -a; source .env; set +a

# 1. Pick the dump. Latest local:
BACKUP=$(ls -1t /srv/trimurti-backups/trimurti-*.sql.gz | head -1)
echo "Restoring from: $BACKUP"

# 2. Stop the app so it doesn't fight the restore.
docker compose -f deploy/docker-compose.prod.yml --env-file .env stop backend

# 3. CONFIRM. This will drop every row in the live database.
read -p "Type 'RESTORE ${POSTGRES_DB}' to proceed: " CONFIRM
[[ "$CONFIRM" == "RESTORE $POSTGRES_DB" ]] || { echo "aborted"; exit 1; }

# 4. Drop + recreate the database so indexes / sequences line up.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB WITH (FORCE)"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER"

# 5. Re-run the init script so extensions (pgcrypto, uuid-ossp, citext,
# pg_trgm) exist before the dump's CREATE TABLE statements.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/01-extensions.sql

# 6. Restore.
gunzip -c "$BACKUP" \
  | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

# 7. Sanity-check.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT
      (SELECT count(*) FROM users)     AS users,
      (SELECT count(*) FROM employees) AS employees,
      (SELECT count(*) FROM audit_log) AS audit_rows;
  "

# 8. Re-apply any migrations that are newer than the dump.
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  --profile tools run --rm --build migrate

# 9. Bring the app back up.
docker compose -f deploy/docker-compose.prod.yml --env-file .env start backend

# 10. Smoke-test /healthz.
curl -fsS https://${DOMAIN}/healthz
```

### If `/healthz` fails after restore

Backend probably can't decrypt the PII columns — the dump was encrypted with
a different `PII_ENCRYPTION_KEY`. Check `.env` on the droplet matches the
value used when the dump was taken. If the old key is lost, PII data is
unrecoverable (which is the PDPA-friendly failure mode).

---

## Sandbox restore (non-destructive)

Proves the dump is valid + sanity-checks real customer data from a week ago,
without touching prod. Safe to run anytime.

```bash
ssh trimurti@<DROPLET_IP>
cd /srv/trimurti
set -a; source .env; set +a

BACKUP=$(ls -1t /srv/trimurti-backups/trimurti-*.sql.gz | head -1)
SANDBOX_DB="${POSTGRES_DB}_sandbox"

# Create sandbox DB.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $SANDBOX_DB WITH (FORCE)"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $SANDBOX_DB OWNER $POSTGRES_USER"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d "$SANDBOX_DB" -f /docker-entrypoint-initdb.d/01-extensions.sql

# Restore.
gunzip -c "$BACKUP" \
  | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
      psql -U "$POSTGRES_USER" -d "$SANDBOX_DB" -v ON_ERROR_STOP=1

# Sanity checks.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d "$SANDBOX_DB" -c "
    SELECT
      (SELECT count(*) FROM users)     AS users,
      (SELECT count(*) FROM employees) AS employees,
      (SELECT count(*) FROM audit_log) AS audit_rows;
  "

# Verify the audit hash chain is intact. Non-zero output = tamper detected.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d "$SANDBOX_DB" -c "
    WITH ordered AS (
      SELECT id, ts, row_hash, prev_hash,
             lag(row_hash) OVER (ORDER BY ts, id) AS expected_prev
      FROM audit_log
    )
    SELECT count(*) AS broken_chain_rows
    FROM ordered
    WHERE prev_hash IS DISTINCT FROM expected_prev;
  "

# Tear down.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $SANDBOX_DB"
```

---

## Restoring to a different droplet / disaster recovery

Only relevant when the original droplet is gone. Short version:

1. Provision a fresh droplet + run `deploy/bootstrap.sh`.
2. Clone the repo to `/srv/trimurti`.
3. Copy `.env` from the backup operator's vault (it contains `PII_ENCRYPTION_KEY` — without it the dump is unreadable).
4. Run `./deploy/deploy.sh` to bring the stack up against an empty DB.
5. Download the dump from Spaces:
   ```bash
   docker run --rm -v /srv/trimurti-backups:/out \
     -e AWS_ACCESS_KEY_ID="$SPACES_ACCESS_KEY" \
     -e AWS_SECRET_ACCESS_KEY="$SPACES_SECRET_KEY" \
     amazon/aws-cli s3 cp \
     "s3://$SPACES_BUCKET/db/$(aws s3 ls s3://$SPACES_BUCKET/db/ --endpoint-url "$SPACES_ENDPOINT" | sort | tail -1 | awk '{print $4}')" \
     /out/ --endpoint-url "$SPACES_ENDPOINT"
   ```
6. Run the [full-restore](#full-restore-destructive) steps from step 2.

---

## Verify the nightly backup is actually running

Run this once a week (or add to ops on-call checklist):

```bash
ssh trimurti@<DROPLET_IP>
# Most recent backup — must be within the last 26 hours.
ls -la --time-style=full-iso /srv/trimurti-backups/ | tail -3

# Cron log — should have a recent "backup ok" line.
tail -20 /var/log/trimurti-backup.log

# Integrity: the latest dump should decompress cleanly and contain
# recognisable SQL.
LATEST=$(ls -1t /srv/trimurti-backups/trimurti-*.sql.gz | head -1)
gunzip -t "$LATEST" && echo "decompress ok"
gunzip -c "$LATEST" | head -20
```

If none of those look right, the [Sandbox restore](#sandbox-restore-non-destructive) is the definitive test — run it.

---

## Test log

Record every successful end-to-end restore test here. This is the evidence
for "backups work, proven not theoretical".

| Date (UTC)       | Operator | Dump restored                          | Path     | Result | Notes |
|------------------|----------|----------------------------------------|----------|--------|-------|
| 2026-04-19 07:10 | pesh2004 | `trimurti-20260419T071017Z.sql.gz`     | sandbox  | PASS   | First end-to-end sandbox restore on the live droplet. Row counts: 1 user / 3 employees / 23 audit rows. `broken_chain_rows = 0`. Session 1 data-safety proven not theoretical. |
