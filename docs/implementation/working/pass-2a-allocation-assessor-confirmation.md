# Pass 2A allocation/assessor DB-first confirmation

## 1. Executive verdict

Not closed

The converted allocation and assessor command paths are substantially DB-first and episode-first, but this checkpoint cannot confirm Pass 2A as closed because `corepack pnpm db:integration:test` currently fails in the scoped integration file. The allocation/assessor-specific DB-first tests passed during that run, but the suite failure means the claim that verification passed is not true for this workspace state.

## 2. Evidence summary

- Production-like startup/wiring uses DB-first repositories: `apps/api/src/index.ts:5-21` passes `productionLike: true` plus registration, applicant, assessor, and allocation repositories; `apps/api/src/app.ts:87-99` throws if a production-like store is wired without its DB-first repository; `apps/api/src/postgres-runtime.ts:183-223` refuses missing production-like DB config and creates the DB-first repositories.
- Converted route handlers prefer repositories before Map paths: allocation routes branch to `repository.readyEpisodes`, `candidates`, `hold`, `release`, `reassign`, `listAssignments`, and `decideAssignment` at `apps/api/src/allocation/routes.ts:75-109`, `197-203`, `238-243`, and `286-332`; assessor profile/admin routes branch to repository methods at `apps/api/src/assessor.ts:225-243`, `261-292`, and `313-426`.
- Allocation repository commands use `UnitOfWork.run`, PostgreSQL rows, row locks, version checks, and same-transaction audit appends: see `apps/api/src/postgres-domain-stores/allocation-repository.ts:403-472`, `475-552`, and `596-668`.
- Assessor repository commands use `UnitOfWork.run`, row locks, version checks, child-table writes, and same-transaction audit appends: see `apps/api/src/postgres-domain-stores/assessor-repository.ts:236-282`, `285-341`, and `344-452`.
- Contact reveal uses PostgreSQL `assessment_episodes.episode_type`: `episodeContext` reads `ae.episode_type` at `apps/api/src/postgres-domain-stores/allocation-repository.ts:176-204`, and `revealFor` only reveals when the episode type is `FULL_ASSESSMENT` and all assignment rows are accepted at `apps/api/src/postgres-domain-stores/allocation-repository.ts:226-228`.
- Reassignment withdraws the replaced assignment and hides it from judge assignment reads: `apps/api/src/postgres-domain-stores/allocation-repository.ts:515-539` updates the replaced row to `WITHDRAWN` and inserts the replacement; `listAssignments` only returns `RELEASED`, `ACCEPTED`, or `DECLINED` assignments at `apps/api/src/postgres-domain-stores/allocation-repository.ts:555-593`.
- Runtime safety still covers Pass 1B and Pass 1C concerns: `apps/api/src/app.ts:87-99` includes registration/applicant guards, `apps/api/src/runtime-safety.ts:81-99` rejects missing DB or hydrated mutable stores in production-like mode, and `apps/api/src/postgres-runtime.ts:212-214` disables static lower-env verification tokens in production-like runtime.
- Tests include targeted coverage for DB-first allocation, Mystery contact hiding, stale multi-runtime assignment decisions, audit rollback, and stale assessor self updates at `apps/api/src/postgres-domain-stores.integration.test.ts:927-1275`. Those tests passed in the executed DB integration run.

## 3. Findings

### Blocker

#### P2A-BLOCKER-001 - `db:integration:test` currently fails

Evidence: `corepack pnpm db:integration:test` failed during this checkpoint with `TypeError: Assignment to constant variable.` in `apps/api/src/postgres-domain-stores.integration.test.ts:824`. The test declares `const app` at `apps/api/src/postgres-domain-stores.integration.test.ts:653-660` and later reassigns it at `apps/api/src/postgres-domain-stores.integration.test.ts:824-829`.

What it means: The Pass 2A report claim that DB integration verification passed is not valid for the current workspace. This is not in the allocation/assessor command logic itself, and the allocation/assessor tests in the same file passed, but a failing scoped integration suite blocks a clean close.

Recommended next action: Do a corrective Pass 2A-fix that changes the test variable shape only, then rerun `corepack pnpm db:integration:test`. Do not change production logic as part of that fix unless a rerun exposes a real logic failure.

Safe to proceed to Pass 2B: No

### High risk

None found in the converted allocation/assessor command implementation.

