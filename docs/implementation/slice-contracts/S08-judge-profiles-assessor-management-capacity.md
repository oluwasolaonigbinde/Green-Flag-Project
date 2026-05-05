# Current Plan

## Metadata

- Slice ID: 8
- Title: Judge profiles, assessor management, availability, and capacity
- Backlog status: IN_PROGRESS
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S08-judge-profiles-assessor-management-capacity.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/implementation-review-checklist.md
  - docs/implementation/slice-contracts/S01-identity-rbac-audit-foundation.md
  - docs/implementation/slice-contracts/S02-organisations-parks-locations-cycles-episodes.md
  - docs/implementation/slice-contracts/S07-admin-read-models-queues.md
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
- Related UI evidence:
  - docs/figma/Assessor - Dashboard.png
  - docs/figma/Assessor - Schedule Visit.png
  - docs/figma/Assessor - Manage Preference.png
  - docs/figma/Super Admin - Assessor Management.png
  - docs/figma/Super Admin - Award management - User role Management - Judges.png
  - docs/figma/Super Admin - Award management - User role Management - Judges-1.png

## Objective

Deliver the judge/assessor profile and capacity management foundation needed before allocation: assessor profile records linked to internal users, accreditation status source-of-truth fields, preference capture, availability windows, capacity limits, admin assessor management read models, assessor self-service read/update contracts, and lower-env fixtures. This slice must not create allocation candidates, judge assignments, visit scheduling workflow, scoring, result decisions, messaging, exports, or production accreditation-provider integration.

This slice is legal because it is the first eligible `TODO` after Slice 7, dependencies `[1, 2]` are satisfied, no earlier `BLOCKED` slice precedes it, and no active slice exists before planning.

## Primary User/System Path

1. A Super Admin opens assessor management and views judge/assessor profiles, accreditation state, active/inactive status, capacity, and preference summaries.
2. A Super Admin creates or updates an assessor profile linked to an existing internal user/role foundation.
3. An assessor opens their dashboard/profile preference surface and views their safe profile, availability, capacity, and preference state.
4. The assessor updates preferences and availability/capacity declarations within validation limits.
5. The backend records all profile/preference/availability/capacity changes with audit events.
6. Later allocation slices can read capacity/preference data, but no allocation candidate or assignment is generated here.

## Scope Lock

### In Scope

- Assessor profile records linked to existing `internal_users` and role assignments.
- Accreditation status fields and read models using lower-env/internal source-of-truth markers only.
- Admin assessor management queue/read model with filters, pagination, active/accreditation/capacity status, and safe contact summary.
- Assessor self-profile/dashboard read model.
- Preference capture for broad region/category/availability constraints where supported by source docs and UI evidence.
- Availability windows and capacity declarations as prerequisites for future allocation.
- Admin create/update/disable assessor profile commands.
- Assessor update preference/availability/capacity commands.
- RBAC/scope checks for Super Admin/KBT Admin and assessor self-service access.
- Audit events for every data-changing profile/preference/availability/capacity command.
- DTO schemas, fixtures, OpenAPI paths, migrations/seeds, tests, and frontend routes backed by available assessor/admin PNG evidence.

### Out Of Scope

- Allocation candidate generation, COI checks, hold/release, assignment, acceptance/decline, reassignment, or contact reveal rules; Slice 9 owns these.
- Actual visit scheduling, visit calendar state machine, judge visit notes, site visit workflow, or Mystery visit timing; later allocation/visit slices own these.
- Assessment forms, scoring criteria, evidence, offline sync, thresholds, results, certificates, public map, notifications, exports, and messaging.
- Production LANTRA/accreditation provider integration, provider credentials, real-time accreditation sync, or official KBT approval workflows.
- User invitation/login flows beyond linking to existing identity/RBAC foundation.
- Applicant-facing assessor data.

### Forbidden Work

- Do not generate allocation candidates or assign judges.
- Do not expose raw Mystery Shop visit, assignment, timing, hidden status, or covert contact data.
- Do not invent official accreditation approvals, provider credentials, certification bodies, scoring criteria, applicant bands, fees, VAT, or legal wording.
- Do not model allocation or assessment lifecycle state in `applications.status`.
- Do not let UI labels define RBAC, accreditation approval, allocation, or visit workflow rules.

## Source Mapping

### Product / Domain Truth

