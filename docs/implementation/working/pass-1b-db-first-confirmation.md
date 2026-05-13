# Pass 1B DB-First Confirmation

## 1. Executive verdict

Mostly closed with caveats.

Pass 1B substantially closes B-001 for the named registration, applicant, document, and payment-facing command paths: production-like API startup wires PostgreSQL repositories, converted route handlers branch to repository methods before legacy Map mutations, and repository methods perform command-scoped PostgreSQL writes in `UnitOfWork` transactions. It should not be described as whole-backend production readiness.

The main caveat is that the DB-backed registration repository still generates and accepts the shared lower-env verification token form without an in-method production/staging gate. This does not undermine the DB-first persistence path, but it fails the lower-env static verification token check.

## 2. Evidence summary

- Production-like entrypoint wiring passes `productionLike: true`, `registrationRepository`, and `applicantRepository` into `buildApp` from the PostgreSQL runtime (`apps/api/src/index.ts:4`, `apps/api/src/index.ts:9`, `apps/api/src/index.ts:10`, `apps/api/src/index.ts:11`).
- `buildApp` rejects production-like registration/applicant store wiring when the corresponding DB-first repository is absent (`apps/api/src/app.ts:81`, `apps/api/src/app.ts:82`, `apps/api/src/app.ts:83`, `apps/api/src/app.ts:85`, `apps/api/src/app.ts:86`), with regression coverage in `apps/api/src/app.test.ts:71`.
- The named command routes all check `if (repository)` before the legacy Map branch and call repository methods for create registration, verify email, approve, reject, create application, autosave, feedback, upload session, chunk acknowledgement, upload complete, submit, PO update, deadline check, override, and mark-paid (`apps/api/src/registration.ts:183`, `apps/api/src/registration.ts:186`, `apps/api/src/registration.ts:312`, `apps/api/src/registration.ts:315`, `apps/api/src/registration.ts:388`, `apps/api/src/registration.ts:392`, `apps/api/src/registration.ts:434`, `apps/api/src/registration.ts:440`, `apps/api/src/applicant/routes.ts:93`, `apps/api/src/applicant/routes.ts:96`, `apps/api/src/applicant/routes.ts:172`, `apps/api/src/applicant/routes.ts:176`, `apps/api/src/applicant/routes.ts:234`, `apps/api/src/applicant/routes.ts:238`, `apps/api/src/applicant/routes.ts:295`, `apps/api/src/applicant/routes.ts:299`, `apps/api/src/applicant/routes.ts:365`, `apps/api/src/applicant/routes.ts:369`, `apps/api/src/applicant/routes.ts:438`, `apps/api/src/applicant/routes.ts:442`, `apps/api/src/applicant/routes.ts:650`, `apps/api/src/applicant/routes.ts:654`, `apps/api/src/applicant/routes.ts:815`, `apps/api/src/applicant/routes.ts:819`, `apps/api/src/applicant/routes.ts:861`, `apps/api/src/applicant/routes.ts:865`, `apps/api/src/applicant/routes.ts:916`, `apps/api/src/applicant/routes.ts:923`, `apps/api/src/applicant/routes.ts:988`, `apps/api/src/applicant/routes.ts:994`).
- Repository methods use `unitOfWork.run` and direct SQL rather than `store.withTransaction`, `flushRegistrationStore`, or `flushApplicantStore`; legacy flush installation remains in `apps/api/src/postgres-domain-stores/transactions.ts:66` for lower-env/test and later non-converted store-backed domains.
- `PostgresAuditLedger` writes through `unitOfWork.currentClient()` when present (`apps/api/src/postgres-runtime.ts:101`, `apps/api/src/postgres-runtime.ts:107`), and `UnitOfWork` uses `BEGIN`/`COMMIT`/`ROLLBACK` (`packages/db/src/postgres.ts:53`, `packages/db/src/postgres.ts:155`, `packages/db/src/postgres.ts:158`, `packages/db/src/postgres.ts:160`, `packages/db/src/postgres.ts:163`).
- Integration tests cover cold-start durability, stale multi-instance autosave conflict, and rollback of domain plus audit work (`apps/api/src/postgres-domain-stores.integration.test.ts:393`, `apps/api/src/postgres-domain-stores.integration.test.ts:497`, `apps/api/src/postgres-domain-stores.integration.test.ts:695`, `apps/api/src/postgres-domain-stores.integration.test.ts:784`, `apps/api/src/postgres-domain-stores.integration.test.ts:893`).

