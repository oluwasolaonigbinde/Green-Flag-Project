# Slice Contract: S03 Registration, Eligibility, Verification, and Admin Approval

## Metadata

- Slice ID: 3
- Title: Registration, eligibility, verification, and admin approval
- Backlog status: IN_PROGRESS
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S03-registration-eligibility-verification-admin-approval.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/figma-snapshot-lock.json
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
- Related UI evidence:
  - docs/figma-manifest.json
  - docs/figma-manifest.md
  - local PNG exports mapped via `ui-slice-map.yaml`

## Objective

Deliver the public-to-admin registration journey: park registration submission, built-in eligibility validation, duplicate warning, What3Words/OS/ONS location capture, email verification, admin approve/reject, notification contracts, and audit-backed state transitions.

This slice is legal because it is the first eligible `TODO` slice after Slice 2, Slice 2 is now `DONE_FULL`, no active slice exists, and no earlier `BLOCKED` slice precedes Slice 3.

## Primary user/system path

1. A park manager starts a registration submission through the public applicant-facing flow.
2. The API validates eligibility before allowing a submission to progress.
3. The registration flow captures the park location with What3Words, OS Open Greenspace, and ONS geography enrichment adapters or approved mocks.
4. The system warns about potential duplicates without blocking the submission unless the business rule requires it.
5. A verification email is sent and a verification landing route confirms the email step.
6. KBT admin reviews the submission queue and approves or rejects with a reason.
7. The canonical park record transitions from pending to active or rejected/inactive through server-side state changes and audit events.

## Scope lock

### In scope

- Registration workflow root for public park submissions.
- Eligibility validation against the source-truth criteria.
- Duplicate name/address warning state with admin-visible acknowledgement.
- Email verification token handling and verification landing route.
- Admin registration review queue, approve, and reject actions.
- What3Words, OS Open Greenspace, and ONS location-capture adapter contracts or mocks for the registration flow.
- Notification intent contracts for verification, approval, and rejection emails.
- Audit events for every state-changing command in the registration journey.
- Domain DTOs/read models for registration submission, verification, and admin review queue states.
- Frontend routes/components for the registration journey where approved UI evidence exists, plus stubs/gaps for missing screens.
- Safe synthetic lower-env registration fixtures.

### Out of scope

- Application draft/autosave, documents, payments, allocation, results, messaging, jobs, exports, and public map updates.
- Judge profile management and allocation UI.
- Live provider credentials for What3Words, OS, ONS, or email delivery.
- Production fee/VAT/legal wording and any payment gateway work.
- Later-slice dashboard/queue work beyond the registration review queue.

### Forbidden work

- Do not invent production credentials or live location-enrichment values.
- Do not bypass the eligibility check or duplicate warning rules.
- Do not introduce application/payment/allocation/workflow tables from later slices.
- Do not use the UI to override server-side approval, verification, or audit logic.
- Do not conflate the registration workflow state with the canonical `parks`/`organisations` domain model from Slice 2.

## Source mapping

### Product / domain truth

- PRD Section 1.3 includes park registration in the full rebuild scope.
- PRD Section 2.2 requires permissions to be enforced at the API level.
- PRD Section 7.1, 7.2, and 7.6 define the What3Words, OS Open Greenspace, and ONS geography integration roles in registration.
- PRD Section 9.1 defines park account statuses: `PENDING_VERIFICATION`, `PENDING_ADMIN_REVIEW`, `ACTIVE`, `SUSPENDED`, `INACTIVE`.
- PRD Appendix screens map to `SCR-REG-01`, `SCR-REG-02`, `SCR-ADM-02`, and the admin dashboard/queue surfaces.
- The requirements workbook confirms:
  - `REQ-REG-001` for eligibility validation and `PENDING_VERIFICATION` on success.
  - `REQ-REG-003` for duplicate warning and acknowledgement.
  - `REQ-REG-004` for structured admin approval/rejection and audit.
  - `REQ-REG-006` for What3Words storage and judge deeplink display.
  - `REQ-REG-007` for OS Open Greenspace suggestion and manual confirmation.
  - `REQ-REG-008` for ONS geography enrichment and audit-logged overrides.