- The backlog requires judge/assessor profiles, accreditation status source of truth, preferences, availability/capacity, admin management surfaces, and related read models.
- S01 already provides internal users, role assignments, session profile resolution, auth guards, and audit foundations.
- S02 already provides parks, award tracks/categories, cycles, windows, and `assessment_episodes`.
- S07 explicitly deferred assessor management to S08.
- Implementation review checklist requires LANTRA/accreditation external adapter boundaries to be respected.

### Operational / Architecture Truth

- `assessment_episodes` remains the operational lifecycle root; assessor profiles are not lifecycle roots for applications.
- `applications` remains applicant package state only.
- Backend owns profile state, RBAC, audit, redaction, API contracts, and validation.
- Every profile/preference/availability/capacity command must emit append-only `audit_events`.

### Platform Reality

- Identity/RBAC/audit foundation exists.
- Domain model and lower-env seeds exist.
- Admin read models exist through S07.
- Judge/assessor management is currently not implemented.
- Production accreditation provider credentials and approval workflows are unavailable.

### Gap Register References

- `FE-006`: assessor/judge management screens exist, but missing state variants must be recorded.
- `FE-007`: allocation screens are later-slice evidence only and must not define S08 allocation behavior.
- External production dependencies remain unavailable for official approvals/provider integrations.

## Backend Contract

### Data / Migration Scope

- Add assessor profile/preference/availability/capacity tables only if needed:
  - `assessor_profiles`
  - `assessor_preferences`
  - `assessor_availability_windows`
  - `assessor_capacity_declarations`
- Link profiles to `internal_users` and role assignments from S01.
- Store accreditation status as an internal/lower-env value with provider sync markers only, not production provider credentials.
- Do not add allocation, assignment, scoring, visit, result, message, export, or notification-send tables.
- Update migration checker to allow only S08 assessor profile/preference/availability/capacity tables.

### Queries / Read Models

- `getAssessorSelfProfile`
- `updateAssessorSelfPreferences`
- `updateAssessorSelfAvailability`
- `updateAssessorSelfCapacity`
- `listAdminAssessorProfiles`
- `getAdminAssessorProfile`
- `createAdminAssessorProfile`
- `updateAdminAssessorProfile`
- `disableAdminAssessorProfile`

### Commands

- Admin create/update/disable assessor profile.
- Assessor self-update preferences.
- Assessor self-update availability windows.
- Assessor self-update capacity declarations.
- All commands must preserve RBAC validation, idempotency where appropriate, optimistic concurrency where updating records, and audit events.

### State / Semantics

- Profile status: active, inactive, pending profile completion.
- Accreditation status: lower-env/current, expired, pending verification, unavailable external value.
- Preference data: broad regions/countries, award track/category preferences, unavailable dates/notes, and declared constraints only.
- Capacity data: cycle-year capacity declarations and current load placeholders; current load may be zero/lower-env until allocation exists.
- Availability windows: date/time windows or unavailable periods for future allocation use.
- Allocation eligibility output is a safe readiness hint only; no candidate generation.

### RBAC / Scope

- Super Admin/KBT Admin can list and manage assessor profiles.
- Assessor/Judge actors can read and update only their own profile/preference/availability/capacity state.
- Applicant and park manager roles cannot access assessor management endpoints.
- Finance Admin has no default access unless separately granted by role foundation.

### Mystery Redaction

- S8 profile/read models must not reveal Mystery assignment, visit timing, hidden contact, or covert status data.
- Assessor self-dashboard may show profile/readiness/capacity information only; actual Mystery allocation visibility waits for S9/S10/S11 contracts.

### Audit

- Pure read-model queries do not emit audit events unless later policy changes.
- Create/update/disable profile, preference, availability, and capacity commands emit audit events with before/after state and reason/idempotency metadata where supplied.

### Error Cases

- `unauthorized` for missing/invalid session.
- `forbidden` for insufficient role or self-scope mismatch.
- `validation_failed` for malformed profile/preferences/availability/capacity input.
- `dependency_missing` for missing internal user/profile/cycle reference.
- `conflict` or `idempotency_conflict` for stale profile versions or invalid state transitions.

## API / DTO Contract

### Endpoints

- `GET /api/v1/assessor/profile`
- `PATCH /api/v1/assessor/profile/preferences`
- `PATCH /api/v1/assessor/profile/availability`
- `PATCH /api/v1/assessor/profile/capacity`
- `GET /api/v1/admin/assessors`
- `POST /api/v1/admin/assessors`
- `GET /api/v1/admin/assessors/:assessorId`
- `PATCH /api/v1/admin/assessors/:assessorId`
- `POST /api/v1/admin/assessors/:assessorId/disable`

