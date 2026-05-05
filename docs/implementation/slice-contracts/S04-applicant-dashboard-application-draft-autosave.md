# Slice Contract: S04 Applicant Dashboard and Application Draft/Autosave

## Metadata

- Slice ID: 4
- Title: Applicant dashboard and application draft/autosave
- Backlog status: IN_PROGRESS
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S04-applicant-dashboard-application-draft-autosave.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/figma-snapshot-lock.json
  - docs/implementation/slice-contracts/S00-operating-layer-and-contract-build-baseline.md
  - docs/implementation/slice-contracts/S01-identity-rbac-audit-foundation.md
  - docs/implementation/slice-contracts/S02-organisations-parks-locations-cycles-episodes.md
  - docs/implementation/slice-contracts/S03-registration-eligibility-verification-admin-approval.md
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
  - docs/implementation/Green_Flag_System_Architecture_Final.docx
  - docs/implementation/Green_Flag_Award_MVP_Implementation_Reference_and_Delivery_Playbook_v1.docx
- Related UI evidence:
  - docs/figma-manifest.json
  - docs/figma-manifest.md
  - local PNG exports mapped via `ui-slice-map.yaml`

## Objective

Deliver the applicant dashboard read model and Full Assessment application draft/autosave foundation: create or continue an application for an eligible Full Assessment episode, save section field values after changes, calculate section/progress completion, expose safe allowed actions, and provide frontend routes aligned to available applicant dashboard and wizard evidence.

This slice is legal because it is the first eligible `TODO` slice after Slice 3, Slice 3 is `DONE_BACKEND`, no active slice exists, and no earlier `BLOCKED` slice precedes Slice 4.

## Primary user/system path

1. An authenticated park manager opens the applicant dashboard.
2. The dashboard returns owned/scoped park and episode cards with safe display status, completion percentage, invoice/result placeholders, and allowed actions.
3. For a Full Assessment episode with an open/current draft boundary, the park manager creates or continues an application package.
4. The applicant edits application sections and each save persists a field-value draft with optimistic concurrency.
5. The API returns section completion and overall progress percentage after each autosave.
6. The review projection can show the current draft package without submitting it.
7. If an applicant has a Mystery Shop episode, the dashboard projection returns only `APPLICATION_UNDER_REVIEW` and suppresses raw episode type, visit, judge, assignment, and hidden-status metadata.

## Scope lock

### In scope

- Applicant dashboard read model for applicant-scoped parks, active assessment episodes, draft application package status, completion percentage, invoice/result placeholders, and allowed actions.
- `applications` persistence for Full Assessment applicant package state only.
- Application section draft state and field-value autosave.
- Optimistic concurrency/version handling for autosave.
- Create/continue application command for a Full Assessment episode.
- Review/read projection for the current draft application package.
- Progress percentage and section completion calculation.
- Previous-year prefill and previous feedback response placeholders where source data exists or synthetic fixtures can safely represent it.
- Server-side applicant and organisation scope checks using the Slice 1 actor context.
- Server-side Mystery-safe applicant dashboard serialization.
- Audit events for every data-changing application command.
- Shared DTO schemas, fixtures, OpenAPI paths, lower-env synthetic seeds, migration checks, and focused tests.
- Frontend routes/components for applicant dashboard and application wizard steps where PNG evidence exists, with mocks/stubs for missing states.

### Out of scope

- Management plan upload/link/versioning, file assets, chunked uploads, signed access, virus scanning, and SHA-256 duplicate detection; these belong to Slice 5.
- Application submission, invoice creation, PO/no-PO capture, payment status, overdue/payment block, and payment overrides; these belong to Slice 6.
- Admin read models/queues beyond applicant-safe DTO fixtures; these belong to Slice 7.
- Judge/assessor management, allocation, visits, assessment scoring, decisions, certificates, public map updates, notifications/jobs/exports, and messaging.
- Production fees, VAT treatment, legal invoice wording, scoring criteria, applicant bands, provider credentials, KBT approvals, and live external integrations.
- Community, Heritage, and Group operational application flows.

### Forbidden work

