# Slice Delivery Record

## Metadata

- Slice ID: 8.6
- Title: PostgreSQL domain repository adapters
- Closed status: DONE_FULL
- Closed at: 2026-05-06
- Contract path: docs/implementation/slice-contracts/S08-postgres-domain-repository-adapters.md

## Delivered Capability

- Added UnitOfWork transaction context over PostgreSQL transactions.
- Made PostgreSQL audit ledger use the active transaction client.
- Added table-specific PostgreSQL runtime payload support for Slices 3-8 stores.
- Added PostgreSQL-backed registration, applicant/application/document/payment, and assessor/judge store hydration and persistence adapters.
- Wired production API runtime to use DB-backed domain stores when `DATABASE_URL` is configured.
- Added production-like startup guard so missing `DATABASE_URL` cannot silently fall back to in-memory stores.
- Added Docker-backed DB integration test command.

## Verification Evidence

| Check | Result |
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

## Backend Handoff

Slice 9 can resume after contract review. Runtime configuration still needs `DATABASE_URL` and Cognito issuer/audience/JWKS values for production-like startup.

## Residual Risks

- The adapter preserves the existing Slices 3-8 route/store contract and persists DTO payloads through table-specific runtime payload columns. A later hardening pass can normalize more read-model fields for query performance.
- Slice 9 allocation remains product-blocked until KBT allocation rules are supplied or safely bounded in contract review.
