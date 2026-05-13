# Pass 2B Assessment Confirmation

Date: 2026-05-07

## 1. Executive verdict

Mostly closed with caveats.

Pass 2B converted the inspected assessment, visit, evidence metadata, score update, and submit command paths to DB-first PostgreSQL persistence for production-like local runtime. The production/staging-style runtime guard is present, converted routes branch to `AssessmentRepository` before legacy Map mutation, command writes use `UnitOfWork`, and reads no longer lazily create assessment rows.

The remaining caveats are not blockers for Pass 2B scope: existing assessment DTOs still expose `storageProvider` / `storageKey`, audit rollback is directly tested for visit scheduling but inferred for other assessment commands through shared transaction structure, and the prior `pg` concurrent-query warning was not reproduced in the Pass 2B report but a separate applicant repository `Promise.all` pattern remains.

## 2. Evidence summary

- Production-like DB-first guard: `apps/api/src/app.ts:90-105` rejects production-like store wiring without DB-first repositories, including `assessmentRepository` at `apps/api/src/app.ts:103-104`.
- Production runtime wiring: `apps/api/src/index.ts:4-22` passes all PostgreSQL repositories and stores into `buildApp` with `productionLike: true`; `apps/api/src/postgres-runtime.ts:185-226` constructs `PostgresAssessmentRepository`.
- Converted route branching: `apps/api/src/assessment.ts:189-240`, `apps/api/src/assessment.ts:243-333`, and `apps/api/src/assessment.ts:336-345` call repository methods before legacy Map paths.
- DB-first repository behavior: `apps/api/src/postgres-domain-stores/assessment-repository.ts:359-596` implements reads and commands against PostgreSQL rows.
- GET/read safety: `apps/api/src/postgres-domain-stores/assessment-repository.ts:359-364` returns a synthetic `NOT_STARTED` projection when no row exists; integration test confirms no `judge_assessments` row after GET at `apps/api/src/postgres-domain-stores.integration.test.ts:979-984`.
- Access checks: `apps/api/src/postgres-domain-stores/assessment-repository.ts:139-181` loads assignment status from PostgreSQL; `apps/api/src/postgres-domain-stores/assessment-repository.ts:96-100` requires `ACCEPTED` for mutations.
- Concurrency and constraints: row locks and version checks appear at `apps/api/src/postgres-domain-stores/assessment-repository.ts:370-375`, `apps/api/src/postgres-domain-stores/assessment-repository.ts:441-465`, and `apps/api/src/postgres-domain-stores/assessment-repository.ts:524-544`; constraints/indexes are in `packages/db/migrations/0011_visits_assessment_scoring_framework.sql:31-78`, `packages/db/migrations/0013_postgres_read_model_normalisation_hardening.sql:4-12`, and `packages/db/migrations/0018_assessment_db_first_safety.sql:3-10`.
- Audit transactionality: assessment writes and `appendAuditEvent` run inside `UnitOfWork.run` in `apps/api/src/postgres-domain-stores/assessment-repository.ts:366-437`, `apps/api/src/postgres-domain-stores/assessment-repository.ts:439-488`, `apps/api/src/postgres-domain-stores/assessment-repository.ts:490-522`, and `apps/api/src/postgres-domain-stores/assessment-repository.ts:524-558`; `PostgresAuditLedger` uses the current transaction client at `apps/api/src/postgres-runtime.ts:104-167`.
- Regression preservation: runtime and repository tests cover production-like guards, registration verification-token behavior, applicant DB-first commands, allocation/assessor DB-first paths, stale updates, and audit rollback in `apps/api/src/app.test.ts:74-109` and `apps/api/src/postgres-domain-stores.integration.test.ts:498-1207`.

## 3. Findings

### Blocker

None.

### High risk

None.

### Medium risk

#### P2B-MED-001 - Existing assessment evidence DTO still exposes storage internals

Evidence: DB-first row mapping returns `storageProvider` and `storageKey` at `apps/api/src/postgres-domain-stores/assessment-repository.ts:221-229`; evidence insert still stores `storage_provider` and `storage_key` at `apps/api/src/postgres-domain-stores/assessment-repository.ts:498-504`. The implementation report also records this caveat at `docs/implementation/working/pass-2b-assessment-db-first-report.md:85` and `docs/implementation/working/pass-2b-assessment-db-first-report.md:134`.

What it means: Pass 2B avoids raw provider object keys by using a metadata-only opaque key, and applicant dashboard regression checks do not expose evidence filename or assessment internals. However, the admin/judge DTO shape still contains provider/key fields, so the public contract surface has not been fully hardened against storage implementation leakage.

