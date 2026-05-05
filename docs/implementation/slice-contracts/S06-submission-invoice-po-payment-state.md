# Current Plan

## Metadata

- Slice ID: 6
- Title: Submission, invoice, PO/no-PO, and manual payment state
- Backlog status: IN_PROGRESS
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S06-submission-invoice-po-payment-state.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/figma-snapshot-lock.json
  - docs/implementation/slice-contracts/S04-applicant-dashboard-application-draft-autosave.md
  - docs/implementation/slice-contracts/S05-documents-management-plan-upload-link-versioning.md
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
- Related UI evidence:
  - docs/figma/Applicant - Application - Review & submit.png
  - docs/figma/Appicant - Application - Submitted.png
  - docs/figma/Appicant - Application - Submitted-1.png
  - docs/figma/Appicant - Application - Payment.png
  - docs/figma/Applicant - Dashboard - My applications.png
  - docs/figma/Applicant - Dashboard - My applications-1.png

## Objective

Deliver the Full Assessment application submission and MVP payment state foundation: validate the applicant package at submit time, allow submission with or without a management plan, generate a lower-env invoice record and notification intent, capture PO/no-PO state, expose applicant invoice/payment status, support manual mark-paid and documented payment override contracts, and enforce payment-deadline blocks server-side without inventing production fees, VAT/legal wording, payment provider credentials, or Business Central integration.

This slice is legal because it is the first eligible `TODO` slice after Slice 5, Slice 5 is `DONE_BACKEND`, no active slice exists, and no earlier `BLOCKED` slice precedes Slice 6.

## Primary user/system path

1. An authenticated park manager reviews a Full Assessment draft application.
2. The backend validates application ownership, cycle window, draft state, and required package fields.
3. The applicant submits the application with PO number or explicit no-PO declaration.
4. The backend transitions the applicant package to submitted state, updates the episode to submitted/payment-pending readiness as appropriate, creates an invoice shell from lower-env fee schedule placeholders, and emits notification intents.
5. Applicant dashboard/read models show submitted/payment status and safe next actions.
6. A finance/admin actor can manually mark payment as paid or apply a documented override.
7. If the configured payment deadline passes without payment or override, the backend sets payment-overdue block state and prevents allocation readiness.

## Scope lock

### In scope

- Application submission command for Full Assessment applicant packages.
- Submission validation against existing S04/S05 package state: application exists, actor scoped, draft/submittable state, current cycle window, document state read where needed.
- Support for submission with or without management plan; if missing, record explicit submitted-with-missing-plan marker while still allowing post-submission management plan upload until allocation.
- Invoice shell and payment state tables using lower-env placeholders only.
- Fee schedule hook/config placeholder that can emit `external_value_unavailable` instead of production values.
- PO/no-PO capture.
- Manual mark-paid command and documented payment override command with mandatory reason.
- Payment overdue/block state and daily-check command/contract stub.
- Applicant dashboard/application read model extensions for submitted/invoice/payment status.
- Notification intent contracts for submission confirmation and invoice availability.
- Audit events for submit, invoice creation, PO/no-PO update, manual mark-paid, payment override, and overdue/block transitions.
- Shared DTO schemas, fixtures, OpenAPI paths, migrations, seeds, tests, and frontend route updates for review/submit/submitted/payment views.

### Out of scope

- Stripe/card payment automation, payment provider webhooks, live provider credentials, refunds, and online card flow.
- Business Central export/API integration and production invoice numbering/legal formatting.
- Production fee schedule, VAT treatment, legal invoice wording, due-date policy beyond lower-env configurable placeholder.
- Admin operational payment queues beyond minimal manual mark-paid/override contracts; broader admin queues are Slice 7.
- Allocation candidate generation/readiness queues; Slice 9 owns allocation workflow.
- Scoring, visits, results, certificates, public map, messages, jobs, exports, and notification sending infrastructure.
- Community, Heritage, and Group award payment rules unless source-approved; use blocked placeholders only.

### Forbidden work

- Do not invent production fees, VAT values, invoice legal wording, payment instructions, provider credentials, Business Central formats, or KBT approvals.
- Do not put allocation, assessment, decision, publication, certificate, public map, scoring, or Mystery lifecycle state into `applications.status`.
- Do not make UI labels define payment or submission rules.
- Do not implement Stripe, Business Central, real email sending, refunds, card capture, or provider webhooks.
- Do not reveal raw Mystery Shop metadata in applicant submitted/payment views.

