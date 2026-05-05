# Slice Contract: S08 PostgreSQL Runtime Persistence Wiring

## Metadata

- Slice ID: 8.5
- Title: PostgreSQL runtime persistence wiring
- Backlog status: DONE_FULL
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S08-postgres-runtime-persistence-wiring.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/slice-contracts/S01-identity-rbac-audit-foundation.md
  - docs/implementation/slice-contracts/S02-organisations-parks-locations-cycles-episodes.md
  - docs/implementation/slice-contracts/S03-registration-eligibility-verification-admin-approval.md
  - docs/implementation/slice-contracts/S04-applicant-dashboard-application-draft-autosave.md
  - docs/implementation/slice-contracts/S05-documents-management-plan-upload-link-versioning.md
  - docs/implementation/slice-contracts/S06-submission-invoice-po-payment-state.md
  - docs/implementation/slice-contracts/S07-admin-read-models-queues.md
  - docs/implementation/slice-contracts/S08-judge-profiles-assessor-management-capacity.md

## Objective

Introduce a production PostgreSQL runtime boundary before Slice 9 so the backend no longer relies only on lower-env/test stores for foundational identity and audit wiring. This slice adds a PostgreSQL pool, transaction helper, migration runner, API runtime configuration, DB-backed Cognito subject lookup, DB-backed role assignment lookup, and DB-backed append-only audit ledger.

## Scope Lock

### In Scope

- PostgreSQL client dependency and typed SQL client/pool abstractions.
- Runtime `DATABASE_URL` configuration.
- Transaction helper with commit/rollback behavior.
- Migration runner that records applied migration filenames in `schema_migrations`.
- API runtime wiring for Cognito-backed session resolution using `internal_users`, `cognito_identity_links`, and `role_assignments`.
- API audit ledger adapter that appends to `audit_events`.
- Tests for config parsing, transaction behavior, identity mapping, and audit inserts.
- Workflow update making this slice a prerequisite for Slice 9.

### Out of Scope

- AWS infrastructure provisioning.
- Live production Cognito tenant values, issuer, audience, or JWKS credentials.
- Full replacement of every lower-env domain command store with table-specific repositories.
- Allocation business rules, COI taxonomy, hold/release rules, contact reveal rules, or judge-count algorithms.
- Any production fees, VAT, scoring criteria, provider credentials, legal wording, or KBT approvals.

## Backend/API Contract

- If `DATABASE_URL` is set, API startup constructs a PostgreSQL pool.
- If `DATABASE_URL` is set, `COGNITO_ISSUER`, `COGNITO_AUDIENCE`, and `COGNITO_JWKS_URL` are required.
- `GET /api/v1/session` can resolve Cognito subjects through PostgreSQL-backed identity and role tables.
- Data-changing routes that receive an injected audit ledger can append to PostgreSQL `audit_events`.
- Lower-env/test stores remain available for unit and contract tests.

## Verification Matrix

| Check | Command / Artifact | Status | Evidence |
| --- | --- | --- | --- |
| DB runtime config | `packages/db/src/postgres.test.ts` | PASS | DATABASE_URL parsing covered |
| Transaction behavior | `packages/db/src/postgres.test.ts` | PASS | commit and rollback behavior covered |
| Identity adapter | `apps/api/src/postgres-runtime.test.ts` | PASS | Cognito subject and role mapping covered |
| Audit adapter | `apps/api/src/postgres-runtime.test.ts` | PASS | audit_events insert shape covered |
| Workspace checks | root validation commands | PASS | recorded in delivery record |

## Closure Note

Slice 8.5 is closed as `DONE_FULL`. The repo now has a real PostgreSQL runtime boundary for session and audit foundations, plus migration execution support. Full domain-store replacement remains a later hardening concern, but Slice 9 can now build allocation logic against a stronger persistence foundation without needing AWS setup first.
