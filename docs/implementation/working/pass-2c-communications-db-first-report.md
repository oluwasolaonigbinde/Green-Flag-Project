# Pass 2C Communications DB-First Persistence Report

Date: 2026-05-07

## Summary

Implemented Pass 2C for communications/message persistence and the admin-created Mystery message leakage fix. Production-like communications routes now use a PostgreSQL DB-first repository for current notification queue/log reads, notification dispatch-stub updates, message thread creation, applicant/admin message listing, renewal reminder queue/job rows, and export job rows. The legacy Map-backed communications store remains only for explicit local/test/lower-env compatibility.

## Files changed

- `apps/api/src/communications.ts`
- `apps/api/src/postgres-domain-stores/communications-repository.ts`
- `apps/api/src/app.ts`
- `apps/api/src/index.ts`
- `apps/api/src/postgres-runtime.ts`
- `apps/api/src/runtime-safety.ts`
- `apps/api/src/app.test.ts`
- `apps/api/src/postgres-domain-stores.integration.test.ts`
- `packages/db/migrations/0019_communications_db_first_safety.sql`
- `docs/implementation/working/pass-2c-communications-db-first-report.md`

## Migrations added

- `0019_communications_db_first_safety.sql`
  - Adds `message_threads.version` for optimistic/state-change tracking.
  - Adds applicant-visible thread lookup index.
  - Adds GIN participant index.
  - Adds notification log and suppression related-entity indexes.

## Command/read paths converted

- Message thread creation for applicant and admin routes.
- Current message body creation as part of thread creation.
- Thread visibility/suppression state at creation time.
- Applicant message listing.
- Admin message listing.
- Admin notification queue/log listing.
- Notification dispatch-stub status/log mutation.
- Renewal reminder queue notification and job-run row creation.
- Admin job listing.
- Export job creation/listing.

No new reply/detail route, provider integration, frontend change, durable outbox/idempotency framework, or OpenAPI/DTO change was introduced. There is no separate implemented message-reply/detail route to convert in this codebase snapshot.

## DB-first enforcement

- Added `PostgresCommunicationsRepository` with direct SQL reads/writes.
- `createPostgresApiRuntime` now constructs and exposes the communications repository.
- `index.ts` passes the repository into `buildApp`.
- `buildApp({ productionLike: true })` rejects mounted communications stores without a DB-first communications repository.
- Route handlers branch to repository methods before lower-env store access.

## Whole-store flush avoidance

Converted production-like communications paths do not call `communicationsStore.withTransaction` or `flushCommunicationsStore`. Those calls remain only in the legacy lower-env Map fallback branch. A regression test verifies a wired repository is preferred even if the lower-env store transaction would throw.

## Mystery suppression

Mystery suppression is now episode-aware in the DB-first path:

- The repository loads `assessment_episodes.episode_type` and `mystery_suppressed` with park/organisation/country ownership context.
- Any thread linked to a Mystery episode is created as `SUPPRESSED`, `visibleToApplicant=false`, with safe placeholder subject/body.
- This applies whether the creator is an admin or applicant.
- Applicant listing filters Mystery/suppressed content server-side from current PostgreSQL rows.
- Admin listing remains able to see suppressed thread records for operational review.
- Suppressed Mystery message attempts insert `notification_suppressions` rows using the existing `mystery_redaction` suppression state.

The DB integration test proves both admin-created and applicant-created Mystery message threads are absent from applicant listings and present in admin listings.

## Storage-key/provider-key exposure

No message attachment model was added and no new communications/message DTO exposes storage provider keys. Existing export-job DTO behavior still includes `storageProvider`/`storageKey` for admin export jobs as pre-existing S13 behavior; this pass did not broaden applicant/org-facing exposure.

## Concurrency controls

