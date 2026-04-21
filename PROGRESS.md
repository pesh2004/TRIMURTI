# Build progress

Source of truth: [SPEC.md](SPEC.md). Check the box (`- [x]`) when the module is
merged to `main` with tests passing.

Status legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Phase 0 — Foundation (no module ID)

- [x] Repo scaffold + root docs (README, PROGRESS, SECURITY, CLAUDE, .gitignore, .editorconfig, .env.example, Makefile)
- [x] `docker-compose.yml` — postgres 17 + redis 7 + mailhog
- [x] Backend skeleton — Go module, Echo, pgx, sqlc, migrations framework, health endpoint, config loader
- [x] Auth + RBAC + Audit — argon2id password, Redis session, login/logout/me endpoints, permission middleware, audit log writer, seed script
- [x] Frontend skeleton — Vite + React + TS + TanStack + Tailwind v4 + shadcn/ui, login page, app layout with sidebar/topbar ported from prototype
- [x] CI — GitHub Actions (backend, frontend, security, deploy) + Dependabot
- [x] Production deploy — live at https://168.144.32.187.sslip.io (DO droplet, Caddy auto-HTTPS)
- [x] Auto-deploy CI/CD — `.github/workflows/deploy.yml` with SSH deploy key
- [x] E2E smoke test — Playwright wiring + login→app-shell path in `frontend/e2e/smoke.spec.ts`, runs against real backend in CI `e2e` job

## Phase 1 — Core workspace (6 modules)

Foundation before any money or paperwork flows.

- [ ] `dashboard` · Enterprise overview (5 sub-pages: Overview, Projects, Financial, Sales pipeline, HSE)
- [ ] `settings` · Company/users/integrations config
- [x] `hr_employees` · Employee master — list/form/drawer + pgcrypto field-level encryption (migration 0003) for national_id & salary
  - [x] Migration 0002 (schema) + 0003 (pgcrypto field-level encryption) applied cleanly
  - [x] Backend handlers: list / get / create / update / terminate with PII masking + reveal_pii permission
  - [x] Audit writes on every mutation + separate `hr_employees.reveal_pii` audit row when unmasked PII leaves the server
  - [x] Frontend list + form + drawer ported pixel-near from design handoff; i18n TH + EN
  - [x] Permissions (`hr_employees.read|write|terminate|reveal_pii`) seeded in RBAC
  - [x] Backend unit tests: `employees_test.go` (PII masking / helpers) + `validate_test.go` (TH NID Luhn)
  - [x] Backend integration tests: `employees_integration_test.go` — real Postgres + migrations for Create / PII reveal audit / Update un-terminate (Bug A regression cage) / List filters
  - [x] TH national ID 13-digit + Luhn checksum validation (backend `validate.go` + frontend `lib/hr/validate.ts`)
  - [x] Birthdate-must-precede-hire-date guard on Create
  - [x] Frontend component tests (Vitest + RTL): EmployeeList, EmployeeForm submit flow, EmployeeDrawer reveal + terminate dialog, pills, format + validate helpers (50 tests total)
  - [x] Playwright E2E `frontend/e2e/hr-employees.spec.ts` — login + open list + create-round-trip
  - [x] Module README at `backend/internal/modules/hr/README.md`
  - [ ] Bulk CSV import/export — deferred (Phase 1B candidate)
  - [ ] PII encryption key rotation mechanism — deferred (Phase 7 `fin_etax` or earlier if compliance audit demands)
  - [ ] Split `employees.go` (562 LOC) into list/create/update/terminate.go — cosmetic, low priority
- [ ] `gov_rbac` · Role / user / permission management UI
- [ ] `audit` · Audit log viewer
- [ ] `approval` · Approval inbox + threshold matrix (Kanban)

## Phase 2 — Sales-to-Cash (5 modules)

Revenue side: Opportunity → Quote → Contract → Billing → Receipt.

- [ ] `sales` · Quotation with BOQ, VAT, WHT
- [ ] `crm_opportunities` · Pipeline (Qualifying → Proposal → Negotiation → Won/Lost)
- [ ] `ct_contracts` · Contract register (Main / Subcontract / Consultant)
- [ ] `proj_billing` · Progress billing (งวดงาน), certification %, retention
- [ ] `fin_ar` · Accounts Receivable + aging

## Phase 3 — Procure-to-Pay (6 modules)

Cost side: PR → RFQ → PO → GRN → 3-Way → AP.

- [ ] `proc_pr` · Purchase Requisition
- [ ] `proc_rfq` · RFQ comparison (≥3 vendors, ISO 9001)
- [ ] `purchase` · PO with 3-stage approval
- [ ] `inv_grn` · Goods Receipt
- [ ] `proc_3way` · 3-Way match (PO/GRN/Invoice)
- [ ] `fin_ap` · Accounts Payable + aging

## Phase 4 — Project execution (5 modules)

