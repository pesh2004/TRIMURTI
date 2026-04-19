# Secrets runbook

Every secret the system runs on, where it lives, how to rotate it, and what
happens if it leaks. Companion to `deploy/.env.production.example`.

**Golden rules:**

1. Secrets live in **one place**: `/srv/trimurti/.env` on the droplet. Not
   in git, not in chat, not in 1Password-shared-via-URL. The .env file is in
   `.gitignore` and should stay there.
2. **Every secret is rotatable** without downtime except `PII_ENCRYPTION_KEY`
   (see below).
3. Treat any value that appears in commit history / screenshots / chat as
   **already compromised**. Rotate it.

---

## Inventory

| Secret | What it protects | Rotation impact | Rotate without downtime? |
|---|---|---|---|
| `POSTGRES_PASSWORD` | DB access | Backend + migrate + seed restart (~30s) | Yes, with care |
| `REDIS_PASSWORD` | Session store, rate-limit state | Active sessions kicked out | Yes |
| `SESSION_SECRET` | Signs session cookies | All users logged out | Yes |
| `PII_ENCRYPTION_KEY` | Encrypts national_id + salary in DB | **Existing encrypted rows become unreadable** | No — requires re-encrypt |
| `SEED_ADMIN_PASSWORD` | Initial admin user | Only used at seed time | N/A |
| `SPACES_ACCESS_KEY` / `SPACES_SECRET_KEY` | Off-box backup upload | Tonight's backup fails until updated | Yes |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Outbound mail (password reset links today; notifications later) | Reset emails stop sending; `ConsoleSender` fallback kicks in (reset URL printed to backend logs) | Yes |
| `ACME_EMAIL` | Let's Encrypt notifications (cert renewal) | Cosmetic, no runtime effect | Yes |

---

## Rotation procedures

### POSTGRES_PASSWORD

**⚠️ Generate with `openssl rand -hex 24`, NOT base64.** The password goes
into `DATABASE_URL=postgres://trimurti:PASS@postgres:5432/...`; base64
emits `/` `+` `=` chars which break URL parsing silently. `/` terminates
the userinfo portion, making `pq` see the truncated password. Hex uses
only `0-9a-f` — safe inside a URL.

```bash
ssh trimurti@<DROPLET>
cd /srv/trimurti
NEW_PW=$(openssl rand -hex 24)     # 48 hex chars, URL-safe

# 1. Change inside the live postgres first.
docker exec -e PGPASSWORD="$(grep ^POSTGRES_PASSWORD .env | cut -d= -f2-)" trimurti-postgres \
  psql -U trimurti -d trimurti -c "ALTER USER trimurti WITH PASSWORD '$NEW_PW';"

# 2. Update .env.
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$NEW_PW|" .env

# 3. Restart services. `compose run migrate` inside deploy.sh forces a
#    postgres recreate so the migrate container gets a fresh connection
#    with the new password.
./deploy/deploy.sh

# 4. Verify login still works from the app.
curl -fsS https://$(grep ^DOMAIN .env | cut -d= -f2-)/healthz
```

### REDIS_PASSWORD

```bash
NEW_PW=$(openssl rand -base64 24)
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$NEW_PW|" .env
./deploy/deploy.sh  # redis + backend restart; all users must re-login
```

### SESSION_SECRET

```bash
NEW=$(openssl rand -hex 32)
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$NEW|" .env
./deploy/deploy.sh  # every session cookie invalidates; users re-login
```

### PII_ENCRYPTION_KEY — **DESTRUCTIVE; read in full before running**

The key encrypts `employees.national_id` + `employees.salary` as BYTEA via
pgcrypto. Changing the key without re-encrypting means every existing row's
PII becomes garbage on next decrypt.

**Do this procedure in one sitting, with a backup verified ≤1 hour old.**