- Slice 2 already established canonical organisations, parks, locations, award tracks, cycles, and episodes, which this workflow must consume rather than re-create.

### Operational / architecture truth

- The architecture requires AWS/ECS/PostgreSQL/PostGIS boundaries and geospatial enrichment via browser/API adapter boundaries.
- The architecture requires data integrity over convenience and event-driven transitions rather than hidden state changes.
- Slice 1 established authenticated actor context, RBAC guards, and append-only audit events.
- Slice 2 established the canonical episode-first domain model that registration must activate, not replace.

### Platform reality

- `system_state.md` still marks registration flow as not implemented.
- The repo already has the workspace, contracts, db package, API scaffold, and validation commands.
- No active slice exists.

### Gap register references

- No external production credentials or values are available for the What3Words, OS, or ONS adapters.
- The slice can proceed with adapter boundaries, synthetic fixtures, and explicit gap records.
- Existing frontend evidence is sufficient for the registration wizard shell but not for every verification-state variant.

## Backend contract

### Data / migration scope

- Add a registration workflow root table such as `registration_submissions` that owns:
  - submission identity
  - park/org reference links
  - eligibility result
  - duplicate warning state
  - verification token state
  - admin review outcome
  - submitted registration payload snapshot
- Reuse the Slice 2 canonical `organisations` and `parks` tables for the final account state.
- Reuse the Slice 1 audit envelope for every mutating registration command.
- Add lower-env synthetic registration fixtures and any required token/notification state tables or snapshots.
- Keep location capture as an adapter-backed contract, not a live production integration.
- Preserve later-slice application/payment behavior boundaries.

### Commands

- `submitRegistration`
- `checkRegistrationEligibility`
- `resolveRegistrationLocation`
- `sendRegistrationVerification`
- `verifyRegistrationEmail`
- `listRegistrationReviews`
- `approveRegistration`
- `rejectRegistration`

### Queries / read models

- Registration submission summary.
- Duplicate warning summary.
- Verification state summary.
- Admin review queue item.
- Park activation snapshot for post-approval handoff.

### State transitions

- Create a registration submission and set the initial status.
- Promote the submission through eligibility, verification, and admin review states.
- Transition the canonical park status from pending to active or inactive/rejected according to the review decision.
- Record duplicate warnings and manual acknowledgements.
- No application, allocation, payment, or results transitions in this slice.

### RBAC / scope

- Park-manager/public registration actions are unauthenticated or use the future applicant identity boundary; do not assume Slice 1 auth context for the public form.
- Admin review actions require the Slice 1 authenticated admin context and scope checks.
- Server-side authorization remains the source of truth.

### Audit

- Every data-changing registration command emits an append-only audit event.
- Store who performed the action, the target registration submission, the decision, and the request metadata.

### Error cases

- `validation_failed` for failed eligibility or malformed form/location payloads.
- `conflict` for duplicate submissions or invalid state transitions.
- `dependency_missing` for missing park/organisation references or unavailable location adapters.
- `forbidden` for admin review actions without the required scope.

### Idempotency / retries

- Registration submission and verification flows must support idempotent retries.
- Repeated verify/approve/reject requests should be handled safely with the Slice 0 command envelope conventions.

## API / DTO contract

### Endpoints

- `POST /api/v1/registrations`
- `POST /api/v1/registrations/:registrationId/location-lookup`
- `POST /api/v1/registrations/:registrationId/verify-email`
- `GET /api/v1/registrations/:registrationId`
- `GET /api/v1/admin/registration-review-queue`
- `POST /api/v1/admin/registration-review-queue/:registrationId/approve`
- `POST /api/v1/admin/registration-review-queue/:registrationId/reject`

### Request DTOs

- Registration submission DTO with eligibility and contact fields.
- Location lookup DTO with lat/lng/postcode/W3W inputs.
- Email verification DTO with token/code input.
- Admin approve/reject DTOs with optional reason.

### Response DTOs

- Registration submission response.
- Verification landing response.
- Admin review queue response.
- Duplicate warning response.
- Park activation response.

### Mock responses / fixtures