- Do not put payment, allocation, assessment, decision, publication, certificate, public map, or Mystery lifecycle state into `applications.status`.
- Do not create document/upload/payment/allocation/scoring/result/message/job/export tables.
- Do not reveal raw Mystery episode type, assignment, visit, judge, notification, or hidden status metadata in applicant dashboard or application read models.
- Do not invent production fee/VAT/legal/scoring/provider/KBT values.
- Do not allow UI labels or PNG copy to override backend state ownership or Mystery redaction.
- Do not implement submission behavior in this slice.

## Source mapping

### Product / domain truth

- PRD Section 4.2 requires application progress to save after every field change, show partial applications as `DRAFT`, and allow parks to return and continue.
- PRD/requirements `REQ-APP-001` requires each field saved on change, partial application shown as `DRAFT`, and returning/continuing.
- `REQ-APP-005` requires previous-year data prefill with editable fields and only payment cleared on annual reset.
- `REQ-APP-006` requires live progress indicators on the park dashboard and application form, and admin visibility of in-progress completion percentage without impersonation; this slice delivers applicant-side read models and DTO primitives while admin queues remain later.
- `REQ-APP-007` requires a structured previous-year feedback response in the application form; this slice may model a draft response field/section but must not implement judge visibility beyond DTO placeholders for later slices.
- `REQ-CYC-002` and PRD Mystery rules require applicant Mystery projection to show only `APPLICATION_UNDER_REVIEW`.
- `REQ-CYC-003` requires Full and Mystery episodes to coexist; dashboard read models must represent this without collapsing them into one application state.
- PRD Appendix maps the relevant screens to `SCR-PRK-01`, `SCR-PRK-02`, and `SCR-PRK-03`.

### Operational / architecture truth

- `assessment_episodes` is the operational lifecycle root.
- `applications` owns only the applicant-submitted Full Assessment package lifecycle.
- Mystery Shop episodes are judge/admin-driven and must not require applicant submission or reveal Mystery metadata to applicants.
- The implementation playbook calls for `GET /applicant/dashboard`, grouped application sections, documents/status/submission events/permitted actions, and section-level autosave with optimistic concurrency.
- Slice 0 already defined safe display statuses and redaction profiles.
- Slice 1 already established authenticated actor context, RBAC/scope resolution, and append-only audit.
- Slice 2 already established organisations, parks, cycles, windows, and assessment episodes.
- Slice 3 already established registration and park activation handoff.

### Platform reality

- `system_state.md` marks applicant application flow as not implemented.
- Existing contracts already include early dashboard fixtures, safe display statuses, application/episode status enums, and Mystery-safe projection tests.
- Existing frontend routes are foundation plus S03 registration/admin fallback routes.
- Existing migrations do not yet include `applications` or application section draft tables.

### Gap register references

- `FE-001`: dashboard/list/detail PNGs are available, with some node-to-PNG mapping uncertainty.
- `FE-002`: wizard PNGs are available for the main flow, but exact one-to-one node-to-PNG mapping remains partial.
- `FE-003` and later document/upload variants remain Slice 5, not this slice.
- Figma live freshness is unknown; local snapshot is available and may be used until live freshness is known newer.

## Backend contract

### Data / migration scope

- Add `applications` for Full Assessment applicant package state only:
  - application id
  - assessment episode id
  - park id
  - applicant owner/scope reference
  - status limited to applicant package states
  - completion percentage
  - version/concurrency fields
  - created/updated timestamps
- Add `application_sections` or equivalent section progress records.
- Add `application_field_values` or equivalent persisted field drafts.
- Add optional draft `application_feedback_responses` only for applicant-entered previous-feedback response text; judge visibility remains later.
- Add safe lower-env synthetic seeds for one Full Assessment draft application and one Mystery-safe dashboard projection.
- Update migration checks to allow only Slice 4 application draft tables while still blocking documents, payments, allocation, scoring, results, messages, and exports.

### Commands

- `getApplicantDashboard`
- `createOrContinueApplication`
- `getApplicationDraft`
- `autosaveApplicationSection`
- `calculateApplicationProgress`
- `recordPreviousFeedbackResponseDraft`

### Queries / read models

