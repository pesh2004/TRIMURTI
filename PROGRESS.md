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

- [ ] `pg_dump` daily cron with 14-day retention on the droplet (`deploy/backup.sh`)
- [ ] Restore runbook at `deploy/RESTORE.md` + restore tested against a fresh DB at least once (timestamped note in runbook)
- [ ] Audit-log partition auto-rotation: SQL function `ensure_audit_log_partitions()` + annual cron (migration 0004)
- [ ] Off-box backup shipment to DO Spaces / S3 — **blocked on operator providing credentials**

### Session 2 — Secret hygiene

- [ ] Remove `PII_ENCRYPTION_KEY` dev-fallback; fail-loud when unset regardless of `APP_ENV`
- [ ] Deploy script refuses to start if any of `SESSION_SECRET` / `PII_ENCRYPTION_KEY` / admin password is missing or looks like a placeholder
- [ ] Initial `SESSION_SECRET`, PII key, and seeded admin password rotated on the live droplet; prior values treated as leaked
- [ ] `deploy/SECRETS.md` runbook documenting where each secret lives and how to rotate it

### Session 3 — User admin + password recovery

- [ ] Password-reset flow (email token, single-use, 15-min TTL)
- [ ] Minimal `gov_rbac` UI: admin creates users + assigns roles (no styling polish required)
- [ ] "Forgot password?" link on `/login`
- [ ] SMTP wired to a real provider in prod (Mailhog stays in dev) — **requires operator to provide SMTP credentials**

### Session 4 — CSRF + rate-limit hardening

- [ ] CSRF token middleware enforced on every mutation endpoint
- [ ] Rate limiter covers sensitive non-login endpoints (password reset request, PII reveal, terminate)
- [ ] Per-user (not just per-IP) rate-limit bucket

### Session 5 — Ops basics

- [ ] `/healthz` verifies the DB + Redis connections (currently only returns "ok" from the process)
- [ ] Uptime monitor wired (UptimeRobot or similar) with email alert on `/healthz` fail
- [ ] PDPA self-export endpoint: authenticated user can download their own data as JSON
- [ ] Log access path documented (`deploy/OPS.md`)
- [ ] TLS cert renewal force-tested — next renewal date recorded

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
