# `settings` — Company profile + integrations

Phase 1B. Two concerns live here:

1. **Company profile CRUD** — one company profile per row in `companies`.
   The session's `ActiveCompanyID` decides which row this module reads and
   writes, so a user who switched to company B in the topbar edits
   company B's profile, not company A's.
2. **Integrations status** — a read-only dashboard of external systems
   (SMTP, storage, payment, e-Tax) built from `*config.Config` at request
   time. Secrets never reach the UI.

This module is also the first consumer of the row-level multi-entity
helpers introduced in migration 0006. Later modules that want per-company
scoping should follow the same shape: pull the active company from the
session via `auth.ActiveCompanyFromContext(ctx)`, pass it into every
SELECT/UPDATE, and never trust a company id from the request body.

## Tables

Owned: none — this module edits rows in `companies` (seeded elsewhere).

Read/write surface:

| Table | Relation |
|---|---|
| `companies` | Read + update rows matching `session.active_company_id` |
| `user_companies` | Read only (via `/auth/me` and the switcher handler) |

Schema additions landed in
[`backend/migrations/0006_multi_entity.up.sql`](../../../migrations/0006_multi_entity.up.sql):
`currency`, `timezone`, `fiscal_year_start_month`, `vat_rate`, `wht_rate`,
`website` on `companies`; plus the `user_companies` join and
`users.default_company_id`.

## HTTP endpoints

Mounted under `/api/v1` in `cmd/api/main.go`:

| Method | Path | Permission |
|---|---|---|
| `GET` | `/settings/company` | `settings.read` |
| `PUT` | `/settings/company` | `settings.write` + per-user rate limit (30/hour) |
| `GET` | `/settings/integrations` | `settings.read` |

The switch-company endpoint is on the auth module (`POST /auth/switch-company`)
since it manipulates the session, not a `companies` row.

## Permissions

Seeded by the RBAC seeder:

- `settings.read` — view the Company + Integrations tabs
- `settings.write` — save changes to the Company tab

Both are granted to the `ADMIN` role by default. Add them to other roles
only after you've thought about the blast radius: tax rate + fiscal year
affect every finance module downstream.

## Validation rules

- `tax_id` — reuses `hr.ValidateThaiNationalID` (Luhn-13). Validated only
  when the request sets it; a pre-existing value that pre-dates Luhn
  enforcement is never re-checked.
- `currency` — allowlist (`THB`, `USD`, `SGD`, `VND`, `EUR`, `JPY`,
  `CNY`, `HKD`). Stored uppercase.
- `timezone` — allowlist of IANA zones the group currently operates in.
- `fiscal_year_start_month` — 1–12.
- `vat_rate` / `wht_rate` — decimal string in [0, 100], formatted to two
  decimals before the SQL write so the round-trip is lossless.
- `address` — stored in `address_json` as `{ "lines": [...], "country": "..." }`.
  UI edits the multiline form; the column stays JSONB so future
  country-specific fields don't need a migration.

## Audit trail

Every successful `PUT /settings/company` writes one `audit_log` row with
action `settings.company.update`, entity `company`, the target company id,
and the full before/after profile as JSON. Field-level diffs are derivable
downstream without the writer carrying that logic.

The switch-company endpoint on the auth module writes
`auth.switch_company` with the pre/post active company id.

## Multi-entity approach

Row-level: every company-scoped module reads
`auth.ActiveCompanyFromContext(ctx)` and filters/updates by that id. A
dedicated `CompanyScope` middleware is not needed yet — the second module
that wants default scoping can add one and backfill the existing handlers.
HR employees still take `company_id` from the UI explicitly so the admin
can list across entities during backfill; that stays as-is until a later
PR flips it to session-scoped.

## Known gaps

- No admin UI for managing `user_companies` memberships — today it's
  seeded + manipulated via SQL. UI belongs in `gov_rbac`.
- Logo upload deferred until `internal/storage` exists.
- Editable secrets stay in `.env` + `deploy/SECRETS.md`; the
  Integrations tab is read-only on purpose.