- Applicant dashboard response with application/episode cards, safe display status, completion percentage, invoice/result placeholders, and allowed actions.
- Application draft response grouped by sections and field values.
- Section completion summary.
- Review projection for the current draft package.
- Mystery-safe applicant projection with raw Mystery fields suppressed.

### State transitions

- Create a Full Assessment application package in `DRAFT` or `IN_PROGRESS`.
- Move application package status from `DRAFT` to `IN_PROGRESS` when draft field values are saved.
- Move application package status to `READY_TO_SUBMIT` only when configured required sections are complete; actual submission remains Slice 6.
- Preserve `assessment_episodes` as lifecycle root and update only draft-related episode status if contractually required, without introducing payment/allocation/decision transitions.
- No document, payment, allocation, scoring, result, publication, or Mystery transitions in this slice.

### RBAC / scope

- Applicant dashboard and application draft endpoints require an authenticated applicant/organisation actor or an explicitly allowed lower-env test actor.
- Park managers can read/write only their scoped park/application package.
- Organisation admins can read/write scoped organisation parks/applications if their role assignment scope permits it.
- Admin read models are not implemented except fixtures/DTO primitives for future slices.
- Server-side scope checks are required; UI hiding is not sufficient.

### Mystery redaction

- Applicant Mystery dashboard cards must return `displayStatus: APPLICATION_UNDER_REVIEW`.
- Applicant Mystery cards must not include raw episode type, raw episode status, visit fields, judge fields, assignment fields, suppressed notification fields, or hidden document metadata.
- Tests must assert the serialized applicant Mystery response does not contain `MYSTERY_SHOP` or other hidden metadata.

### Audit

- Every data-changing command emits an append-only audit event:
  - create/continue application
  - autosave section
  - record previous feedback response draft
- Audit must include actor, target application/episode, request metadata, idempotency/concurrency metadata where present, and before/after state summaries.

### Error cases

- `unauthorized` for missing/invalid session.
- `forbidden` for actor scope mismatch.
- `validation_failed` for malformed section/field payloads.
- `dependency_missing` for missing park, episode, cycle/window, or application.
- `conflict` for invalid draft state transitions.
- `idempotency_conflict` or `conflict` for optimistic concurrency/version mismatches.
- `redaction_blocked` if a requested applicant projection would leak Mystery-only metadata.

### Idempotency / retries

- `createOrContinueApplication` must be idempotent per actor/episode.
- `autosaveApplicationSection` must be retry-safe and version-aware.
- Repeated identical autosave requests should not create duplicate sections or duplicate audit target rows.

## API / DTO contract

### Endpoints

- `GET /api/v1/applicant/dashboard`
- `POST /api/v1/applicant/applications`
- `GET /api/v1/applicant/applications/:applicationId`
- `PATCH /api/v1/applicant/applications/:applicationId/sections/:sectionKey`
- `POST /api/v1/applicant/applications/:applicationId/previous-feedback-response`

### Request DTOs

- Create/continue application DTO with park id, episode id, and optional idempotency key.
- Autosave section DTO with section key, field values, client version, and optional idempotency key.
- Previous feedback response draft DTO with response text and client version.

### Response DTOs

- Applicant dashboard response.
- Applicant dashboard item with safe display status, completion percent, invoice/result placeholders, and allowed actions.
- Application draft response grouped by sections.
- Section autosave response with new version and completion summary.
- Review projection response.
- Error response using existing error codes.

### Mock responses / fixtures

- Full Assessment draft dashboard item.
- Mystery-safe dashboard item.
- Application draft fixture with sections for location/site information/contact/publicity/optional/review.
- Autosave response fixture.
- Previous feedback response draft fixture.

## Frontend contract

### Available screens

- `docs/figma/Applicant  - Applications.png`
- `docs/figma/Applicant - Dashboard - My applications.png`
- `docs/figma/Applicant - Dashboard - My applications-1.png`
- `docs/figma/Applicant - Application - Location.png`
- `docs/figma/Applicant - Application - Location-1.png`
- `docs/figma/Applicant - Application - Location-2.png`
- `docs/figma/Applicant - Application - Site Information.png`
- `docs/figma/Applicant - Application - contact details.png`
- `docs/figma/Applicant - Application - publicity.png`
- `docs/figma/Applicant - Application - Optional Information.png`
- `docs/figma/Applicant - Application - Review & submit.png`
- `docs/figma/Applicant - Application - Application details.png`
- `docs/figma/Applicant - Application - Application details - Mystery Shopping.png`

