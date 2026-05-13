# S13 Notifications Messaging Jobs Exports Reminders Delivery

## Status

- Slice: 13
- Status: DONE_FULL
- Closed: 2026-05-06
- Contract: `docs/implementation/slice-contracts/S13-notifications-messaging-jobs-exports-reminders.md`

## Delivered

- Notification queue/log/suppression persistence and contracts.
- Lower-env notification dispatch stub that records `adapter_not_configured`.
- Applicant/admin message thread APIs with server-side Mystery suppression.
- Renewal reminder job run API that queues lower-env notification records.
- Generic export job shell with redaction profile capture and lower-env storage marker.
- PostgreSQL runtime persistence for notifications, messages, job runs, and exports.
- OpenAPI skeleton parity and lower-env seed metadata.
- External configuration register covering runtime/auth, location, documents, finance/payments, assessor/allocation, assessment/results, communications/jobs/exports, and public-map setup.

## Deferred

- Real email/SMS provider dispatch, credentials, webhooks, bounce/opt-out handling, approved notification copy, Business Central automation, production export formats, public-map worker dispatch, and S14 UAT/security/performance hardening.

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
