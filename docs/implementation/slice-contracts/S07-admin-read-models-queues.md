# Current Plan

## Metadata

- Slice ID: 7
- Title: Admin read models and operational queues
- Backlog status: IN_PROGRESS
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S07-admin-read-models-queues.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/figma-snapshot-lock.json
  - docs/implementation/slice-contracts/S03-registration-eligibility-verification-admin-approval.md
  - docs/implementation/slice-contracts/S04-applicant-dashboard-application-draft-autosave.md
  - docs/implementation/slice-contracts/S05-documents-management-plan-upload-link-versioning.md
  - docs/implementation/slice-contracts/S06-submission-invoice-po-payment-state.md
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
- Related UI evidence:
  - docs/figma/Super Admin - Dashboard.png
  - docs/figma/Super Admin - Award Management - Recent Applications.png
  - docs/figma/Super Admin - Assessor Allocation - Application List.png
  - docs/figma/Super Admin - Park details.png
  - docs/figma/Super Admin - Document Archieve.png
  - docs/figma/Super Admin - Coverage Map.png

## Objective

Deliver admin-facing read models and operational queue foundations across the already-delivered registration, application, document, and payment states: dashboard metrics, registration/application/payment/document queues, park/application detail read model, filters, pagination, safe allocation-readiness indicators, and Mystery-safe admin projections. This slice must not implement judge allocation, assessor management, scoring, result decisions, certificates, public map publication, notification sending, exports, or production finance integrations.

This slice is legal because it is the first eligible `TODO` after Slice 6, Slice 6 is `DONE_BACKEND`, dependencies `[3, 4, 6]` are satisfied, no earlier `BLOCKED` slice precedes it, and no active slice exists.

## Primary user/system path

1. An authenticated Super Admin or scoped admin opens the admin dashboard.
2. The backend returns aggregate queue counts and safe summary metrics derived from registration submissions, assessment episodes, applications, documents, and payment state.
3. The admin filters and pages through operational queues for registrations, submitted applications, payment attention, document attention, and allocation-readiness previews.
4. The admin opens a park/application detail read model that combines safe registration, park, episode, application, document, and payment summaries.
5. The admin can perform only already-owned commands from prior slices where exposed safely, such as registration approve/reject and payment mark-paid/override; new allocation/scoring/result commands are not introduced.
6. All admin projections enforce RBAC/scope and Mystery redaction server-side.

## Scope Lock

### In Scope

- Admin dashboard summary read model with queue counts and safe operational metrics.
- Admin registration queue consolidation using S03 registration state.
- Admin application queue for draft/submitted/payment/document attention states from S04-S06.
- Admin payment queue/read model for pending, paid, overdue-blocked, and override states using S06 lower-env finance markers only.
- Admin document archive/attention read model using S05 document metadata and visibility rules.
- Park/application detail read model combining canonical park/episode data with application, document, and payment summaries.
- Filters and pagination contracts for admin queues.
- Allocation-readiness preview flags that summarize prerequisites without creating allocation candidates or assignments.
- RBAC/scope checks for Super Admin, Finance Admin, and scoped organisation/admin roles.
- Audit for any reused data-changing admin command surfaced through this slice.
- Shared DTO schemas, fixtures, OpenAPI paths, migrations/seeds if needed, API tests, and frontend admin dashboard/queue/detail routes backed by available PNG evidence.

### Out Of Scope

- Judge/assessor profile management, accreditation, capacity, preferences, or availability; Slice 8 owns this.
- Allocation candidate generation, conflict-of-interest handling, hold/release, assignment, acceptance, or reassignment; Slice 9 owns this.
- Mystery redaction hardening beyond S07 read-model enforcement; Slice 10 centralizes full hardening.
- Visits, assessment forms, scoring, evidence, offline sync, thresholds, results, certificates, public map, publications, and past-winner decisions.
- Notification sending, message threads, scheduled jobs, renewal reminders, generic exports, and Business Central export.
- Production fee schedule, VAT/legal invoice wording, online card automation, provider webhooks, or finance-system credentials.

### Forbidden Work

- Do not create allocation, scoring, result, certificate, public map, message, export, notification-send, judge-capacity, or assessor-management production behavior.
- Do not put payment, allocation, assessment, decision, result, certificate, publication, or Mystery lifecycle state into `applications.status`.
- Do not reveal raw Mystery Shop visit, judge, assignment, location timing, hidden notifications, or covert status labels in admin queues unless explicitly allowed by a role-specific later slice.
- Do not invent production finance values, VAT treatment, legal invoice wording, Business Central fields, provider credentials, KBT approvals, scoring criteria, or applicant score bands.
- Do not let UI table labels define workflow rules; product and backend contracts define queue semantics.

