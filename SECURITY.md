# Security policy

Target threat model: **financial fraud, data leak (PDPA breach), ransomware,
insider abuse, compliance audit failure** — in that priority order.

Any change that weakens a control listed here must be reviewed + approved in a
PR; no silent relaxations.

## Reporting vulnerabilities

Do **not** open a public GitHub issue. Email the maintainer (or use a private
GitHub security advisory). We commit to an initial response within 48 hours.

---

## 1. Authentication

- Password hashing: **Argon2id**, memory 64 MB, iterations 3, parallelism 4 (tunable via env, but never downgraded below OWASP 2024 recommendations).
- Password policy: minimum 12 characters, cannot match last 5, rotated every 90 days for administrative roles (CEO/CFO/IT).
- **MFA required** for roles `CEO`, `CFO`, `PM`, `ACCOUNTANT`, `ADMIN`. Optional for Site Engineer. Method: TOTP (RFC 6238).
- Session: opaque UUID token in Redis, 30-minute sliding TTL. On password change or privilege escalation → invalidate **all** sessions for that user.
- Cookie flags: `HttpOnly`, `Secure` (prod), `SameSite=Lax`.
- Login rate limit: **5 failed attempts per 15 minutes per user + per IP**. After threshold, 15-minute lockout with email notification.
- Login history visible in every user's profile (IP, user-agent, geo, timestamp). Anomalous login triggers email alert (new IP/device/country).
- Passwordless admin recovery uses signed one-time links (15-minute expiry, single-use, audit-logged).

## 2. Authorization (RBAC + Row-level)

- Roles defined in `gov_rbac` module: CEO, CFO, PM, SITE_ENGINEER, ACCOUNTANT, HR, PROCUREMENT, ADMIN, AUDITOR (read-only).
- Permissions are `<module>.<action>` strings, e.g. `sales.read`, `fin_ap.approve`. Checked by Go middleware `requirePermission("…")`.
- **Postgres Row-Level Security (RLS)**: users see only records for projects they are assigned to. Bypass requires `admin` role AND explicit audit log entry.
- Approval thresholds enforced in **DB triggers** (not just application code) to prevent bypass via direct DB access:
  - PO < 500k → PM only
  - PO 500k–2M → PM + Proc.Dir.
  - PO 2M–10M → PM + Proc.Dir. + CFO
  - PO > 10M → PM + CFO + CEO
- Service accounts (CI, cron, external integrations) use dedicated low-privilege users with scoped permissions, rotated quarterly.

## 3. Data protection

### At rest
- RDS / DO managed Postgres encrypted via KMS (AES-256).
- S3 buckets: SSE-KMS, bucket policy denies unencrypted upload.
- EBS volumes encrypted.
- **Field-level** encryption (pgcrypto) for: ID card number, bank account, salary, tax ID. Encryption key separate from DB master key, stored in AWS Secrets Manager.

### In transit
- TLS 1.3 only (minimum 1.2 for legacy clients, logged).
- HSTS: `max-age=63072000; includeSubDomains; preload`.
- Internal service-to-service: mTLS (once we have multiple services).
- No plaintext traffic on private subnet (even inside VPC).

### Backup
- RDS automated backups: 35-day retention + point-in-time recovery.
- `pg_dump` logical backup to S3 nightly, 90-day retention.
- Cross-region replication of backup bucket.
- **On-premise mirror** via AWS Storage Gateway → office NAS (requirement).
- **Glacier Deep Archive** monthly snapshot for **10-year** retention (Thai accounting law).
- Restore drill every quarter. Backup that has never been restored = no backup.

## 4. Input handling