### Request DTOs

- Admin assessor queue query DTO with page, page size, search, profile status, accreditation status, country/region, award track/category, cycle year, and capacity status filters.
- Create/update assessor profile DTO.
- Preference update DTO.
- Availability window update DTO.
- Capacity declaration update DTO.
- Route params for assessor profile id.

### Response DTOs

- Assessor self-profile response.
- Admin assessor profile page envelope.
- Admin assessor profile detail response.
- Assessor profile command response.
- Preference/availability/capacity command responses.
- Error response using existing envelope.

### Fixtures

- Lower-env assessor profile fixture.
- Assessor self-profile fixture.
- Admin assessor list fixture.
- Admin assessor detail fixture.
- Preference update fixture.
- Availability update fixture.
- Capacity declaration fixture.

## Frontend Contract

### Available Screens

- `docs/figma/Assessor - Dashboard.png`
- `docs/figma/Assessor - Schedule Visit.png`
- `docs/figma/Assessor - Manage Preference.png`
- `docs/figma/Super Admin - Assessor Management.png`
- `docs/figma/Super Admin - Award management - User role Management - Judges.png`
- `docs/figma/Super Admin - Award management - User role Management - Judges-1.png`

### Partial Screens

- Assessor dashboard and preference evidence exists, but assignment/visit content in those screens belongs to S9/S11 unless safely stubbed.
- Super Admin assessor management and judge role management screens exist, but exact create/edit/disable/accreditation sync/capacity variants are not separately confirmed.

### Missing Screens

- Exact assessor profile edit variants.
- Exact accreditation pending/expired/unavailable variants.
- Exact admin create/edit/disable assessor variants.
- Exact capacity and availability conflict/validation variants.
- Exact mobile assessor management/preference views.

### Implement Now

- Admin assessor management list/detail route backed by contract fixtures.
- Assessor profile/preferences/availability/capacity route backed by contract fixtures.
- Safe dashboard cards for profile completion, accreditation status, availability, and capacity.
- Stub visit/assignment cards as unavailable/deferred only.

### Stub / Mock Now

- Production accreditation provider sync stays `external_value_unavailable`.
- Visit schedule cards are layout-only/deferred if no allocation/visit contract exists.
- Allocation load/current assignments remain zero/deferred placeholders until S9.

### Wait For Future Slices

- Allocation candidates, COI, assignments, hold/release, accept/decline, reassignment.
- Actual visits/site scheduling and assessment workflows.
- Mystery redaction hardening expansion.
- Scoring/results/certificates/public map.
- Notification sending, exports, jobs, and messages.

### Reopen Triggers

- New or changed assessor dashboard/preference screens.
- Exact admin assessor create/edit/disable screens.
- Exact accreditation sync/provider state screens.
- Exact mobile assessor management/preference screens.
- Approved production accreditation provider contract or credentials.

## Design Coverage Check

### Expected UI Surfaces

- Assessor self-dashboard/profile summary.
- Assessor preference/availability/capacity management.
- Super Admin assessor management list/detail.
- Judge role management list/detail.

### PNG Matches

- Expected surface: assessor dashboard/profile summary
  - Matched PNG: `docs/figma/Assessor - Dashboard.png`
  - Confidence: medium; assignment/visit content must remain deferred unless backed by S9/S11.
- Expected surface: assessor preferences
  - Matched PNG: `docs/figma/Assessor - Manage Preference.png`
  - Confidence: high for preference layout.
- Expected surface: availability/schedule layout
  - Matched PNG: `docs/figma/Assessor - Schedule Visit.png`
  - Confidence: low for S8; actual visit scheduling belongs later.
- Expected surface: admin assessor management
  - Matched PNG: `docs/figma/Super Admin - Assessor Management.png`
  - Confidence: high for list layout.
- Expected surface: admin judge role management
  - Matched PNG: `docs/figma/Super Admin - Award management - User role Management - Judges.png`
  - Matched PNG: `docs/figma/Super Admin - Award management - User role Management - Judges-1.png`
  - Confidence: medium; role rules come from backend contracts.

### Frontend Gap Records Required