Recommended next action: Carry a Pass 2C prompt constraint to preserve applicant/org redaction and either formally keep these fields as internal admin/judge metadata or replace them with safer evidence metadata in a contract-managed change.

Safe to proceed to Pass 2C: Conditional.

#### P2B-MED-002 - `pg` warning not reproduced, but one same-client concurrent query pattern remains outside assessment

Evidence: Pass 2A recorded the warning in `docs/implementation/working/pass-2a-allocation-assessor-confirmation.md:40-46`. Pass 2B says the DB integration run did not reproduce it at `docs/implementation/working/pass-2b-assessment-db-first-report.md:127-130`. The previously suspected allocation/assessor mappers now sequence queries at `apps/api/src/postgres-domain-stores/allocation-repository.ts:129-137` and `apps/api/src/postgres-domain-stores/assessor-repository.ts:70-88`, but `apps/api/src/postgres-domain-stores/applicant-repository.ts:178-188` still uses `Promise.all` over the same supplied SQL client.

What it means: The warning does not appear to remain in the Pass 2B reported test run and is not caused by the assessment repository. A same-client concurrent query source still exists in applicant hydration when invoked with a transaction client, so the underlying forward-compatibility risk may not be fully eliminated.

Recommended next action: Fix before or at the start of Pass 2C if Pass 2C touches applicant/domain repository hydration; otherwise schedule as a small hardening item before any `pg@9` upgrade. Use sequential awaits when the supplied client may be transaction-scoped.

Safe to proceed to Pass 2C: Conditional.

### Low risk / improvement

#### P2B-LOW-001 - Audit rollback is directly tested for visit scheduling, not every converted assessment command

Evidence: Forced audit failure rollback for assessment routes is tested with visit scheduling at `apps/api/src/postgres-domain-stores.integration.test.ts:1170-1206`. Score, evidence, and submit commands use the same `UnitOfWork.run` plus transaction-aware `PostgresAuditLedger` structure at `apps/api/src/postgres-domain-stores/assessment-repository.ts:439-558` and `apps/api/src/postgres-runtime.ts:104-167`.

What it means: There is strong structural evidence that domain and audit writes are transactional for all converted commands, but only one assessment command has a direct forced-audit-failure regression.

Recommended next action: Add targeted rollback tests for score/evidence/submit when next touching assessment integration tests; not required as a Pass 2B closure blocker.

Safe to proceed to Pass 2C: Yes.

#### P2B-LOW-002 - Access denial tests cover all mutation logic by code, but only schedule is tested across released/declined/withdrawn states

Evidence: `assertAccepted` is called by visit schedule, score update, evidence creation, and submit at `apps/api/src/postgres-domain-stores/assessment-repository.ts:366-369`, `apps/api/src/postgres-domain-stores/assessment-repository.ts:439-442`, `apps/api/src/postgres-domain-stores/assessment-repository.ts:490-493`, and `apps/api/src/postgres-domain-stores/assessment-repository.ts:524-527`. The explicit loop over released/declined/withdrawn assignments exercises schedule denial at `apps/api/src/postgres-domain-stores.integration.test.ts:1084-1118`.

What it means: The implementation is centralized and convincing, but the negative test matrix is thinner than the requirement wording.

Recommended next action: In Pass 2C or later hardening, expand the matrix to score/evidence/submit denial for released, declined, withdrawn, and replaced/removed-style states.

Safe to proceed to Pass 2C: Yes.

## 4. Pass 2C readiness decision

Proceed to Pass 2C with tightened prompt.

Recommended Pass 2C prompt constraints:

- Do not regress Pass 2B assessment repository routing, GET non-creation, accepted-assignment mutation checks, or UnitOfWork audit transactionality.
- Treat `storageProvider` / `storageKey` as internal-only until a contract-managed replacement is approved; do not expose raw provider internals to applicant/org-facing projections.
- Avoid same-client `Promise.all` inside transaction-scoped repository code.
- Preserve Pass 1B registration/applicant/document/payment DB-first paths, Pass 1C verification-token behavior, and Pass 2A allocation/assessor DB-first contact reveal rules.

## 5. Mutation check

Before writing this report, `git status --short` showed a pre-existing dirty workspace with modified backend/docs/contracts/OpenAPI/db files and many untracked slice artifacts, including `docs/implementation/working/pass-2b-assessment-db-first-report.md`. The requested confirmation report did not exist before this checkpoint.

After writing this report, `git status --short` shows the same pre-existing dirty workspace plus this new untracked report. The only additional file created by this checkpoint is:

- `docs/implementation/working/pass-2b-assessment-confirmation.md`

No source code, migrations, tests, OpenAPI/contracts, package files, lock files, generated clients, fixtures, seed files, configs, snapshots, frontend files, or destructive commands were changed by this checkpoint.
