# Production deploy — DigitalOcean single droplet

Single-droplet deploy for the demo/staging stage. Migrate to DO App Platform +
Managed DB when user count grows; migrate to AWS for production HA.

## Topology

```
        Internet
           │ :443
           ▼
    ┌─────────────┐
    │   Caddy     │  auto-HTTPS (Let's Encrypt), HTTP→HTTPS redirect
    │  80 / 443   │
    └──────┬──────┘
           │ /api/*     │ /*
     ┌─────▼─────┐ ┌───▼──────┐
     │  backend  │ │ frontend │
     │  Go :8080 │ │ nginx:80 │
     └─────┬─────┘ └──────────┘
           │
   ┌───────┴────────┐
   ▼                ▼
┌──────────┐  ┌──────────┐
│ postgres │  │  redis   │
│  :5432   │  │  :6379   │       all internal-only
└──────────┘  └──────────┘
                                 ↓ every night 02:05
                            /srv/trimurti-backups
                                 + DO Spaces
```

## First-time setup

### 1. Create the droplet

Follow the walkthrough in the parent chat. Short version:

- Region: **SGP1** (Singapore)
- OS: **Ubuntu 24.04 LTS x64**
- Size: **Basic Regular Intel, 2 vCPU / 4 GB / 80 GB, $24/mo**
- Auth: **SSH key**
- Hostname: `trimurti-demo`
- Enable: weekly Backups, Monitoring, IPv6

### 2. Bootstrap the server

SSH in as root and run `bootstrap.sh`:

```bash
ssh root@<DROPLET_IP>
# If the repo is public:
wget -O bootstrap.sh https://raw.githubusercontent.com/pesh2004/TRIMURTI/main/deploy/bootstrap.sh
chmod +x bootstrap.sh
./bootstrap.sh
```

What it does:
- Creates non-root `trimurti` user with sudo + your SSH key
- Disables root SSH + password auth
- Installs Docker + Compose
- Configures UFW (only 22/80/443 open)
- Installs unattended-upgrades + fail2ban
- Enables 4 GB swap
- Clones the repo to `/srv/trimurti`

For a **private** repo, create a deploy key after bootstrap:

```bash
ssh trimurti@<IP> 'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""'
ssh trimurti@<IP> 'cat ~/.ssh/id_ed25519.pub'
# Paste that pubkey in GitHub → Settings → Deploy keys (read-only is fine)
ssh trimurti@<IP> 'git clone git@github.com:pesh2004/TRIMURTI.git /srv/trimurti'
```

### 3. Configure `.env`

```bash
ssh trimurti@<IP>
cd /srv/trimurti
cp deploy/.env.production.example .env
nano .env
```

Fill in every `CHANGE_ME`. Critical minimum:

```bash
DOMAIN=<IP>.sslip.io              # or your real domain
APP_BASE_URL=https://<IP>.sslip.io
COOKIE_DOMAIN=<IP>.sslip.io
ACME_EMAIL=you@example.com
POSTGRES_PASSWORD=$(openssl rand -base64 24)
REDIS_PASSWORD=$(openssl rand -base64 24)
SESSION_SECRET=$(openssl rand -hex 32)
```

**sslip.io** is a free wildcard DNS (`<anyip>.sslip.io` → that IP). Lets Caddy
issue real Let's Encrypt certs without you owning a domain.

### 4. First deploy

```bash
./deploy/deploy.sh
```

