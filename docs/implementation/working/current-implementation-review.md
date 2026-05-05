# Current Implementation Review

## Slice

- Scope: Slices 1-8 production-blocker hardening
- Review date: 2026-05-05
- Outcome: PARTIAL_HARDENING_COMPLETE

## Findings

- API route registration no longer silently creates in-memory lower-env stores for production paths. Tests and lower-env callers must inject explicit stores/repositories.
- Applicant, registration, and assessor stores now expose transaction wrappers; submission/payment critical paths use the wrapper so audit failure rolls back lower-env state.
- Applicant and admin scope checks now use central ownership predicates rather than role/scope type alone.
- Payment block override writes a dedicated in-process `admin_override_events` record and the database migration now defines append-only `admin_override_events`.
- Applicant dashboard/document redaction now routes through a central redaction policy module.
- Admin application queues now read episode status from the episode-status store instead of deriving it solely from application/payment state.
- This hardening does not implement S09 allocation or S10 full Mystery redaction. S09 remains in contract review and S10 remains TODO.

## Verification

- `corepack pnpm install --frozen-lockfile` passed; pnpm reported ignored build scripts for `esbuild` and `sharp`.
- `corepack pnpm contracts:check` passed.
- `corepack pnpm openapi:check` passed.
- `corepack pnpm db:migrate:check` passed.
- `corepack pnpm db:seed:check` passed.
- `corepack pnpm lint` passed.
- `corepack pnpm test` passed: 8 files / 51 tests.
- `corepack pnpm build` passed; existing Next.js ESLint-plugin warning remains.
- `corepack pnpm typecheck` passed; existing Next.js ESLint-plugin warning remains.

## Closure Recommendation

Do not continue to S09-S12. Remaining production risk is the absence of a real DB adapter/client in this repo; current hardening prevents implicit production Map defaults and adds transaction/override/redaction contracts, but production deployment still needs repository implementations backed by PostgreSQL transactions.