### Partial screens

- Application wizard PNGs are available for main steps, but exact node-to-PNG mapping remains partly family-level.
- Applicant dashboard/list/detail screens are available, but some variants and state-specific details remain ambiguous.
- Document, submitted, and payment PNGs appear in the same wizard family but are not implementation scope for Slice 4 except as disabled/deferred navigation affordances if needed.

### Missing screens

- Exact empty/error/loading states for dashboard and autosave conflict are not separately exported.
- Exact previous feedback response screen is not separately confirmed.
- Exact mobile PNG exports for the applicant wizard are not available.

### Implement now

- Applicant dashboard route/read model using available applicant dashboard/list evidence.
- Application draft/wizard route shell for in-scope sections.
- Autosave UI behavior against DTOs or mocked route handlers if backend integration is not complete at first implementation pass.
- Progress/completion UI aligned to dashboard and wizard evidence.
- Mystery-safe applicant detail/dashboard state using available Mystery comparison PNG only as visual evidence, not business truth.

### Stub/mock now

- Document/upload step affordance should be disabled, read-only, or linked to a future placeholder because Slice 5 owns documents.
- Submission/payment affordances should be disabled or hidden because Slice 6 owns submission/payment.
- Previous feedback response may use a simple draft text section if exact screen evidence is absent.
- Empty/loading/conflict states may use compact contract-backed placeholders.

### Wait for future screens

- Management plan upload/link/versioning UI variants.
- Payment/invoice/submitted states.
- Full admin in-progress application queue.
- Messaging/site visit/results screens.
- Exact mobile wizard exports.

### Reopen triggers

- New or changed applicant dashboard/list/detail PNGs.
- New or changed application wizard step PNGs.
- Exact previous-feedback-response screen.
- Mobile applicant wizard PNG exports.

## Design coverage check

### Expected UI surfaces for this slice

- Applicant dashboard/application list.
- Application draft wizard.
- Application detail/review projection.
- Mystery-safe applicant dashboard/detail comparison.

### PNG matches

- Expected surface: applicant dashboard/list
  - Matched PNG: `docs/figma/Applicant  - Applications.png`
  - Matched PNG: `docs/figma/Applicant - Dashboard - My applications.png`
  - Matched PNG: `docs/figma/Applicant - Dashboard - My applications-1.png`
  - Confidence: medium
  - Notes: supports shell, cards/list, progress/status, and allowed action layout.
- Expected surface: application draft wizard
  - Matched PNG: `docs/figma/Applicant - Application - Location.png`
  - Matched PNG: `docs/figma/Applicant - Application - Site Information.png`
  - Matched PNG: `docs/figma/Applicant - Application - contact details.png`
  - Matched PNG: `docs/figma/Applicant - Application - publicity.png`
  - Matched PNG: `docs/figma/Applicant - Application - Optional Information.png`
  - Matched PNG: `docs/figma/Applicant - Application - Review & submit.png`
  - Confidence: medium
  - Notes: document/submission/payment screens are adjacent but deferred to later slices.
- Expected surface: Mystery-safe detail comparison
  - Matched PNG: `docs/figma/Applicant - Application - Application details - Mystery Shopping.png`
  - Confidence: medium
  - Notes: UI may shape redacted layout only; backend redaction rules win.

### PNG-backed surface inventory