## Source mapping

### Product / domain truth

- `REQ-APP-001` requires application progress autosave and allows application submission with or without a management plan; management plan remains uploadable after submission until judge allocation.
- `REQ-APP-004` requires submission window validation, off-window error with next window date, and Super Admin override with mandatory reason/audit.
- `REQ-APP-005` says payment section is cleared on annual reset.
- `REQ-PAY-001` requires invoice generation when application is submitted and invoice availability in the park portal; production invoice legal content remains an external dependency.
- `REQ-PAY-002` requires payment deadline enforcement, overdue block, park notification, and Super Admin override with documented reason.
- `REQ-PAY-003` requires PO number entry, online card payment, and no-PO option; this slice implements PO/no-PO and manual payment MVP, while online card is deferred.
- PRD says Phase 1 payment confirmation is manual admin mark-as-paid; full Stripe automation is Phase 2/confirmation required.

### Operational / architecture truth

- `assessment_episodes` remains the operational lifecycle root.
- `applications` owns applicant package submission state only.
- Payment/invoice state belongs in dedicated finance/payment records and must block allocation readiness server-side where required.
- Backend owns workflow rules, RBAC, audit, redaction, state machines, and API contracts.
- Every data-changing command must emit `audit_events`.
- Event-driven architecture mentions application submitted events, invoice/payment side effects, and downstream notification/worker consumers; this slice models intents/events, not production integrations.

### Platform reality

- S04 delivered application drafts, progress, previous feedback draft, and applicant dashboard.
- S05 delivered document metadata/upload and the applicant document step.
- Current system state marks applicant submission/payment and post-submission flow as not implemented.
- Production fee/VAT/legal/provider/Business Central details are unavailable external dependencies.

### Gap register references

- `EXT-003`: production fee schedule, VAT treatment, and legal invoice wording unavailable.
- `EXT-004`: Business Central data contract and credentials unavailable.
- `EXT-005`: production payment provider account/keys/webhook sign-off unavailable; manual mark-paid MVP and feature-flagged automation later.
- `FE-004`: payment/PO/no-PO/invoice UI has PNG evidence but production fee/VAT/legal values are unavailable.

## Backend contract

### Data / migration scope

- Add `application_submissions` or equivalent immutable submission record:
  - id, application id, assessment episode id, submitted by actor, submitted at, package version, document state summary, submission status.
- Add `invoices` with lower-env placeholder finance data:
  - id, application id, assessment episode id, invoice reference, status, amount marker, due at placeholder/config field, created at, sent/available flags.
- Add `payment_states` or equivalent:
  - invoice id, payment status, PO number/no-PO declaration, manual mark-paid actor/reason/time, override actor/reason/time, overdue/block fields.
- Add `notification_intents` entries or extend existing intent pattern for submission/invoice/payment notifications without sending.
- Add lower-env seeds for submitted application, pending invoice, paid invoice, overdue invoice, and override scenario.
- Update migration checks to allow only S06 finance/payment/submission tables while still blocking allocation, scoring, results, messages, exports, certificates, and public map tables.

### Commands

- `submitApplication`
- `validateApplicationSubmission`
- `createInvoiceForSubmission`
- `recordPurchaseOrderPreference`
- `markPaymentPaidManually`
- `overridePaymentBlock`
- `runPaymentDeadlineCheck`
- `getApplicantPaymentSummary`

### Queries / read models

- Submitted application response.
- Applicant invoice/payment summary.
- Applicant dashboard item updated with submitted/payment display status.
- Payment deadline/block summary.
- Manual payment admin action response.
- Notification intent response for submission/invoice events.

### State transitions

- Application package: `READY_TO_SUBMIT` or valid `IN_PROGRESS` with accepted submission preconditions -> `SUBMITTED` or `SUBMITTED_WITH_MISSING_PLAN`.
- Assessment episode: `APPLICATION_DRAFT` -> `APPLICATION_SUBMITTED` or payment-pending readiness state where required.
- Invoice: `PENDING` -> `PAID` or `OVERDUE_BLOCKED` or `WAIVED`.
- Payment state: PO pending/no-PO declared/manual-paid/override recorded.
- No allocation, assessment, decision, result, certificate, publication, or public map transitions in this slice.

