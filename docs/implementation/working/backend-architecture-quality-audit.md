# Backend Architecture and Quality Audit

Date: 2026-05-07  
Scope: read-only backend architecture, schema, contract, security, production-readiness, and test-quality audit for the Green Flag Award platform rebuild.

## Executive summary

The backend shows a strong episode-first domain intent in the schema, contracts, and implementation documentation. `assessment_episodes` exists and many later tables attach allocation, assessment, decisions, results, public map events, messages, jobs, exports, and documents to episodes. The implementation also avoids inventing official scoring text, fees, VAT, legal invoice wording, storage credentials, and provider integrations.

However, the current backend is not production-ready. The largest issue is that the PostgreSQL runtime still hydrates mutable in-memory map stores and only flushes them to PostgreSQL when selected `withTransaction` wrappers are used. Several real data-changing routes mutate those maps outside the flush boundary. That can produce durable audit events with non-durable domain state, state loss after restart, and different behavior between single-process tests and production.

The second launch-blocking area is Mystery Shop secrecy. The code contains central redaction helpers and some good tests, but Mystery secrecy is not consistently enforced across allocation contact reveal, assessment location disclosure, and messaging. I found paths where Mystery contact/location/message information can become applicant-visible.

The third launch-blocking theme is lower-env/fake data on production-facing routes. Admin read models and assessor assignment read models still use lower-env fixture names and static fake park contact details. External providers and official production inputs are also explicitly documented as not implemented, so a production go-live would require hardening and external configuration beyond the current backend.

Overall verdict: episode-first architecture is visible and partially implemented, but the persistence boundary, Mystery secrecy enforcement, fake production-path data, and launch-critical provider/configuration gaps make this backend unfit for production launch until remediated.

## Evidence base

- Required operating docs reviewed: `docs/implementation/agent-operating-model.md`, `docs/implementation/slice-backlog.yaml`, `docs/implementation/system_state.md`, `docs/implementation/gap-register.md`, `docs/implementation/ui-slice-map.yaml`, and `docs/implementation/source-reconciliation.md`.
- Source artifacts located and sampled read-only: `docs/source/GFA_Integrated_Architecture (3).docx`, `docs/source/GFA_PRD_v1_1 (1).docx`, `docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx`, `docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx`, `docs/source/schema_GreenFlag_Live.md`, `docs/source/schema_KBT_GFA.md`, `docs/implementation/Green_Flag_System_Architecture_Final.docx`, and `docs/implementation/Green_Flag_Award_MVP_Implementation_Reference_and_Delivery_Playbook_v1.docx`.
- The source docs explicitly reinforce the key principles: application is not assessment episode; `assessment_episodes` is the operational root; Full and Mystery episodes can overlap; Mystery applicants must not know visits/assessors until allowed; allocation, COI, payment, scoring, RBAC, and audit are backend responsibilities.
- Commands run: `corepack pnpm openapi:check`, `corepack pnpm db:migrate:check`, `corepack pnpm db:seed:check`, `corepack pnpm contracts:check`, and `corepack pnpm --filter @green-flag/api test`.
- Verification results: OpenAPI skeleton check passed; migration convention check passed for 15 files; lower-env seed safety check passed for 11 files; contract tests passed 17/17; API tests passed 52/52 with 3 PostgreSQL integration tests skipped because `TEST_DATABASE_URL` was not set.

## Overall architecture verdict

The schema direction is mostly correct: `assessment_episodes` is the core lifecycle root and `applications` is linked to episodes rather than owning the whole award lifecycle. Later domain areas generally attach to `assessment_episode_id`.

The runtime architecture is weaker than the schema. The API still operates primarily on mutable stores loaded into memory at startup, with PostgreSQL persistence implemented as hydration and flush adapters. That is not a safe production repository boundary for a multi-user, multi-instance, auditable workflow platform. It also hides important state-machine and transactional gaps because many tests exercise in-memory behavior rather than durable database behavior.

## What appears well implemented

- Episode-first tables exist and are widely referenced: `assessment_episodes` is created in `packages/db/migrations/0003_organisations_parks_locations_cycles_episodes.sql:77`, and later migrations reference it for applications, documents, invoices/payments, allocations, visits/assessments, decisions/results, messages, notifications, and exports.
- The source reconciliation rules are explicit: Full Assessment contact reveal only after all required judges accept and Mystery never reveals contact details, at `docs/implementation/source-reconciliation.md:33`; applicant-facing Mystery status must suppress assessor, visit, assignment, judge count, and assessment type at `docs/implementation/source-reconciliation.md:34`.
- Audit persistence has an append-only trigger: `packages/db/migrations/0002_identity_rbac_audit_foundation.sql:44` creates `audit_events`, and `packages/db/migrations/0002_identity_rbac_audit_foundation.sql:100` installs the no-update/no-delete trigger.
- Production startup fails closed when `NODE_ENV`, `API_RUNTIME_MODE`, or `DATABASE_URL` imply production/staging without required database/Cognito configuration, in `apps/api/src/postgres-runtime.ts:156`.
- The docs are honest about external production inputs: storage, virus scanning, payment provider automation, Business Central, fees/VAT/legal invoice wording, and official scoring remain not implemented in `docs/implementation/system_state.md:82` through `docs/implementation/system_state.md:86`.
- Applicant result DTOs hide raw scores in the implementation: `apps/api/src/results/routes.ts:223` through `apps/api/src/results/routes.ts:245`.

## Blockers requiring immediate attention

- B-001: PostgreSQL production runtime is still map-backed, and many data-changing routes bypass durable flushes.
- B-002: Mystery contact and assessment location secrecy can be violated.
- B-003: Messaging can leak Mystery content when an admin creates an applicant-visible thread.
- B-004: Production-facing admin/allocation read models still use lower-env fixture data and fake contacts.
- B-005: Launch-critical providers and official production configuration are explicitly absent.

## Blocker findings

### B-001 - PostgreSQL runtime is map-backed and real mutations bypass durable persistence

Severity: Blocker

