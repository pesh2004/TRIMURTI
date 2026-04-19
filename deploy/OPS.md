# Operations runbook

Everyday ops for the production droplet. Pair with `deploy/RESTORE.md`
(disaster) and `deploy/SECRETS.md` (rotation).

---

## Viewing logs

All container logs go through Docker's json-file driver with 10 MB × 3
rotation (configured in `docker-compose.prod.yml`). No external log
aggregation yet; inspect directly on the droplet.

```bash
ssh trimurti@168.144.32.187
cd /srv/trimurti

# Latest N lines per service
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  logs --tail 100 backend

# Live tail with timestamps
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  logs -f --timestamps backend

# Multi-service
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  logs -f backend frontend caddy
```

Structured logs on the backend: each request emits a JSON line with
`request_id`, `user_id`, `method`, `path`, `status`, `latency`,
`internal_err`. Grep recipes:

```bash
# Errors in the last 200 lines
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  logs --tail 200 backend | grep '"level":"error"'

# All requests by a specific user
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  logs backend | grep '"user_id":42'

# One request end-to-end
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  logs backend | grep 'be17a946-8160-4025-8a9a-ff7111b3c19c'
```

Backup cron logs live in `/var/log/trimurti-backup.log` (not in Docker).

Caddy access log goes to Caddy's stdout, same logs command applies.

---

## Audit trail spelunking

When an auditor asks "who touched this employee record":

```bash
docker exec -it trimurti-postgres \
  psql -U trimurti -d trimurti
```

```sql
-- Everything touching employee id=12, newest first
SELECT ts, user_id, action, before_json->>'status' AS before_status,
       after_json->>'status' AS after_status
  FROM audit_log
 WHERE entity = 'employee' AND entity_id = '12'
 ORDER BY ts DESC
 LIMIT 20;

-- Every PII reveal in the last 24h
SELECT ts, user_id, entity_id, after_json->'fields' AS fields
  FROM audit_log
 WHERE action = 'hr_employees.reveal_pii'
   AND ts > NOW() - INTERVAL '24 hours'
 ORDER BY ts DESC;

-- Verify the chain is unbroken since a given date (should return 0 rows)
WITH ordered AS (
    SELECT id, ts, row_hash, prev_hash,
           lag(row_hash) OVER (ORDER BY ts, id) AS expected_prev
      FROM audit_log
     WHERE ts > '2026-01-01'
)
SELECT count(*) AS broken_rows
  FROM ordered
 WHERE prev_hash IS DISTINCT FROM expected_prev;
```

---

## Health checks

`/healthz` and `/readyz` both run the deep check: ping Postgres + Redis,
return 503 with `{"status":"degraded", "checks": {...}}` when any
dependency is down. 200 with `{"status":"ok"}` when everything is up.

```bash
# From your laptop (goes through Caddy HTTPS)
curl -fsS https://168.144.32.187.sslip.io/healthz

# From inside the droplet (goes directly to the backend container)
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  exec -T caddy wget -qO- http://backend:8080/healthz
```

The deploy workflow (`./deploy/deploy.sh`) smoke-tests this after every
roll; if the health check fails, the deploy exits non-zero and the
operator is paged by GitHub Actions.

---

## Uptime monitoring (UptimeRobot)

The droplet currently has no external uptime monitoring. Wire it in via
UptimeRobot (free, 5-min interval, 50 monitors free tier):

1. Sign in at <https://uptimerobot.com/>
2. **Add New Monitor**
   - Type: **HTTP(s)**
   - Friendly name: `TRIMURTI prod`
   - URL: `https://168.144.32.187.sslip.io/healthz`
   - Monitoring Interval: **5 minutes**
   - Keyword (optional): `"status":"ok"`  — flags degraded state as a
     keyword mismatch even when the server returns 503 slowly.
3. **Alert Contacts** → add the on-call email / Slack webhook.
4. Save.

Expected behaviour:
- Monitor goes "down" within 5–10 minutes of `/healthz` failing.
- Alert fires immediately on first failure; auto-recovers on next
  successful poll.

To verify it catches real problems, once after setup:
```bash
# Temporarily break Redis on the droplet
docker stop trimurti-redis
# Wait 5–10 minutes → UptimeRobot emails "TRIMURTI prod is DOWN"
docker start trimurti-redis
# Next poll shows recovery
```

