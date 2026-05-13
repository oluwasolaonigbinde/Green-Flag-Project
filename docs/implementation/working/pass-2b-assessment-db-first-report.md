# Pass 2B Assessment DB-First Persistence Report

Date: 2026-05-07

## Summary

Implemented Pass 2B for assessment, visits, evidence metadata, score update, assessment draft/read, and submit command paths. Production-like assessment routes now require and use a DB-first PostgreSQL repository. The legacy Map-backed assessment store remains available only through explicit local/test/lower-env wiring.

## Files changed

- `apps/api/src/assessment.ts`
- `apps/api/src/app.ts`
- `apps/api/src/index.ts`
- `apps/api/src/postgres-runtime.ts`
- `apps/api/src/app.test.ts`
- `apps/api/src/postgres-domain-stores.integration.test.ts`
- `apps/api/src/postgres-domain-stores/assessment-repository.ts`
- `packages/db/migrations/0018_assessment_db_first_safety.sql`
- `docs/implementation/working/pass-2b-assessment-db-first-report.md`

## Migrations added

- `0018_assessment_db_first_safety.sql`
  - Adds one-current-row-per-assignment visit uniqueness: `ux_assessment_visits_judge_assignment`.
  - Adds assessment assignment/version lookup index.
  - Adds evidence assessment/created/id read index.

## Command paths converted

- Visit scheduling.
- Assessor visit list read.
- Assessment GET/read without row creation.
- Assessment score update.
- Evidence metadata creation.
- Assessment submit.
- Admin assessment detail read.

No new provider integration, frontend surface, official scoring content, applicant score bands, result/outbox framework, or lifecycle state in `applications.status` was added.

## DB-first enforcement

- `PostgresAssessmentRepository` performs exact-row writes using `UnitOfWork.run`.
- `createPostgresApiRuntime` constructs the assessment repository and passes it to `buildApp`.
- `buildApp({ productionLike: true })` now rejects mounted assessment stores unless a DB-first assessment repository is supplied.
- Assessment routes branch to repository methods before any legacy store mutation.

## Whole-store flush avoidance

Converted production-like assessment commands do not call `assessmentStore.withTransaction`, `flushAssessmentStore`, or mutate hydrated Maps before persistence. The old Map/flush path remains only behind explicit store-only route wiring for unit/lower-env compatibility.

## Access rules

- Mutation commands require a judge actor with a PostgreSQL-backed assignment row.
- `ACCEPTED` assignment status is required for visit scheduling, score updates, evidence creation, and submit.
- `RELEASED`, `DECLINED`, `WITHDRAWN`, replaced/removed-style inactive states, and non-assigned judges are denied for mutations.
- Released judges still use the allocation accept/decline routes from Pass 2A; they cannot mutate assessments.

## GET/read behavior

DB-backed `GET /api/v1/assessor/assessments/:assignmentId` no longer creates a `judge_assessments` row. If no row exists, it returns a read-only `NOT_STARTED` projection using the assignment id as the compatible assessment id. The first write command creates the row transactionally.

## Concurrency controls

- `SELECT ... FOR UPDATE` locks assignment and assessment rows during mutations.
- Visit scheduling locks the visit row by assignment and checks client version.
- Score update and submit use assessment version checks.
- The new unique visit index prevents duplicate current visits per assignment.
- Score child rows are replaced only for the locked assessment being updated.
- Integration tests prove a second independently initialized runtime cannot stale-overwrite assessment score/update or submit state.

## Audit transactionality

Assessment domain writes and `audit_events` append through the same `UnitOfWork` transaction. Forced audit failure rolls back visit creation and audit rows.

## Mystery/redaction behavior

- Assignment and episode context are read from PostgreSQL.
- Mystery visit location disclosure is stored as `mystery_restricted`.
- Mystery evidence metadata visibility is stored as `mystery_restricted`.
- Applicant dashboard projection regression asserts that raw assessment id, raw scores, and evidence filename are not exposed through applicant-facing reads.
- Admin detail remains admin-only and episode-owned.

## Evidence/storage behavior

Evidence changes remain metadata-only. No S3, signed URL, virus scanning, transcription, or storage-provider dispatch was added. The DB-first path stores a metadata-only opaque key string instead of a raw provider object key. The existing contract still contains `storageProvider`/`storageKey` fields, so complete removal is a future contract-safety cleanup rather than an API-compatible Pass 2B change.

## Scoring/content guardrails

The repository reads existing configurable template/criteria rows. It validates submitted score criteria against that template and preserves existing threshold calculation behavior. No official criteria, subcriteria wording, guidance text, applicant-facing bands, fee/VAT/legal content, provider credentials, or KBT approvals were introduced.

## Runtime safety changes

- Production-like assessment routes require `assessmentRepository`.
- The production entrypoint now wires `PostgresAssessmentRepository`.
- Runtime safety from Pass 1B/1C and Pass 2A is preserved.

## Tests added/updated

- Runtime/app construction test for production-like assessment repository requirement.
- PostgreSQL integration coverage for:
  - visit scheduling cold-start persistence;
  - assessment GET not creating rows;
  - score update cold-start persistence;
  - evidence metadata cold-start persistence;
  - assessment submit cold-start persistence;
  - released/declined/withdrawn judge mutation denial;
  - accepted judge mutation allowance;
  - stale multi-runtime assessment update/submit denial;
  - audit failure rollback;
  - applicant-facing projection not exposing assessment internals.

## Verification results

- `git status --short` before implementation: dirty worktree with pre-existing modified/untracked backend, docs, contracts, migrations, OpenAPI, and generated/output files.
- `corepack pnpm --filter @green-flag/api typecheck`: passed.
- `corepack pnpm --filter @green-flag/api test`: passed, 62 passed, 14 DB integration tests skipped as expected without `TEST_DATABASE_URL`.
- `corepack pnpm db:integration:test`: passed, 14/14.
- `corepack pnpm --filter @green-flag/db typecheck`: passed.
- `corepack pnpm db:migrate:check`: passed, 18 migration files.
- `corepack pnpm db:seed:check`: passed, 11 seed files.
- `corepack pnpm contracts:check`: passed, 17/17.
- `corepack pnpm lint`: passed.
- `corepack pnpm test`: passed, 96 passed, 14 DB integration tests skipped in the normal non-DB run.
- `corepack pnpm openapi:check`: passed.
- `git status --short` after implementation: still dirty from the pre-existing workspace plus Pass 2B source/test/migration/report changes.

## pg deprecation warning status

The previous Pass 2A report observed a `pg` same-client concurrent-query deprecation warning. The Pass 2B `corepack pnpm db:integration:test` run did not reproduce that warning. Status: not observed/resolved in this run.

## Remaining caveats

- The repo remains broadly dirty from pre-existing work; this report does not claim ownership of unrelated modified/untracked files.
- Existing assessment DTOs still include `storageProvider` and `storageKey`. Pass 2B avoids raw provider key generation in the DB-first path but does not make a public contract-breaking DTO removal.
- Legacy Map/flush assessment compatibility remains for explicit local/test/lower-env wiring.
- Production launch still depends on the documented external gates: official scoring content, provider configuration, UAT, migration rehearsal, monitoring, backup/rollback, and sign-off.

## Repository mutation summary

Pass 2B added the DB-first assessment repository, wired production-like assessment route enforcement, added a targeted DB safety migration, updated assessment route branching, and expanded PostgreSQL integration coverage. No frontend, provider, official content, legacy schema/import, communications, registration verification-token, or allocation behavior changes were intentionally made beyond shared repository wiring.
