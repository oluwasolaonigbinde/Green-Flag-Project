# Slice Contract: S08.6 PostgreSQL Domain Repository Adapters

## Metadata

- Slice ID: 8.6
- Title: PostgreSQL domain repository adapters
- Backlog status: DONE_FULL
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S08-postgres-domain-repository-adapters.md

## Objective

Replace remaining map-backed production runtime stores for Slices 3-8 with PostgreSQL-backed repository adapters before Slice 9 allocation resumes. The API may keep in-memory stores for explicit unit-test wiring, but production-like startup must fail without `DATABASE_URL`.

## Scope Lock

### In Scope

- `UnitOfWork` / `TransactionContext` abstraction over PostgreSQL transactions.
- Transaction-aware audit writes using the active UnitOfWork client.
- PostgreSQL domain store adapters for registration, applicant/application/document/payment, admin read-model backing state, and assessor/judge management.
- Support migration columns needed to round-trip already-approved Slices 3-8 DTO payloads.
- Production-like startup guard for missing `DATABASE_URL`.
- Docker-backed DB integration test command.

### Out of Scope

- Slice 9 allocation tables, COI taxonomy, hold/release rules, judge-count rules, or contact reveal timing.
- AWS provisioning.
- Production fees, VAT, legal wording, official scoring criteria, provider credentials, KBT approvals, or real migration data.

## Acceptance Gates

- Slice 8.6 may only close as `DONE_FULL` after all checks pass.
- Runtime with `NODE_ENV=production`, `API_RUNTIME_MODE=production`, or `API_RUNTIME_MODE=staging` must refuse startup without `DATABASE_URL`.
- Domain mutation, audit writes, and runtime payload persistence must share one UnitOfWork transaction.
- DB-backed admin, applicant, and assessor/judge read models must continue to use existing RBAC and Mystery redaction checks.

## Verification Matrix

| Check | Status |
| --- | --- |
| `corepack pnpm lint` | PASS |
| `corepack pnpm typecheck` | PASS |
| `corepack pnpm test` | PASS |
| `corepack pnpm build` | PASS |
| `corepack pnpm contracts:check` | PASS |
| `corepack pnpm openapi:check` | PASS |
| `corepack pnpm db:migrate:check` | PASS |
| `corepack pnpm db:seed:check` | PASS |
| `corepack pnpm db:integration:test` | PASS |

## Closure Note

Closed as `DONE_FULL` after the acceptance checks passed. Slice 9 remains the next legal backlog slice, but the prior KBT allocation-rule questions still need to be handled during S09 contract review.