Document the recovery email time in the test log at the bottom of this
file so there's evidence monitoring is real.

---

## TLS certificate renewal

Caddy handles Let's Encrypt renewals automatically. Certs are valid for
90 days and Caddy starts attempting renewal at 30 days remaining — so a
broken renewal has a ~30-day window before the site goes down.

Check current cert:

```bash
# Expiry date
curl -vI https://168.144.32.187.sslip.io 2>&1 | grep -i 'expire'

# Or from the droplet
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  logs --tail 100 caddy | grep -iE 'certificate|renew'
```

Force a renewal (useful to confirm the renewal path works before you
depend on it):

```bash
# Invalidate Caddy's cached cert and let it re-request
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  exec caddy rm -rf /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$DOMAIN
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  restart caddy

# Watch it happen
docker compose -f deploy/docker-compose.prod.yml --env-file .env \
  logs -f caddy
```

Expected log lines during renewal:
```
certificate obtained successfully  
...  
finished handling certificate issuance
```

Record successful renewals in this file's [TLS renewal log](#tls-renewal-log)
so the next operator can see when the system was last proven healthy.

---

## PDPA data-subject-access requests

An authenticated user downloads their own data via a button on the
dashboard, which calls `GET /api/v1/me/export`. The response is a JSON
file including the user row, their employee record (with plaintext
`national_id` + `salary` since the caller is the data subject), and up
to 1000 of their most recent audit trail entries. Every export writes
an `me.data_export` audit row.

Verify from the droplet:

```bash
# curl requires the session cookie — easier via the browser's
# Download-my-data button on /dashboard. If you need to test from CLI:
curl -sS -X POST https://168.144.32.187.sslip.io/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ama.bmgpesh@gmail.com","password":"...your password..."}' \
  -c /tmp/c.txt

curl -sS https://168.144.32.187.sslip.io/api/v1/me/export \
  -b /tmp/c.txt -o /tmp/me-export.json
rm /tmp/c.txt
wc -l /tmp/me-export.json
```

---

## Common tasks

| Task | Command |
|---|---|
| Restart a service | `docker compose -f deploy/docker-compose.prod.yml --env-file .env restart backend` |
| Follow Caddy's HTTPS log | `docker compose -f deploy/docker-compose.prod.yml --env-file .env logs -f caddy` |
| Run psql | `docker exec -it trimurti-postgres psql -U trimurti -d trimurti` |
| Redis CLI | `docker exec -it trimurti-redis redis-cli -a "$(grep ^REDIS_PASSWORD /srv/trimurti/.env \| cut -d= -f2-)"` |
| Disk usage by container | `docker system df -v` |
| Free disk space | `df -h /srv` |
| Active sessions count | `docker exec trimurti-redis redis-cli -a "..." KEYS 'sess:*' \| wc -l` |

---

## Troubleshooting

| Symptom | First check | Likely cause |
|---|---|---|
| `/healthz` returns 503, "redis": "fail" | `docker ps -a \| grep redis` | Redis container stopped — restart it; check memory limits |
| `/healthz` returns 503, "database": "fail" | `docker logs trimurti-postgres --tail 50` | Postgres OOM, disk full, or password mismatch after rotation |
| Caddy returns 502 Bad Gateway | `docker logs trimurti-caddy --tail 50` | Backend container died — check `docker logs trimurti-backend` |
| Login succeeds but /auth/me 401 | `docker exec trimurti-redis redis-cli -a "..." DBSIZE` | Redis lost session data (restart wiped it); user just re-logs |
| Password reset email never arrives | `docker compose logs backend \| grep -iE 'smtp\|fallback'` | SMTP creds wrong OR console fallback engaged (`SMTP_HOST` empty in .env) |

---

## TLS renewal log

Record successful cert renewals (automatic or forced) so operators can
prove renewal still works.

| Date (UTC) | Cert valid until | Triggered by | Notes |
|---|---|---|---|
| _TBD_ | _TBD_ | _TBD_ | Run the force-renewal recipe above at least once before relying on automatic renewal. |

---

## UptimeRobot test log

Record the result of the "break Redis, wait for alert" drill here
whenever the monitoring path is (re)configured.

| Date (UTC) | Operator | Outage induced | Alert arrived at | Gap |
|---|---|---|---|---|
| _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
