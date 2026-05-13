# Pass 1 Runtime Persistence Checkpoint

## 1. Executive verdict

**Not closed.**

Pass 0/Pass 1 improved startup safety and transactional rollback behavior, but they did not close B-001's core production persistence risk. Production/staging currently fail closed, but mainly because lower-env provider guards always fire. The actual runtime persistence model still hydrates PostgreSQL rows into mutable process-local Maps, route handlers mutate those Maps, and PostgreSQL is updated afterward by domain-level flushes. That means PostgreSQL is not the canonical source of truth during the request, and multi-instance stale snapshot/last-writer-wins risks remain.

## 2. Findings

### Blocker

**B-001 - Mutable PostgreSQL-hydrated Maps remain the command runtime**

- Evidence:
  - `apps/api/src/postgres-domain-stores.ts:43-49` hydrates registration, applicant, assessor, allocation, assessment, results, and communications stores into runtime store objects.
  - `apps/api/src/postgres-domain-stores.ts:59` installs transactional flush wrappers around those stores.
  - `apps/api/src/postgres-domain-stores/transactions.ts:76-83` and `:90-97` run route work first, then call `flushRegistrationStore` or `flushApplicantStore`.
  - `apps/api/src/registration.ts:219-221`, `:318-320`, `:373-376`, `:412-414` mutate `store.records`/record objects inside route transactions.
  - `apps/api/src/applicant/routes.ts:114-117`, `:158-167`, `:269-271`, `:312-323`, `:428-442`, `:548-592`, `:671-678`, `:704-715`, `:752-764`, `:811-821` mutate process-local application/document/payment Maps before persistence.
  - `apps/api/src/postgres-domain-stores/registration.ts:70-172` flushes every registration record in the store.
  - `apps/api/src/postgres-domain-stores/applicant.ts:280-479` flushes all episode statuses, applications, sections/fields, feedback responses, documents, upload sessions/chunks, invoices, payment states, and override events.
- What it means:
  - Pass 1 reduced durability gaps for selected paths because flushes happen in a DB transaction, but it did not replace the map/flush architecture with command-scoped DB writes.
  - The flush is whole-store/domain-level, not exact-row/command-level.
  - During a request, the mutable in-process store is the canonical source; PostgreSQL becomes current only after flush.
- Recommended next action:
  - Do a corrective Pass 1B that replaces Pass 1 registration/applicant/document/payment command paths with transaction-scoped repository methods that read/write exact rows in PostgreSQL. Keep route-level DTO behavior stable.
- Safe to proceed to Pass 2: **No**.

**B-002 - Multi-instance stale snapshot overwrite risk remains**

- Evidence:
  - Hydration happens once at store creation (`apps/api/src/postgres-domain-stores.ts:43-49`).
  - Applicant autosave checks `input.clientVersion !== application.version` against the local Map object (`apps/api/src/applicant/routes.ts:150-158`), not against a locked/current DB row.
  - Flush SQL uses `ON CONFLICT ... DO UPDATE` without version predicates for applications/sections/payment state (`apps/api/src/postgres-domain-stores/applicant.ts:293-297`, `:307-311`, `:460-466`).
  - Flush deletes and reinserts child rows from the local snapshot for application field values, upload chunks, and payment notification intents (`apps/api/src/postgres-domain-stores/applicant.ts:323-342`, `:416-425`, `:439-448`).
  - No `SELECT ... FOR UPDATE` or DB-level optimistic `WHERE version = ...` pattern appears in the Pass 1 registration/applicant flush code.
- What it means:
  - Two API instances can hydrate the same entity, mutate independently, and later overwrite each other with stale local state.
  - Client-version checks reduce single-instance conflicts but do not protect against stale process snapshots.
- Recommended next action:
  - Add row-level locks or DB-enforced optimistic version checks inside command-scoped transactions. Avoid whole-store flushes that can replay stale sibling data.
- Safe to proceed to Pass 2: **No**.

### High risk

**H-001 - Production/staging fail closed today, but not specifically against PostgreSQL-hydrated mutable stores**

