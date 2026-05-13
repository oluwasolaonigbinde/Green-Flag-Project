# Pass 2D Results Confirmation

Date: 2026-05-08

## 1. Executive verdict

Mostly closed with caveats.

Pass 2D is confirmed for the focused DB-first results scope in production-like local runtime. Converted result routes require and prefer the PostgreSQL results repository, do not use whole-store results flushes on the converted path, read submitted assessment state from PostgreSQL, enforce Full versus Mystery publication mode from `assessment_episodes.episode_type`, create result artifacts/award cache/public map event rows inside the command transaction, and keep applicant/public projections free of raw assessment and Mystery operational data.

The caveats are mostly future-shape and DTO hardening risks: the current schema remains one decision result per episode with no explicit republish/revision/history path, admin/internal result DTOs still expose raw scores and storage internals by design, and this confirmation did not rerun the full command suite or DB integration suite.

## 2. Evidence summary

- Production-like runtime is `NODE_ENV=production`, `API_RUNTIME_MODE=production`, or `API_RUNTIME_MODE=staging` in `apps/api/src/runtime-safety.ts:64-66`.
- `buildApp` rejects production-like results store wiring without a DB-first results repository at `apps/api/src/app.ts:96-117`, while preserving the prior registration/applicant/assessor/allocation/assessment/communications repository guards in the same block.
- Production runtime wires `resultsRepository` at `apps/api/src/index.ts:4-23` and constructs `PostgresResultsRepository` at `apps/api/src/postgres-runtime.ts:206-226`.
- Converted results routes call the repository before legacy Map code at `apps/api/src/results/routes.ts:47-68`, `apps/api/src/results/routes.ts:113-119`, `apps/api/src/results/routes.ts:195-201`, and `apps/api/src/results/routes.ts:235-239`.
- Legacy `resultsStore.withTransaction` calls remain only after the repository branch in the lower-env/test compatibility path at `apps/api/src/results/routes.ts:80-109`, `apps/api/src/results/routes.ts:134-191`, and `apps/api/src/results/routes.ts:205-230`.
- Whole-store `flushResultsStore` remains in the compatibility transaction adapter at `apps/api/src/postgres-domain-stores/transactions.ts:126-130`; app regression coverage proves the repository branch avoids that fallback at `apps/api/src/app.test.ts:163-194`.
- Result hold reads submitted PostgreSQL `judge_assessments` with `status = 'SUBMITTED'` and `FOR UPDATE` at `apps/api/src/postgres-domain-stores/results-repository.ts:242-263`; it does not depend on assessment Map state.
- Assessment submit preservation is supported by the prior Pass 2B confirmation, which recorded that submit updates `judge_assessments.status = 'SUBMITTED'` and does not create `decision_results`.
- Hold inserts `decision_results` and updates `assessment_episodes` inside `UnitOfWork.run`, then appends audit through the transaction-aware ledger at `apps/api/src/postgres-domain-stores/results-repository.ts:419-475` and `apps/api/src/postgres-runtime.ts:106-168`.
- Publication loads and locks the decision and episode context, enforces `full_batch` for Full Assessment and `single` for Mystery Shop, then inserts artifact/cache/public-map rows, updates the decision with a version check, and appends audit in the same transaction at `apps/api/src/postgres-domain-stores/results-repository.ts:478-575`.
- Withdrawal creates a provider-neutral `award_withdrawn` map event, version-checks the decision update, deletes only the targeted park award cache row, updates the episode, and appends audit at `apps/api/src/postgres-domain-stores/results-repository.ts:578-623`.
- Applicant result projection returns only episode id, park id, status, and safe display label at `apps/api/src/postgres-domain-stores/results-repository.ts:626-644`.
- Public map event payload schema is limited to `parkId`, `displayLabel`, and `published` at `packages/contracts/src/schemas.ts:1239-1251`; inserts use that provider-neutral payload at `apps/api/src/postgres-domain-stores/results-repository.ts:536-543` and `apps/api/src/postgres-domain-stores/results-repository.ts:586-594`.
- Integration tests cover Full batch publication, Mystery individual publication, applicant/public payload leak checks, independent-runtime double publish, forced audit rollback, and withdrawal/cache cleanup at `apps/api/src/postgres-domain-stores.integration.test.ts:1930-2248`.
- Static scan found no `Promise.all` in `apps/api/src/postgres-domain-stores/results-repository.ts`; remaining `Promise.all` hits are in tests only.
- Pass 2D reported no migration was added. The existing result tables and constraints are in `packages/db/migrations/0012_decisions_results_certificates_public_map_events.sql:3-62`, with read indexes in `packages/db/migrations/0013_postgres_read_model_normalisation_hardening.sql:24-26`.
- `git diff --name-only` shows no frontend, OpenAPI, contract, package, lock, generated client, fixture, seed, config, or snapshot file changed by tracked diffs for Pass 2D.

## 3. Findings

### Blocker

None.

### High risk

None.

### Medium risk

#### P2D-MED-001 - Future republish/revision/history shape is not confirmed by the current result schema