## Source Mapping

### Product / Domain Truth

- S03 delivered registration review queue and admin approve/reject state.
- S04 delivered applicant dashboard/application package state and Mystery-safe applicant projections.
- S05 delivered document metadata, version/archive, signed access, and visibility rules.
- S06 delivered submission, payment state, manual payment actions, and payment blocks.
- The backlog purpose for S07 explicitly scopes admin dashboard/read models for registrations, applications, payments, allocation readiness, documents, results, filters, pagination, and operational queues.
- Result/publication surfaces appear in admin Figma evidence, but result decision state is not implemented until Slice 12; S07 can expose placeholders only.

### Operational / Architecture Truth

- `assessment_episodes` remains the lifecycle root for operational state.
- `applications` remains applicant package state only.
- Admin read models compose already-owned records; they do not become workflow roots.
- Backend owns RBAC, redaction, workflow rules, audit, state machines, and API contracts.
- Every data-changing command exposed or reused through S07 must emit `audit_events`.

### Platform Reality

- Backend/API exists through S06 with contracts, migrations, seeds, OpenAPI, tests, and frontend routes.
- Admin registration fallback route exists from S03.
- Admin queue/read-model UI is partial; exact queue variants and mobile admin views remain incomplete.
- Production finance/provider details and result/scoring criteria remain external dependencies.

### Gap Register References

- `FE-005`: admin registration/application/payment/result queues have Super Admin dashboard/queue PNG evidence, but registration queue specifics are uncertain.
- `FE-012`: exact admin registration review queue remains a frontend gap from S03.
- `FE-023`: exact admin manual mark-paid and override UI remains missing.
- `EXT-003`, `EXT-004`, `EXT-005`: production finance, Business Central, and payment provider details unavailable.
- `EXT-001`, `EXT-002`: official scoring criteria and applicant score bands unavailable; result-related admin cards must stay placeholders.

## Backend Contract

### Data / Migration Scope

- Prefer read-model composition over new workflow tables.
- Add no new lifecycle root unless a denormalized admin snapshot table is necessary for lower-env queue fixtures.
- If tables/seeds are added, limit to admin queue/read-model snapshots and indexes over existing S03-S06 records.
- Migration checker must continue blocking allocation, scoring, results, certificates, public map, messages, exports, and notification-send tables.

### Queries / Read Models

- `getAdminDashboardSummary`
- `listAdminRegistrationQueue`
- `listAdminApplicationQueue`
- `listAdminPaymentQueue`
- `listAdminDocumentQueue`
- `getAdminParkApplicationDetail`
- `getAdminAllocationReadinessPreview`

### Commands

- No new domain-changing commands by default.
- Reuse prior commands only through existing contracts:
  - approve/reject registration from S03.
  - mark payment paid/override payment block from S06.
- Any reused command must preserve its original RBAC, validation, idempotency, and audit behavior.

### State / Queue Semantics

- Registration queue: submitted, verified, pending admin review, approved, rejected.
- Application queue: draft, ready/submitted, submitted-with-missing-plan, payment-pending/paid/blocked, document attention.
- Payment queue: pending, paid, overdue-blocked, waived/override, no-PO/PO markers.
- Document queue: missing required management plan, uploaded/current, archived versions, scan placeholder states, applicant/admin visibility.
- Allocation readiness preview: boolean and reason codes such as `payment_pending`, `management_plan_missing`, `application_not_submitted`, `eligible_preview`; no allocation candidate generation.
- Results/publication cards: unavailable/deferred markers only until Slice 12.

### RBAC / Scope

- Super Admin can view global admin dashboard and all queues.
- Finance Admin can view payment queue and payment-related application detail only.
- Organisation-scoped admins can view only parks/episodes in their scope where supported.
- Applicant roles cannot access admin endpoints.
- Server-side checks are mandatory; UI hiding is not sufficient.

### Mystery Redaction

- Admin queues must not leak raw Mystery Shop metadata by default.
- Mystery rows use safe labels and redacted reason codes unless a later role-specific contract permits raw details.
- Search, filters, counts, document summaries, payment summaries, and detail projections must avoid covert visit/judge/assignment metadata.

### Audit

- Pure read-model queries do not emit audit events unless existing policy requires read access logging later.
- Any reused approve/reject/mark-paid/override command emits its original audit event.
- If S07 adds a saved admin filter/view preference command, it must emit audit; otherwise preferences stay out of scope.

### Error Cases

