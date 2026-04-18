# Guidance for Claude sessions on this repo

This file is read first by Claude Code when operating in this repository. If you
are Claude: read this end-to-end before you touch anything.

## What this repo is

A **production-grade** Thai/English construction & real-estate ERP — 80 modules,
Go + React monorepo. See [README.md](README.md) for the stack, [SPEC.md](SPEC.md)
for the module catalogue, [PROGRESS.md](PROGRESS.md) for current build status,
and [SECURITY.md](SECURITY.md) for non-negotiable security rules.

The HTML file at `design/ERP.html` is the **visual reference prototype** — do
**not** edit it, and do **not** base production code on its internal structure.
It's the source of truth for look-and-feel only.

## Tech stack (short)

- Backend: Go 1.24, Echo, pgx, sqlc, golang-migrate, Asynq, Redis, Argon2id, JWT
- Frontend: Vite 6, React 19, TypeScript strict, TanStack Router/Query/Table, Tailwind v4, shadcn/ui, i18next, Recharts
- Data: PostgreSQL 17 (primary + read replica in prod), Redis 7
- Infra dev: docker-compose; prod: DigitalOcean first, AWS later — same Docker images

## Repo layout (high level)

```
backend/              Go API
  cmd/api/            HTTP server entrypoint
  cmd/migrate/        Migration runner
  cmd/seed/           Seed data
  internal/
    auth/             Login, session, MFA, RBAC, password hashing
    audit/            Audit log writer (Asynq-backed)
    config/           Env loader
    db/               pgx pool
    middleware/       Request ID, logging, CORS, rate limit, auth, recover
    modules/          ONE SUBDIR PER MODULE  ← where new features live
      <module_id>/
        handler.go
        service.go
        repository.go
        types.go
        handler_test.go
  migrations/         golang-migrate .sql files
  queries/            sqlc .sql files (compiled to internal/db/gen/)
  sqlc.yaml
frontend/
  src/
    routes/           TanStack Router file-based routes
      (auth)/         Login, password reset
      (app)/          Everything behind auth
        _layout.tsx   Sidebar + topbar (ported from prototype)
        <module_id>/
          route.tsx
          _index.tsx
    components/
      layout/         Sidebar, topbar, palette
      ui/             shadcn/ui primitives
      modules/        Module-specific shared components
    lib/
      api.ts          Fetch wrapper
      auth.tsx        Auth context
      i18n/           i18next + dictionaries
    styles/
      globals.css     Tailwind + design tokens
shared/
  openapi.yaml        Single API contract (source of truth for types)
design/
  ERP.html            Visual reference only — do not edit
```

## Adding a new module — the standard recipe

1. **Pick it** from [PROGRESS.md](PROGRESS.md) (take the top unchecked item unless user says otherwise).
2. **Branch:** `git checkout -b feat/<module_id>`.
3. **Migration:** new file `backend/migrations/NNNN_<module_id>.up.sql` + `.down.sql`. Sequence number = highest + 1.
4. **Queries:** `backend/queries/<module_id>.sql` — one query per function, annotate with `-- name: GetFoo :one`.
5. **Generate:** `make sqlc`.
6. **Module skeleton:** `backend/internal/modules/<module_id>/` with `handler.go`, `service.go`, `repository.go`, `types.go`.
7. **Register route:** in `cmd/api/main.go` under the `/api/v1` group with `requirePermission("<module_id>.<action>")`.
8. **Audit:** every mutation handler calls `audit.Write(ctx, action, entity, before, after)`.
9. **Frontend route:** `frontend/src/routes/(app)/<module_id>/route.tsx` (layout), `_index.tsx` (list page). Use TanStack Query for fetching, TanStack Table for the grid, shadcn for components.
10. **i18n:** add keys to both `frontend/src/lib/i18n/th.json` and `en.json`.
11. **Permission seed:** add `<module_id>.read`, `<module_id>.write`, etc. to the `gov_rbac` seed.
12. **Tests:**
    - Backend: unit in `handler_test.go`, integration in `service_test.go` (uses testcontainers-go for real Postgres).
    - Frontend: component tests in `*.test.tsx` (Vitest + RTL), one E2E path in `frontend/e2e/<module_id>.spec.ts` (Playwright).
