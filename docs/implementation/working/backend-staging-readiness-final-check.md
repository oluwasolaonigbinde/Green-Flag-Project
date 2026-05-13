# Backend Staging Readiness Final Check

Date: 2026-05-10  
Scope: read-only backend staging-readiness checkpoint. No fixes were implemented. No live AWS staging, production, shared UAT, or developer personal database was used. The clean migration apply check used the script's disposable local database path with explicit opt-in.

## 1. Executive verdict

Ready for AWS staging/UAT handoff with external gates

The backend is technically defensible for AWS staging/UAT handoff as an episode-first, DB-first PostgreSQL backend, with provider-backed actions and KBT/business inputs remaining external launch gates. All requested local verification commands passed, including DB integration and clean migration apply against a disposable local database.

This verdict does not mean production launch approval. It means the backend hardening passes can stop unless DevOps/UAT chooses to exercise a scope that requires currently external provider/KBT configuration.

## 2. What is confirmed closed

- Production-like command paths are DB-first for registration, applicant/application, document, payment/manual payment, allocation, assessor, assessment/visit/evidence/submit, communications/messages/jobs/exports/reminders, and results/decisions/publication/artifacts/public map events.
- Production-like startup rejects missing DB/runtime wiring and rejects canonical mutable PostgreSQL-hydrated Map stores (`apps/api/src/runtime-safety.ts:64`, `apps/api/src/runtime-safety.ts:82`, `apps/api/src/runtime-safety.ts:90`; `apps/api/src/app.ts:96`).
- The actual API entrypoint wires DB-first repositories for all converted backend families (`apps/api/src/index.ts:4`, `apps/api/src/index.ts:9`; `apps/api/src/postgres-runtime.ts:217`).
- Lower-env/static verification tokens are disabled in production-like runtime by repository construction (`apps/api/src/postgres-runtime.ts:209`, `apps/api/src/postgres-runtime.ts:218`), and DB integration covers rejection unless explicitly enabled.
- Applicant-facing document DTOs no longer expose storage provider/key fields (`packages/contracts/src/schemas.ts:530`, `packages/contracts/src/schemas.ts:615`, `packages/contracts/src/schemas.ts:632`).
- Applicant-facing message DTOs no longer expose participant actor IDs, sender actor IDs, or visibility flags (`packages/contracts/src/schemas.ts:1381`, `packages/contracts/src/schemas.ts:1391`, `apps/api/src/redaction.ts:156`).
- Applicant result projection remains safe and omits raw scores, internal notes, artifacts, evidence, judge, visit, assignment, storage, and Mystery metadata (`apps/api/src/postgres-domain-stores/results-repository.ts:655`).
- Admin/internal/judge DTOs still retain operational fields, but they are route-protected and scoped rather than reused for applicant/public projections.
- Mystery secrecy is enforced server-side across implemented allocation contact reveal, applicant documents, assessment/evidence projections, messages, notifications/jobs where implemented, applicant results, and public map event payloads.
- Tuple-aware authorization helpers are in place (`apps/api/src/authorization.ts:45`), with representative tests for read-only mutation denial, mixed-role/mixed-scope denial, and finance non-finance denial (`apps/api/src/hardening.test.ts:193`, `apps/api/src/hardening.test.ts:230`, `apps/api/src/hardening.test.ts:258`).
- Audit coverage exists for the implemented data-changing command families, including signed document access (`apps/api/src/postgres-domain-stores/applicant-repository.ts:941`, `apps/api/src/postgres-domain-stores/applicant-repository.ts:964`), notification dispatch-stub (`apps/api/src/postgres-domain-stores/communications-repository.ts:453`, `apps/api/src/postgres-domain-stores/communications-repository.ts:479`), and renewal reminders (`apps/api/src/postgres-domain-stores/communications-repository.ts:660`, `apps/api/src/postgres-domain-stores/communications-repository.ts:718`).
- Retry/idempotency protections are in place for upload session replay, result publish artifact/map side effects, renewal reminder run, export creation, and manual payment command paths.
- GitHub CI exists and provisions a disposable PostGIS PostgreSQL service without AWS/prod credentials (`.github/workflows/ci.yml:1`, `.github/workflows/ci.yml:15`, `.github/workflows/ci.yml:25`).
- Clean migration apply check exists, applies all migrations to a disposable local database, and refuses production/staging/shared markers (`scripts/check-clean-migration-apply.mjs:8`, `scripts/check-clean-migration-apply.mjs:16`, `scripts/check-clean-migration-apply.mjs:22`).