## 3. Findings

### Blocker

None for the DB-first B-001 Pass 1 scope.

### High risk

ID: H-001

Title: Shared lower-env verification token is accepted by the DB-backed registration repository.

Evidence: `PostgresRegistrationRepository.submit` stores tokens as `lower-env-verification-token:${registrationId}` (`apps/api/src/postgres-domain-stores/registration-repository.ts:281`, `apps/api/src/postgres-domain-stores/registration-repository.ts:318`, `apps/api/src/postgres-domain-stores/registration-repository.ts:324`). `verifyEmail` accepts either the exact stored token or the shared token when the stored token starts with that prefix (`apps/api/src/postgres-domain-stores/registration-repository.ts:426`, `apps/api/src/postgres-domain-stores/registration-repository.ts:427`, `apps/api/src/postgres-domain-stores/registration-repository.ts:428`). DB integration tests exercise the shared token against the repository path (`apps/api/src/postgres-domain-stores.integration.test.ts:420`, `apps/api/src/postgres-domain-stores.integration.test.ts:423`, `apps/api/src/postgres-domain-stores.integration.test.ts:822`, `apps/api/src/postgres-domain-stores.integration.test.ts:825`).

What it means: The converted route is DB-first, but lower-env static token compatibility is not scoped inside the repository to test/lower-env modes. Production-like startup is currently fail-closed for other lower-env provider reasons, but once those broader guards are relaxed this method would still accept the shared token unless explicitly gated.

Recommended next action: In a corrective prompt, require environment-aware verification token handling so `API_RUNTIME_MODE=staging`, `API_RUNTIME_MODE=production`, or `NODE_ENV=production` rejects shared/static lower-env tokens while retaining explicit local/test compatibility.

Safe to proceed to Pass 2: Conditional.

### Medium risk

ID: M-001

Title: Upload session idempotency relies on a unique index but lacks a repository-level replay/collision path.

Evidence: Migration 0016 adds `ux_document_upload_sessions_idempotency_key` on `(application_id, idempotency_key)` only when an idempotency key exists (`packages/db/migrations/0016_db_first_persistence_safety_indexes.sql:12`, `packages/db/migrations/0016_db_first_persistence_safety_indexes.sql:13`, `packages/db/migrations/0016_db_first_persistence_safety_indexes.sql:14`). `createUploadSession` checks for an existing active same-hash session with `FOR UPDATE`, then inserts the idempotency key (`apps/api/src/postgres-domain-stores/applicant-repository.ts:626`, `apps/api/src/postgres-domain-stores/applicant-repository.ts:632`, `apps/api/src/postgres-domain-stores/applicant-repository.ts:642`, `apps/api/src/postgres-domain-stores/applicant-repository.ts:646`, `apps/api/src/postgres-domain-stores/applicant-repository.ts:659`) but does not use `ON CONFLICT` or a catch-and-reload path for concurrent identical idempotency keys.

What it means: This is still DB-backed and corruption-resistant, but a concurrent replay with the same idempotency key could surface as an unhandled database uniqueness error rather than an idempotent response. Same-hash active sessions without an idempotency key are indexed but not unique by design.

Recommended next action: In a later hardening pass, add repository-level idempotent replay handling for upload-session creation while preserving the narrow idempotency-key uniqueness.

Safe to proceed to Pass 2: Yes, with a hardening note.

ID: M-002

Title: Legacy transactional flushes remain installed for the hydrated stores, though converted command routes bypass them when repositories are present.

