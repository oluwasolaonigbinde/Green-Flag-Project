# Slice Delivery Record

## Metadata

- Slice ID: 8.5
- Title: PostgreSQL runtime persistence wiring
- Closed status: DONE_FULL
- Closed at: 2026-05-05
- Contract path: docs/implementation/slice-contracts/S08-postgres-runtime-persistence-wiring.md

## Delivered Capability

- Added `pg`-backed PostgreSQL runtime utilities in `packages/db`.
- Added `DATABASE_URL` runtime configuration parsing.
- Added typed SQL client/pool abstractions.
- Added transaction helper with rollback on failure.
- Added migration runner with `schema_migrations` tracking.
- Added DB-backed identity lookup adapter for `internal_users`, `cognito_identity_links`, and `role_assignments`.
- Added DB-backed audit ledger adapter for append-only `audit_events`.
- Wired API startup to use the PostgreSQL runtime when `DATABASE_URL` is configured.
- Kept lower-env/test stores available for existing route tests and contract fixtures.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `corepack pnpm lint` | PASS | workspace lint passed |
| `corepack pnpm typecheck` | PASS | workspace typecheck passed |
| `corepack pnpm test` | PASS | runtime config, transaction, identity adapter, and audit adapter tests passed |
| `corepack pnpm build` | PASS | workspace build passed |
| `corepack pnpm contracts:check` | PASS | contract package tests passed |
| `corepack pnpm openapi:check` | PASS | OpenAPI validation passed |
| `corepack pnpm db:migrate:check` | PASS | migration convention check passed |
| `corepack pnpm db:seed:check` | PASS | lower-env seed check passed |

## Backend Handoff

Slice 9 does not need AWS provisioning before contract work resumes. For production-like API runtime, configure:

- `DATABASE_URL`
- `COGNITO_ISSUER`
- `COGNITO_AUDIENCE`
- `COGNITO_JWKS_URL`
- optional `DATABASE_SSL=true`
- optional `DATABASE_MAX_CONNECTIONS`

## Residual Risks

- Full table-specific PostgreSQL repositories for every Slices 3-8 domain command store are not replaced in this pass.
- Existing lower-env stores remain the main unit-test path.
- DB-backed integration tests should be added before UAT/prod hardening.
- AWS infrastructure and live Cognito values remain deployment configuration, not repo truth.

## Next Legal Work

Slice 9 can return to planning/contract review. Source requirements and architecture provide implementable allocation defaults for judge-count suggestions, hard/soft COI handling, rotation deprioritisation, hold/release, contact reveal, and Mystery suppression. Remaining KBT-dependent items should be handled as configurable production policy values or import boundaries, not as a total blocker to S09.
