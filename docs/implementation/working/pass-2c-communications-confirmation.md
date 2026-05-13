# Pass 2C Communications Confirmation

Date: 2026-05-08

## 1. Executive verdict

Mostly closed with caveats.

Pass 2C confirms the converted communications/message paths are DB-first for production-like local runtime. `buildApp` rejects production/staging-style communications store wiring without a DB-first repository, `index.ts` wires the PostgreSQL communications repository, and converted route handlers call the repository before any legacy Map path. Mystery message suppression is now episode-aware and fixes the admin-created Mystery message leakage path.

The main caveat is audit coverage: representative message/export commands use `UnitOfWork` plus the transaction-aware audit ledger, but the converted notification dispatch-stub and renewal reminder mutations do not append audit events.

## 2. Evidence summary

- Production-like runtime is `NODE_ENV=production`, `API_RUNTIME_MODE=production`, or `API_RUNTIME_MODE=staging` in `apps/api/src/runtime-safety.ts:64-66`.
- Production-like route construction rejects missing communications repository at `apps/api/src/app.ts:93-111`, while preserving registration/applicant/assessor/allocation/assessment DB-first requirements in the same guard.
- Production runtime creates and passes `PostgresCommunicationsRepository` at `apps/api/src/postgres-runtime.ts:204-223` and `apps/api/src/index.ts:4-23`.
- Converted communications routes branch to repository methods before Map access at `apps/api/src/communications.ts:160-175`, `apps/api/src/communications.ts:200-228`, `apps/api/src/communications.ts:275-291`, and `apps/api/src/communications.ts:324-368`.
- Legacy `communicationsStore.withTransaction` / Map mutations remain only after the repository branch in `apps/api/src/communications.ts:184-197`, `apps/api/src/communications.ts:258-270`, `apps/api/src/communications.ts:296-321`, and `apps/api/src/communications.ts:351-363`.
- Whole-store flush still exists only in the compatibility transaction installer at `apps/api/src/postgres-domain-stores/transactions.ts:134-138`; app regression coverage proves repository preference over store flush at `apps/api/src/app.test.ts:119-153`.
- Mystery suppression loads `assessment_episodes.episode_type` / `mystery_suppressed` with optional row lock at `apps/api/src/postgres-domain-stores/communications-repository.ts:213-242`, suppresses any Mystery-linked thread at `apps/api/src/postgres-domain-stores/communications-repository.ts:385-421`, and applicant listings filter Mystery/suppressed rows server-side at `apps/api/src/postgres-domain-stores/communications-repository.ts:334-372`.
- DB-backed cold-start, admin/applicant Mystery suppression, multi-runtime visibility, and audit rollback tests are present at `apps/api/src/postgres-domain-stores.integration.test.ts:1674-1861`.
- Applicant repository no longer has the previously reported same-client `Promise.all`: `hydrateApplication` now awaits sections then fields sequentially at `apps/api/src/postgres-domain-stores/applicant-repository.ts:178-186`.
- Pass 2B preservation evidence remains: assessment GET returns a synthetic non-created draft at `apps/api/src/postgres-domain-stores/assessment-repository.ts:359-363`; submit only updates `judge_assessments.status = 'SUBMITTED'` at `apps/api/src/postgres-domain-stores/assessment-repository.ts:524-556`.

## 3. Findings

### Blocker

None.

### High risk

#### P2C-HIGH-001 - Some converted communications mutations still lack audit events

Evidence: `dispatchNotificationStub` updates `notification_queue` and inserts `notification_logs` inside `UnitOfWork.run` without appending audit at `apps/api/src/postgres-domain-stores/communications-repository.ts:306-331`. `runRenewalReminders` inserts `notification_queue` and `job_runs` rows without audit at `apps/api/src/postgres-domain-stores/communications-repository.ts:449-494`. By contrast, thread creation and export creation append audit inside the same transaction at `apps/api/src/postgres-domain-stores/communications-repository.ts:375-435` and `apps/api/src/postgres-domain-stores/communications-repository.ts:521-556`.

What it means: The representative audited message/export paths are transactional, and forced audit failure rolls back message rows in `apps/api/src/postgres-domain-stores.integration.test.ts:1831-1861`. However, two data-changing converted communications operations persist domain/log/job state without audit coverage, which is weaker than the repo-wide audit invariant.

Recommended next action: Add audit events and rollback tests for dispatch-stub and renewal-reminder commands in a corrective hardening pass.

Safe to proceed to Pass 2D: Conditional.

### Medium risk