13. **Docs:** short `backend/internal/modules/<module_id>/README.md` — what it does, table names, permissions.
14. **Tick the box** in `PROGRESS.md` in the same commit.
15. **PR** — CI must be green before merge.

## Non-negotiables

These rules are enforced and can break the build:

- **No SQL string concatenation.** Use sqlc or parameterised pgx. Reviewer blocks on sight.
- **No `dangerouslySetInnerHTML`** without a comment explaining why and a reviewer signoff.
- **Every mutation is audited.** If you add a handler that writes data and doesn't call `audit.Write`, tests should fail.
- **Money uses `shopspring/decimal`** — never `float64`. Currency code explicit on every monetary field (THB default but multi-entity adds SGD, VND).
- **Timezone is `Asia/Bangkok`** for display, UTC in DB. Use `date-fns-tz` on the frontend.
- **Every label has TH + EN.** No English-only or Thai-only user-facing text.
- **Permissions declared, not implicit.** If a route isn't wrapped in `requirePermission()`, it's rejected in review.
- **Tests required.** New handler = new test. No "I'll add tests later" commits.

## Coding conventions

### Backend (Go)

- Error wrapping: `fmt.Errorf("loading user %d: %w", id, err)`. Never log AND return; one or the other.
- Context first arg on every function that does I/O: `func (s *Service) Get(ctx context.Context, id int64) …`.
- Structured logging via `zerolog`. Never `fmt.Println`, never `log.Printf` in production code.
- No panics in handlers. Middleware `Recover` is a safety net, not a pattern.
- Interfaces defined on the consumer side (the package that uses them), not the producer.
- Generate, don't write: sqlc owns CRUD SQL; write raw SQL only for complex queries (CTEs, window functions).

### Frontend (TypeScript)

- `strict: true` is on. No `any` — use `unknown` and narrow, or define a type.
- Server state → TanStack Query. Client state → Zustand or local `useState`. Never mix.
- Forms → React Hook Form + Zod schema. Same Zod schema is the single source of truth; backend validation mirrors it via OpenAPI.
- Styling → Tailwind classes in JSX. Use `cn()` helper (clsx + tailwind-merge) for conditionals. No CSS-in-JS.
- Imports: `import type` for type-only imports (bundler strips them).

## How to work here

- Small PRs. One module per PR. Never merge 3 modules together to "save time" — review quality degrades sharply.
- If something surprises you (schema, weird SQL, a TODO comment), **ask** before changing it. This is a business system; odd-looking things usually protect money or compliance.
- When in doubt about a policy, re-read [SECURITY.md](SECURITY.md). If the answer still isn't clear, ask the user.
- Do not run destructive DB commands without an explicit prompt. `make reset-db` is local-dev-only.
- Do not push secrets, not even for testing. Use `.env`.

## Running locally

See [README.md](README.md) → "Quick start". The short version:

```bash
cp .env.example .env
make up
make migrate
make seed
make frontend-install
make dev
```

## When you finish a module

1. `make test` (all tests pass).
2. `make lint` (no warnings).
3. Update `PROGRESS.md` → check the box.
4. Commit with conventional message: `feat(<module_id>): <one-line summary>`.
5. Push, open PR, wait for CI.

## Things that are placeholders today (Phase 0 constraints)

- Charts: `recharts` is installed but most modules default to table view; richer visualisations are added per-module.
- Real-time (WebSocket / SSE): not wired in Phase 0. First module needing it (approval inbox live count?) will add the infra.
- File storage: local filesystem in dev, S3 in prod — abstraction in `internal/storage` added with the first module that uploads (submittal / site diary).
- e-Tax / PND submission: stubs only; real XML + SOAP integration lands in Phase 7.
