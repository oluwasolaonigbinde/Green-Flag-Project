# Pass 2C Audit Fix Report

## Summary

Implemented the tiny Pass 2C audit fix for converted communications/job mutations. The PostgreSQL notification dispatch-stub and renewal reminder run now append audit events inside the same `UnitOfWork` transaction as their related domain writes.

## Files changed

- `apps/api/src/postgres-domain-stores/communications-repository.ts`
- `apps/api/src/communications.ts`
- `apps/api/src/postgres-domain-stores.integration.test.ts`
- `docs/implementation/working/pass-2c-audit-fix-report.md`

## Commands audited

- Admin notification dispatch-stub mutation.
- Admin renewal reminder run mutation.

## Audit action names used

- `DISPATCH_NOTIFICATION_STUB`
- `RUN_RENEWAL_REMINDERS`

## Transaction and rollback behaviour

- `dispatchNotificationStub` now appends `DISPATCH_NOTIFICATION_STUB` after updating `notification_queue` and inserting `notification_logs`, before the `UnitOfWork` commits.
- `runRenewalReminders` now appends `RUN_RENEWAL_REMINDERS` after inserting `notification_queue` and `job_runs`, before the `UnitOfWork` commits.
- Both commands use the existing authenticated admin actor from `SessionProfile`.
- Both commands use existing request metadata conventions, including request id and idempotency key where available.
- Forced audit append failure rolls back the associated domain/log/job rows because audit append occurs through the same transaction-bound `PostgresAuditLedger`.

## Tests added or updated

- Added a positive PostgreSQL integration test confirming audit rows are written for both converted commands.
- Added a forced audit failure PostgreSQL integration test confirming dispatch-stub rollback preserves the notification as `QUEUED` and does not persist notification log rows.
- Added a forced audit failure PostgreSQL integration test confirming renewal reminder rollback does not add reminder notification or job rows.
- Updated internal repository route wiring to pass request context into the PostgreSQL repository without changing public API contracts.

## Verification command results

- `corepack pnpm lint`: passed.
- `corepack pnpm test`: passed, 97 tests passed and 21 PostgreSQL integration tests skipped in the general run because `TEST_DATABASE_URL` was not set there.
- `corepack pnpm db:integration:test`: passed on rerun, 21 PostgreSQL integration tests passed.
- `corepack pnpm --filter @green-flag/api typecheck`: passed.
- `corepack pnpm --filter @green-flag/db typecheck`: passed.
- `corepack pnpm db:migrate:check`: passed, migration convention check passed for 19 files.
- `corepack pnpm db:seed:check`: passed, lower-env seed safety check passed for 11 files.
- `corepack pnpm contracts:check`: passed, 17 contract tests passed.
- `corepack pnpm openapi:check`: passed.

## Remaining caveats

- No real SES, SMS, provider dispatch, outbox, or idempotency framework was implemented.
- No public API contracts, DTOs, frontend code, provider code, scoring content, fees, VAT, legal wording, applicant score bands, or legacy schema/import work was introduced.
- The first `db:integration:test` run failed because the new renewal rollback assertion assumed no earlier `renewal_reminder` rows existed in the shared integration suite. The assertion was corrected to compare before/after counts, and the rerun passed.

## Repository mutation summary

- `git status --short` before implementation showed an already-dirty worktree with many modified and untracked files, including an untracked `apps/api/src/postgres-domain-stores/communications-repository.ts`.
- `git status --short` after implementation still showed the pre-existing dirty tree plus this pass touching the scoped communications repository, communications route wiring, PostgreSQL integration test, and this report.
- No unrelated dirty files were reverted or modified intentionally.