### RBAC / scope

- Park managers can submit and view payment summaries only for scoped park applications.
- Organisation admins can act for parks in their organisation scope if existing role scope permits.
- Finance admins and Super Admin can mark paid manually.
- Super Admin can override payment block with mandatory reason.
- All permission checks are server-side; UI hiding is not sufficient.

### Mystery redaction

- Mystery Shop episodes have no applicant submission and no applicant invoice/payment view.
- Applicant submitted/payment views must not expose raw Mystery state, visit, judge, assignment, or hidden notification metadata.

### Audit

- Every data-changing command emits append-only audit:
  - submit application
  - create invoice
  - record PO/no-PO
  - mark paid manually
  - override payment block
  - overdue/block transition
- Audit includes actor, application, episode, invoice/payment entity, request metadata, reason where required, before/after summary, and lower-env finance marker.

### Error cases

- `unauthorized` for missing/invalid session.
- `forbidden` for actor scope mismatch.
- `validation_failed` for malformed PO/no-PO payload or missing mandatory override reason.
- `dependency_missing` for missing application/document/invoice/payment state.
- `conflict` for invalid submission/payment state transition, already submitted, not submittable, or off-window submission.
- `idempotency_conflict` for conflicting retry payloads.
- `redaction_blocked` for any projection that would leak Mystery-only metadata.

### Idempotency / retries

- Submission is idempotent per application/version/idempotency key.
- Invoice creation is idempotent per application submission.
- Manual mark-paid and override commands are idempotent for identical request keys and conflict for mismatched retries.
- Deadline check is repeatable and does not duplicate audit target rows for already-overdue invoices.

## API / DTO contract

### Endpoints

- `POST /api/v1/applicant/applications/:applicationId/submit`
- `GET /api/v1/applicant/applications/:applicationId/submission`
- `GET /api/v1/applicant/applications/:applicationId/payment-summary`
- `PATCH /api/v1/applicant/applications/:applicationId/purchase-order`
- `POST /api/v1/admin/payments/:invoiceId/mark-paid`
- `POST /api/v1/admin/payments/:invoiceId/override-block`
- `POST /api/v1/admin/payments/deadline-check`

### Request DTOs

- Submit application DTO with client application version, PO number or no-PO declaration, optional idempotency key.
- Purchase-order preference DTO with PO number or no-PO declaration.
- Manual mark-paid DTO with mandatory reason and optional external reference placeholder.
- Override payment block DTO with mandatory reason.
- Deadline check DTO with lower-env as-of date.

### Response DTOs

- Application submission response.
- Invoice summary with status, amount marker, due-at placeholder, notification intents.
- Payment summary with PO/no-PO, manual payment, override, overdue/block state.
- Admin payment action response.
- Error response using existing envelope.

### Mock responses / fixtures

- Submitted application fixture.
- Submitted-with-missing-plan fixture.
- Pending invoice fixture with `external_value_unavailable` marker.
- Manual paid fixture.
- Payment overdue/blocked fixture.
- Payment override fixture.

## Frontend contract

### Available screens

- `docs/figma/Applicant - Application - Review & submit.png`
- `docs/figma/Appicant - Application - Submitted.png`
- `docs/figma/Appicant - Application - Submitted-1.png`
- `docs/figma/Appicant - Application - Payment.png`
- `docs/figma/Applicant - Dashboard - My applications.png`
- `docs/figma/Applicant - Dashboard - My applications-1.png`

### Partial screens

- Payment/submitted PNGs exist but exact node mapping is partly uncertain and filenames contain Figma spelling errors.
- Exact PO/no-PO variants, manual mark-paid admin screen, overdue block, payment override, and invoice unavailable/error states are not separately confirmed.
- Production invoice text/fees/VAT/legal values are unavailable and must not appear.

### Missing screens

- Exact PO/no-PO selection variants.
- Exact invoice pending/paid/overdue/override states.
- Exact manual mark-paid admin UI.
- Exact payment provider/card UI, which is deferred.
- Exact mobile submitted/payment PNGs.

### Implement now

- Applicant review/submit route state within existing wizard.
- Submitted confirmation and payment summary using lower-env DTO fixtures.
- Applicant dashboard submitted/payment placeholders.
- Admin/API-only manual mark-paid and override routes/contracts; frontend can remain minimal/stubbed if no exact admin screen exists.