Evidence: `decision_results` has `UNIQUE (assessment_episode_id)` at `packages/db/migrations/0012_decisions_results_certificates_public_map_events.sql:22`. The DB-first hold path rejects any existing decision for an episode unless the same idempotent hold audit is being replayed at `apps/api/src/postgres-domain-stores/results-repository.ts:423-435`. Publication is allowed only from `CONFIRMED_HELD` at `apps/api/src/postgres-domain-stores/results-repository.ts:505`, and withdrawal moves the existing row to `WITHDRAWN` without a republish/archive/history path at `apps/api/src/postgres-domain-stores/results-repository.ts:595-609`.

What it means: Current Pass 2D behavior safely supports one held/published/withdrawn decision lifecycle per episode, including withdrawal. I cannot confirm that the constraints already support a future legitimate republish, archive, or result revision/history model without a contract-managed extension.

Recommended next action: Treat republish/revision/history as a future contract decision before adding those commands. If needed, add explicit history/revision tables or revision semantics without moving lifecycle ownership away from `assessment_episodes` and `decision_results`.

Safe to proceed to next hardening pass: Conditional.

#### P2D-MED-002 - Confirmation relies on reported DB test results; tests were not rerun in this read-only checkpoint

Evidence: The Pass 2D implementation report records passing lint, unit tests, DB integration tests, typechecks, migration/seed checks, contracts, and OpenAPI checks in `docs/implementation/working/pass-2d-results-db-first-report.md`. This confirmation used static inspection and did not rerun those commands. The reported prior `pg` same-client warning was "not observed"; static inspection found no `Promise.all` in `apps/api/src/postgres-domain-stores/results-repository.ts`.

What it means: The code evidence supports the report, and the results repository itself does not show the same-client concurrent-query pattern. Runtime warning status is not independently revalidated by this checkpoint.

Recommended next action: Re-run `corepack pnpm db:integration:test` in the next executable hardening checkpoint if fresh runtime evidence is required.

Safe to proceed to next hardening pass: Yes.

### Low risk / improvement

#### P2D-LOW-001 - Admin/internal result DTOs still expose raw scores and storage internals

Evidence: `decisionResultSchema` includes `rawScoreTotal`, `maxScoreTotal`, `thresholdMet`, and `internalNotes` at `packages/contracts/src/schemas.ts:1198-1216`; `resultArtifactSchema` includes `storageProvider` and `storageKey` at `packages/contracts/src/schemas.ts:1218-1227`. The DB repository maps artifact storage fields for admin/command responses at `apps/api/src/postgres-domain-stores/results-repository.ts:140-146`.

What it means: Applicant projections are safe, and admin/judge-only result detail is expected to contain operational detail. The shared DTOs should remain explicitly internal/admin-only; they are not suitable for applicant/org/public result projection without redaction.

Recommended next action: In storage/DTO hardening, split or label internal result artifact/admin decision DTOs so future applicant/public features cannot accidentally reuse them.

Safe to proceed to next hardening pass: Yes.

#### P2D-LOW-002 - Result publication intentionally does not enqueue notification/job rows

Evidence: The publication path inserts `result_artifacts`, `park_award_cache`, and `public_map_update_events`, updates `decision_results` and `assessment_episodes`, and appends audit at `apps/api/src/postgres-domain-stores/results-repository.ts:511-573`. There are no `notification_queue` or `job_runs` writes in that path. The Pass 2D report states result publication did not enqueue notification/job rows because that side effect was not present in the existing route model.

What it means: No provider dispatch, durable outbox, or broad idempotency framework was introduced. Transactional notification/job consistency is currently not applicable to result publication because no such rows are modeled there.

Recommended next action: If result-publication notifications are added later, add them inside the same `UnitOfWork` transaction as the decision/publication/audit rows and keep provider dispatch outside the command path.

Safe to proceed to next hardening pass: Yes.

## 4. Next readiness decision

Proceed to storage/DTO/RBAC/audit hardening.

## 5. Mutation check

`git status --short` before writing this report showed a pre-existing dirty workspace with modified backend/docs files and untracked Pass 2 reports/repositories/delivery records/source artifacts. The requested report did not exist before this checkpoint.

Before status included these tracked modifications: `apps/api/src/app.test.ts`, `apps/api/src/app.ts`, `apps/api/src/communications.ts`, `apps/api/src/index.ts`, `apps/api/src/postgres-domain-stores.integration.test.ts`, `apps/api/src/postgres-runtime.ts`, `apps/api/src/results/routes.ts`, `apps/api/src/runtime-safety.ts`, `docs/extract.mjs`, `docs/implementation/gap-register.md`, `docs/implementation/slice-backlog.yaml`, `docs/implementation/system_state.md`, `docs/implementation/working/current-implementation-review.md`, `docs/implementation/working/current-plan-review.md`, and `docs/implementation/working/current-plan.md`.

Before status also included untracked files, including `apps/api/src/postgres-domain-stores/communications-repository.ts`, `apps/api/src/postgres-domain-stores/results-repository.ts`, multiple S09-S14 delivery/contract docs, prior Pass 1/2 working reports, `docs/source/schema_GreenFlag_Live.md`, `docs/source/schema_KBT_GFA.md`, `output/`, and `packages/db/migrations/0019_communications_db_first_safety.sql`.

`git status --short` after writing this report showed the same pre-existing dirty workspace plus this new untracked report:

- `docs/implementation/working/pass-2d-results-confirmation.md`

Only this report file was intended to be created/modified by this checkpoint:

- `docs/implementation/working/pass-2d-results-confirmation.md`