Evidence:
- `apps/api/src/postgres-domain-stores.ts:41` through `apps/api/src/postgres-domain-stores.ts:47` hydrate all domain stores into memory.
- `apps/api/src/postgres-domain-stores.ts:55` installs transactional flush wrappers.
- `apps/api/src/postgres-domain-stores/transactions.ts:38` through `apps/api/src/postgres-domain-stores/transactions.ts:87` flush only when each store's `withTransaction` is invoked.
- Data-changing routes mutate stores outside `withTransaction`: registration verify/approve/reject at `apps/api/src/registration.ts:318`, `apps/api/src/registration.ts:371`, and `apps/api/src/registration.ts:408`; applicant upload/session/document/PO paths at `apps/api/src/applicant/routes.ts:264`, `apps/api/src/applicant/routes.ts:411`, and `apps/api/src/applicant/routes.ts:650`; assessor profile changes at `apps/api/src/assessor.ts:342` and `apps/api/src/assessor.ts:372`; assessment creation on read at `apps/api/src/assessment.ts:143`.
- `apps/api/src/postgres-domain-stores.integration.test.ts:37` and `apps/api/src/postgres-domain-stores.integration.test.ts:38` skip the PostgreSQL integration suite unless `TEST_DATABASE_URL` is set; the local API run skipped those 3 tests.

What I observed:
The production runtime creates PostgreSQL-backed stores by loading rows into mutable in-memory maps, then swapping store transaction methods to flush complete store state back to PostgreSQL. Several real write routes mutate those maps without entering the transaction/flush wrapper. Some of those routes still append audit events, so durable audit can diverge from non-durable domain state.

Why it matters:
This can lose registration state, autosaves, upload sessions, documents, PO changes, assessor profile changes, and assessment creation after process restart. It also makes multi-instance deployment unsafe because each API process has its own stale map snapshot. This breaks core workflow correctness, audit integrity, and production reliability.

Affected requirement/principle:
Backend owns workflow state, audit, API contracts, and production persistence. Every data-changing command must emit durable audit once the audit foundation exists.

Recommended fix:
Replace the hydration/flush adapter with DB-first repositories and per-command transactions. Every data-changing route should run through a unit-of-work that persists the exact rows changed and appends audit in the same transaction or via an outbox. Remove data-changing behavior from GET/read paths. Add cold-start/restart integration tests for every command family, and run DB integration in CI.

Safe to defer: No

Confidence: High

### B-002 - Mystery contact and location secrecy can be violated

Severity: Blocker

Evidence:
- Source rule: Mystery Shop never reveals contact details in `docs/implementation/source-reconciliation.md:33`.
- Helper is correct in isolation: `apps/api/src/allocation/commands.service.ts:21` and `apps/api/src/allocation/commands.service.ts:22` return reveal only for `"FULL_ASSESSMENT"` and all accepted.
- Route passes a hardcoded `"FULL_ASSESSMENT"` on accept/decline at `apps/api/src/allocation/routes.ts:325`, rather than the actual episode type.
- Assessor assignment read model returns static contact details when reveal is true at `apps/api/src/allocation/routes.ts:286` and `apps/api/src/allocation/routes.ts:287`.
- Assessment scheduling always uses `locationDisclosure: "visible_to_assessor_only"` at `apps/api/src/assessment.ts:212`, with no observed Mystery-specific suppression.

What I observed:
The contact reveal policy has the right type signature, but the route hardcodes Full Assessment. If a Mystery allocation reaches the same accept path and all assignments are accepted, `contactRevealAvailable` can become true. The assignment read model then exposes fake contact details. Assessment visit scheduling also does not branch on Mystery episode type for location disclosure.

Why it matters:
Mystery secrecy is a non-negotiable production requirement. Contact or visit/location disclosure can reveal Mystery activity to actors who should not know it, and static/fake contact data worsens the risk by making production behavior inaccurate.

Affected requirement/principle:
Mystery Shop secrecy must be enforced server-side across APIs, read models, notifications, documents, messages, exports, search, and status labels.

Recommended fix:
Look up the actual `assessment_episodes.episode_type` and `mystery_suppressed` state in every allocation/assessment command and read model. Enforce a hard "never reveal" branch for Mystery. Add regression tests proving Mystery allocations never expose contact, judge count/type, visit, assessment, or location metadata even after all judges accept.

Safe to defer: No

Confidence: High

### B-003 - Admin-created messages can leak Mystery content to applicants

Severity: Blocker

Evidence:
- Central Mystery redaction is required across messages by `docs/implementation/agent-operating-model.md:57` and `docs/implementation/system_state.md:53`.
- `apps/api/src/communications.ts:133` defines `isMysteryApplicantSuppressed` using the actor redaction profile, not the episode's Mystery state.
- `apps/api/src/communications.ts:223` suppresses only when `!admin && isMysteryApplicantSuppressed(...)`.
- `apps/api/src/communications.ts:231` sets `visibleToApplicant: !suppressed`.
- Applicant thread listing returns open visible threads and messages at `apps/api/src/communications.ts:192`.
- Central leak assertion exists at `apps/api/src/redaction.ts:289`, but the communication routes do not call it.
- Existing tests cover applicant-created suppressed Mystery messages at `apps/api/src/communications.test.ts:97` and `apps/api/src/hardening.test.ts:112`, but not admin-created Mystery threads.

What I observed:
An admin-created message thread for a Mystery episode is not suppressed by the current route logic, because the suppression branch excludes admin calls. The applicant listing endpoint then returns any open thread marked visible to applicant. The decision is based on the caller profile rather than the target episode's Mystery status.

Why it matters:
This is a direct Mystery leakage path through messages, one of the surfaces explicitly called out by the architecture rules. It also shows that central redaction exists but is not the universal gate for all new surfaces.

Affected requirement/principle:
Server-side Mystery redaction across messages and read models; product/requirements docs win over UI behavior.