- [ ] `production` · Project master + Gantt + milestones
- [ ] `proj_wbs` · WBS / cost control (budget vs actual vs EV)
- [ ] `proj_evm` · Earned Value Management (PV / EV / AC / CPI / SPI / EAC)
- [ ] `proj_vo` · Variation Orders
- [ ] `sitediary` · Site Diary (weather, manpower, progress, photos)

## Phase 5 — Site & Docs (8 modules)

- [ ] `proj_dsr` · Daily Site Report
- [ ] `proj_ir` · Inspection Request
- [ ] `proj_punch` · Punch List (snag)
- [ ] `proj_permits` · Permit to Work
- [ ] `drawing` · Drawing Viewer + markup
- [ ] `docs_drawings` · Drawing Register (ARC/STR/MEP) rev tracking
- [ ] `docs_submittal` · Submittal Log
- [ ] `docs_rfi` · RFI (Request for Information)
- [ ] `docs_trm` · Transmittal

## Phase 6 — Inventory, Equipment, Sub (9 modules)

- [ ] `inventory` · Stock master + reorder point
- [ ] `inv_movement` · Stock movement ledger
- [ ] `inv_count` · Stock count
- [ ] `eq_fleet` · Equipment register
- [ ] `eq_maint` · Maintenance work orders
- [ ] `eq_fuel` · Fuel log
- [ ] `sub_list` · Subcontractor master + scorecard
- [ ] `sub_contracts` · Sub-contracts
- [ ] `proc_vendors` · Vendor master + scorecard
- [ ] `proc_landed` · Landed cost
- [ ] `ct_units` · Unit inventory (real estate)
- [ ] `crm_tenders` · Tender log
- [ ] `crm_estimation` · Estimation / BOQ workbench

## Phase 7 — Finance depth + HR extensions (11 modules)

- [ ] `accounting` · GL, CoA, JE, Trial Balance
- [ ] `fin_fa` · Fixed Assets + depreciation
- [ ] `fin_cashflow` · 13-week cashflow forecast
- [ ] `fin_etax` · e-Tax invoice, ภ.พ.30, ภ.ง.ด.1/3/53
- [ ] `fin_wht` · Withholding tax certificate
- [ ] `fin_multi` · Multi-entity consolidation (TH/SG/VN)
- [ ] `hr` · HR overview
- [ ] `hr_payroll` · Payroll + PND files
- [ ] `hr_training` · Training calendar + cost
- [ ] `hr_competency` · Competency matrix (กว., จป., AWS, ปั้นจั่น) + expiry alerts
- [ ] `hr_perf` · Performance review (H1/H2 + KPI)

## Phase 8 — Risk, Governance, BI, Exec, Mobile (12 modules)

- [ ] `risk_register` · Risk register (likelihood × impact)
- [ ] `risk_insurance` · Insurance policies (CAR/WC/PL)
- [ ] `risk_bonds` · Bonds/Guarantees (Performance/Retention/Advance/Bid)
- [ ] `risk_warranty` · Defect Liability Period (DLP)
- [ ] `gov_audit` · Consolidated audit trail
- [ ] `gov_matrix` · Approval matrix configuration
- [ ] `reports` · Report library
- [ ] `bi_reports` · Saved reports
- [ ] `bi_alerts` · Alerts & thresholds
- [ ] `exec_ceo` · CEO dashboard
- [ ] `exec_cfo` · CFO dashboard
- [ ] `exec_coo` · COO dashboard
- [ ] `mobile` · Site mobile app

---

## Operations readiness — test-server production

Module features are not enough to put real customer data on the server.
This track covers the infrastructure + operational guarantees that make
the deployment safe. **No real data until every item below is `[x]`**
(or explicitly deferred with a written reason).

### Session 1 — Data safety

- [x] `pg_dump` daily cron with 14-day retention on the droplet (`deploy/backup.sh`) — installed 2026-04-19, integrity check (`gunzip -t` + `CREATE TABLE` guard) proven on first run
- [x] Restore runbook at `deploy/RESTORE.md` + restore tested against a fresh DB — sandbox restore passed 2026-04-19 07:10 UTC; audit hash chain verified (0 broken rows). See `deploy/RESTORE.md#test-log`.
- [x] Audit-log partition auto-rotation: SQL function `ensure_audit_log_partitions()` (migration 0004) + weekly cron in `deploy/backup.cron`; partitions seeded 2026–2030 at migrate time
- [x] Off-box backup shipment to DO Spaces (sgp1) — proven 2026-04-19 07:18 UTC: `trimurti-20260419T071752Z.sql.gz` uploaded to `s3://skgrp/db/`. Lifecycle policy expires `db/` objects after 90 days.

### Session 2 — Secret hygiene