- Synthetic registration submission fixture.
- Synthetic duplicate-warning fixture.
- Synthetic verification token fixture.
- Synthetic approve/reject queue fixtures.
- Mock location-suggestion responses for What3Words, OS Open Greenspace, and ONS enrichment.

## Frontend contract

### Available screens

- `docs/figma/Applicant - Application - Location.png`
- `docs/figma/Applicant - Application - Location-1.png`
- `docs/figma/Applicant - Application - Site Information.png`
- `docs/figma/Applicant - Application - contact details.png`
- `docs/figma/Applicant - Application - publicity.png`
- `docs/figma/Applicant - Application - Optional Information.png`
- `docs/figma/Applicant - Application - Review & submit.png`
- `docs/figma/Appicant - Application - Submitted.png`
- `docs/figma/Super Admin - Dashboard.png`
- `docs/figma/Super Admin - Assessor Allocation - Application List.png`
- `docs/figma/Super Admin - Award Management - Recent Applications.png`

### Partial screens

- The registration wizard shell is partially mapped through application-wizard PNGs.
- The admin queue is partially mapped through the super-admin dashboard/queue PNGs.

### Missing screens

- `SCR-REG-02` email verification landing page is not present in the local PNG exports.
- The exact `SCR-ADM-02` registration review queue screen is not separately exported.

### Implement now

- Registration form routes/components aligned to the available location and review wizard evidence.
- Email verification landing route as a stubbed or minimally functional screen.
- Admin review queue layout and decision actions backed by DTOs or mocked responses where the backend is not yet complete.

### Stub/mock now

- Mock location suggestions and verification state for missing provider integrations.
- Stub the verification landing page copy if the exact PNG evidence is absent.

### Wait for future screens

- Later applicant dashboard and payment states remain for later slices.
- Exact admin registration review variants wait for new UI evidence.

### Reopen triggers

- New or changed registration/verification PNG exports.
- A new exact registration review queue design that changes the layout or DTO shape.

## Design coverage check

### Expected UI surfaces for this slice

- Registration wizard/location step.
- Email verification landing page.
- Admin registration review queue.

### PNG matches

- Expected surface: registration wizard and admin queue
  - Matched PNG: `docs/figma/Applicant - Application - Location.png`
  - Matched PNG: `docs/figma/Applicant - Application - Site Information.png`
  - Matched PNG: `docs/figma/Applicant - Application - Review & submit.png`
  - Matched PNG: `docs/figma/Super Admin - Dashboard.png`
  - Matched PNG: `docs/figma/Super Admin - Award Management - Recent Applications.png`
  - Confidence: medium
  - Notes: these screens inform the registration workflow layout, but the exact email-verification screen is missing from local PNG exports.

### PNG-backed surface inventory

| Surface | Route | PNG path | Viewport / variant | Visual inventory | Approved fallback | Internal-copy rule |
| --- | --- | --- | --- | --- | --- | --- |
| Registration wizard location step | `/register` or equivalent | docs/figma/Applicant - Application - Location.png | mobile/applicant | Registration/location capture | Wizard shell with mocks | Do not reveal hidden status copy |
| Registration wizard review | `/register/review` or equivalent | docs/figma/Applicant - Application - Review & submit.png | mobile/applicant | Submission confirmation | Stubbed review screen | Do not invent fees or legal wording |
| Admin registration queue | `/admin/registrations` or equivalent | docs/figma/Super Admin - Award Management - Recent Applications.png | desktop/admin | Queue and review layout | Queue shell with stubs | Do not reveal Mystery data |

### Missing or unclear design coverage

- `SCR-REG-02` exact email verification landing page is missing.
- Exact queue microcopy remains partially inferred from dashboard-level PNGs.

### Existing implementation overlap

- Slice 1 auth/RBAC/audit foundation.
- Slice 2 canonical organisation/park/cycle/episode data model.

### Design traceability

- Surface: registration wizard location step
  - Verified route: `/register` or equivalent
  - PNG: `docs/figma/Applicant - Application - Location.png`
  - Variant notes: mobile-first registration flow

### Visual / route-inspection gates

- Route: registration and verification routes
  - Screenshot artifact: required during implementation review if the routes can run locally
  - Semantic anchors: eligibility status, duplicate warning, verification state, admin approval
  - Negative copy assertions: no production fee/VAT/legal wording, no raw Mystery labels