```bash
ssh trimurti@<DROPLET>
cd /srv/trimurti

# 1. Fresh backup — restore target if anything goes wrong.
sudo -u trimurti ./deploy/backup.sh
# Confirm the new file uploaded to Spaces, then copy it somewhere local too:
LATEST=$(ls -1t /srv/trimurti-backups/trimurti-*.sql.gz | head -1)
echo "Rollback file: $LATEST"

# 2. Read current key.
OLD_KEY="$(grep ^PII_ENCRYPTION_KEY .env | cut -d= -f2-)"
NEW_KEY="$(openssl rand -hex 32)"

# 3. Re-encrypt every PII column in a single transaction. If it errors
#    halfway the transaction rolls back — nothing lost.
docker exec -i -e PGPASSWORD="$(grep ^POSTGRES_PASSWORD .env | cut -d= -f2-)" trimurti-postgres \
  psql -U trimurti -d trimurti -v ON_ERROR_STOP=1 <<SQL
BEGIN;
UPDATE employees
   SET national_id = CASE WHEN national_id IS NULL THEN NULL
                          ELSE pgp_sym_encrypt(pgp_sym_decrypt(national_id, '$OLD_KEY'), '$NEW_KEY')
                     END,
       salary      = CASE WHEN salary IS NULL THEN NULL
                          ELSE pgp_sym_encrypt(pgp_sym_decrypt(salary, '$OLD_KEY'), '$NEW_KEY')
                     END;
COMMIT;
SQL

# 4. Swap the key in .env AFTER the re-encrypt commits.
sed -i "s|^PII_ENCRYPTION_KEY=.*|PII_ENCRYPTION_KEY=$NEW_KEY|" .env

# 5. Restart the backend so it picks up the new key.
docker compose -f deploy/docker-compose.prod.yml --env-file .env restart backend

# 6. Verify by fetching an employee as a user with hr_employees.reveal_pii.
#    The decrypt should succeed; masked view still works for non-reveal users.
#    Spot-check via UI or a psql sanity query:
docker exec -e PGPASSWORD="$(grep ^POSTGRES_PASSWORD .env | cut -d= -f2-)" trimurti-postgres \
  psql -U trimurti -d trimurti -c "
    SELECT id, length(pgp_sym_decrypt(national_id, '$NEW_KEY')) AS nid_ok
      FROM employees
     WHERE national_id IS NOT NULL
     LIMIT 3;
  "

# 7. Invalidate the old key wherever you stored it (1Password etc.).
unset OLD_KEY NEW_KEY
```

If step 6 fails: stop, don't accept further writes, restore from the backup
taken in step 1 using `deploy/RESTORE.md` → full restore, then try again.

### SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS

Password reset emails go through here. Until these are set, the system
falls back to `ConsoleSender` — the reset URL is printed to the backend
container's stderr instead of emailed. The operator can recover a link
via `docker compose logs backend | grep -A5 'email (console fallback)'`,
which is fine for the test-server stage but not for real end-user
support.

Options: **Gmail app password** (free, ~500/day, requires 2FA), **Amazon
SES** (cheap at scale, needs sender verification), **Mailgun/SendGrid**
(free tiers ~100-300/day). Gmail is the fastest path and what the
test-server currently uses.

```bash
# upsert helper — `sed -i` alone is a no-op when the key is absent.
set_env() {
  local key="$1" value="$2" file="/srv/trimurti/.env"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

# Accept the app password via read -sp so it never lands in shell history.
read -sp "SMTP password (app password for Gmail): " PW && echo

# Gmail example — swap in SES/Mailgun values as needed.
set_env SMTP_HOST  "smtp.gmail.com"
set_env SMTP_PORT  "587"
set_env SMTP_USER  "ama.bmgpesh@gmail.com"        # must match auth account
set_env SMTP_FROM  "ama.bmgpesh@gmail.com"        # Gmail refuses spoof
set_env SMTP_PASS  "$PW"
unset PW

./deploy/deploy.sh

# Verify: request a reset for the admin email. If SMTP is wired, the
# backend log contains NO "console fallback" block AND the recipient
# receives the email. If SMTP auth fails, backend logs print both the
# fallback block and the SMTP error.
docker compose -f deploy/docker-compose.prod.yml --env-file .env logs backend --tail 30 \
  | grep -iE "smtp|console fallback"
```