Recommended fix:
Make message creation/listing episode-aware. Determine suppression from the target episode and recipient role, not the actor who creates the message. Route all applicant/org-facing message DTOs through the central redaction policy and leak assertion. Record suppressed notification/message logs for Mystery. Add tests for admin-created Mystery threads, replies, listing, exports, and notification logs.

Safe to defer: No

Confidence: High

### B-004 - Production-facing read models still use lower-env fixtures and fake contact data

Severity: Blocker

Evidence:
- Admin read models import lower-env fixtures at `apps/api/src/admin/read-models.ts:3` through `apps/api/src/admin/read-models.ts:5`.
- Application queue rows use fixture park, organisation, and cycle fields at `apps/api/src/admin/read-models.ts:82` through `apps/api/src/admin/read-models.ts:84`.
- Payment/document queues use fixture park names at `apps/api/src/admin/read-models.ts:123` and `apps/api/src/admin/read-models.ts:157`.
- Queue access uses lower-env ownership at `apps/api/src/admin.ts:42`, `apps/api/src/admin.ts:96`, `apps/api/src/admin.ts:120`, `apps/api/src/admin.ts:131`, and `apps/api/src/admin.ts:146`.
- Assessor assignments use fixture park names and static fake contact details at `apps/api/src/allocation/routes.ts:282`, `apps/api/src/allocation/routes.ts:286`, and `apps/api/src/allocation/routes.ts:287`.

What I observed:
Several real API read models still display lower-env fixture data instead of joining/hydrating actual park, organisation, cycle, and contact records. Scope checks for queues are also initialized with lower-env ownership before item-level filtering.

Why it matters:
Production users can see wrong park/organisation/cycle/contact information. Tenant scoping and operational queues can become inaccurate, especially when more than one organisation/country exists. This is also a hidden fake-production-data risk.

Affected requirement/principle:
No hidden in-memory/fake production stores; scoped RBAC must be enforced server-side; UI/Figma only shapes read models, not production data.

Recommended fix:
Replace lower-env fixture usage in production route/read-model code with real repository joins against parks, organisations, award cycles, park contacts, and role scopes. Make lower-env fixtures test-only or seed-only. Add tests with two countries, two organisations, two parks, and non-fixture names to prove read models and authorization are real.

Safe to defer: No

Confidence: High

### B-005 - Launch-critical providers and official production inputs are intentionally absent

Severity: Blocker

Evidence:
- `docs/implementation/system_state.md:82` marks several items as not implemented.
- Production storage, signed URLs, virus scanning, and upload infrastructure are not implemented at `docs/implementation/system_state.md:85`.
- Payment provider automation, Business Central, fees/VAT/legal wording, and online card flow are not implemented at `docs/implementation/system_state.md:86`.
- Launch verdict requires external/manual gates at `docs/implementation/production-readiness-checklist.md:80` through `docs/implementation/production-readiness-checklist.md:82`.
- External register lists object storage and scanning gaps at `docs/implementation/external-configuration-register.md:26` and `docs/implementation/external-configuration-register.md:27`, finance/payment gaps at `docs/implementation/external-configuration-register.md:34` through `docs/implementation/external-configuration-register.md:36`, official scoring at `docs/implementation/external-configuration-register.md:52`, and job scheduling at `docs/implementation/external-configuration-register.md:65`.
- OpenAPI exposes lower-env operations, for example lower-env invoice shell at `openapi/openapi.json:976`, lower-env notification dispatch stub at `openapi/openapi.json:2316`, and lower-env export job shell at `openapi/openapi.json:2454`.

What I observed:
The repository is transparent that key production integrations and official content are absent. That honesty is good, but it means the completed backend is a lower-env/MVP foundation, not a production-ready backend.

Why it matters:
Launching without these inputs would either block essential workflows or invite invented operational/legal/scoring behavior, which the project rules explicitly forbid.

Affected requirement/principle:
Do not invent fees, VAT values, official scoring criteria, applicant bands, legal wording, provider credentials, or KBT approvals.

Recommended fix:
Treat these as formal production activation gates. Supply provider adapters/configuration, official seed/config data, UAT sign-off, migration rehearsal, monitoring, backup/rollback, and provider smoke tests before production launch. Keep lower-env placeholders disabled or clearly feature-flagged outside lower environments.

Safe to defer: No for production launch; yes only for non-production hardening environments.

Confidence: High

## High risk findings

### H-001 - Public/system audit actor is hardcoded but not seeded in repo

Severity: High risk

Evidence:
- Public registration uses a hardcoded SYSTEM actor at `apps/api/src/registration.ts:71` through `apps/api/src/registration.ts:74`.
- PostgreSQL audit insert writes `actor_user_id` from the actor context at `apps/api/src/postgres-runtime.ts:106` through `apps/api/src/postgres-runtime.ts:128`.
- `audit_events.actor_user_id` is a non-null foreign key to `internal_users` at `packages/db/migrations/0002_identity_rbac_audit_foundation.sql:46`.
- Lower-env seed file `packages/db/seeds/lower-env-foundation.json:1` through `packages/db/seeds/lower-env-foundation.json:5` contains only synthetic award category seed metadata; a repo-wide search of `packages/db/seeds` found no `00000000-0000-4000-8000-000000000003` or `public-registration` seed.

What I observed:
Public registration commands append audit events using an actor ID that must exist in `internal_users`. I found no seed/import/provisioning file in the repository that creates that internal user.

Why it matters:
With PostgreSQL audit enabled, public registration submission or verification can fail on the audit foreign key and roll back, unless production provisioning creates the actor out of band.

Affected requirement/principle:
Audit events for every data-changing command; registration/account lifecycle must work in production.

Recommended fix:
Provision a durable system/public-registration internal user via migration or production bootstrap, document ownership of system actors, and add a DB integration test for public registration audit inserts against a clean migrated database.

Safe to defer: Conditional only if deployment provisioning creates and verifies the actor before API startup.

Confidence: Medium

### H-002 - Judges can access assessment flows before accepting assignments

Severity: High risk