- `unauthorized` for missing/invalid session.
- `forbidden` for insufficient role or scope mismatch.
- `validation_failed` for malformed filters, pagination, or sort fields.
- `dependency_missing` for missing queue/detail target.
- `redaction_blocked` for unsafe projections.
- `conflict` only for reused mutating commands with invalid state transitions.

## API / DTO Contract

### Endpoints

- `GET /api/v1/admin/dashboard-summary`
- `GET /api/v1/admin/queues/registrations`
- `GET /api/v1/admin/queues/applications`
- `GET /api/v1/admin/queues/payments`
- `GET /api/v1/admin/queues/documents`
- `GET /api/v1/admin/applications/:applicationId`
- `GET /api/v1/admin/applications/:applicationId/allocation-readiness`

### Request DTOs

- Admin queue query DTO with page, page size, sort, search, status filters, cycle year, park/organisation filters, payment status, document status, and attention flags.
- Route params for application id and optional registration/episode ids.
- Reused S03/S06 command DTOs stay unchanged.

### Response DTOs

- Admin dashboard summary response.
- Admin queue page envelope with items, page, page size, total count, available filters, and safe attention counts.
- Registration queue item.
- Application queue item.
- Payment queue item.
- Document queue item.
- Admin park/application detail response.
- Allocation readiness preview response with safe reason codes.
- Error response using existing envelope.

### Fixtures

- Super Admin dashboard summary fixture.
- Registration queue fixture.
- Application queue fixture with submitted/payment/document attention states.
- Payment queue fixture with pending/paid/blocked/override states and `external_value_unavailable`.
- Document queue fixture with management-plan current/archive states.
- Park/application detail fixture.
- Allocation readiness preview fixture.

## Frontend Contract

### Available Screens

- `docs/figma/Super Admin - Dashboard.png`
- `docs/figma/Super Admin - Award Management - Recent Applications.png`
- `docs/figma/Super Admin - Assessor Allocation - Application List.png`
- `docs/figma/Super Admin - Park details.png`
- `docs/figma/Super Admin - Document Archieve.png`
- `docs/figma/Super Admin - Coverage Map.png`

### Partial Screens

- Admin dashboard and dense table family exists, but exact per-queue field mapping is partly inferred.
- Payment/admin manual action UI is not separately exported.
- Allocation list screenshot can shape readiness preview layout, but not allocation behavior.
- Result/publication admin screens exist but are later-slice business scope.

### Missing Screens

- Exact admin application queue variants by status.
- Exact admin payment queue and manual mark-paid/override screen.
- Exact document archive filters/version detail variants.
- Exact mobile admin dashboard/queue views.
- Exact allocation-readiness-without-allocation queue state.
- Exact result placeholders for pre-result applications.

### Implement Now

- Admin dashboard route with queue counts and safe summary cards.
- Admin queue route(s) or tabs for registrations, applications, payments, and documents using contract fixtures.
- Admin application/park detail read model route or section.
- Filters, search, status chips, pagination controls, and safe empty/error states.
- Reuse existing registration/payment actions only where backend contracts already exist.

### Stub / Mock Now

- Result/publication cards show deferred/unavailable states only.
- Allocation readiness shows safe prerequisite preview without candidates or judge data.
- Finance values stay `external_value_unavailable`.
- Export, notification sending, Business Central, and online card automation are absent.

### Wait For Future Slices

- Assessor management and capacity.
- Actual allocation workflow and candidate actions.
- Mystery redaction hardening expansion.
- Scoring/results/certificates/public map.
- Notification sending, exports, jobs, and messages.

### Reopen Triggers

- New or changed Super Admin dashboard/queue screens.
- Exact payment/admin manual action UI.
- Exact document archive/detail variants.
- Exact mobile admin views.
- Approved production finance/provider/export contracts.

## Design Coverage Check

### Expected UI Surfaces

- Super Admin dashboard.
- Recent applications / application queue.
- Payment attention queue.
- Document archive/attention queue.
- Park/application detail.
- Allocation readiness preview.

### PNG Matches

- Expected surface: dashboard summary
  - Matched PNG: `docs/figma/Super Admin - Dashboard.png`
  - Confidence: high
- Expected surface: application queue
  - Matched PNG: `docs/figma/Super Admin - Award Management - Recent Applications.png`
  - Matched PNG: `docs/figma/Super Admin - Assessor Allocation - Application List.png`
  - Confidence: medium
- Expected surface: park/application detail
  - Matched PNG: `docs/figma/Super Admin - Park details.png`
  - Confidence: medium
- Expected surface: document archive
  - Matched PNG: `docs/figma/Super Admin - Document Archieve.png`
  - Confidence: medium