### Medium risk

#### P2A-MED-001 - `pg` concurrent-query deprecation warning reproduced

Evidence: The DB integration run emitted `DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0`. The most likely sources are repository mappers that call `Promise.all` with the same client: `allocationFromRow` at `apps/api/src/postgres-domain-stores/allocation-repository.ts:129-136` and `profileFromRow` at `apps/api/src/postgres-domain-stores/assessor-repository.ts:70-82`. These mappers are called from transaction-scoped code paths such as `loadAllocation(..., true)` and `loadProfileByActor(..., true)`.

What it means: This is not currently failing the suite, and PostgreSQL transactionality still works today, but it is a real forward-compatibility and diagnostic risk for `pg@9`. It is also avoidable: these child reads can be sequenced on the same transaction client without behavior changes.

Recommended next action: Fix before or at the very start of Pass 2B if Pass 2B will continue touching these repositories; otherwise schedule for hardening before any `pg@9` upgrade. Use sequential `await` on a transaction client.

Safe to proceed to Pass 2B: Conditional

#### P2A-MED-002 - Scope-control attribution is incomplete because the workspace was already broad and dirty

Evidence: The before-status for this checkpoint already included modified `openapi/openapi.json`, `packages/contracts/src/*`, `packages/db/*`, and many untracked backend/docs files. No `apps/web/*` files appeared in tracked or untracked status, but existing OpenAPI/contracts changes cannot be attributed or ruled out from this read-only checkpoint alone.

What it means: I can confirm this checkpoint did not edit OpenAPI/contracts/frontend code, and I found no evidence that Pass 2A moved lifecycle state into `applications`, cloned legacy schema lifecycle models, implemented provider integrations, or invented official scoring/fee/VAT/legal/provider values in the inspected Pass 2A files. I cannot certify that Pass 2A itself did not make DTO/OpenAPI changes without a clean baseline or pass-specific diff.

Recommended next action: Before Pass 2B, review the intended Pass 2A diff or commit range and explicitly classify OpenAPI/contracts changes as either pre-existing slice work or accidental Pass 2A scope creep.

Safe to proceed to Pass 2B: Conditional

### Low risk / improvement

#### P2A-LOW-001 - Legacy Map/flush compatibility still exists and must stay clearly lower-env only

Evidence: Map fallback branches remain in `apps/api/src/allocation/routes.ts:111-194`, `204-235`, `245-281`, and `334-377`, and assessor Map fallback branches remain in `apps/api/src/assessor.ts:245-258`, `268-310`, `336-374`, and `399-447`. Whole-store flushes remain in `apps/api/src/postgres-domain-stores/transactions.ts:104-117`. Production-like route construction rejects store-without-repository wiring at `apps/api/src/app.ts:87-99`, and runtime safety rejects canonical PostgreSQL-hydrated mutable stores at `apps/api/src/runtime-safety.ts:90-99`.

What it means: This is acceptable compatibility for local/test/lower-env route construction. The converted repository-backed paths do not call `store.withTransaction`, `flushAllocationStore`, or `flushAssessorStore`; the flushes are outside the converted repository code and behind compatibility store transactions.

Recommended next action: Keep the lower-env Map paths explicit until they are intentionally retired. Add no new production-like entry point that can bypass `buildApp(... productionLike: true)` or `createPostgresApiRuntime`.

Safe to proceed to Pass 2B: Yes

## 4. Pass 2B readiness decision

Do corrective Pass 2A-fix first

The implementation evidence supports the DB-first allocation/assessor architecture, contact reveal rules, reassignment revocation, row-lock/version/constraint approach, COI policy preservation, and same-transaction audit behavior. The current test failure is enough to stop closure until corrected and rerun.

## 5. Mutation check

Before writing this report, `git status --short` showed an already-dirty workspace with existing modified/untracked backend, docs, OpenAPI/contracts, migration, seed, and output files. The Pass 2A confirmation report file was not present in that before-status.

After writing this report, `git status --short` showed the same pre-existing modified/untracked workspace plus exactly one new checkpoint file: `?? docs/implementation/working/pass-2a-allocation-assessor-confirmation.md`.

Checkpoint mutation confirmation: only this report file was created by this checkpoint. No source code, migrations, tests, OpenAPI/contracts, package files, lock files, generated clients, fixtures, seed files, configs, or snapshots were edited by this checkpoint.