Evidence:
- Assignment lookup allows both `"RELEASED"` and `"ACCEPTED"` statuses at `apps/api/src/assessment.ts:113`.
- The same lookup is used by visit scheduling and assessment update/submit routes, with transactional writes at `apps/api/src/assessment.ts:202`, `apps/api/src/assessment.ts:244`, `apps/api/src/assessment.ts:270`, and `apps/api/src/assessment.ts:303`.
- Contact reveal rule requires all required judges accept before reveal in `docs/implementation/source-reconciliation.md:33`.

What I observed:
An assigned judge can schedule visits and update/submit assessment data while their assignment is only released, not accepted.

Why it matters:
This weakens the judge accept/decline lifecycle, can create assessment artifacts for judges who later decline, and undermines sequencing around contact reveal and access revocation.

Affected requirement/principle:
Judge participant acceptance/decline/reassignment lifecycle; Full contact reveal only after all required judges accept; Mystery contact reveal never.

Recommended fix:
Require `ACCEPTED` for assessment/visit mutation routes. Allow released-but-not-accepted judges only the minimal assignment details needed to accept/decline. Add tests for released access denial, decline after release, reassignment, and access revocation.

Safe to defer: No

Confidence: High

### H-003 - Document DTOs expose storage keys and accept caller-supplied storage keys

Severity: High risk

Evidence:
- `documentAssetSchema` exposes `storageProvider` and `storageKey` at `packages/contracts/src/schemas.ts:516` and `packages/contracts/src/schemas.ts:517`.
- Complete upload request accepts `storageKey` from the caller at `packages/contracts/src/schemas.ts:594`.
- Applicant complete upload persists `input.storageKey` at `apps/api/src/applicant/routes.ts:400`.
- Applicant list/version routes return document DTOs at `apps/api/src/applicant/routes.ts:227` and `apps/api/src/applicant/routes.ts:481`.
- Production storage/signed URL integration is not implemented at `docs/implementation/system_state.md:85`.

What I observed:
Storage keys are part of public contract DTOs and clients supply the key that becomes persisted on completion. Signed access exists as a lower-env shell, but internal storage identifiers are still exposed to API consumers.

Why it matters:
Storage keys should be internal capability references, not applicant/admin read-model fields. Once production storage is added, exposing keys can enable enumeration, metadata leakage, or incorrect authorization assumptions.

Affected requirement/principle:
Documents must use signed access and access-policy decisions; no direct storage-key exposure without policy; Mystery document names/metadata must be protected.

Recommended fix:
Split internal asset records from public document DTOs. Remove `storageKey` from applicant/org/admin read models unless explicitly needed for internal admin tooling behind strict RBAC. Use provider-issued upload sessions/tokens and validate object keys server-side. Add tests that applicant/org DTOs never contain storage keys.

Safe to defer: No for production storage activation.

Confidence: High

### H-004 - RBAC is route-level and scope-mixed, with weak database typing

Severity: High risk

Evidence:
- `role_assignments.role_type` and `scope_type` are plain text in `packages/db/migrations/0002_identity_rbac_audit_foundation.sql:26` through `packages/db/migrations/0002_identity_rbac_audit_foundation.sql:37`; there are no DB check constraints against contract role/scope enums.
- Primary role selection is based on scope rank at `apps/api/src/auth.ts:63`; active scopes from all assignments are then copied into the session at `apps/api/src/auth.ts:140`.
- Authorization checks use one primary role plus all active scopes in `apps/api/src/authorization.ts:12`.
- Admin queue endpoints first check lower-env ownership at `apps/api/src/admin.ts:96`, `apps/api/src/admin.ts:120`, and `apps/api/src/admin.ts:146`.

What I observed:
The session model collapses multiple role assignments into one primary role while retaining scopes from all active assignments. The database does not constrain role/scope values. Some admin routes use lower-env ownership for initial access checks and only then apply item filtering.

Why it matters:
In multi-role users, combining a primary role with scopes from other assignments can produce authorization behavior that was not explicitly granted by any single assignment. Weak DB typing also allows bad role/scope values to enter the authorization foundation.

Affected requirement/principle:
Scoped RBAC across Super Admin, KBT/Country Admin, Organisation Admin, Park Manager, Judge/Assessor, Read-Only Viewer, and System; endpoint and repository/query-level safeguards.

Recommended fix:
Authorize against explicit role-assignment tuples instead of primary-role-plus-all-scopes. Add DB check constraints or lookup FKs for role/scope types. Add cross-tenant tests for users with multiple roles and conflicting scopes. Replace lower-env ownership guards with real resource-derived ownership.

Safe to defer: No for production multi-tenant launch.

Confidence: Medium

### H-005 - Idempotency is not durable or globally enforced

Severity: High risk

Evidence:
- `audit_events.idempotency_key` exists but has no unique constraint at `packages/db/migrations/0002_identity_rbac_audit_foundation.sql:57`.
- `document_upload_sessions.idempotency_key` exists but only as a text column at `packages/db/migrations/0006_documents_management_plan_upload_link_versioning.sql:45`.
- Allocation/result command helpers search in-memory audit lists for idempotency replay, for example `matchingAuditByIdempotency` is imported into `apps/api/src/allocation/routes.ts:30`.
- PostgreSQL runtime does not hydrate audit events into the domain stores; audit writes go directly to PostgreSQL at `apps/api/src/postgres-runtime.ts:106`.

What I observed:
Some idempotency behavior relies on in-memory audit arrays or current map state. The durable audit table stores the key but does not enforce uniqueness by actor/action/entity/key. After restart or across API instances, duplicate command execution is still possible for several flows.

Why it matters:
Submission, allocation release, assessment submit, result publish, webhooks, exports, and jobs need durable idempotency. Without it, retries can create duplicate side effects or contradictory state.

Affected requirement/principle:
Idempotency and retry behavior for jobs/workers, submissions, publication, exports, and external integrations.

Recommended fix:
Add an idempotency table or unique partial indexes keyed by actor, action, entity, and idempotency key. Make commands read/write idempotency markers within the same DB transaction as domain state. Add concurrent retry tests and restart tests.

Safe to defer: Conditional for low-volume lower-env; no for production.

