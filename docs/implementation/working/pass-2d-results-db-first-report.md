# Pass 2D Results DB-First Persistence Report

Date: 2026-05-08

## Summary

Implemented Pass 2D for result, decision, publication, artifact, award cache, public map event, and applicant/admin result read paths. Production-like results routes now use a PostgreSQL DB-first repository instead of PostgreSQL-hydrated mutable Maps and whole-store flushes.

## Files Changed

- `apps/api/src/postgres-domain-stores/results-repository.ts`
- `apps/api/src/results/routes.ts`
- `apps/api/src/app.ts`
- `apps/api/src/index.ts`
- `apps/api/src/postgres-runtime.ts`
- `apps/api/src/runtime-safety.ts`
- `apps/api/src/app.test.ts`
- `apps/api/src/postgres-domain-stores.integration.test.ts`
- `docs/implementation/working/pass-2d-results-db-first-report.md`

Pre-existing dirty files remain in the worktree, including Pass 2C communications files and documentation/source artifacts. I did not revert or intentionally modify unrelated dirty files.

## Migrations Added

None. Existing S12/S12.5 schema already provided `decision_results.version`, `result_artifacts`, `park_award_cache`, `public_map_update_events`, and assessment/result lookup indexes sufficient for this pass.

## Paths Converted

- Admin result detail read.
- Applicant result read/projection.
- Hold/confirm decision result.
- Threshold acknowledgement as part of the existing hold request model.
- Full Assessment held result followed by batch publication.
- Mystery result individual publication.
- Result withdrawal.
- Certificate shell/result artifact row creation where currently modeled.
- Award cache upsert/delete.
- Public map update event creation.

No real certificate generation, public map provider, notification provider, official scoring text, applicant bands, certificate wording, or frontend work was added. Result publication did not enqueue notification/job rows because the existing result publication route did not model that side effect; communications/job rows remain under the Pass 2C repository.

## DB-First Enforcement

- Added `PostgresResultsRepository`.
- `createPostgresApiRuntime` now creates `resultsRepository`.
- `index.ts` passes `resultsRepository` to `buildApp`.
- `buildApp({ productionLike: true })` now rejects mounted results stores without a DB-first results repository.
- Results routes branch to repository methods before legacy Map code.
- Runtime safety messaging now names results as part of the mutable-store production risk.

## Whole-Store Flush Avoidance

Converted production-like result routes do not call `resultsStore.withTransaction` or `flushResultsStore`. Those remain only in the lower-env/test Map compatibility path. `app.test.ts` includes a regression proving the repository path is used even when the lower-env store transaction would throw.

## Submitted Assessment State

Hold/confirm reads submitted `judge_assessments` rows directly from PostgreSQL inside the transaction and locks them with `FOR UPDATE`. Assessment submit remains unchanged: Pass 2B behavior still sets `judge_assessments.status = 'SUBMITTED'` and does not create decision/result rows.

## Publication Behavior

- Full Assessment: hold creates `CONFIRMED_HELD`; publish requires `releaseMode: "full_batch"`.
- Mystery Shop: hold creates `CONFIRMED_HELD`; publish requires `releaseMode: "single"`.
- Episode type comes from `assessment_episodes.episode_type`.
- Publish creates a provider-neutral certificate shell artifact row, award cache row, and public map update event row.
- Withdraw sets the decision to `WITHDRAWN`, deletes the award cache row, updates the episode to `WITHDRAWN`, and creates an `award_withdrawn` public map event.

## Safety And Redaction

Applicant result reads are DB-backed and expose only `episodeId`, `parkId`, safe publication status, and safe display label. The converted applicant projection does not expose raw scores, subcriterion scores, judge identities, visit dates, assignment state, internal notes, evidence internals, storage keys, message metadata, or Mystery metadata. Certificate artifact rows are admin-visible in result detail; applicant projection withholds artifact provider/key internals because the current shared certificate DTO would otherwise expose a storage provider marker.

Public map event payloads contain only `{ parkId, displayLabel, published }`. Tests assert the payload does not include raw scores, judges, visit data, assessment internals, storage information, or Mystery operational metadata.

## Concurrency And Audit

- `UnitOfWork.run` wraps all result mutations.
- `PostgresAuditLedger` participates in the active transaction.
- Hold locks `assessment_episodes`, existing `decision_results`, and submitted `judge_assessments`.
- Publish/withdraw lock the current `decision_results` row and use status/version constrained `UPDATE ... RETURNING`.
- Two independent runtimes cannot double-publish: one publish succeeds and the stale concurrent publish receives `409`; side effects remain single-row.
- Forced audit failure rolls back hold rows and publish side effects, including artifact, award cache, and public map event rows.

## Tests Added/Updated

- Runtime construction guard for production-like results repository.
- Regression test that converted results routes do not call the Map store transaction/flush path.
- PostgreSQL integration coverage for:
  - held decision persistence across cold start;
  - submitted assessment input consumption;
  - threshold acknowledgement with below-threshold Mystery result;
  - Full Assessment held then batch publish;
  - Mystery individual publish;
  - certificate/artifact rows;
  - public map publish/withdraw events;
  - applicant-safe projection and missing applicant band safety;
  - public map payload leak checks;
  - independent-runtime double-publish protection;
  - forced audit rollback for hold and publish side effects;
  - withdrawal projection/cache cleanup.

## Verification Results

- `git status --short` before implementation: dirty worktree with existing modified API/docs files and untracked Pass 2C/report/source artifacts; no `results-repository.ts` or Pass 2D report yet.
- `corepack pnpm lint`: passed.
- `corepack pnpm test`: passed, 98 tests passed; 25 PostgreSQL integration tests skipped in the normal non-DB run.
- `corepack pnpm db:integration:test`: passed, 25 PostgreSQL integration tests passed.
- `corepack pnpm --filter @green-flag/api typecheck`: passed.
- `corepack pnpm --filter @green-flag/db typecheck`: passed.
- `corepack pnpm db:migrate:check`: passed, migration convention check passed for 19 files.
- `corepack pnpm db:seed:check`: passed, lower-env seed safety check passed for 11 files.
- `corepack pnpm contracts:check`: passed, 17 contract tests passed.
- `corepack pnpm openapi:check`: passed.

The prior `pg` same-client concurrent-query deprecation warning did not appear during the Pass 2D `db:integration:test` runs. Status: not observed, not increased.

## Remaining Caveats

- Legacy results Map/flush compatibility remains for explicit local/test/lower-env wiring.
- Applicant certificate artifact projection is intentionally withheld in the DB-first path until a safe public DTO can expose certificate availability without provider/key internals.
- Result publication still uses lower-env certificate shell metadata rows and does not generate documents.
- Result publication does not enqueue notifications/jobs because that side effect was not present in the existing result route model.
- No official applicant bands, scoring text, certificate wording, public result wording, provider integration, outbox framework, frontend code, or legacy schema/import work was introduced.

## Repository Mutation Summary

`git status --short` after implementation remains dirty with pre-existing modified/untracked files plus the Pass 2D changes listed above. No files were staged or committed.