- [x] `PII_ENCRYPTION_KEY` dev-fallback removed; `config.Load()` fail-loud on empty, placeholder, or ≤whitespace. Covered by `internal/config/config_test.go` including regression on the old fallback literal.
- [x] Deploy script refuses to start if any of `POSTGRES_PASSWORD` / `REDIS_PASSWORD` / `SESSION_SECRET` / `PII_ENCRYPTION_KEY` is missing, matches a known placeholder, or is shorter than 32 chars (`deploy/preflight.sh`, runs as step 0/5 in `deploy/deploy.sh`)
- [x] Initial `REDIS_PASSWORD`, `SESSION_SECRET`, `POSTGRES_PASSWORD`, and `SEED_ADMIN_PASSWORD` rotated on the live droplet 2026-04-19 (see `deploy/SECRETS.md` incident log). `PII_ENCRYPTION_KEY` rotation deferred until before the first real customer data lands, per the destructive-safe procedure in the runbook.
- [x] `deploy/SECRETS.md` runbook — inventory, per-secret rotation procedure (PII has destructive-safe re-encrypt), incident-response playbook, incident log template

### Session 3 — User admin + password recovery

- [x] Password-reset flow — migration 0005, backend `/api/v1/auth/password-reset/{request,confirm}`, SHA-256 token hashed at rest, single-use, 15-min TTL, audited, rate-limited (5/15min per IP), enumeration-safe (always 200)
- [x] "Forgot password?" link on `/login`; frontend `/forgot-password` + `/password-reset?token=` routes, bilingual
- [x] Email abstraction: SMTPSender + ConsoleSender fallback (prints to server log when SMTP unconfigured — operator can retrieve reset URL from `docker compose logs backend` without a real provider wired up)
- [ ] Minimal `gov_rbac` UI: admin creates users + assigns roles — deferred to its own module slot in Phase 1 (until then, CLI via `compose run --rm seed` remains the provisioning path)
- [x] SMTP wired to Gmail (ama.bmgpesh@gmail.com, app-password auth, port 587 STARTTLS) on 2026-04-19 — password-reset emails delivered to the inbox end-to-end; ConsoleSender fallback retained for when SMTP is unavailable (network issues, rotated app password, etc.)

### Session 4 — CSRF + rate-limit hardening

- [x] CSRF middleware (`middleware.CSRF`) enforces double-submit cookie on every authenticated mutation; GET/HEAD/OPTIONS pass through untouched to keep CORS preflights working. Cookie `trimurti_csrf` is non-HttpOnly so the SPA can mirror it into `X-CSRF-Token`; backend verifies in constant time.
- [x] Rate limit coverage extended — password-reset request (per-IP), HR create/update (100/hour per user), HR terminate (10/hour per user). PII-reveal rate-limit deferred: implementing it properly requires an audit-counter-based bucket rather than a simple per-minute counter; tracked as Phase-1 ops tweak.
- [x] `middleware.RateLimitByUser` helper — wraps the existing RateLimit with a `u:<id>` key derived from `auth.FromContext`, falls back to IP when no session is in context.

### Session 5 — Ops basics

- [x] `/healthz` and `/readyz` both run the deep check (Postgres ping + Redis ping; 503 with `status: degraded` on failure). Error details kept server-side; response body is opaque to avoid reconnaissance signal.
- [x] PDPA self-service export: `GET /api/v1/me/export` returns the user row + employee record (PII decrypted since the caller is the data subject) + last 1000 audit_log entries authored by the user. "Download my data" button on the dashboard triggers the save. Every export writes an `me.data_export` audit row.
- [x] `deploy/OPS.md` runbook — log access recipes, audit-trail spelunking SQL, health/TLS verification, common tasks, troubleshooting matrix, plus empty test-log tables for TLS renewal and uptime-alert drills.
- [x] Uptime monitor wired (UptimeRobot) with email alert on `/healthz` fail — drill signed in `deploy/OPS.md#uptimerobot-test-log` on 2026-04-21 (stop Redis → DOWN email ≈1 min later; UP email at 03:54 UTC after restart). Free-tier HEAD probe works because `/healthz` now accepts both GET + HEAD (commit f4a3dd9).
- [x] TLS cert renewal force-tested — drill signed in `deploy/OPS.md#tls-renewal-log` on 2026-04-21. Pattern: staging issuer first (proves ACME path without burning prod quota), then revert to a fresh prod cert. Confirmed `docker compose restart caddy` is required — `caddy reload` keeps the old cert in memory and never re-issues. New prod cert valid until 2026-07-20.

---

## Conventions for checking off a module

A module is **done** (`[x]`) only when **all** of these are true:

1. Migration merged and applied cleanly.
2. Either `sqlc`-generated code compiles, **or** the module's DB access is through vetted pgx (current default — sqlc codegen is deferred until a module with many simple CRUD queries benefits from it).
3. Backend handlers: unit + integration tests pass (`go test ./internal/modules/<id>/...`).
4. Frontend route: component tests pass + one Playwright E2E path.
5. i18n: both TH and EN strings present.
6. RBAC: permissions declared in `gov_rbac` and enforced via middleware.
7. Audit: every mutation calls `audit.Write`.
8. Docs: module-specific README in `backend/internal/modules/<id>/README.md`.
9. Customer-facing catalog entry added/flipped to `live` in `frontend/src/lib/features/catalog.ts` so the `/features` page shown to sales + stakeholders is truthful.
10. Merged to `main`, CI green.