Evidence: `createPostgresDomainStores` always calls `installTransactionalFlushes` (`apps/api/src/postgres-domain-stores.ts:59`). That installer still defines `registrationStore.withTransaction` and `applicantStore.withTransaction` around whole-store flushes (`apps/api/src/postgres-domain-stores/transactions.ts:76`, `apps/api/src/postgres-domain-stores/transactions.ts:81`, `apps/api/src/postgres-domain-stores/transactions.ts:90`, `apps/api/src/postgres-domain-stores/transactions.ts:95`). The converted route handlers branch to repository methods first, so these flushes are not used for the named command routes when production-like repositories are wired.

What it means: Pass 1B did not remove the legacy flush mechanism from the backend. It only avoids it for the converted registration/applicant/document/payment command paths. This is consistent with the stated Pass 1 scope but should not be marketed as whole-backend persistence cleanup.

Recommended next action: Keep Pass 2 prompts explicit about which later domains still use legacy Map/flush paths, especially allocation, assessment, communications, results, and provider-facing work.

Safe to proceed to Pass 2: Yes.

### Low risk / improvement

ID: L-001

Title: `buildApp({ productionLike: true })` enforces repositories only when stores are supplied.

Evidence: The production-like checks throw when `registrationStore && !registrationRepository` or `applicantStore && !applicantRepository` (`apps/api/src/app.ts:81`, `apps/api/src/app.ts:82`, `apps/api/src/app.ts:85`). If neither store nor repository is supplied, the routes are simply not registered (`apps/api/src/app.ts:107`, `apps/api/src/app.ts:116`). The real production entrypoint does supply both repositories (`apps/api/src/index.ts:9`, `apps/api/src/index.ts:10`, `apps/api/src/index.ts:11`).

What it means: There is no silent Map fallback in the actual production-like entrypoint, but the guard is phrased as "if stores exist, repositories must exist" rather than "production-like registration/applicant routes require repositories unconditionally."

Recommended next action: Optional test/guard tightening only; not needed to confirm current DB-first production entrypoint wiring.

Safe to proceed to Pass 2: Yes.

ID: L-002

Title: No CI workflow was found for DB integration execution.

Evidence: The root scripts include `db:integration:test` (`package.json:15`), but no `.github` directory is present in this checkout.

What it means: Relevant tests exist, but this read-only checkpoint found no GitHub Actions workflow proving they run in CI from this workspace snapshot.

Recommended next action: Later process hardening can add or confirm CI coverage; do not broaden Pass 1B to CI implementation.

Safe to proceed to Pass 2: Yes.

## 4. Pass 2 readiness decision

Proceed to Pass 2 with tightened prompt.

The tightened Pass 2 prompt should explicitly preserve the DB-first repository path for registration/applicant/document/payment commands, avoid claiming whole-backend production readiness, keep later domains scoped to later passes, and carry forward a corrective requirement to gate shared lower-env verification tokens before any production/staging provider guards are relaxed.

## 5. Mutation check

Initial `git status --short` was already dirty before this checkpoint, including modified scoped files such as `apps/api/src/app.ts`, `apps/api/src/applicant.ts`, `apps/api/src/index.ts`, `apps/api/src/postgres-domain-stores.integration.test.ts`, `apps/api/src/postgres-domain-stores.ts`, `apps/api/src/postgres-runtime.ts`, `apps/api/src/registration.ts`, plus many untracked domain files and migrations. This checkpoint did not attempt to clean or revert pre-existing changes.

Final `git status --short` after writing this report showed the same pre-existing modified/untracked files, plus this new report:

- `?? docs/implementation/working/pass-1b-db-first-confirmation.md`

Confirmed checkpoint mutation scope: only this report file was created by this checkpoint. No source code, migrations, tests, OpenAPI/contracts, package files, lock files, generated clients, fixtures, seed files, configs, or snapshots were edited by this checkpoint.

No tests were run; this was a focused read-only code confirmation plus the requested report write.