Confidence: High

### H-006 - Whole-table hydration and flush design creates scalability and concurrency risks

Severity: High risk

Evidence:
- Applicant hydration clears and loads entire store families at `apps/api/src/postgres-domain-stores/applicant.ts:17` through `apps/api/src/postgres-domain-stores/applicant.ts:23`.
- It performs per-application section/field queries at `apps/api/src/postgres-domain-stores/applicant.ts:40` through `apps/api/src/postgres-domain-stores/applicant.ts:59`.
- It performs per-upload-session chunk queries at `apps/api/src/postgres-domain-stores/applicant.ts:150`.
- Allocation hydration loads all allocations and per-allocation assignments at `apps/api/src/postgres-domain-stores/allocation.ts:47` through `apps/api/src/postgres-domain-stores/allocation.ts:59`.
- Assessment hydration loads all visits and assessments, with per-assessment detail queries at `apps/api/src/postgres-domain-stores/assessment.ts:52` through `apps/api/src/postgres-domain-stores/assessment.ts:93`.

What I observed:
Startup hydration reads broad datasets into memory and then route handlers filter arrays/maps. This introduces N+1 queries at startup, unbounded memory growth, no row-level locks, and stale snapshots in long-running processes.

Why it matters:
The legacy workload includes many parks, invoices, judges, documents, and assessment records. Unbounded startup hydration and map filtering will not scale cleanly and can produce lost updates under concurrent load.

Affected requirement/principle:
Production readiness, scalability, transactional integrity, and repository/query-level safeguards.

Recommended fix:
Replace startup hydration with paginated, indexed query repositories. Add row-level locks or optimistic DB version checks for mutable aggregates. Add load/performance tests for queues, allocation candidates, applicant dashboards, documents, exports, and result publication.

Safe to defer: No for production; conditional for an isolated demo environment.

Confidence: High

### H-007 - Scoring framework remains placeholder-only and lacks official subcriteria/bands

Severity: High risk

Evidence:
- Official scoring and applicant bands are external gaps at `docs/implementation/gap-register.md:9` and `docs/implementation/gap-register.md:10`.
- Criteria table enforces `placeholder_only` at `packages/db/migrations/0011_visits_assessment_scoring_framework.sql:20`.
- Contract schema requires `placeholderOnly: z.literal(true)` at `packages/contracts/src/schemas.ts:1096`.
- Contract template source is `configurable_lower_env` at `packages/contracts/src/schemas.ts:1103`.
- Official criteria are listed as lower-env placeholder only at `docs/implementation/external-configuration-register.md:52`.

What I observed:
The backend has a configurable placeholder scoring framework and internal raw score/result paths, but not official criteria/subcriteria/guidance text, applicant band ranges/labels, or the full threshold model described in the prompt.

Why it matters:
Production assessment cannot launch without approved official scoring configuration. Applicant-facing result publication must not invent bands or official wording.

Affected requirement/principle:
Configurable scoring templates, criteria, subcriteria, thresholds, and bands; do not invent official scoring criteria or applicant score bands.

Recommended fix:
Load official scoring templates, subcriteria, thresholds, mandatory recommendation rules, guidance text, and applicant-safe band configuration as versioned seed/config data after KBT approval. Keep Community/Heritage/Group blocked until approved. Add tests for threshold flags and applicant-safe result DTOs.

Safe to defer: No for production scoring; yes for lower-env scaffolding.

Confidence: High

### H-008 - Production TLS configuration disables certificate validation

Severity: High risk

Evidence:
- PostgreSQL pool config sets `ssl: config.ssl ? { rejectUnauthorized: false } : undefined` at `packages/db/src/postgres.ts:71`.

What I observed:
When SSL is enabled, the client disables certificate verification.

Why it matters:
This can permit man-in-the-middle interception or connection to the wrong database endpoint in production-like environments.

Affected requirement/principle:
Security, secrets/configuration safety, production readiness.

Recommended fix:
Require proper CA configuration for production/staging, keep certificate validation enabled, and restrict `rejectUnauthorized: false` to explicit local development modes if absolutely required.

Safe to defer: No for production.

Confidence: High

## Medium risk findings

### M-001 - Schema constraints do not fully encode lifecycle invariants

Severity: Medium risk

Evidence:
- `assessment_episodes` has `UNIQUE (park_id, award_cycle_id, episode_type)` at `packages/db/migrations/0003_organisations_parks_locations_cycles_episodes.sql:88`.
- Role assignment text typing is unconstrained beyond uniqueness at `packages/db/migrations/0002_identity_rbac_audit_foundation.sql:26` through `packages/db/migrations/0002_identity_rbac_audit_foundation.sql:37`.
- `judge_assignments` has episode and assessor columns at `packages/db/migrations/0010_allocation_workflow_candidates_coi_release_acceptance.sql:39`, but no observed unique constraint preventing duplicate assessor assignment for the same episode.

What I observed:
The schema uses useful FKs and some status checks, but several business invariants remain application-code-only. Episode uniqueness is per park/cycle/type, but active/carryover/category variants and duplicate judge assignment constraints are not fully represented.

Why it matters:
Application-code-only invariants are easier to bypass during imports, admin scripts, concurrent commands, and future maintenance.

Affected requirement/principle:
Lifecycle-critical statuses typed/validated; episode uniqueness with Full/Mystery overlap and carryover support; judge allocation integrity.

Recommended fix:
Add targeted DB constraints or partial unique indexes for active episode rules, duplicate judge assignment, role/scope enums, and state ownership. Use import validation for legacy edge cases that cannot be expressed in simple constraints.

Safe to defer: Conditional through UAT if application-level checks are strengthened first.

Confidence: Medium

### M-002 - Allocation candidate engine is still lower-env/config-light

Severity: Medium risk

