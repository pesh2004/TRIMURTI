#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# backup.sh — nightly pg_dump → gzip → upload to DO Spaces.
#
# Scheduled via cron (see deploy/README.md). Runs as the `trimurti` user.
# Exits non-zero on any failure so cron emails the operator.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=/dev/null
set -a; source .env; set +a

LOCAL_DIR="/srv/trimurti-backups"
RETAIN_LOCAL_DAYS=14
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="trimurti-${TIMESTAMP}.sql.gz"
mkdir -p "$LOCAL_DIR"

echo "[$(date -u +%FT%TZ)] backup start"

# ---- Dump ----
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" trimurti-postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  | gzip -9 > "$LOCAL_DIR/$FILE"

SIZE=$(stat -c %s "$LOCAL_DIR/$FILE" 2>/dev/null || stat -f %z "$LOCAL_DIR/$FILE")
if [[ "$SIZE" -lt 1024 ]]; then
  echo "ERROR: dump file suspiciously small ($SIZE bytes)" >&2
  exit 1
fi
# Integrity: gzip itself must decompress cleanly, and the dump must contain
# at least one CREATE TABLE statement. Catches cases where pg_dump errored
# mid-write but still produced a non-empty gzip file.
if ! gunzip -t "$LOCAL_DIR/$FILE"; then
  echo "ERROR: gunzip integrity check failed" >&2
  exit 1
fi
if ! gunzip -c "$LOCAL_DIR/$FILE" | grep -q '^CREATE TABLE'; then
  echo "ERROR: dump contains no CREATE TABLE — likely truncated" >&2
  exit 1
fi
echo "  wrote $LOCAL_DIR/$FILE ($SIZE bytes, integrity ok)"

# ---- Upload to DO Spaces (via dockerised aws-cli — no host install needed) ----
if [[ -n "${SPACES_ACCESS_KEY:-}" && -n "${SPACES_SECRET_KEY:-}" ]]; then
  docker run --rm \
    -v "$LOCAL_DIR:/backup:ro" \
    -e AWS_ACCESS_KEY_ID="$SPACES_ACCESS_KEY" \
    -e AWS_SECRET_ACCESS_KEY="$SPACES_SECRET_KEY" \
    amazon/aws-cli \
    s3 cp "/backup/$FILE" "s3://${SPACES_BUCKET}/db/$FILE" \
    --endpoint-url "$SPACES_ENDPOINT" \
    --no-progress
  echo "  uploaded to s3://${SPACES_BUCKET}/db/$FILE"
else
  echo "  SKIP upload (SPACES_ACCESS_KEY / SPACES_SECRET_KEY unset)"
fi

# ---- Rotate local copies ----
find "$LOCAL_DIR" -name 'trimurti-*.sql.gz' -type f -mtime +"$RETAIN_LOCAL_DAYS" -delete
echo "  rotated local (kept $RETAIN_LOCAL_DAYS days)"

echo "[$(date -u +%FT%TZ)] backup ok"