- Message thread creation locks the target `assessment_episodes` row with `FOR UPDATE` when an episode is linked.
- Notification dispatch locks the target `notification_queue` row with `FOR UPDATE` and refuses suppressed dispatch.
- `message_threads.version` is available for visibility/state tracking.
- Reads query current PostgreSQL rows, so independently initialized runtimes do not serve or overwrite stale hydrated Map state.
- DB integration covers a second runtime observing a DB-side visibility suppression instead of stale applicant-visible state.

## Audit transactionality

Message/export DB-first writes and audit appends run through `UnitOfWork.run`. `PostgresAuditLedger` uses the active transaction client, so forced audit failure rolls back communications domain rows. DB integration verifies failed audit append leaves no message thread behind.

## Notification/log behaviour

Existing provider-neutral behavior is preserved:

- Dispatch-stub updates notification status to `DISPATCH_STUBBED`.
- Dispatch-stub inserts an `adapter_not_configured` notification log.
- Renewal reminder run creates the existing queued notification and completed job-run rows.
- No SES/SMS/provider dispatch was implemented.
- Mystery message suppression records existing `notification_suppressions` state without adding a new worker/outbox design.

## Runtime safety changes

- Production-like app construction requires the DB-first communications repository when communications routes are mounted.
- Runtime safety messaging now names communications as part of the mutable-store fallback risk.
- Production runtime wiring includes `communicationsRepository`.

## Tests added/updated

- Runtime/app construction test requiring DB-first communications repository.
- Regression test proving repository path avoids lower-env store transaction/flush fallback.
- PostgreSQL integration tests for:
  - message/thread creation surviving cold restart;
  - message row creation surviving cold restart;
  - admin listing from DB-backed state;
  - applicant listing from DB-backed state;
  - admin-created Mystery thread/message not applicant-visible;
  - applicant-created Mystery thread/message suppression preserved;
  - independently initialized runtimes reading current DB visibility state;
  - audit failure rolling back communications domain writes.

Existing communications and redaction tests still pass.

## Verification results

- `git status --short` before implementation: dirty worktree with pre-existing docs/source/output changes; no Pass 2C files were present yet.
- `corepack pnpm lint`: passed.
- `corepack pnpm test`: passed, 97 passed, 18 DB integration tests skipped in the normal non-DB run.
- `corepack pnpm db:integration:test`: passed, 18/18.
- `corepack pnpm --filter @green-flag/api typecheck`: passed.
- `corepack pnpm --filter @green-flag/db typecheck`: passed.
- `corepack pnpm db:migrate:check`: passed, 19 migration files.
- `corepack pnpm db:seed:check`: passed, 11 seed files.
- `corepack pnpm contracts:check`: passed, 17/17.
- `corepack pnpm openapi:check`: passed.
- `git status --short` after implementation, before this report: dirty worktree with pre-existing changes plus Pass 2C source/test/migration changes.

## pg deprecation warning status

The `pg` same-client concurrent-query deprecation warning noted in Pass 2A did not appear during the Pass 2C `corepack pnpm db:integration:test` runs. Status: not observed; not increased.

## Remaining caveats

- Legacy communications Map/flush compatibility remains available only for explicit local/test/lower-env wiring.
- No separate message reply/detail route exists in the current backend, so there was no additional reply/detail implementation to convert.
- Full provider dispatch, durable outbox/idempotency, export-worker redesign, and provider integrations remain out of scope.
- The unrelated applicant-repository same-client `Promise.all` caveat from Pass 2B was not touched and did not break this pass.
- The repo remains broadly dirty from pre-existing documentation/source/output artifacts.

## Repository mutation summary

Pass 2C added a DB-first communications repository, production-like runtime/app wiring, a targeted migration, runtime-safety messaging, and PostgreSQL integration coverage. It did not edit frontend code, OpenAPI/contracts, provider integrations, registration/applicant/document/payment logic, allocation/assessor command logic, assessment evidence DTO/storage shape, results/publication logic, official scoring/fees/legal content, or legacy schema/import work.