- Evidence:
  - Production-like mode includes `NODE_ENV=production`, `API_RUNTIME_MODE=production`, and `API_RUNTIME_MODE=staging` (`apps/api/src/runtime-safety.ts:47-49`).
  - Missing `DATABASE_URL` produces `in_memory_mutable_stores` (`apps/api/src/runtime-safety.ts:63-70`).
  - Even with `DATABASE_URL`, production-like startup appends lower-env provider issues (`apps/api/src/runtime-safety.ts:71`) and `createPostgresApiRuntime` calls the guard before creating the pool/stores (`apps/api/src/postgres-runtime.ts:175-205`).
  - Tests assert failure without DB and failure while lower-env providers remain wired (`apps/api/src/runtime-safety.test.ts:24-35`; `apps/api/src/postgres-runtime.test.ts:21-35`).
- What it means:
  - Production/staging currently do not allow the API to reach the PostgreSQL-hydrated mutable-store runtime because the broader lower-env guard blocks startup.
  - However, the guard does not identify "PostgreSQL-hydrated mutable stores as canonical production runtime" as its own unsafe configuration. If lower-env provider issues are cleared first, the map/flush model could become production-eligible.
- Recommended next action:
  - Add an explicit runtime safety issue or architecture gate for mutable PostgreSQL-hydrated domain stores until command-scoped DB repositories exist.
- Safe to proceed to Pass 2: **No**.

**H-002 - Manual payment MVP appears blocked by the production guard**

- Evidence:
  - The gap register allows `Manual mark-paid MVP; provider automation feature-flagged` (`docs/implementation/gap-register.md:13`).
  - The runtime guard unconditionally treats payments/invoices as a production-like startup issue because "Payment handling is a lower-env/manual shell" and there is no production provider (`apps/api/src/runtime-safety.ts:22-25`).
  - The manual mark-paid route itself exists and mutates invoice/payment state (`apps/api/src/applicant/routes.ts:692-735`), and integration tests cover durable manual mark-paid (`apps/api/src/postgres-domain-stores.integration.test.ts:640-648`, `:662-666`).
- What it means:
  - Pass 0 appears to block production/staging startup before the MVP manual mark-paid path can be used.
  - The guard should block fake fee/invoice/provider automation and online card shells, not an approved manual mark-paid MVP path.
- Recommended next action:
  - Split payment safety checks: keep provider automation/fee/legal wording gated, but allow explicitly configured manual mark-paid MVP if product accepts it for launch.
- Safe to proceed to Pass 2: **Conditional** only if Pass 2 does not require production-like startup or payment launch readiness.

### Medium risk

**M-001 - Audit and domain writes are transactional for covered Pass 1 paths, but through flush architecture**

- Evidence:
  - `PostgresAuditLedger` uses `unitOfWork.currentClient()` when available (`apps/api/src/postgres-runtime.ts:99-105`) and inserts into `audit_events` (`apps/api/src/postgres-runtime.ts:121-161`).
  - `UnitOfWork.run` wraps work in `BEGIN`/`COMMIT`/`ROLLBACK` (`packages/db/src/postgres.ts:53-57`, `:155-167`).
  - Registration/applicant flush wrappers run route work and flush inside the same `UnitOfWork` transaction (`apps/api/src/postgres-domain-stores/transactions.ts:76-97`).
  - Integration tests prove rollback when audit append fails for registration verify and applicant autosave (`apps/api/src/postgres-domain-stores.integration.test.ts:687-791`) and prove direct audit+domain rollback in one transaction (`apps/api/src/postgres-domain-stores.integration.test.ts:794-842`).
- What it means:
  - For the covered Pass 1 paths with the production runtime wiring, audit and domain DB changes generally commit or roll back together.
  - This is a meaningful improvement, but it is still built on route mutations against local Maps and later flush.
- Recommended next action:
  - Preserve the shared transaction behavior while moving persistence into command-scoped repositories.
- Safe to proceed to Pass 2: **Conditional**; only after B-001/B-002 are corrected or explicitly accepted.

**M-002 - Cold rehydrate tests are useful but do not prove multi-instance correctness**

