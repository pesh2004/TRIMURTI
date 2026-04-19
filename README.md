# TRIMURTI ERP

Thai/English Construction & Real‑Estate ERP — 80 modules, SAP/Bloomberg-inspired,
Bilingual (TH/EN), role-aware (CEO/CFO/PM/Site), built for high concurrency and
compliance with Thai accounting law + PDPA.

See [SPEC.md](SPEC.md) for the full module catalogue (80 modules across 17 groups)
and [PROGRESS.md](PROGRESS.md) for the current build checklist.

Live demo (Phase 0): https://168.144.32.187.sslip.io

## Stack

| Layer | Tech |
|---|---|
| Backend | Go 1.25, Echo, pgx, sqlc (configured; generated code added per-module when needed), golang-migrate |
| Frontend | Vite 6, React 19, TypeScript, TanStack Router/Query/Table, Tailwind v4, shadcn/ui, i18next, Recharts |
| Database | PostgreSQL 17 |
| Cache / Session | Redis 7 |
| Dev infra | Docker Compose (Postgres + Redis + Mailhog) |
| CI | GitHub Actions (lint, test, build, security scans) |

## Layout

```
.
├── backend/          Go API service
├── frontend/         Vite + React SPA
├── design/           ERP.html prototype (visual reference only)
├── infra/            IaC and deployment config
├── .github/          CI workflows + Dependabot
├── PROGRESS.md       80-module build checklist
├── SECURITY.md       Security policy and runbook
├── SPEC.md           Module specifications
└── CLAUDE.md         Guidance for future Claude sessions
```

## Prerequisites

- Go **1.25+**
- Node **22 LTS+** (or 24)
- Docker Desktop (or OrbStack / Colima) — for Postgres + Redis + Mailhog
- `make`

Recommended global tools:

```bash
go install github.com/air-verse/air@latest                      # hot reload
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest             # SQL → Go
go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
go install golang.org/x/vuln/cmd/govulncheck@latest
go install github.com/securego/gosec/v2/cmd/gosec@latest
```

## Quick start

```bash
cp .env.example .env                # fill in SESSION_SECRET + PII_ENCRYPTION_KEY (each via: openssl rand -hex 32)
make up                             # start postgres + redis + mailhog
make migrate                        # apply schema migrations
make seed                           # create admin user + roles
make frontend-install               # one-time npm install
make dev                            # backend :8080  ·  frontend :5173
```

Open http://localhost:5173 and log in with the seeded admin (see output of `make seed`).

### E2E smoke test

With the stack running (`make dev`) and a known admin password exported,
run the Playwright smoke from `frontend/`:

```bash
cd frontend
npx playwright install --with-deps chromium      # one-time
E2E_ADMIN_EMAIL=admin@trimurti.local \
E2E_ADMIN_PASSWORD=<the password from make seed> \
npm run e2e
```

CI runs this automatically on every push that touches `frontend/` or
`backend/` via the `e2e` job in `.github/workflows/frontend.yml`.

## Development workflow

1. Pick a module from [PROGRESS.md](PROGRESS.md) (top of the checklist).
2. Create a branch: `git checkout -b feat/<module_id>`.
3. Write the migration in `backend/migrations/`.
4. Write the SQL queries in `backend/queries/` and run `make sqlc`.
5. Add the module handler in `backend/internal/modules/<module_id>/`.
6. Add the frontend page at `frontend/src/routes/<module_id>.tsx`, register it in `frontend/src/router.tsx`, and put module components under `frontend/src/components/<module_id>/`.
7. Update i18n dictionaries.
8. Write tests: unit + integration (backend), component + E2E (frontend).
9. Check the box in `PROGRESS.md`.
10. Open a PR — CI must be green.

See [CLAUDE.md](CLAUDE.md) for more detail on conventions.

## Deployment

- **Dev / demo:** DigitalOcean droplet + managed Postgres + managed Redis (~$85/mo)
- **Production:** AWS `ap-southeast-1` — ECS Fargate + RDS Multi-AZ + ElastiCache + ALB + CloudFront + S3 (~$700–1,000/mo at 10k concurrent)

Docker images build identically for both targets. See `infra/` (added in later phases).

## Security

See [SECURITY.md](SECURITY.md) for the full policy: auth/MFA/RBAC, encryption,
PDPA compliance, audit retention (10 years per Thai accounting law), incident
response. Report vulnerabilities privately — do not open public issues.

## License

Proprietary — internal use only.