First run takes 3–5 minutes (Docker images build from scratch). Subsequent
runs take ~30s. Watch logs in another tab:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file .env logs -f
```

### 5. Seed the admin user

```bash
cd /srv/trimurti
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  --profile tools run --rm seed
# Output prints the admin password — save it to 1Password/Bitwarden
```

### 6. Install the backup cron

```bash
sudo cp /srv/trimurti/deploy/backup.cron /etc/cron.d/trimurti-backup
sudo chmod 644 /etc/cron.d/trimurti-backup
sudo systemctl reload cron
sudo touch /var/log/trimurti-backup.log
sudo chown trimurti:trimurti /var/log/trimurti-backup.log
# Test it once:
sudo -u trimurti /srv/trimurti/deploy/backup.sh
```

The cron file installs two jobs:

- **02:05 nightly** — `pg_dump` → gzip → integrity-check → `/srv/trimurti-backups/` → (optional) upload to DO Spaces if `SPACES_ACCESS_KEY` is set in `.env`.
- **03:00 Sunday** — `SELECT ensure_audit_log_partitions()` so `audit_log` always has a partition for the current year + the next two. Harmless if it runs twice; the function is idempotent.

### 7. Prove the restore actually works

**Do this before loading real customer data.** A backup you've never restored
is not a backup.

Follow [`deploy/RESTORE.md`](RESTORE.md) → "Sandbox restore" section. It
creates a temporary `trimurti_sandbox` database, decompresses the latest
dump into it, verifies the audit-log hash chain is intact, then drops the
sandbox. Takes ~1 minute and touches nothing in prod.

When it passes, log the date in the test log at the bottom of `RESTORE.md`.

### 8. Visit the site

- `https://<IP>.sslip.io` → login page
- Log in with the seeded admin email + generated password

## Routine operations

| Task | Command |
|---|---|
| Deploy latest code | `./deploy/deploy.sh` (or push to `main` if GitHub Actions is wired) |
| View logs | `docker compose -f deploy/docker-compose.prod.yml --env-file .env logs -f [service]` |
| Run migrations only | `docker compose -f deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate` |
| Rollback one migration | `docker compose -f deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate down 1` |
| Psql shell | `docker exec -it trimurti-postgres psql -U trimurti -d trimurti` |
| Redis CLI | `docker exec -it trimurti-redis redis-cli -a "$REDIS_PASSWORD"` |
| Restore backup | See [`RESTORE.md`](RESTORE.md) — the sandbox path for sanity checks, full-restore for disaster recovery. Do **not** pipe a dump into the live DB without the destructive-restore checklist. |
| Verify backup health | [`RESTORE.md#verify-the-nightly-backup-is-actually-running`](RESTORE.md#verify-the-nightly-backup-is-actually-running) — run weekly. |

## Auto-deploy from GitHub

Secrets to add under **Settings → Secrets and variables → Actions**
(production environment):

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | droplet IP |
| `DEPLOY_USER` | `trimurti` |
| `DEPLOY_SSH_KEY` | a private key whose public key is in `/home/trimurti/.ssh/authorized_keys` (generate a dedicated key pair for Actions; do not reuse your laptop key) |
| `DEPLOY_BASE_URL` | `https://<IP>.sslip.io` or your domain |

`.github/workflows/deploy.yml` runs on every push to `main` and SSHes in to
run `deploy.sh`, then smoke-tests `/healthz`.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Caddy fails to get cert | port 80 blocked / DOMAIN wrong / behind CGNAT | check `ufw status`, DNS, `docker logs trimurti-caddy` |
| Backend restarts endlessly | migration broke schema | `logs backend`, fix migration, redeploy |
| OOM | postgres hitting 1.5GB limit | raise limit in compose, or upgrade droplet to 8GB |
| Login cookie never sets | `SESSION_COOKIE_SECURE=true` but site on HTTP | ensure `DOMAIN` is set → Caddy serves HTTPS |
| Disk full | logs not rotated | logs already rotate (docker json-file, 10MB × 3) — check backups dir first |

## When to stop using this setup

Move off single-droplet when any of these are true:

- Real users (not just stakeholders) are depending on it
- Downtime from `apt upgrade` reboots is unacceptable
- Data volume > 10 GB
- You need read replicas for reports
- You need to run more than one app instance behind a load balancer

Next step: DO App Platform + Managed Postgres + Managed Redis (~$80/mo), or
AWS per the production spec in `SECURITY.md`.