| Surface | Route | PNG path | Viewport / variant | Visual inventory | Approved fallback | Internal-copy rule |
| --- | --- | --- | --- | --- | --- | --- |
| Applicant dashboard/list | `/applicant/dashboard` | docs/figma/Applicant - Dashboard - My applications.png | desktop/applicant | Cards/list, statuses, progress, allowed action entry points | Contract-backed dashboard with fixture states | Do not expose raw Mystery state |
| Application wizard | `/applicant/applications/[id]` | docs/figma/Applicant - Application - Site Information.png | desktop/applicant | Wizard shell, section forms, progress | Implement in-scope sections only; disable document/payment/submission | Do not invent document/payment behavior |
| Application review projection | `/applicant/applications/[id]/review` or same route section | docs/figma/Applicant - Application - Review & submit.png | desktop/applicant | Draft review layout | Read-only draft projection; submission disabled/deferred | Do not submit or show fees |
| Mystery-safe application detail | `/applicant/dashboard` or detail route | docs/figma/Applicant - Application - Application details - Mystery Shopping.png | desktop/applicant | Redacted comparison state | Safe display status only | Do not reveal `MYSTERY_SHOP`, visit, judge, assignment, or hidden status |

### Missing or unclear design coverage

- Exact autosave conflict/loading/empty states are missing.
- Exact previous feedback response UI is missing.
- Exact mobile application wizard PNG exports are missing.
- Some dashboard node-to-PNG mapping is family-level rather than one-to-one.

### Existing implementation overlap

- Slice 0 safe display statuses, contracts, and application/dashboard fixture baseline.
- Slice 1 authenticated actor context and audit helper.
- Slice 2 canonical parks/cycles/episodes and Mystery suppression data boundary.
- Slice 3 registration and active park handoff.

### Design traceability

- Surface: applicant dashboard/list
  - Verified route: `/applicant/dashboard`
  - PNG: `docs/figma/Applicant - Dashboard - My applications.png`
  - Variant notes: dashboard/list family; exact mapping partially uncertain.
- Surface: application wizard
  - Verified route: `/applicant/applications/[id]`
  - PNG: `docs/figma/Applicant - Application - Site Information.png`
  - Variant notes: desktop wizard family; document/payment/submission deferred.

### Visual / route-inspection gates

- Route: `/applicant/dashboard`
  - Screenshot artifact: required during implementation review if local app runs.
  - Semantic anchors: park name, cycle year, progress, display status, allowed action, safe Mystery projection.
  - Negative copy assertions: no raw Mystery labels, no visit/judge/assignment data, no production fee/VAT/legal wording.
- Route: `/applicant/applications/[id]`
  - Screenshot artifact: required during implementation review if local app runs.
  - Semantic anchors: section list, draft status, autosave status, completion percent, disabled/deferred document/payment/submission affordances.
  - Negative copy assertions: no live upload/payment/submission claims.

### Ambiguities requiring user decision

- None for backend/API planning after applying product and architecture truth. Missing UI variants are handled as stubs/gaps.

### User-approved design decisions

- Use local Figma snapshot because live Figma freshness is unknown and local snapshot is available.
- Keep document/upload and submission/payment affordances deferred to later slices even though related PNGs exist in the wizard family.

### Deferred affordance policy

- Element: document upload/link step
  - Treatment: disabled or read-only placeholder
  - Notes: Slice 5 owns document/upload behavior.
- Element: submit/payment action
  - Treatment: disabled or hidden
  - Notes: Slice 6 owns submission/payment behavior.
- Element: previous feedback response exact UI
  - Treatment: stub route/section
  - Notes: Implement draft DTO/field only if exact screen remains absent.

## Planned file zones

Advisory only; implementation may choose better locations if repo conventions require it.