- Evidence:
  - Integration setup recreates schema and runs migrations in a test database (`apps/api/src/postgres-domain-stores.integration.test.ts:220-224`).
  - Tests cover store round-trip/cold rehydrate (`apps/api/src/postgres-domain-stores.integration.test.ts:231-276`) and normalized rows (`:279-388`).
  - Route-level cold rehydrate tests cover registration submit/verify/approve/reject (`:391-490`) and applicant create, autosave, previous feedback, upload session, chunk ack, completion, submit, PO, deadline check, override, and manual mark-paid (`:492-685`).
- What it means:
  - Restart/cold rehydrate coverage is broad for Pass 1 command families.
  - The tests do not simulate two concurrently hydrated API instances mutating the same logical entity, so they do not prove stale snapshot safety.
- Recommended next action:
  - Add a DB integration test that creates two independently hydrated store bundles, mutates the same entity from both, and verifies DB-enforced conflict/locking behavior.
- Safe to proceed to Pass 2: **Conditional** only if multi-instance risk is accepted short-term; otherwise no.

### Low risk / improvement

**L-001 - DB integration tests are not part of normal `corepack pnpm test` and no CI workflow is present**

- Evidence:
  - Root `test` runs contract build plus `vitest run` only (`package.json:10`).
  - DB integration tests are a separate script (`package.json:15`) that runs `scripts/run-db-integration.mjs`.
  - The integration script starts Docker Postgres and runs only `apps/api/src/postgres-domain-stores.integration.test.ts` (`scripts/run-db-integration.mjs:54-60`).
  - `.github` directory is not present in this worktree, so no GitHub Actions workflow could be found.
- What it means:
  - `corepack pnpm db:integration:test` is not mandatory from repo scripts/CI evidence found here.
  - Future agents can pass normal `corepack pnpm test` while missing DB integration failures.
- Recommended next action:
  - Add an explicit CI gate or documented required check that runs `corepack pnpm db:integration:test` for persistence/runtime changes.
- Safe to proceed to Pass 2: **Conditional** if Pass 2 prompt requires DB integration explicitly; otherwise no.

**L-002 - PostgreSQL TLS hardening is closed for the inspected config path**

- Evidence:
  - `DATABASE_SSL_REJECT_UNAUTHORIZED=false` always throws (`packages/db/src/postgres.ts:83-88`).
  - `DATABASE_SSL_ALLOW_UNAUTHORIZED_LOCAL=true` throws in production/staging (`packages/db/src/postgres.ts:90-99`) and requires `DATABASE_SSL=true` (`:102-110`).
  - Verified TLS defaults to `{ rejectUnauthorized: true }` (`packages/db/src/postgres.ts:113-123`).
  - Tests cover production/staging refusal and local/test-only unsafe TLS (`packages/db/src/postgres.test.ts:82-113`).
- What it means:
  - Production/staging cannot configure `rejectUnauthorized: false` through these runtime config flags.
  - Unsafe TLS is limited to explicit local/test/lower-env modes.
- Recommended next action:
  - Keep this guard; no Pass 1B blocker.
- Safe to proceed to Pass 2: **Yes** for TLS only.

## 3. Pass 2 readiness decision

**Do corrective Pass 1B first.**

Pass 2 should not build on the assumption that B-001 is closed. The next prompt should require command-scoped PostgreSQL repositories for the Pass 1 registration/applicant/document/payment write paths, DB-enforced concurrency controls, and an explicit production guard against mutable PostgreSQL-hydrated stores until that replacement is complete.

## 4. Mutation check

- Before writing this report, `git status --short` showed a pre-existing dirty worktree with many modified/untracked source, docs, migration, and test files. The report file did not exist before this checkpoint.
- This checkpoint intentionally created only `docs/implementation/working/pass-1-runtime-persistence-checkpoint.md`.
- After writing, `git status --short` matched the pre-report dirty worktree plus one new path: `docs/implementation/working/pass-1-runtime-persistence-checkpoint.md`. No source, migration, test, contract, package, lock, config, fixture, seed, generated, or snapshot file was edited by this checkpoint.