Evidence:
- Candidate/allocation contract exposes contact reveal fields at `packages/contracts/src/schemas.ts:1049`, `packages/contracts/src/schemas.ts:1060`, and `packages/contracts/src/schemas.ts:1074`.
- Allocation policy config table exists with one country/year uniqueness at `packages/db/migrations/0010_allocation_workflow_candidates_coi_release_acceptance.sql:15`.
- External register says allocation policy inputs remain configurable lower-env at `docs/implementation/external-configuration-register.md:45`.
- Source reconciliation requires current-accredited candidates, configured distance/capacity, hard/self conflict exclusion, soft flag preservation, distance/cluster scoring, and draft invisibility at `docs/implementation/source-reconciliation.md:29`.

What I observed:
The foundation models policy, COI, rotation, holds, release, acceptance, and overrides, but production allocation inputs remain external and some read models still use fixture data. I did not verify a complete distance/capacity/geospatial candidate engine from real park/judge locations.

Why it matters:
Allocation quality and COI safety are central operational workflows. Incorrect candidate filtering can assign conflicted or unsuitable judges.

Affected requirement/principle:
Judge allocation with hard COI exclusion, soft COI acknowledgement, rotation flags, capacity/distance rules, hold/release, accept/decline, reassignment, and reveal rules.

Recommended fix:
Complete real candidate query inputs, geospatial distance rules, capacity accounting, current accreditation import, COI import, rotation history, and production policy configuration. Add edge-case tests for hard/soft COI, distance, capacity, declined/reassigned judges, and multi-country scoping.

Safe to defer: Conditional for controlled pilot; no for full production allocation.

Confidence: Medium

### M-003 - Notifications, jobs, exports, and map updates are shells without production workers

Severity: Medium risk

Evidence:
- System state says real email/SMS, approved copy, production export formats, Business Central automation, and public-map dispatch remain external/manual at `docs/implementation/system_state.md:78`.
- Job scheduling is lower-env trigger APIs only at `docs/implementation/external-configuration-register.md:65`.
- Export jobs use `storage_provider = 'lower_env_stub'` at `packages/db/migrations/0014_notifications_messaging_jobs_exports_reminders.sql:96`.
- OpenAPI summaries identify lower-env notification dispatch, renewal reminder job, and export shell at `openapi/openapi.json:2316`, `openapi/openapi.json:2402`, and `openapi/openapi.json:2454`.

What I observed:
The schema records queues, logs, suppressions, job runs, and export jobs, but there is no verified production scheduler/worker/retry/dead-letter/provider pipeline.

Why it matters:
Operational reliability depends on retries, idempotency, suppression logs, provider errors, export artifact generation, and map publication lag management.

Affected requirement/principle:
Notifications, scheduled jobs/workers, audit events, public map update events, certificates/results publication.

Recommended fix:
Implement worker processes with durable outbox semantics, retry/backoff, dead-letter handling, provider adapters, metrics, and idempotent processors. Add tests for duplicate delivery, provider failure, suppression, and redacted export contents.

Safe to defer: Conditional for manual lower-env operation; no for production automation.

Confidence: High

### M-004 - OpenAPI and contract checks are skeleton-level, not behavioral safety checks

Severity: Medium risk

Evidence:
- `scripts/check-openapi.mjs:6` and `scripts/check-openapi.mjs:76` define required path/schema presence lists.
- The script prints `OpenAPI skeleton check passed` at `scripts/check-openapi.mjs:169`.
- OpenAPI still exposes lower-env endpoint summaries at `openapi/openapi.json:976`, `openapi/openapi.json:2136`, `openapi/openapi.json:2316`, and `openapi/openapi.json:2454`.
- Document contracts expose storage keys at `packages/contracts/src/schemas.ts:516` and `packages/contracts/src/schemas.ts:517`.

What I observed:
The OpenAPI check verifies that expected paths/schemas exist, but not route behavior, RBAC, redaction, internal-field exposure, storage-key leakage, or production readiness. Contract tests pass fixtures, including lower-env fixtures.

Why it matters:
Contracts can drift from route behavior or accidentally publish unsafe DTO fields while still passing skeleton checks.

Affected requirement/principle:
OpenAPI/DTO/read models must not expose raw scores, Mystery metadata, storage keys, internal enums, or cross-scope data.

Recommended fix:
Add contract tests that exercise actual route responses under role/scope/Mystery cases and validate against OpenAPI schemas plus negative leak assertions. Add static contract lint rules for forbidden public fields such as `storageKey`, raw scores, internal notes, and Mystery metadata.

Safe to defer: Conditional during hardening; no before launch sign-off.

Confidence: High

### M-005 - Test suite is broad but misses the highest-risk failure modes

Severity: Medium risk

Evidence:
- Local API test run passed 52 tests, with PostgreSQL integration tests skipped because `TEST_DATABASE_URL` was absent.
- DB integration skip gate is at `apps/api/src/postgres-domain-stores.integration.test.ts:37` and `apps/api/src/postgres-domain-stores.integration.test.ts:38`.
- Existing communication Mystery tests cover applicant-created suppressed messages at `apps/api/src/communications.test.ts:97` and `apps/api/src/hardening.test.ts:112`, but no observed test covers admin-created Mystery messages.
- Allocation test expects contact reveal after acceptance at `apps/api/src/allocation.test.ts:180` through `apps/api/src/allocation.test.ts:182`, but no observed test proves Mystery never reveals.
- Assessment test seeds one accepted and one released assignment at `apps/api/src/assessment.test.ts:25` through `apps/api/src/assessment.test.ts:39`, but no observed negative test denies released-only mutation.

What I observed:
Unit/API coverage exists across slices and is useful, but much of it runs on injected map stores. It does not catch the durable persistence gaps, Mystery contact reveal bug, admin-created Mystery message leak, storage key DTO exposure, or released judge assessment access.

Why it matters:
Passing tests currently do not mean production safety. The highest-risk architecture and secrecy gaps are outside the tested matrix.

Affected requirement/principle:
Tests should cover RBAC/scope denial, Mystery leakage, episode-first invariants, state transitions, transactional writes, audit events, payment overdue/override, allocation reveal rules, document access, scoring redaction, idempotency, and no fake production stores.

