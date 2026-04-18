#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh — pulls the latest code, rebuilds images, migrates, restarts.
#
# Runs on the droplet, either manually or via GitHub Actions.
#   cd /srv/trimurti
#   ./deploy/deploy.sh
#
# Idempotent: safe to re-run. Zero-downtime for frontend (rolling). Backend
# has a brief restart (seconds) — acceptable for a demo. Managed services are
# where we'll get real zero-downtime later.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f .env ]]; then
  echo "ERROR: .env missing at $REPO_ROOT/.env" >&2
  echo "  Copy from: deploy/.env.production.example" >&2
  exit 1
fi

COMPOSE_ARGS=(-f deploy/docker-compose.prod.yml --env-file .env --project-directory .)

echo "==> [1/5] Fetching latest main"
git fetch origin
git reset --hard origin/main

echo "==> [2/5] Pulling base images + building"
docker compose "${COMPOSE_ARGS[@]}" pull --ignore-buildable || true
docker compose "${COMPOSE_ARGS[@]}" build --pull

echo "==> [3/5] Starting postgres + redis (if not running)"
docker compose "${COMPOSE_ARGS[@]}" up -d postgres redis

echo "==> [4/5] Running migrations"
# --build: tools profile is excluded from the step-2 `compose build`, so the
# migrate image stays cached between deploys. Force a rebuild every run so
# a new migration file actually gets picked up.
docker compose "${COMPOSE_ARGS[@]}" --profile tools run --rm --build migrate

echo "==> [5/5] Rolling backend + frontend + caddy"
docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans backend frontend caddy

echo ""
echo "==> Health check"
sleep 3
if docker compose "${COMPOSE_ARGS[@]}" exec -T caddy wget -qO- http://backend:8080/healthz | grep -q '"status":"ok"'; then
  echo "    backend: OK"
else
  echo "    backend: FAIL — check 'docker compose logs backend'" >&2
  exit 1
fi

echo ""
echo "==> Pruning old images"
docker image prune -f

echo ""
echo "=========================================================="
echo " Deploy complete."
git log -1 --oneline
echo "=========================================================="