- Expected surface: coverage/operational geography
  - Matched PNG: `docs/figma/Super Admin - Coverage Map.png`
  - Confidence: low for S07; map behavior is likely later/public/allocation support only.

### Frontend Gap Records Required

- FE-026: exact admin application queue status variants.
- FE-027: exact admin payment queue/manual action UI.
- FE-028: exact document archive/version filter variants.
- FE-029: admin dashboard/queues mobile variants.
- FE-030: allocation readiness preview without allocation action variants.

## Planned File Zones

- apps/api/src/**
- apps/web/app/admin/**
- apps/web/app/globals.css
- packages/contracts/src/**
- packages/db/src/**
- packages/db/migrations/**
- packages/db/seeds/**
- packages/db/scripts/check-migrations.mjs
- openapi/**
- scripts/check-openapi.mjs
- docs/implementation/working/**
- docs/implementation/slice-contracts/**
- docs/implementation/delivery-records/**

## Verification Matrix

| Check | Command / Artifact | Status | Evidence |
| --- | --- | --- | --- |
| Repo/app scaffold check | inspect root/apps/packages files | Pending | Confirm S06 scaffold remains intact |
| Contracts validation | `corepack pnpm contracts:check` | Pending | Must validate S07 DTOs/fixtures |
| OpenAPI validation | `corepack pnpm openapi:check` | Pending | Must include S07 paths/schemas |
| Migration check | `corepack pnpm db:migrate:check` | Pending | Must allow only S07 read-model/index/snapshot scope if migrations are added |
| Seed check | `corepack pnpm db:seed:check` | Pending | Must validate admin queue lower-env seeds if added |
| Lint | `corepack pnpm lint` | Pending | Must pass |
| Tests | `corepack pnpm test` | Pending | Must include admin queue/read-model tests |
| Build/typecheck | `corepack pnpm typecheck` | Pending | Must pass full build and package typechecks |
| API smoke | admin dashboard and queue reads | Pending | Use Fastify injection with Super Admin and scoped-denied cases |
| Frontend route smoke | admin dashboard/queues/detail | Pending | Confirm semantic anchors and no forbidden copy |
| Mystery leakage check | admin queue/detail payloads | Pending | Must prove no raw Mystery metadata leaks |

## Stop Triggers

Stop instead of guessing if:

- S07 requires allocation candidate generation, judge assignment, scoring, result decisions, certificates, public map, exports, or notification sending.
- Queue semantics require production finance values, VAT/legal invoice wording, Business Central fields, provider credentials, scoring criteria, score bands, or KBT approvals.
- Admin read models cannot preserve `assessment_episodes` lifecycle ownership.
- A projection requires raw Mystery metadata outside a later approved redaction contract.
- Live Figma is known newer than the local snapshot and the user has not approved using the local snapshot.

## Contract Review Notes

PASS on 2026-05-05.

- Slice 7 is the first eligible TODO after Slice 6, which is DONE_BACKEND with delivery evidence.
- Dependencies S03, S04, and S06 are satisfied.
- The contract is limited to admin read models, operational queues, safe previews, filters, pagination, DTOs, and UI routes.
- Allocation, assessor management, scoring, results, certificates, public map, exports, messaging, notification sending, production finance, Business Central, and provider automation remain out of scope.
- `assessment_episodes` remains the lifecycle root, `applications` remains applicant package state, RBAC/redaction are server-side, and Mystery metadata is not exposed.

## Implementation Review Notes

PASS_WITH_FRONTEND_GAPS on 2026-05-05.

- Backend/API scope is complete for S07 admin read models and operational queues.
- Contract fixtures, OpenAPI entries, API smoke tests, RBAC-denied cases, and Mystery leakage assertions passed.
- Frontend admin routes exist for dashboard, queues, application detail, and registration fallback, but exact queue variants and mobile/payment/document variants remain recorded gaps.

## Closure Note

Closed as `DONE_BACKEND` on 2026-05-05.

- Delivery record: docs/implementation/delivery-records/S07-admin-read-models-queues-delivery.md.
- Close summary: Admin dashboard/read models, registration/application/payment/document queues, application detail, safe allocation-readiness preview, DTOs, OpenAPI paths, tests, and partial frontend routes delivered.
- Client impact: Admin users can inspect operational queues across registration through payment without introducing allocation, scoring, results, exports, or production finance behavior.
- Frontend handoff: `/admin`, `/admin/queues`, `/admin/applications/[applicationId]`, and `/admin/registrations` exist as contract-backed routes aligned to available Super Admin evidence.
- Reopen triggers: New/changed admin application queue variants, payment manual action UI, document archive/detail variants, mobile admin views, or allocation-readiness preview screens.