### Stub/mock now

- Invoice amount must show `external_value_unavailable` or neutral lower-env marker, not a real fee.
- Legal/VAT/payment instructions must be absent or placeholder-safe.
- Online card payment should be disabled/hidden with provider automation deferred.
- Business Central export is a future adapter event/intent only.

### Wait for future screens

- Exact admin payment queue and finance workflow UI.
- Online payment/card flow.
- Business Central export screens.
- Mobile payment/submitted variants.

### Reopen triggers

- New or changed payment/PO/no-PO/invoice PNGs.
- Exact admin manual payment/override screen.
- Mobile submitted/payment exports.
- Approved production fee/VAT/legal invoice wording or provider contract.

## Design coverage check

### Expected UI surfaces for this slice

- Applicant review and submit.
- Applicant submitted confirmation.
- Applicant payment/invoice summary.
- Applicant dashboard post-submission payment status.
- Minimal admin manual payment/override affordance if safe.

### PNG matches

- Expected surface: review and submit
  - Matched PNG: `docs/figma/Applicant - Application - Review & submit.png`
  - Confidence: medium
  - Notes: supports applicant review/submit shell; backend rules define submittability.
- Expected surface: submitted confirmation
  - Matched PNG: `docs/figma/Appicant - Application - Submitted.png`
  - Matched PNG: `docs/figma/Appicant - Application - Submitted-1.png`
  - Confidence: medium
  - Notes: Figma filename typo retained in path; code should use correct spelling.
- Expected surface: payment state
  - Matched PNG: `docs/figma/Appicant - Application - Payment.png`
  - Confidence: medium
  - Notes: supports layout only; no production fee/VAT/legal values.

### PNG-backed surface inventory

| Surface | Route | PNG path | Viewport / variant | Visual inventory | Approved fallback | Internal-copy rule |
| --- | --- | --- | --- | --- | --- | --- |
| Review submit | `/applicant/applications/[id]#review` | docs/figma/Applicant - Application - Review & submit.png | desktop/applicant | Review shell and submit action | Contract-backed review/submission state | Do not invent fees/legal text |
| Submitted confirmation | `/applicant/applications/[id]/submitted` or same route state | docs/figma/Appicant - Application - Submitted.png | desktop/applicant | Confirmation state | Route section/state if no separate route | Do not expose raw payment internals |
| Payment summary | `/applicant/applications/[id]/payment` or same route state | docs/figma/Appicant - Application - Payment.png | desktop/applicant | Payment/invoice shell | Safe placeholder invoice values | No production VAT/legal wording |

### Missing or unclear design coverage

- Exact PO/no-PO, overdue, paid, override, admin mark-paid, error, and mobile states.
- Whether submitted/payment should be separate routes or wizard states.

### Existing implementation overlap

- S04 applicant dashboard/application draft/status/progress.
- S05 document completion and management-plan upload status.
- S01 auth/scope/audit helpers.

### Design traceability

- Surface: review submit
  - Verified route: `/applicant/applications/[id]`
  - PNG: `docs/figma/Applicant - Application - Review & submit.png`
  - Variant notes: desktop wizard family.
- Surface: submitted/payment
  - Verified route: planned `/applicant/applications/[id]` state or sibling routes
  - PNG: `docs/figma/Appicant - Application - Submitted.png`, `docs/figma/Appicant - Application - Payment.png`
  - Variant notes: payment exact node mapping partially uncertain.

### Visual / route-inspection gates

- Route: `/applicant/applications/11111111-1111-4111-8111-111111111111`
  - Semantic anchors: Review, Submit application, PO/no-PO, Submitted, Payment, invoice status, amount unavailable marker.
  - Negative copy assertions: no production fee, VAT number, legal invoice text, payment provider credentials, raw Mystery labels.

### Ambiguities requiring user decision

- None blocking backend/API planning. Production fee/VAT/legal/provider details remain external dependencies and must not be invented.

### User-approved design decisions

- Use local Figma snapshot because live Figma freshness is unknown and local snapshot is available.
- Build manual mark-paid MVP and defer Stripe/card automation.
- Use lower-env invoice placeholders until KBT provides production finance values.

### Deferred affordance policy

- Element: online card payment
  - Treatment: disabled or hidden
  - Notes: production provider automation is external/later.
