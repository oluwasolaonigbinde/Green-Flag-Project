# S10 Mystery Redaction Hardening Delivery

## Status

- Slice: 10
- Status: DONE_FULL
- Closed: 2026-05-06
- Contract: `docs/implementation/slice-contracts/S10-mystery-redaction-hardening.md`

## Delivered

- Central Mystery redaction policy in `apps/api/src/redaction.ts`.
- Applicant/org-facing suppression for delivered dashboard, document list, and signed document access surfaces.
- Typed projector boundaries for applicant/org notification, message, search/export count, and status-label redaction.
- Admin/super-admin visibility remains intact through role-based policy decisions.
- Shared contract schemas and fixtures for redaction decisions and synthetic notification/message/search-export projections.
- Matrix tests for applicant/org suppression and admin visibility.

## Deferred

- Notification sending, message persistence, export jobs, visits, scoring, result publication, certificates, and public map behavior remain later slices.
- Exact Mystery UI variants for messages, visits, exports, and mobile remain frontend gaps.

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