- apps/api/src/**
- apps/web/app/applicant/**
- apps/web/app/globals.css
- packages/contracts/src/**
- packages/db/src/**
- packages/db/migrations/**
- packages/db/seeds/**
- packages/db/scripts/check-migrations.mjs
- openapi/**
- docs/implementation/working/**
- docs/implementation/slice-contracts/**
- docs/implementation/delivery-records/**

## Verification matrix

| Check | Command / Artifact | Status | Evidence |
| --- | --- | --- | --- |
| Repo/app scaffold check | inspect root/apps/packages files | Pending | Confirm scaffold and prior slice files remain intact |
| Backend lint | `corepack pnpm lint` | Pending | Must pass or record exact failure |
| Backend typecheck | `corepack pnpm typecheck` | Pending | Must pass or record exact failure |
| Backend tests | `corepack pnpm test` | Pending | Must pass or record exact failure |
| Backend build | `corepack pnpm build` | Pending | Must pass or record exact failure |
| Contracts validation | `corepack pnpm contracts:check` | Pending | Must validate S04 DTOs/fixtures and Mystery-safe projection |
| OpenAPI validation | `corepack pnpm openapi:check` | Pending | Must reflect applicant dashboard/application draft endpoints |
| Migration check | `corepack pnpm db:migrate:check` | Pending | Must validate Slice 4 application draft tables and block later-slice tables |
| Seed check | `corepack pnpm db:seed:check` | Pending | Must validate safe synthetic lower-env application seeds |
| API smoke check | `GET /api/v1/applicant/dashboard` and autosave route if implemented | Pending | Use actual implemented endpoint set |
| Browser/route check | `/applicant/dashboard` and `/applicant/applications/[id]` if implemented | Pending | Must inspect applicant dashboard/wizard routes |
| Mystery leakage check | test/grep serialized applicant dashboard fixtures | Pending | Must prove no raw Mystery metadata leaks in applicant projection |

## Stop triggers

Stop instead of guessing if:

- The application state machine would require payment, allocation, assessment, decision, result, or Mystery lifecycle state inside `applications`.
- Applicant scope/RBAC cannot be enforced from the Slice 1 actor context and existing scope model.
- Mystery-safe dashboard serialization cannot suppress raw episode type/status/visit/judge/assignment metadata.
- Implementation requires document/upload/payment/submission behavior before the relevant later slice.
- Returning-park prefill or previous feedback response requires production migration data rather than safe synthetic placeholders.
- Live Figma is known newer than the local snapshot and the user has not approved using the local snapshot.

## Contract review notes

PASS on 2026-05-05.

- Slice 4 is the first eligible TODO after Slice 3, which is DONE_BACKEND with delivery evidence.
- Source PRD and requirements rows REQ-APP-001, REQ-APP-005, REQ-APP-006, REQ-APP-007, REQ-CYC-002, and REQ-CYC-003 support dashboard, draft/autosave, progress, previous-data placeholders, and Mystery-safe projection scope.
- The contract preserves episode-first ownership: assessment_episodes remains the lifecycle root and applications owns only the Full Assessment applicant package state.
- Documents/uploads and submission/payments are explicitly deferred to Slices 5 and 6 despite adjacent wizard PNG evidence.
- Missing UI variants are recorded as stubs/gaps; no production fees, VAT/legal wording, scoring criteria, provider credentials, or KBT approvals are introduced.

## Implementation review notes

PASS_WITH_FRONTEND_GAPS on 2026-05-05.

- Contracts, OpenAPI, migration, seed, lint, tests, build/typecheck, API smoke, frontend route smoke, and Mystery leakage checks passed.
- Direct `corepack pnpm build` emitted successful Next build output but exceeded the shell tool timeout; `corepack pnpm typecheck` reran the full build and package typechecks successfully.
- Remaining frontend gaps are exact autosave loading/conflict/empty variants, exact previous-feedback-response UI, and mobile applicant wizard exports.

## Closure note

Closed as DONE_BACKEND on 2026-05-05 because backend/API/contracts are verified and frontend routes exist, while frontend visual coverage remains partial pending additional design evidence.

### Closure Inputs

- Close summary: Applicant dashboard and Full Assessment draft/autosave foundation delivered.
- Client impact: Park managers can view safe applicant dashboard cards, create/continue a draft application, save section drafts, see progress, and record previous feedback draft text in lower-env flows.
- Frontend handoff: `/applicant/dashboard` and `/applicant/applications/[applicationId]` exist and serve successfully from the Next app; visual precision remains partial for missing variants.
- Backend handoff: S04 API routes, shared DTOs/fixtures, OpenAPI paths, application draft migrations/seeds, scope checks, audit events, optimistic concurrency, and Mystery-safe projection tests are in place.
- Remaining frontend gaps: FE-001, FE-002, FE-013, FE-014, FE-015.
- Reopen triggers: New or changed applicant dashboard/list/detail PNGs, wizard step PNGs, exact previous-feedback screen, autosave state variants, or mobile wizard exports.
