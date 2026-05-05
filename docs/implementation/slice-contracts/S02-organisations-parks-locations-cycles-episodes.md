# Slice Contract: S02 Organisations, Parks, Locations, Cycles, and Episodes

## Metadata

- Slice ID: 2
- Title: Organisations, parks, locations, cycles, and episodes
- Backlog status: IN_PROGRESS
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S02-organisations-parks-locations-cycles-episodes.md
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

Establish the canonical domain model for organisations, parks, park locations, award tracks/categories, award cycles, cycle windows, and `assessment_episodes` as the lifecycle root.

This slice is legal because it is the first eligible `TODO` slice after Slice 1, Slice 1 is `DONE_FULL`, no active slice exists, and there is no earlier `BLOCKED` slice before Slice 2.

## Primary user/system path

1. The backend can persist a canonical organisation and its parks.
2. Each park can be linked to a location record carrying the geospatial and geography-enrichment fields needed by later registration and allocation slices.
3. Award tracks/categories can be represented with safe operational states for Standard Green Flag and blocked/draft states for Community, Heritage, and Group.
4. Award cycles and cycle windows can represent overlapping annual windows without conflating window state with episode state.
5. `assessment_episodes` becomes the operational lifecycle root for all later workflow slices.
6. Later slices can resolve a park to a cycle/window/episode without putting workflow state into `applications`.

## Scope lock

### In scope

- Canonical `organisations` persistence and lookup.
- Canonical `parks` persistence and lookup, with organisation ownership.
- Park location persistence for geospatial coordinates and geography enrichment fields.
- Canonical `award_tracks` lookup data with operational status.
- Award cycle persistence and cycle window persistence.
- `assessment_episodes` persistence as the lifecycle root.
- Unique constraints and read helpers that enforce one episode per park per episode type per cycle year, in line with the PRD/architecture dual-window model.
- Safe lower-environment fixtures for organisations, parks, cycles, and episodes.
- Contract schemas and fixtures for organisation/park/cycle/episode read models.
- Migration and seed checks that allow the approved Slice 2 domain tables while still forbidding later-slice workflow tables.

### Out of scope

- Registration submission flow, eligibility checks, email verification, and admin approval.
- Applications, documents, payments, allocation, scoring, results, notifications, messaging, jobs, exports, and public map updates.
- Judge profile management and allocation UI.
- Mystery redaction hardening beyond the data model boundary established here.
- Live What3Words, OS Open Greenspace, or ONS API integrations.
- Production migration data, imported live park data, or real external credentials.

### Forbidden work

- Do not put application, payment, allocation, assessment, or decision state into `applications`.
- Do not invent live park, organisation, or cycle data.
- Do not invent production geocoding or location-enrichment values.
- Do not create later-slice tables such as `applications`, `invoices`, `scores`, `allocations`, or `results`.
- Do not relax the episode-first boundary.

## Source mapping

### Product / domain truth

- PRD Section 8.1 defines the core entities: Organisation, Park, Assessment Episode, Award Cycle, Judge Profile, Allocation, Score, Invoice, and Audit Log.
- PRD Section 8.2 defines the dual application window and the requirement that the data model support two active award cycle windows simultaneously.
- PRD Section 8.3 states that mystery shop suppression is set at the assessment episode level and that park-facing notifications are swallowed server-side.
- PRD Section 9.2 and 9.3 define application and allocation status separation, which this slice must not conflate.
- The PRD appendix maps admin and applicant screens to cycle/park/organisation concepts, including `SCR-ADM-01`, `SCR-ADM-05`, `SCR-ADM-12`, and `SCR-PRK-01/02/03`.
- The requirements workbook confirms:
  - `REQ-CYC-001` for full/mystery alternation.
  - `REQ-CYC-003` for two active award cycle windows.
  - `REQ-REG-007` and `REQ-REG-008` for park location enrichment fields.
  - `REQ-REG-001`, `REQ-REG-003`, `REQ-APP-005`, and `REQ-APP-006` for park and dashboard read models that will later consume these entities.
- `OI-018` appears as an open architecture question, but the PRD and architecture already define the dual-window model and the per-episode-type-per-cycle-year constraint, so it is not a blocker for this slice.

### Operational / architecture truth

- The architecture document defines:
  - `award_cycles` as year/country windows.
  - `assessment_episodes` as one row per park per assessment type per year.
  - `applications` as existing only for full assessment episodes.
  - event-driven state transitions between cycle phases.
- The architecture requires data integrity over convenience and says the data model separates assessment episodes from applications cleanly.
- The architecture requires geospatial enrichment from OS Open Greenspace and ONS Open Geography to feed later registration and allocation slices.
- Slice 0 and Slice 1 already established typed contracts, episode-first ownership, and audit-safe boundaries.

