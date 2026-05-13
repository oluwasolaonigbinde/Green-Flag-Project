# S12 Decisions Results Certificates Public Map Events Delivery

## Status

- Slice: 12
- Status: DONE_FULL
- Closed: 2026-05-06
- Contract: `docs/implementation/slice-contracts/S12-decisions-results-certificates-public-map-events.md`

## Delivered

- Episode-rooted decision result contracts and API routes.
- Threshold acknowledgement and submitted-assessment precondition.
- Admin hold, publish, and withdraw commands with audit records.
- Certificate shell and result artifact metadata using lower-env storage markers.
- Derived park award cache and append-only public map update event outbox.
- Applicant-safe result projection that omits raw scores, internal notes, judge identity, visit dates, and assessment internals.
- PostgreSQL tables and runtime persistence for result/publication state.
- OpenAPI skeleton parity and lower-env synthetic seed metadata.

## Deferred

- Applicant band labels/ranges, official certificate wording, public-map provider contract, notification sending, messaging, jobs, and exports remain later dependencies/slices.
- Frontend result/certificate/public-map screens remain gap-tracked against available evidence.
- S12.5 must normalize high-value read-model fields for production PostgreSQL read paths.

## Checks

- `corepack pnpm install --frozen-lockfile`: PASS
- `corepack pnpm contracts:check`: PASS
- `corepack pnpm openapi:check`: PASS
- `corepack pnpm db:migrate:check`: PASS
- `corepack pnpm db:seed:check`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS
- `corepack pnpm build`: PASS
- `corepack pnpm typecheck`: PASS
- `corepack pnpm db:integration:test`: PASS

## Notes

- Build/typecheck still emit the existing non-blocking Next.js ESLint plugin warning.
