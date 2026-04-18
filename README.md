# TRIMURTI ERP

Thai/English Construction & Real‑Estate ERP — 80 modules, SAP/Bloomberg-inspired,
Bilingual (TH/EN), role-aware (CEO/CFO/PM/Site), built for high concurrency and
compliance with Thai accounting law + PDPA.

See [SPEC.md](SPEC.md) for the full module catalogue (80 modules across 17 groups)
and [PROGRESS.md](PROGRESS.md) for the current build checklist.

## Stack

| Layer | Tech |
|---|---|
| Backend | Go 1.24, Echo, pgx, sqlc, golang-migrate, Asynq |
| Frontend | Vite 6, React 19, TypeScript, TanStack Router/Query/Table, Tailwind v4, shadcn/ui, i18next, Recharts |
| Database | PostgreSQL 17 |
| Cache / Session / Queue | Redis 7 |
| Dev infra | Docker Compose (Postgres + Redis + Mailhog) |
| CI | GitHub Actions (lint, test, build, security scans) |

## Layout

```
.
├── backend/          Go API service
├── frontend/         Vite + React SPA
├── design/           ERP.html prototype (visual reference only)
├── shared/           OpenAPI spec (single API contract)
├── infra/            IaC and deployment config
├── .github/          CI workflows + Dependabot
├── PROGRESS.md       80-module build checklist
├── SECURITY.md       Security policy and runbook
├── SPEC.md           Module specifications
└── CLAUDE.md         Guidance for future Claude sessions
```

## Prerequisites

- Go **1.24+**
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
cp .env.example .env                # fill in SESSION_SECRET (openssl rand -hex 32)
make up                             # start postgres + redis + mailhog
make migrate                        # apply schema migrations
make seed                           # create admin user + roles
make frontend-install               # one-time npm install
make dev                            # backend :8080  ·  frontend :5173
```

Open http://localhost:5173 and log in with the seeded admin (see output of `make seed`).

## Development workflow

1. Pick a module from [PROGRESS.md](PROGRESS.md) (top of the checklist).
2. Create a branch: `git checkout -b feat/<module_id>`.
3. Write the migration in `backend/migrations/`.
4. Write the SQL queries in `backend/queries/` and run `make sqlc`.
5. Add the module handler in `backend/internal/modules/<module_id>/`.
6. Add the frontend route + components under `frontend/src/routes/(app)/<module_id>/`.
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