- FE-031: exact assessor profile edit/accreditation state variants.
- FE-032: exact admin create/edit/disable assessor variants.
- FE-033: exact availability/capacity conflict/validation variants.
- FE-034: assessor/admin management mobile variants.

## Planned File Zones

- apps/api/src/**
- apps/web/app/admin/assessors/**
- apps/web/app/assessor/**
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
| Repo/app scaffold check | inspect root/apps/packages files | Pending | Confirm S07 scaffold remains intact |
| Contracts validation | `corepack pnpm contracts:check` | Pending | Must validate S08 assessor DTOs/fixtures |
| OpenAPI validation | `corepack pnpm openapi:check` | Pending | Must include S08 paths/schemas |
| Migration check | `corepack pnpm db:migrate:check` | Pending | Must allow only S08 assessor profile/preference/availability/capacity scope |
| Seed check | `corepack pnpm db:seed:check` | Pending | Must validate lower-env assessor seeds if added |
| Lint | `corepack pnpm lint` | Pending | Must pass |
| Tests | `corepack pnpm test` | Pending | Must include assessor profile/admin management tests |
| Build/typecheck | `corepack pnpm typecheck` | Pending | Must pass full build and package typechecks |
| API smoke | assessor self/admin assessor management reads and writes | Pending | Use Fastify injection with admin, assessor, and denied applicant cases |
| Frontend route smoke | assessor/admin assessor routes | Pending | Confirm semantic anchors and no forbidden allocation/visit claims |
| Mystery leakage check | profile/dashboard payloads | Pending | Must prove no raw Mystery visit/assignment/timing/contact metadata leaks |
| Audit check | profile/preference/availability/capacity commands | Pending | Must prove data-changing commands append audit events |

## Stop Triggers

Stop instead of guessing if:

- S8 requires allocation candidate generation, judge assignment, COI, accept/decline, reassignment, actual visit scheduling, scoring, results, messages, exports, or notification sending.
- Accreditation state requires production provider credentials, official approval wording, KBT approval workflow, or live LANTRA/provider integration.
- Profile/capacity semantics require application lifecycle changes outside `assessment_episodes`.
- A projection requires raw Mystery assignment, visit timing, hidden contact, or covert status data outside a later approved redaction contract.
- Live Figma is known newer than the local snapshot and the user has not approved using the local snapshot.

## Contract Review Notes

PASS on 2026-05-05.

- Slice 8 is the first eligible TODO after Slice 7, which is DONE_BACKEND with delivery evidence.
- Dependencies S01 and S02 are satisfied.
- The contract is limited to assessor/judge profiles, accreditation source-of-truth markers, preferences, availability, capacity, admin management surfaces, read models, frontend routes, tests, and lower-env fixtures.
- Allocation candidates, assignments, COI, visit scheduling workflows, scoring, results, messages, exports, notification sending, production accreditation provider integration, credentials, and official approval workflows remain out of scope.
- `assessment_episodes` remains the lifecycle root, `applications` remains applicant package state, RBAC/redaction/audit are server-side, and Mystery assignment/visit/timing/contact data is not exposed.

## Implementation Review Notes

PASS_WITH_FRONTEND_GAPS on 2026-05-05.

- Backend/API scope is complete for S08 assessor profile and management foundations.
- Contract fixtures, OpenAPI entries, migrations/seeds, API smoke tests, RBAC-denied cases, audit assertions, and Mystery leakage assertions passed.
- Frontend assessor/admin management routes exist, but exact profile edit/accreditation/admin edit/capacity/mobile variants remain recorded gaps.

## Closure Note

Closed as `DONE_BACKEND` on 2026-05-05.

- Delivery record: docs/implementation/delivery-records/S08-judge-profiles-assessor-management-capacity-delivery.md.
- Close summary: Judge/assessor profiles, accreditation markers, preferences, availability, capacity, admin management APIs, assessor self-service APIs, migrations/seeds, OpenAPI paths, tests, audit-backed commands, and partial frontend routes delivered.
- Client impact: Admins can manage assessor readiness and assessors can maintain prerequisite availability/capacity data before allocation.
- Frontend handoff: `/assessor/profile`, `/admin/assessors`, and `/admin/assessors/[assessorId]` exist as contract-backed routes aligned to available assessor/admin evidence.
- Reopen triggers: New/changed profile/accreditation variants, admin create/edit/disable screens, availability/capacity validation screens, mobile assessor/admin screens, or approved production accreditation provider contracts.