Recommended fix:
Make DB-backed integration tests mandatory in CI. Add targeted regression tests for every finding in this report, especially cold restart persistence, multi-tenant RBAC, Mystery contact/message/document/export leaks, released-vs-accepted judge access, and storage-key absence.

Safe to defer: Conditional during early UAT; no before production approval.

Confidence: High

### M-006 - Generic API error handler can expose internal error messages

Severity: Medium risk

Evidence:
- Generic error response uses `error.message` at `apps/api/src/app.ts:172`.

What I observed:
Unhandled errors can return their message text to clients. That is useful in development but risky in production.

Why it matters:
Database, provider, filesystem, SQL, or implementation error messages can expose internal structure or sensitive operational data.

Affected requirement/principle:
Sensitive data exposure in logs/errors; production security readiness.

Recommended fix:
Return a generic production-safe error body with a correlation/request ID. Log detailed error information server-side with redaction.

Safe to defer: Conditional if production config already masks errors outside this handler; not verified.

Confidence: Medium

### M-007 - Migration and seed checks do not prove migrated production readiness

Severity: Medium risk

Evidence:
- Migration check only reports convention success at `packages/db/scripts/check-migrations.mjs:148`.
- Seed check enforces lower-env synthetic markers at `packages/db/scripts/check-seeds.mjs:26` and reports success at `packages/db/scripts/check-seeds.mjs:37`.
- Production readiness requires migration rehearsal at `docs/implementation/production-readiness-checklist.md:35` through `docs/implementation/production-readiness-checklist.md:43`.

What I observed:
The automated checks prove naming/convention and lower-env seed safety, but not applying migrations to a clean database, rollback behavior, data migration coverage, import mapping, or production seed completeness.

Why it matters:
Production launch depends on clean migration application, rollback planning, seed/config completeness, and legacy import fidelity.

Affected requirement/principle:
Migration/schema assessment, legacy schema/import mapping, data-integrity safety.

Recommended fix:
Add CI jobs that apply all migrations to an empty PostgreSQL database, run down/up where supported, validate required seed/config records, and run import dry-runs against legacy samples.

Safe to defer: Conditional until pre-launch migration rehearsal; no for launch.

Confidence: High

## Low risk / improvement findings

### L-001 - Route modules still mix transport, domain mutation, read-model assembly, and persistence concerns

Severity: Low risk / improvement

Evidence:
- `apps/api/src/applicant/routes.ts` contains application creation, autosave, upload, document completion, payment, and deadline logic.
- `apps/api/src/assessment.ts` contains assignment lookup, implicit assessment creation, visit scheduling, scoring, evidence, and submit logic.
- Post-S14 modularity improvements are documented at `docs/implementation/system_state.md:59`.

What I observed:
The project has moved toward domain submodules, but several route files still combine controller, domain service, repository, and read-model logic.

Why it matters:
This makes it easier for future changes to bypass transactions, audit, RBAC, or redaction. B-001 is partly a symptom of this coupling.

Affected requirement/principle:
Clean bounded contexts/modules, maintainability, cohesive services/repositories.

Recommended fix:
Move commands into domain services with explicit repository/unit-of-work dependencies and keep routes thin. Make redaction/audit/authorization standard middleware or command decorators where possible.

Safe to defer: Yes, after blocker fixes.

Confidence: Medium

### L-002 - Documentation accurately records launch gates but may overstate backend completion

Severity: Low risk / improvement

Evidence:
- System state lists many implemented foundations at `docs/implementation/system_state.md:41` through `docs/implementation/system_state.md:59`.
- The same file lists critical not-implemented production integrations at `docs/implementation/system_state.md:82` through `docs/implementation/system_state.md:86`.
- Launch verdict rule says S14 completion is not production launch approval at `docs/implementation/production-readiness-checklist.md:80` through `docs/implementation/production-readiness-checklist.md:82`.

What I observed:
The docs are mostly honest, but the phrase "completed backend implementation" can be misleading unless paired with the launch gate caveats.

Why it matters:
Stakeholders may interpret slice completion as production readiness and miss required external inputs, UAT, provider smoke tests, and persistence hardening.

Affected requirement/principle:
Production readiness assessment and launch approval discipline.

Recommended fix:
Add a short status banner to `system_state.md` or release notes: "Backend foundation complete for lower-env/UAT, not production-ready until launch gates pass."

Safe to defer: Yes

Confidence: High

### L-003 - Audit read/export/admin review surface is not clearly evidenced

Severity: Low risk / improvement

Evidence:
- Audit persistence exists at `packages/db/migrations/0002_identity_rbac_audit_foundation.sql:44`.
- Export jobs exist at `packages/db/migrations/0014_notifications_messaging_jobs_exports_reminders.sql:90`.
- I did not find a mature audit-event query/admin endpoint during this audit.

What I observed:
Audit events are appended in many flows, but review/search/export tooling for auditors and incident response was not clearly evidenced.

Why it matters:
Production operations need to investigate payment overrides, Mystery suppressions, allocation changes, document access, exports, and result publication.

Affected requirement/principle:
Audit event content, export audit logging, observability and incident response.

Recommended fix:
Add scoped audit read APIs and export/reporting tools with strict Super Admin/KBT access, pagination, filtering, and redaction.

Safe to defer: Conditional through early UAT; not ideal for production.

Confidence: Low

## Cross-cutting risks

- Persistence is the main architectural risk: map-backed stores and partial flush wrappers undermine state machines, audit, idempotency, scalability, and production multi-instance operation.
- Mystery redaction is not consistently central. Some surfaces use central helpers, but allocation, assessment, messages, and exports still contain local logic or shortcuts.
- Lower-env placeholders are not fully isolated from route code. Fixture names, fake contacts, and lower-env providers appear in production-facing code paths and contracts.
- Authorization is mostly route-level and not yet proven at repository/query level. Multi-role/multi-scope behavior needs more explicit testing.
- Provider and official content gaps are documented but must be treated as launch blockers, not optional polish.

## Test coverage assessment