### Platform reality

- `system_state.md` still marks organisations/parks/cycles/episodes as not implemented.
- The repo already has the workspace, contracts, db package, API scaffold, and validation commands.
- No active slice exists.

### Gap register references

- `OI-018` is recorded as an open architecture question, but the PRD/architecture provide enough truth to proceed with a safe dual-window model.
- `ASM-005` data migration assumption remains a later hardening concern, not a blocker for synthetic lower-env seeds in this slice.
- No current frontend gap blocks the domain model.

## Backend contract

### Data / migration scope

- Add domain tables or equivalent persisted models for:
  - `organisations`
  - `parks`
  - `park_locations`
  - `award_tracks`
  - `award_cycles`
  - `cycle_windows`
  - `assessment_episodes`
- Keep the model episode-first:
  - `assessment_episodes` is the lifecycle root.
  - `applications` remains out of this slice.
- Model the dual-window rule so a park can have both full and mystery shop episodes in the same cycle year, with at most one episode per type per park per cycle year.
- Preserve later-slice flexibility for location enrichment and award-track expansion.
- Keep lifecycle-critical fields typed and check-constrained.
- Add lower-environment synthetic seeds for one organisation, multiple parks, two overlapping cycles/windows, and a small set of episodes.
- Keep migration checks aligned with the approved tables and still block later-slice workflow tables.

### Commands

- `createOrganisation`
- `createPark`
- `recordParkLocation`
- `createAwardCycle`
- `openCycleWindow`
- `createAssessmentEpisode`
- `resolveParkCycleSnapshot`

### Queries / read models

- Organisation summary.
- Park summary with current organisation, award track, and status.
- Park location summary.
- Award cycle summary and active-window summary.
- Assessment episode summary and per-park/per-cycle lookup.
- Dashboard-ready read model primitives for later registration and admin slices.

### State transitions

- Create canonical organisation and park records.
- Record and update park location enrichment fields.
- Open and close cycle windows.
- Create assessment episodes and enforce the per-park/per-type/per-cycle-year uniqueness rule.
- No application, allocation, payment, or result transitions in this slice.

### RBAC / scope

- No new permission model is introduced in this slice.
- Any mutating helpers or future APIs must use the Slice 1 actor/scope/audit foundation.
- Organisation and park ownership relationships are stored as data, not implied by UI.

### Audit

- Any mutating command introduced by this slice or its supporting seed/bootstrap path must carry the Slice 1 audit envelope.
- Do not create mutable audit logic here; reuse the Slice 1 append-only foundation.

### Error cases

- `invalid_state` when an episode violates the per-park/per-type/per-cycle-year constraint.
- `conflict` when a canonical organisation, park, or cycle identifier would duplicate an existing record.
- `validation_failed` for malformed geospatial or cycle data.
- `dependency_missing` when required organisation ownership or cycle references are absent.

### Idempotency / retries

- Preserve idempotent create/update command semantics for later slices.
- Use the Slice 0 command envelope conventions and Slice 1 audit metadata where applicable.

## API / DTO contract

### Endpoints

- No new public HTTP endpoints are required for this slice.
- Existing foundation endpoints remain unchanged.

### Request DTOs

- No public write DTOs are required.
- Domain command DTOs may exist in contracts/package tests for later slice consumption.

### Response DTOs

- Organisation summary schema.
- Park summary schema.
- Park location schema.
- Award cycle schema.
- Cycle window schema.
- Assessment episode schema.
- Dashboard snapshot fixture schemas for later applicant/admin read models.

### Mock responses / fixtures

- Synthetic lower-env organisation and park fixtures.
- Synthetic park location fixture with safe, non-production geography data.
- Synthetic cycle/window fixtures for one full and one mystery cycle.
- Synthetic assessment episode fixture for each episode type.

## Frontend contract

### Available screens

- `docs/figma/Super Admin - Award management - Award category.png`
- `docs/figma/Super admin - Management - Category details.png`
- `docs/figma/Super Admin - Assessor Management.png`
- `docs/figma/Applicant - Application - Application details.png`
- `docs/figma/Applicant - Application - Application details - Mystery Shopping.png`

### Partial screens

- None for this slice.

### Missing screens

- No Slice 2-specific frontend route is delivered.
- Organisation/park/cycle screens will be consumed by later slices and are not implemented here.

### Implement now

- No frontend route or component changes are required for Slice 2.

### Stub/mock now

- No frontend stubs are required because the slice is backend/data-model only.

### Wait for future screens

- Applicant dashboard, registration, admin queues, and assessor management screens remain for later slices.

### Reopen triggers