#### P2C-MED-001 - Applicant message DTO still exposes shared thread/message metadata fields

Evidence: The shared message schemas include `episodeId`, `participantActorIds`, `visibleToApplicant`, and `senderActorId` at `packages/contracts/src/schemas.ts:1344-1361`. Applicant DB-first listings return the same schemas after server-side filtering at `apps/api/src/postgres-domain-stores/communications-repository.ts:370-372`.

What it means: Applicant Mystery listings do not expose hidden Mystery message details, `episode_type`, assignment state, judge count, visit dates, assessment timestamps, suppressed notification details, or internal suppression rows. Still, the DTO is not a purpose-built applicant projection; it exposes operational actor/visibility metadata for non-suppressed threads.

Recommended next action: In a contract-managed hardening pass, split applicant/org message projections from admin/internal thread DTOs or explicitly approve the existing shared fields.

Safe to proceed to Pass 2D: Conditional.

#### P2C-MED-002 - Admin message listing remains coarse-grained by admin role

Evidence: `listAdminMessages` requires an admin role but returns all message threads/messages at `apps/api/src/postgres-domain-stores/communications-repository.ts:438-446`; `requireAdmin` includes `SUPER_ADMIN`, `KBT_ADMIN`, and `FINANCE_ADMIN` at `apps/api/src/postgres-domain-stores/communications-repository.ts:85-88`.

What it means: This appears to preserve the existing backend rule shape rather than introduce a Pass 2C regression, but it is not resource-scoped on read the way message creation is scoped through `ensureAccess` at `apps/api/src/postgres-domain-stores/communications-repository.ts:377-383`.

Recommended next action: Before broad admin rollout, clarify whether finance/country/org-scoped admin users should see all message threads or only scoped resources.

Safe to proceed to Pass 2D: Conditional.

### Low risk / improvement

#### P2C-LOW-001 - `message_threads.version` is present but not yet used for API-level optimistic message mutations

Evidence: Migration `packages/db/migrations/0019_communications_db_first_safety.sql:3-16` adds `message_threads.version` and indexes. The only current version mutation observed in tests is a direct DB-side suppression update at `apps/api/src/postgres-domain-stores.integration.test.ts:1816-1819`; no reply/update route exists in this snapshot.

What it means: This is acceptable for Pass 2C because thread creation is insert-only and visibility reads are DB-current. Future reply/visibility commands should use the version column or row locks.

Recommended next action: Require optimistic checks or row locks when adding mutable thread/message follow-up commands.

Safe to proceed to Pass 2D: Yes.

## 4. Pass 2D readiness decision

Proceed to Pass 2D with tightened prompt.

Pass 2D can rely on DB-first communications/message storage, server-side Mystery message suppression, DB-current applicant/admin message reads, provider-neutral notification/log/job/export rows, and no real provider dispatch. It should not rely on dispatch-stub or renewal-reminder audit completeness until corrected.

## 5. Pass 2D implementation notes

- Assessment submit state after Pass 2B is `judge_assessments.status = 'SUBMITTED'`; GET does not create assessment rows, and submit requires accepted assignment access plus version checks.
- Assessment submit does not create or update `decision_results`, result draft rows, or task rows in the inspected Pass 2B repository path.
- Result publication may read communications/notification rows as provider-neutral state, but must not assume real SES/SMS/provider delivery or a durable outbox worker.
- Mystery result publication must preserve episode-first redaction: suppress applicant/org-facing Mystery assignment, visit, judge, assessment timestamp, message, notification, export, and status-label details server-side.
- Pass 2D prompt should carry the audit caveat for dispatch/reminder commands, avoid exposing shared internal message metadata to applicant/org result surfaces, and keep official scoring criteria, applicant bands, fee/VAT/legal wording, provider credentials, and KBT approvals external.

## 6. Mutation check

`git status --short` before writing this report showed a pre-existing dirty workspace, including modified Pass 2C source/test/runtime files, untracked `apps/api/src/postgres-domain-stores/communications-repository.ts`, untracked `packages/db/migrations/0019_communications_db_first_safety.sql`, and prior working reports. No frontend files, OpenAPI files, package files, lock files, generated clients, fixtures, seed files, configs, or snapshots were modified by this checkpoint.

`git status --short` after writing this report showed the same pre-existing dirty workspace plus this new untracked report:

- `docs/implementation/working/pass-2c-communications-confirmation.md`

No source code, migrations, tests, OpenAPI/contracts, package files, lock files, generated clients, fixtures, seed files, configs, snapshots, frontend files, or destructive commands were changed by this checkpoint.