Verification commands run:

| Command | Result |
| --- | --- |
| `corepack pnpm lint` | Passed |
| `corepack pnpm test` | Passed, 104 tests passed; DB integration file skipped in unit run |
| `corepack pnpm db:integration:test` | Passed, 27 PostgreSQL integration tests passed |
| `corepack pnpm --filter @green-flag/api typecheck` | Passed |
| `corepack pnpm --filter @green-flag/db typecheck` | Passed |
| `corepack pnpm db:migrate:check` | Passed, 20 migration files checked |
| `corepack pnpm db:seed:check` | Passed, 11 lower-env seed files checked |
| `corepack pnpm contracts:check` | Passed, 17 contract tests passed |
| `corepack pnpm openapi:check` | Passed |
| `$env:ALLOW_MIGRATION_APPLY_TO_TEST_DATABASE='true'; corepack pnpm db:migration:apply:check` | Passed, 20 migrations applied to a disposable local database |

Additional clean-migration guard checks:

- `NODE_ENV=production` failed closed with `Clean migration apply check refuses production/staging runtime modes.`
- `TEST_DATABASE_URL=.../green_flag_staging` failed closed with a production-like marker refusal.

## 3. Findings

### Blocker

None.

### High risk

None.

### Medium risk

#### F-MED-001 - Production-like runtime intentionally fails closed until external provider/staging-safe configuration exists

Severity: Medium risk  
Category: external launch gate

Evidence:

- Runtime safety treats `NODE_ENV=production`, `API_RUNTIME_MODE=production`, and `API_RUNTIME_MODE=staging` as production-like (`apps/api/src/runtime-safety.ts:64`).
- Production-like mode blocks lower-env fixture providers, lower-env storage/certificate shells, notification dispatch stubs, export stubs, fake contact reveal, fake/lower-env payment, and missing invoice configuration (`apps/api/src/runtime-safety.ts:8`, `apps/api/src/runtime-safety.ts:41`, `apps/api/src/runtime-safety.ts:98`).
- Runtime tests confirm lower-env modes remain allowed while production/staging modes fail closed (`apps/api/src/runtime-safety.test.ts:13`, `apps/api/src/runtime-safety.test.ts:58`, `apps/api/src/postgres-runtime.test.ts:28`).

Why it matters:

AWS staging/UAT cannot simply set `API_RUNTIME_MODE=staging` and boot with lower-env providers. That is intentional safety behavior. DevOps must either supply approved staging-safe provider configuration/adapters or run a deliberately lower-env/manual-MVP UAT mode with provider-backed actions disabled.

Recommended action:

Treat provider configuration as the first DevOps/UAT handoff item. Do not weaken the fail-closed guard without replacing lower-env providers with approved staging-safe disabled or real adapters.

Must fix before AWS staging: Conditional  
Safe to defer beyond AWS staging: Conditional

#### F-MED-002 - Remote GitHub Actions evidence is still external to this local checkpoint

Severity: Medium risk  
Category: external launch gate

Evidence:

- CI workflow exists and runs lint, unit tests, DB integration tests, typechecks, migration/seed checks, contract/OpenAPI checks, and clean migration apply (`.github/workflows/ci.yml:43`, `.github/workflows/ci.yml:52`, `.github/workflows/ci.yml:55`, `.github/workflows/ci.yml:77`).
- This checkpoint ran the same command families locally; it did not observe a remote GitHub Actions run.

Why it matters:

Local passing checks are strong technical evidence, but DevOps should still capture a remote CI run before treating the branch as deployment-ready.

Recommended action:

Run the workflow in GitHub on the handoff branch and archive the run URL/result with the deployment ticket.

Must fix before AWS staging: Conditional  
Safe to defer beyond AWS staging: Conditional

### Low risk / improvement

#### F-LOW-001 - Renewal reminder notification-level dedupe remains explicit-idempotency-key scoped

Severity: Low risk / improvement  
Category: product decision

Evidence:

- Renewal reminder job runs dedupe by explicit idempotency key or run-date/cycle job key (`apps/api/src/postgres-domain-stores/communications-repository.ts:669`).
- Notification-level dedupe is only created when an explicit idempotency key is supplied (`apps/api/src/postgres-domain-stores/communications-repository.ts:672`).
- Pass B records the same caveat because a real certificate/park/episode/recipient/offset/expiry target model is not yet approved.

Why it matters:

For current provider-disabled UAT this is acceptable. A future automated renewal reminder provider may need target-level dedupe once KBT approves the real reminder target model.

Recommended action:

Keep current explicit-idempotency behavior for AWS staging. Add target-level reminder modeling only when the renewal recipient/offset/expiry contract is approved.

Must fix before AWS staging: No  
Safe to defer beyond AWS staging: Yes

### External launch gate

#### F-EXT-001 - External/KBT/provider launch inputs remain unsupplied by design

Severity: External launch gate  
Category: external launch gate

Evidence:

- Gap register records official scoring, applicant bands, fee/VAT/legal, Business Central, payment provider, SMS, public map, migration, governance, and launch-readiness dependencies as external (`docs/implementation/gap-register.md:8`).
- System state records production storage, payment provider automation, Business Central, production communication dispatch, approved copy, export delivery, and public-map worker automation as not implemented (`docs/implementation/system_state.md:82`).
- Production readiness checklist keeps these as provider/manual configuration gates, not backend completion gates (`docs/implementation/production-readiness-checklist.md:56`).

Why it matters:

The backend must not invent official scoring criteria, bands, fees, VAT/legal wording, certificate wording, provider credentials, or KBT approvals. These are not backend bugs, but they are launch/UAT scope gates.

Recommended action:

Track these as DevOps/product/KBT handoff gates and load them only as approved configuration/contracts.

Must fix before AWS staging: Conditional  
Safe to defer beyond AWS staging: Conditional

### Product decision

#### F-PD-001 - Republish/revision/history semantics remain a future product decision

Severity: Low risk / improvement  
Category: product decision

Evidence:

- Pass 2D confirmed current behavior supports one held/published/withdrawn decision lifecycle per assessment episode.
- Result publication and withdrawal paths are transactional and audited (`apps/api/src/postgres-domain-stores/results-repository.ts:493`, `apps/api/src/postgres-domain-stores/results-repository.ts:606`).
- Integration tests cover replay, double-publication conflict, publish audit rollback, and withdrawal (`apps/api/src/postgres-domain-stores.integration.test.ts:2086`, `apps/api/src/postgres-domain-stores.integration.test.ts:2178`, `apps/api/src/postgres-domain-stores.integration.test.ts:2306`).

Why it matters:

This is not required for AWS staging/UAT handoff, but future result correction, republish, revision, reissue, archive, or history behavior should be contract-managed instead of inferred.

Recommended action:

Leave current one-lifecycle model in place for staging. Add revision/history semantics only through a future contract decision.

Must fix before AWS staging: No  
Safe to defer beyond AWS staging: Yes

## 4. Final backend status

Backend hardening should stop for this checkpoint. No tiny backend fix is required before AWS staging handoff for the implemented backend scope.

The handoff should be framed as: backend code is ready for AWS staging/UAT with external gates, provider-backed actions disabled or configured safely, and no claim that KBT/provider/business launch approvals are complete.

## 5. DevOps/AWS handoff checklist

Runtime environment variables and modes:

- `DATABASE_URL` must point to PostgreSQL/PostGIS.
- `COGNITO_ISSUER`, `COGNITO_AUDIENCE`, and `COGNITO_JWKS_URL` are required when PostgreSQL runtime is configured (`apps/api/src/postgres-runtime.ts:199`).
- `API_RUNTIME_MODE=staging` or `API_RUNTIME_MODE=production` currently fails closed while lower-env providers/stubs remain wired.
- `PAYMENT_RUNTIME_MODE=manual_mvp` is the only currently approved production-like payment posture without real provider automation (`apps/api/src/runtime-safety.ts:41`).
- `INVOICE_RUNTIME_MODE=manual_offline` is required to avoid lower-env invoice markers in production-like runtime (`apps/api/src/runtime-safety.ts:53`).

PostgreSQL/PostGIS requirements:

- CI uses `postgis/postgis:16-3.4` (`.github/workflows/ci.yml:15`).
- Migrations are checked by `corepack pnpm db:migrate:check`.
- Clean disposable migration rehearsal is checked by `ALLOW_MIGRATION_APPLY_TO_TEST_DATABASE=true corepack pnpm db:migration:apply:check`.
- Do not run clean migration apply against staging, production, shared UAT, or personal databases.

CI expectations:

- `corepack pnpm install --frozen-lockfile`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm db:integration:test` or the CI equivalent DB integration command
- `corepack pnpm --filter @green-flag/api typecheck`
- `corepack pnpm --filter @green-flag/db typecheck`
- `corepack pnpm db:migrate:check`
- `corepack pnpm db:seed:check`
- `corepack pnpm contracts:check`
- `corepack pnpm openapi:check`
- `corepack pnpm db:migration:apply:check` with disposable DB opt-in

Provider flags/configuration that must remain disabled or externally supplied:

- Real storage/S3/signed URL provider and virus scanning.
- Real email/SMS dispatch.
- Real export artifact delivery.
- Real payment provider/webhook replay/signature automation.
- Business Central automation.
- Public map dispatch adapter.
- Certificate generation/wording provider.

Production-like startup gates:

- Missing `DATABASE_URL` fails closed.
- Missing DB-first repositories / canonical mutable Map-store fallback fails closed.
- Lower-env fixtures, fake contacts, lower-env storage/export/communications/payment/certificate shells fail closed.
- Local/test/lower-env modes remain explicitly allowed by the runtime-safety tests.

External config still required:

- Approved scoring criteria/subcriteria/guidance and applicant bands.
- Fee schedule, VAT treatment, invoice/legal wording.
- Provider credentials/contracts for storage, scanning, email/SMS, payment, Business Central, public map, certificate generation.
- KBT UAT/signoff and AWS staging/prod infrastructure.

## 6. External gates not to invent in code

- Official scoring criteria, subcriteria, threshold guidance, assessment guidance, or applicant-facing result wording.
- Applicant bands, band labels, or band ranges.
- Fee schedule, VAT treatment, legal invoice wording, or finance legal text.
- Payment provider credentials, webhook signatures, event payloads, or online card-flow behavior.
- Business Central data contract, credentials, API mapping, or automated finance integration.
- S3 bucket policy, signed URL provider, virus scanning provider, retention/quarantine rules, or production object-key convention.
- SES/SMS provider accounts, sender identities, approved template copy, suppression rules, retry/dead-letter policy, or credentials.
- Public map adapter endpoint, final payload/data contract, retry policy, worker configuration, or publication SLA.
- Certificate wording, certificate generation provider, reissue/revision rules, or legal certificate text.
- KBT UAT approval, legal/compliance approval, go-live signoff, monitoring/alert thresholds, backup/rollback acceptance, or migration import signoff.
- AWS staging/prod infrastructure.

## 7. Mutation check

`git status --short` before writing this report showed an already dirty workspace with modified backend/tests/contracts/docs/package files and many untracked prior pass artifacts, including `.github/`, `apps/api/src/postgres-domain-stores/communications-repository.ts`, `apps/api/src/postgres-domain-stores/results-repository.ts`, prior working reports, migration files `0019` and `0020`, and `scripts/check-clean-migration-apply.mjs`.

The before-writing status was captured before any report write and again after the verification commands. The verification commands did not add any new tracked/untracked paths beyond the pre-existing dirty tree.

Actual `git status --short` after writing this report showed the same pre-existing dirty workspace plus:

- `?? docs/implementation/working/backend-staging-readiness-final-check.md`

Checkpoint mutation confirmation: only this report file was created by this checkpoint. No source code, migrations, tests, OpenAPI/contracts, package files, lock files, generated clients, fixtures, seed files, configs, snapshots, CI files, or docs other than this final report were intentionally edited by this checkpoint.

Scope-control confirmation:

- No frontend code was edited.
- No legacy schema lifecycle model was cloned.
- Lifecycle state was not moved into `applications.status`.
- No real providers were implemented.
- No official scoring, applicant bands, fee/VAT/legal wording, certificate wording, provider credentials, or KBT approvals were invented.