- Element: production invoice values/legal text
  - Treatment: placeholder marker only
  - Notes: EXT-003 blocks production content.
- Element: Business Central export
  - Treatment: notification/export intent placeholder
  - Notes: EXT-004 blocks integration.
- Element: admin payment queue
  - Treatment: API/manual action only
  - Notes: Slice 7 owns admin operational queues.

## Planned file zones

- apps/api/src/**
- apps/web/app/applicant/**
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

## Verification matrix

| Check | Command / Artifact | Status | Evidence |
| --- | --- | --- | --- |
| Repo/app scaffold check | inspect root/apps/packages files | PASS | S05 scaffold remained intact and S06 files were added in planned zones |
| Backend lint | `corepack pnpm lint` | PASS | Passed |
| Backend typecheck | `corepack pnpm typecheck` | PASS | Full build and package typechecks passed |
| Backend tests | `corepack pnpm test` | PASS | 6 files / 38 tests |
| Backend build | `corepack pnpm build` | PASS | Completed during `typecheck` |
| Contracts validation | `corepack pnpm contracts:check` | PASS | 10 contract tests |
| OpenAPI validation | `corepack pnpm openapi:check` | PASS | S06 paths/schemas present |
| Migration check | `corepack pnpm db:migrate:check` | PASS | 7 migration files |
| Seed check | `corepack pnpm db:seed:check` | PASS | 6 seed files |
| API smoke check | submit, payment summary, mark paid, override | PASS | Submit, submission read, payment summary, deadline check, override, and mark-paid returned 200 |
| Browser/route check | applicant review/submitted/payment state | PASS | Route served Submit application, `external_value_unavailable`, and deferred card copy |
| Mystery leakage check | serialized submitted/payment fixtures | PASS | No raw Mystery metadata; route smoke found no VAT text |

## Stop triggers

Stop instead of guessing if:

- Production fee schedule, VAT treatment, legal invoice wording, provider credentials, Business Central format, or KBT approvals are required.
- Submission/payment state cannot be separated from allocation/assessment/decision/result lifecycle.
- Payment block cannot be enforced server-side.
- Super Admin override cannot require a reason/audit.
- Mystery-safe applicant projections cannot suppress raw Mystery metadata.
- Live Figma is known newer than the local snapshot and the user has not approved using the local snapshot.

## Contract review notes

PASS on 2026-05-05.

- Slice 6 is the first eligible TODO after Slice 5, which is DONE_BACKEND with delivery evidence.
- Source PRD and requirements rows REQ-APP-001, REQ-APP-004, REQ-APP-005, REQ-PAY-001, REQ-PAY-002, and REQ-PAY-003 support submission, invoice shell, PO/no-PO, manual mark-paid, overdue block, and documented override scope.
- The contract keeps `assessment_episodes` as lifecycle root and keeps payment/invoice state in dedicated records instead of expanding `applications` into finance/allocation/assessment lifecycle ownership.
- Production fee, VAT, legal invoice wording, provider credentials, Business Central details, and KBT approvals remain external dependencies.
- Online card payment, Business Central export, admin payment queues, allocation readiness queues, and notification sending are deferred.

## Implementation review notes

PASS_WITH_FRONTEND_GAPS on 2026-05-05.

- Backend/API scope delivered against the frozen S06 contract.
- Frontend route state is contract-backed and safe, but exact PO/no-PO, invoice state, admin payment action, online card, and mobile variants remain recorded gaps.

## Closure note

Closed as `DONE_BACKEND` on 2026-05-05.

### Closure Inputs

- Close summary: Delivered application submission, lower-env invoice/payment state, PO/no-PO, manual mark-paid, override, deadline block, contracts, OpenAPI, migrations, seeds, tests, and applicant route updates.
- Client impact: Applicants can submit and see safe lower-env invoice/payment status; finance/admin actors can manually manage payment state via audited API contracts.
- Frontend handoff: Applicant route and dashboard show submitted/payment placeholders using fixtures; online card flow is disabled/deferred.
- Backend handoff: Production finance/provider/Business Central integrations remain adapter/future work; no production fees, VAT, legal wording, or credentials were invented.
- Remaining frontend gaps: FE-004, FE-021, FE-022, FE-023, FE-024, FE-025.
- Reopen triggers: New payment/PO/no-PO/admin/mobile screens, approved production finance/legal/provider inputs, or changed submitted/payment PNGs.