Revoking a compromised SMTP key just means regenerating in the
provider panel and rerunning the sed + deploy.

### SPACES_ACCESS_KEY / SPACES_SECRET_KEY

```bash
# Generate a new key pair at:
#   https://cloud.digitalocean.com/account/api/spaces
sed -i "s|^SPACES_ACCESS_KEY=.*|SPACES_ACCESS_KEY=<NEW_ID>|" .env
sed -i "s|^SPACES_SECRET_KEY=.*|SPACES_SECRET_KEY=<NEW_SECRET>|" .env

# Verify tonight's backup will go through:
sudo -u trimurti ./deploy/backup.sh  # should print 'uploaded to s3://...'
```

Revoke the old key pair in DO Panel after the next backup confirms.

---

## Initial rotation after first production cutover

Anything the repo shipped with, was pasted into chat during setup, or landed
in a screenshot is **leaked** and must be rotated on go-live day. Run the
four non-destructive rotations in this order:

1. `REDIS_PASSWORD`
2. `SESSION_SECRET`
3. `POSTGRES_PASSWORD`
4. `SEED_ADMIN_PASSWORD` — set a new one + re-run `compose run --rm seed`

`PII_ENCRYPTION_KEY` rotation can wait until after the first rotation wave
lands, but **do it before the first real customer PII enters the system**.
After real data is in, rotation becomes a managed procedure (see above).

---

## Incident response (suspected leak)

### Symptoms that trigger rotation

- A secret appeared in a commit, issue, PR, or Slack/email/chat.
- A backup file is in someone's "Downloads" outside the authorised operator.
- `.env` was ever `cat`-ed to a shared terminal recording or screen.
- A third-party service (any of ours) reports a breach.

### Response playbook

1. **Stop ingress** if the leak is severe: `ufw deny 443/tcp` on the droplet.
2. Rotate in this order (fastest to slowest):
   - `SESSION_SECRET` (kicks all attackers with stolen cookies)
   - `REDIS_PASSWORD` (blocks direct Redis access)
   - `POSTGRES_PASSWORD`
   - `SPACES_*` (if backup URLs were in the leak)
   - `PII_ENCRYPTION_KEY` (if full `.env` was leaked; follow the destructive
     procedure above — the old encrypted data the attacker may have will
     decrypt until we re-encrypt with the new key, so backups older than the
     rotation are worthless to them)
3. Re-enable ingress only after rotations complete.
4. Record an incident entry at the bottom of this file.

---

## Incident log

| Date (UTC) | Operator | Triggered by | Secrets rotated | Notes |
|---|---|---|---|---|
| 2026-04-19 ~07:50 | pesh2004 | Session-2 cutover (initial post-bootstrap rotation) | `REDIS_PASSWORD`, `SESSION_SECRET`, `POSTGRES_PASSWORD`, `SEED_ADMIN_PASSWORD` | PII key deferred until first customer data. Two sub-incidents surfaced mid-rotation and are now fixed in code: (a) `POSTGRES_PASSWORD` generated via `openssl rand -base64 24` contained `/`, which silently broke `DATABASE_URL` userinfo parsing — rotated to hex; preflight now rejects URL-unsafe chars. (b) `seed` ignored `SEED_ADMIN_PASSWORD` for existing users — fixed in f4206a6 so the env var now actually rotates the password. Login verified post-rotation (`HTTP 200`, ADMIN role + 13 permissions). |
| 2026-04-19 ~08:55 | pesh2004 | Session-3 SMTP cutover (password-reset email delivery) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` added | Wired Gmail SMTP (ama.bmgpesh@gmail.com, app password, port 587 STARTTLS). End-to-end verified: request password reset → email received in inbox, reset link opened, new password applied. One sub-incident: first `sed -i` rotation produced a no-op because `.env` didn't have the SMTP keys yet; added an "insert if missing, replace if present" helper to the ops flow (documented in SECRETS.md alongside the POSTGRES_PASSWORD procedure). |