- All input validated at the API boundary using `go-playground/validator`. Reject-by-default, whitelist approach.
- SQL: parameterised queries only (`pgx` named/positional args, sqlc-generated). **String concatenation into SQL is a merge-blocking offence.**
- XSS: React escapes by default; `dangerouslyInnerHTML` requires reviewer signoff. Strict CSP header, no inline scripts (nonces only where necessary).
- CSRF: double-submit cookie pattern. Mutating requests require `X-CSRF-Token` header matching cookie.
- File uploads: extension allowlist; MIME sniff verification; **ClamAV** scan; store in private S3 + presigned URL; never served from API origin.

## 5. Audit

- **Every mutation** writes an audit entry: `{ts, user_id, ip, user_agent, action, entity, entity_id, before, after, request_id}`.
- `audit_log` is monthly-partitioned, WORM-style (no update/delete via app user). Tamper detection via hash chain (each row references `prev_hash`).
- Retention: **10 years** (Thai accounting law). Annual rollover to Glacier Deep Archive.
- Read-only `AUDITOR` role has access to full audit trail across all entities.

## 6. Infrastructure

- No public SSH. Production access via AWS Session Manager / Tailscale bastion, MFA-gated.
- Security groups: least privilege. App tier → DB tier on 5432 only. DB tier rejects all other traffic.
- Private subnets for DB + Redis; no public IP assignment.
- ALB in front with AWS WAF (OWASP Top 10 managed rules + rate limit + geo rules: admin endpoints Thailand-only).
- AWS Shield Standard (free, always on) for DDoS absorption.
- Container images: distroless or minimal base, signed with cosign, scanned with Trivy in CI.
- Secrets: **AWS Secrets Manager** (prod), `.env` (dev only). Never in git. `gitleaks` runs in pre-commit hook and CI.

## 7. Supply chain

- `Dependabot` weekly updates for Go, npm, GitHub Actions, Docker base images.
- CI gates: `govulncheck`, `gosec`, `semgrep`, `npm audit --audit-level=high`. PR must pass all.
- Lock files committed (`go.sum`, `package-lock.json`). No floating versions.
- Third-party SDKs vetted for license + last-publish date; unmaintained deps flagged.

## 8. PDPA (พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล)

- Data subject rights: export (JSON), rectification, deletion (tombstone + audit). Endpoints under `/api/v1/pdpa/*` with owner-or-admin permission.
- Consent tracking: every personal-data collection point records purpose + timestamp + consent version.
- Data retention schedule per category (HR: 10 yr post-termination for payroll; CRM: 2 yr post-last-contact).
- **Breach notification within 72 hours** to PDPC. See `runbook/breach.md` (added in Phase 1).
- DPO designated (role `DPO`), contact surfaced in public website footer.

## 9. Incident response

- On-call rotation (tooling: PagerDuty / Opsgenie once team > 1).
- Runbooks in `docs/runbooks/` (added in Phase 1): `breach.md`, `ransomware.md`, `ddos.md`, `db-failover.md`, `rollback.md`.
- Post-mortem within 5 business days; blameless; template in repo.
- Annual tabletop exercise: simulated ransomware, simulated data leak.

## 10. Development practice

- All code changes go through PR + review; direct push to `main` disabled (branch protection).
- Required checks before merge: backend tests, frontend tests, lint, security scans, type check.
- Code review checklist includes: input validation, auth/permission check, audit logging, error handling (no stack traces to client), test coverage for new code.
- Annual external penetration test before major releases.
- Quarterly access review: remove inactive accounts, validate role assignments.

## 11. Monitoring & alerting

- Sentry for application errors (scrubbed for PII).
- CloudWatch metrics + Grafana dashboards.
- Alert triggers:
  - login failures > 10/min → Slack + email
  - 5xx rate > 1% sustained 2 min → PagerDuty
  - slow query > 1s → Slack
  - backup job failure → PagerDuty (critical)
  - WAF block rate spike → Slack (investigate)

---

## Exceptions

Any exception to this policy must be:

1. Proposed in a PR with rationale, compensating controls, and expiry date.
2. Reviewed by maintainer + security reviewer.
3. Logged in `docs/security-exceptions.md` with review date.
