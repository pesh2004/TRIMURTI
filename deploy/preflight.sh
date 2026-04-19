#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# preflight.sh — checks `.env` for missing / placeholder values BEFORE the
# deploy touches the running stack. Sourced by deploy.sh as step 0.
#
# Called with the repo root as the working directory. Exits non-zero with a
# human-readable explanation so the operator (or the GitHub Actions log)
# sees exactly what to fix.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f .env ]]; then
  echo "preflight: ERROR — .env missing at $REPO_ROOT/.env" >&2
  echo "preflight:   copy from deploy/.env.production.example and fill in real values" >&2
  exit 1
fi

# Source .env into this shell for the duration of the check.
# shellcheck source=/dev/null
set -a; source .env; set +a

# Secrets that must be set AND not match any well-known placeholder.
# Keep this list in lockstep with backend/internal/config/config.go's
# placeholderSecrets map; config.Load() is the second line of defense but
# we want to fail here before any container restarts.
REQUIRED_SECRETS=(
  "POSTGRES_PASSWORD"
  "REDIS_PASSWORD"
  "SESSION_SECRET"
  "PII_ENCRYPTION_KEY"
)

PLACEHOLDERS=(
  "CHANGE_ME"
  "CHANGEME"
  "changeme"
  "CHANGE_ME_32_BYTES_HEX"
  "CHANGE_ME_openssl_rand_hex_32"
  "CHANGE_ME_strong_random_24_bytes"
  "dev-pii-key-do-not-use-in-production"
)

errors=0

check_required() {
  local name="$1"
  local value="${!name:-}"
  # strip leading/trailing whitespace
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  if [[ -z "$value" ]]; then
    echo "preflight: ERROR — $name is empty; set in .env" >&2
    errors=$((errors + 1))
    return
  fi
  for placeholder in "${PLACEHOLDERS[@]}"; do
    if [[ "$value" == "$placeholder" ]]; then
      echo "preflight: ERROR — $name still contains the placeholder '$placeholder'; rotate before deploying" >&2
      errors=$((errors + 1))
      return
    fi
  done
}

for s in "${REQUIRED_SECRETS[@]}"; do
  check_required "$s"
done

# Length sanity: SESSION_SECRET should be at least 32 hex chars (`openssl
# rand -hex 32` = 64). Anything shorter is almost certainly a typo or a
# truncated paste.
if [[ ${#SESSION_SECRET} -lt 32 ]]; then
  echo "preflight: ERROR — SESSION_SECRET is shorter than 32 chars (${#SESSION_SECRET}); regenerate with: openssl rand -hex 32" >&2
  errors=$((errors + 1))
fi
if [[ ${#PII_ENCRYPTION_KEY} -lt 32 ]]; then
  echo "preflight: ERROR — PII_ENCRYPTION_KEY is shorter than 32 chars (${#PII_ENCRYPTION_KEY}); regenerate with: openssl rand -hex 32" >&2
  errors=$((errors + 1))
fi

# APP_ENV must be production when deploying to the droplet. The compose file
# also hard-sets it but we want the .env value to match so an operator
# inspecting the file isn't misled.
APP_ENV_FROM_ENV="${APP_ENV:-}"
if [[ -n "$APP_ENV_FROM_ENV" && "$APP_ENV_FROM_ENV" != "production" ]]; then
  echo "preflight: WARN  — .env has APP_ENV=$APP_ENV_FROM_ENV; compose overrides to 'production', but update .env to avoid confusion" >&2
fi

if [[ "$errors" -gt 0 ]]; then
  echo "" >&2
  echo "preflight: $errors blocking issue(s). Deploy aborted." >&2
  echo "preflight: see deploy/SECRETS.md for rotation guidance." >&2
  exit 1
fi

echo "preflight: OK — required secrets present, no placeholders, lengths sane."