### Ambiguities requiring user decision

- None after applying the PRD/requirements/architecture sources.

### User-approved design decisions

- Keep the email verification landing page as a minimal but functional route if exact screen evidence is missing.

### Deferred affordance policy

- Element: exact registration review queue variants
  - Treatment: stub route
  - Notes: later UI evidence can reopen the slice if the design changes materially.

## Planned file zones

Advisory only; implementation may choose better locations if repo conventions require it.

- apps/api/src/**
- apps/web/app/**
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
| Repo/app scaffold check | inspect root/apps/packages files | Pending | Confirm current scaffold remains intact |
| Backend lint | `corepack pnpm lint` | Pending | Must pass or record exact failure |
| Backend typecheck | `corepack pnpm typecheck` | Pending | Must pass or record exact failure |
| Backend tests | `corepack pnpm test` | Pending | Must pass or record exact failure |
| Backend build | `corepack pnpm build` | Pending | Must pass or record exact failure |
| Contracts validation | `corepack pnpm contracts:check` | Pending | Must validate registration DTOs/fixtures |
| OpenAPI validation | `corepack pnpm openapi:check` | Pending | Must reflect the registration endpoints if they are added |
| Migration check | `corepack pnpm db:migrate:check` | Pending | Must validate registration workflow tables and block later-slice tables |
| Seed check | `corepack pnpm db:seed:check` | Pending | Must validate safe synthetic lower-env seeds |
| API smoke check | N/A or `POST /api/v1/registrations` if implemented | Pending | Use the actual implemented endpoint set |
| Browser/route check | Registration and verification routes if implemented | Pending | Must inspect the available applicant/admin routes |

## Stop triggers

Stop instead of guessing if:

- The source truth cannot support the registration state machine.
- The duplicate-warning or verification flows require invented production data or credentials.
- The implementation would need later workflow tables beyond the registration/root workflow tables.
- The registration route set cannot be mapped safely to the available UI evidence.
- A required verification or admin queue screen lacks sufficient design evidence and cannot be stubbed safely.

## Contract review notes

PASS on 2026-05-05.

- Slice 3 is the only active CONTRACT_REVIEW item, and Slice 2 is DONE_FULL with delivery evidence.
- Source PRD and requirements rows REQ-REG-001 through REQ-REG-008 support registration eligibility, duplicate warning, email verification, admin approval/rejection, W3W/OS/ONS enrichment, notifications, and audit expectations.
- The contract preserves Slice 1 audit/RBAC foundations and Slice 2 canonical organisation/park/location model instead of creating a parallel domain model.
- Missing exact verification and registration-review queue screens are recorded as frontend gaps with stubs/reopen triggers; UI evidence is not used to invent business rules.
- No production provider credentials, fee/VAT/legal values, scoring criteria, KBT approvals, or later-slice workflow behavior are introduced.

## Implementation review notes

Pending.

## Closure note

Closed as DONE_BACKEND on 2026-05-05.

- Implementation review outcome: PASS_WITH_FRONTEND_GAPS.
- Delivery record: docs/implementation/delivery-records/S03-registration-eligibility-verification-admin-approval-delivery.md.
- Remaining frontend gaps: exact `SCR-REG-02` email verification landing and exact `SCR-ADM-02` registration review queue.

### Closure Inputs

- Close summary: Registration submission, eligibility, duplicate acknowledgement, mock location enrichment, verification, admin queue, approve/reject, notification intents, audit, migration/seed, OpenAPI, and fallback frontend routes delivered.
- Client impact: Public park registration can now progress to verified admin review and admin decision using stable auditable contracts.
- Frontend handoff: `/register`, `/register/verify`, and `/admin/registrations` exist as fallback routes aligned to available evidence.
- Backend handoff: Registration owns its workflow state and consumes Slice 1 audit/RBAC plus Slice 2 canonical park/organisation boundaries.
- Remaining frontend gaps: `SCR-REG-02` and exact `SCR-ADM-02`.
- Reopen triggers: New/changed registration verification PNGs or exact admin registration queue design.