The test suite is useful and broad for a slice foundation: 52 API tests and 17 contract tests passed in this audit. It covers registration, applicant flows, admin queues, allocation, assessment, results, communications, redaction helpers, auth, and runtime startup.

The main weakness is that the highest-risk production behavior is not exercised by default. PostgreSQL integration tests are skipped without `TEST_DATABASE_URL`, and many route tests inject map stores. The suite does not currently catch non-flushed mutations, multi-instance state drift, admin-created Mystery message leakage, Mystery allocation contact reveal, released judge assessment access, storage key exposure in DTOs, or durable idempotency after restart.

Recommended minimum before launch: make DB integration mandatory in CI, add cross-tenant RBAC tests, add a Mystery leakage matrix across every read model/export/message/notification/document surface, and add restart/idempotency/concurrency tests for every state-changing command.

## OpenAPI, DTO, and read-model assessment

OpenAPI exists and the skeleton check passes, but many operations are explicitly lower-env shells. DTOs also expose lower-env provider markers and storage keys. Applicant result projections look safer than document and communications projections.

High priority improvements: remove internal storage keys from public DTOs, verify OpenAPI against real route responses, add forbidden-field contract tests, and ensure all applicant/org read models are episode-aware and Mystery-redacted centrally.

## Migration/schema assessment

The migration set models the broad domain shape well: identity/RBAC/audit, organisations/parks/cycles/episodes, registration, applications, documents, payments, assessors, allocations, visits/assessments, scoring entries, results/public map events, notifications/messages/jobs/exports. The migration convention check passed.

The remaining schema risks are production hardening issues: insufficient DB constraints for several lifecycle invariants, placeholder-only scoring, lower-env provider/storage/export markers, no durable idempotency uniqueness, no verified production seed for the system/public registration audit actor, and no mandatory migration application test in the default audit run.

## Security, RBAC, and Mystery assessment

RBAC is present and useful, but needs stronger role-assignment semantics, DB role/scope typing, repository/query-level scoping, and multi-role tests. Read-only viewer/no-mutation and system/service identity behavior should be explicitly tested across all commands.

Mystery secrecy is the highest security concern. Dashboard/document/result tests show some good redaction behavior, but allocation contact reveal, assessment location disclosure, admin-created messages, exports, notification logs, filenames/metadata, counts, and public surfaces need a single enforceable policy and regression matrix.

## Production readiness assessment

Not production-ready. The backend can support lower-env/UAT exploration, but production activation is blocked by durable persistence issues, Mystery leakage paths, fake production-path read models, missing provider integrations, official scoring/finance/content inputs, skipped DB integration verification, and operational gaps around workers, retries, monitoring, backups, and incident response.

## Recommended fix sequence

1. Replace map-backed production persistence with DB-first repositories and mandatory per-command transactions; remove data-changing GET/read behavior.
2. Centralize Mystery redaction and enforce it across allocation, assessment, messages, documents, notifications, exports, search/counts/status labels, and public map/results.
3. Remove lower-env fixtures and fake contacts from production route/read-model code.
4. Strengthen RBAC to evaluate explicit role-assignment tuples and add DB constraints for role/scope values.
5. Add durable idempotency and outbox/job processing before enabling provider integrations.
6. Remove storage keys from public DTOs and implement production storage/signed URL/scanning adapters.
7. Load official scoring/fees/VAT/legal/template/config inputs only after KBT approval.
8. Make PostgreSQL integration, migration dry-run, cross-tenant RBAC, Mystery leakage, and restart/idempotency tests mandatory CI gates.
9. Complete provider, worker, monitoring, backup/rollback, migration rehearsal, and UAT launch gates.

## Questions for the engineering lead/product owner

- Is the current code intended for lower-env/UAT only, or is it being considered production-complete?
- Who owns provisioning of required system actors such as `public-registration`, and where is that production bootstrap verified?
- Should lower-env fixtures be blocked by runtime assertions when `NODE_ENV=production` or `API_RUNTIME_MODE=production`?
- What is the authoritative production data source for park contacts, organisation contacts, assessor accreditation, COI, distance/capacity inputs, and allocation policy?
- Which surfaces are in the required Mystery redaction matrix for launch, and who signs off the UAT leakage test?
- When will official Standard Green Flag criteria/subcriteria, applicant bands, fee schedule, VAT treatment, legal invoice wording, certificate wording, notification templates, and provider credentials be supplied?

## Repository mutation check

I ran `git status --short` before creating this report and again after writing it. The worktree was already dirty before the audit. The only audit-created path is:

- `?? docs/implementation/working/backend-architecture-quality-audit.md`

Unexpected/pre-existing changes still present in the final status include modified backend/docs/contracts/db/OpenAPI files and many untracked slice 9-14 implementation artifacts. Representative final status groups:

- Modified API files: `apps/api/src/admin.ts`, `apps/api/src/app.ts`, `apps/api/src/applicant.ts`, `apps/api/src/index.ts`, `apps/api/src/postgres-domain-stores.integration.test.ts`, `apps/api/src/postgres-domain-stores.ts`, `apps/api/src/redaction.ts`.
- Modified docs/contracts/db/OpenAPI files: `docs/extract.mjs`, `docs/implementation/gap-register.md`, `docs/implementation/slice-backlog.yaml`, `docs/implementation/system_state.md`, current working review/plan docs, `openapi/openapi.json`, contract schema/fixture/enums/tests, `packages/db/migrations/0009_postgres_domain_repository_adapters.sql`, DB scripts/src files, and `scripts/check-openapi.mjs`.
- Untracked implementation artifacts: `apps/api/src/admin/`, allocation/assessment/communications/results modules and tests, `apps/api/src/postgres-domain-stores/`, redaction/hardening tests, slice delivery records/contracts for S09-S14, production/external configuration docs, legacy/source schema docs, `output/`, migrations `0010` through `0015`, and lower-env seeds for allocation/assessment/notifications/results.

Mutation conclusion: this audit only created the permitted audit report. I did not intentionally modify source code, migrations, tests, contracts, package files, fixtures, seed files, configs, generated clients, or snapshots.