- New or changed organisation/park/cycle UI evidence.
- A later slice that needs a concrete read model for these entities.

## Design coverage check

### Expected UI surfaces for this slice

- None directly. UI evidence only informs downstream read-model shape.

### PNG matches

- Expected surface: organisation/park/cycle foundation
  - Matched PNG: `docs/figma/Super Admin - Award management - Award category.png`
  - Matched PNG: `docs/figma/Super admin - Management - Category details.png`
  - Matched PNG: `docs/figma/Applicant - Application - Application details.png`
  - Matched PNG: `docs/figma/Applicant - Application - Application details - Mystery Shopping.png`
  - Confidence: medium
  - Notes: these screens are downstream consumers of the domain model; no slice-2 UI is being shipped now.

### PNG-backed surface inventory

| Surface | Route | PNG path | Viewport / variant | Visual inventory | Approved fallback | Internal-copy rule |
| --- | --- | --- | --- | --- | --- | --- |
| Organisation/category management read model | N/A | docs/figma/Super Admin - Award management - Award category.png | desktop/admin | Domain labels and management hierarchy | Backend data model only | Do not invent new UI copy |
| Category detail read model | N/A | docs/figma/Super admin - Management - Category details.png | desktop/admin | Track/category details | Backend data model only | Do not imply production category activation |
| Park application detail read model | N/A | docs/figma/Applicant - Application - Application details.png | desktop/applicant | Park/application entity display | Backend data model only | Do not conflate application state with episode state |
| Mystery comparison read model | N/A | docs/figma/Applicant - Application - Application details - Mystery Shopping.png | desktop/applicant | Mystery-safe presentation | Backend data model only | Do not leak raw Mystery state |

### Missing or unclear design coverage

- No slice-2 route or screen is being added.
- Exact one-to-one UI mapping remains family-level in the local manifest.

### Existing implementation overlap

- Slice 0 foundation shell.
- Slice 1 identity/session/audit foundation.

### Design traceability

- Surface: organisation/category model
  - Verified route: N/A
  - PNG: `docs/figma/Super Admin - Award management - Award category.png`
  - Variant notes: backend data-model foundation only

### Visual / route-inspection gates

- Route: none required for this slice
  - Screenshot artifact: not required
  - Semantic anchors: organisation ownership, park location, cycle window, assessment episode, episode-first root
  - Negative copy assertions: no invented production values, no later workflow state in `applications`

### Ambiguities requiring user decision

- None after applying PRD/architecture source truth.

### User-approved design decisions

- Keep Slice 2 backend/data-model only.

### Deferred affordance policy

- Element: organisation/park/cycle frontend surfaces
  - Treatment: hidden
  - Notes: later slices will surface the read models through approved UI evidence.

## Planned file zones

Advisory only; implementation may choose better locations if repo conventions require it.

- packages/contracts/src/**
- packages/db/src/**
- packages/db/migrations/**
- packages/db/seeds/**
- packages/db/scripts/check-migrations.mjs
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
| Contracts validation | `corepack pnpm contracts:check` | Pending | Must validate new domain DTOs/fixtures |
| OpenAPI validation | `corepack pnpm openapi:check` | Pending | Should still pass if no new public routes are added |
| Migration check | `corepack pnpm db:migrate:check` | Pending | Must validate Slice 2 tables and block later-slice tables |
| Seed check | `corepack pnpm db:seed:check` | Pending | Must validate safe synthetic lower-env seeds |
| API smoke check | N/A | N/A | No new public route is being added in this slice |
| Browser/route check | N/A | N/A | No frontend surface is being added in this slice |

## Stop triggers

Stop instead of guessing if:

- The source truth cannot support a safe dual-window/episode model.
- A proposed schema would require inventing live migration data or production park records.
- The implementation would need later workflow tables such as applications, allocation, or results.
- The per-park/per-type/per-cycle-year uniqueness rule cannot be preserved.
- A frontend route appears required but has no supporting evidence.

## Contract review notes

PASS on 2026-05-05.

- Slice 2 is the first eligible TODO after Slice 1, which is DONE_FULL.
- The PRD and architecture explicitly define the episode-first data model, the dual active cycle window model, and the separation between assessment episodes and applications.
- The plan keeps later workflow tables and production values out of scope while allowing the approved organisations/parks/cycles/episodes foundation.
- UI evidence is recorded only as downstream read-model shape, not as a frontend delivery claim.

## Implementation review notes

Pending.

## Closure note

Pending.

### Closure Inputs

- Close summary: Pending
- Client impact: Pending
- Frontend handoff: Pending
- Backend handoff: Pending
- Remaining frontend gaps: Pending
- Reopen triggers: Pending
