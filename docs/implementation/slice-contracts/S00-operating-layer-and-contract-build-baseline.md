# Slice Contract: S00 Operating Layer and Contract/Build Baseline

## Metadata

- Slice ID: 0
- Title: Operating layer and contract/build baseline
- Backlog status: DONE_FULL
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S00-operating-layer-and-contract-build-baseline.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/figma-snapshot-lock.json
  - docs/implementation/Green_Flag_Award_MVP_Implementation_Reference_and_Delivery_Playbook_v1.docx
  - docs/implementation/Green_Flag_System_Architecture_Final.docx
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/SF-1_Greenfield_Software_Factory_Playbook (1).docx
- Related UI evidence:
  - docs/figma-manifest.json
  - docs/figma-manifest.md
  - docs/implementation/figma-snapshot-lock.json
  - Slice 0 has no shippable UI surface; UI assets inform future contract/read-model conventions only.

## Objective

Move the repository from docs-only to a runnable foundation scaffold that future Green Flag slices can build on. Establish the monorepo package structure, baseline scripts, TypeScript/project conventions, API/DTO contract package, OpenAPI skeleton, database migration convention, safe lower-environment seed strategy, and workflow delivery record baseline without implementing later business slices.

Slice 0 is legal because it is the first `TODO` item in `slice-backlog.yaml`, has no dependencies, no earlier slice is blocked, and the active-slice invariant is currently satisfied with zero active slices.

## Primary user/system path

1. A future agent checks out the repo and runs one package-manager install.
2. The agent can run deterministic root scripts for lint, typecheck, test, build, contract validation, OpenAPI validation, and migration/seed checks.
3. Shared contracts expose canonical enums, error codes, actor/scope command envelope types, redaction-profile types, safe display status helpers, and provisional fixtures that do not invent production values.
4. The API scaffold can start a health endpoint and expose/validate an OpenAPI skeleton.
5. The web scaffold can build as a Next.js App Router shell without claiming later applicant/admin/assessor workflows are implemented.
6. The database package contains migration conventions and baseline parse checks, but not later slice schemas beyond explicitly safe foundation placeholders.

## Scope lock

### In scope

- Create a pnpm TypeScript workspace unless an existing stronger convention is discovered during build.
- Create:
  - apps/web: Next.js App Router scaffold.
  - apps/api: Fastify TypeScript API scaffold.
  - packages/contracts: shared TypeScript/Zod DTOs, enums, error/idempotency conventions, redaction profiles, fixtures, and contract validation tests.
  - packages/db: PostgreSQL/PostGIS migration/schema package with migration naming convention, baseline SQL migration, and safe lower-env seed check.
  - packages/shared: shared utilities/types where needed by app/package scaffolds.
- Add root scripts for install-time/project validation: lint, typecheck, test, build, contracts:check, openapi:check, db:migrate:check, db:seed:check.
- Add OpenAPI skeleton for foundation endpoints only, including health and contract metadata.
- Add baseline migration convention and a minimal foundation migration only if it does not implement Slice 1+ operational behavior.
- Add synthetic fixtures that demonstrate episode-first and redaction-safe read models.
- Add repo docs needed to run and maintain the scaffold.
- Update workflow files as required by plan/review/build/review/close commands.

### Out of scope

- Real Cognito integration, internal user persistence, role assignment persistence, auth guards, or audit persistence. These belong to Slice 1.
- Organisations, parks, locations, award cycles, and real assessment episode lifecycle implementation. These belong to Slice 2.
- Registration, applications, documents, payments, admin queues, assessor management, allocation, visits/scoring, results, notifications, messaging, jobs, exports, public map, migration tooling, and hardening slices.
- Production UI implementation for applicant, assessor, admin, mobile, or public screens.
- Live Figma refresh or design-token extraction.
- Real provider integrations or credentials.

### Forbidden work

- Do not invent production fees, VAT treatment, legal invoice wording, official scoring criteria, applicant score bands, provider credentials, KBT approvals, official category criteria, or real migration data.
- Do not put payment, allocation, assessment, decision, publication, or Mystery state into `applications.status`.
- Do not expose Mystery Shop raw state in applicant-safe fixtures or display labels.
- Do not make UI/Figma labels override product or architecture rules.
- Do not mark later slice capabilities implemented in `system_state.md`.

## Source mapping

### Product / domain truth

- PRD and requirements identify the platform as an end-to-end awards operations replacement with auditability, Mystery Shop tracking, invoices/payments, assessor workflows, and public results, but Slice 0 only establishes the foundation.
- Requirements and architecture require Standard Green Flag as the operational MVP track; Community, Heritage, and Group remain draft/blocked until criteria/processes are supplied.
- Applicant-facing statuses may combine lifecycle meanings for display, but source truth separates application package state from operational episode state.

### Operational / architecture truth

- `assessment_episodes` is the operational lifecycle root.
- `applications` owns applicant package lifecycle state only.
- Backend owns workflow rules, state machines, RBAC/scope checks, redaction, audit, integrations, and stable API contracts.
- Cognito owns external identity/login/MFA subject IDs; PostgreSQL owns internal profiles, role assignments, scopes, permissions, organisation/park links, and audit references.
- PostgreSQL/PostGIS is the domain data target. Lifecycle-critical fields use typed columns/enums/checks where practical; JSONB is only supplementary for flexible answers, provider payloads, config, template merge data, and snapshots.
- State-changing commands validate current state, actor permission, entity scope, and idempotency key where repeated submission is possible.
- Once Slice 1 creates audit persistence, every data-changing command emits append-only `audit_events`.

### Platform reality

- `system_state.md` records `docs_only: true`, no app scaffold, no frontend, no backend, no migrations, no OpenAPI contracts, and no known commands.
- Root inspection found only `AGENTS.md` and `docs/`; no package manager or hidden config exists.
- Figma/PNG evidence exists locally but live freshness is unknown.

### Gap register references

- EXT-001, EXT-002: official scoring criteria and bands unavailable.
- EXT-003, EXT-004, EXT-005: production fee/VAT/legal invoice wording, Business Central contract/credentials, and payment provider details unavailable.
- EXT-006: Community, Heritage, and Group criteria/processes unavailable.
- EXT-007, EXT-008: SMS provider and public map endpoint unavailable.
- EXT-009: current system export files unavailable.
- EXT-010: legal/compliance/KBT sign-off unavailable.
- Frontend gaps are not directly active in Slice 0 because no production UI surface is delivered.

## Backend contract

### Data / migration scope

- Add `packages/db` with SQL migration convention, migration index/readme, and a baseline migration file that establishes only foundation-safe scaffolding.
- Any baseline SQL must avoid claiming Slice 1+ persistence is implemented. It may define conventions, schema metadata, or extension expectations only where safe.
- Add parse/check tooling for migrations that can run without a live database.
- Add optional local PostgreSQL/PostGIS docker-compose only if practical and clearly lower-env.

### Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm contracts:check`
- `pnpm openapi:check`
- `pnpm db:migrate:check`
- `pnpm db:seed:check`

### Queries / read models

- Establish baseline fixture/read-model contracts only:
  - applicant dashboard item with display-safe fields.
  - Mystery applicant projection that suppresses raw Mystery metadata and uses a safe display status.
  - contract metadata query shape for the API scaffold.

### State transitions

- Define canonical enum values and transition ownership boundaries only.
- Do not implement operational transition validators for later slices.

### RBAC / scope

- Define typed actor context, role type, role scope type, scope reference, and redaction profile types.
- Do not implement real persistence or authorization decisions in Slice 0.

### Audit

- Define audit-ready command metadata fields: actor, scope, reason, request metadata, idempotency key, and future audit hook shape.
- Do not implement `audit_events` persistence until Slice 1.

### Error cases

- Define stable error codes: `unauthorized`, `forbidden`, `invalid_state`, `validation_failed`, `redaction_blocked`, `dependency_missing`, `conflict`, `idempotency_conflict`.
- API scaffold must return a stable error envelope for known foundation errors.

### Idempotency / retries

- Define command envelope/idempotency key conventions for future state-changing commands.
- Do not implement a production idempotency store in Slice 0.

## API / DTO contract

### Endpoints

- `GET /health`
- `GET /api/v1/contract-metadata`
- OpenAPI JSON endpoint if practical for the scaffold.

### Request DTOs

- No data-changing production request DTOs.
- Contract package may define future command envelope schemas without routing them to real operations.

### Response DTOs

- Health response.
- Contract metadata response.
- Standard error envelope.
- Safe read-model fixture schemas.

### Mock responses / fixtures

- Lower-env/synthetic fixtures only.
- Fixture IDs should be UUID-shaped unless explicitly marked as provisional public IDs.
- No production-looking fees, VAT, legal wording, scoring criteria, score bands, provider credentials, or approvals.
- Standard Green Flag may be seeded as operational; Community, Heritage, and Group may appear only as blocked/draft category fixtures.

## Frontend contract

### Available screens

- No Slice 0 production screens.
- Local Figma snapshot has 57 PNG exports and manifest coverage for future applicant, assessor, super admin, and missing mobile/public groups.

### Partial screens

- Not applicable to Slice 0 implementation.

### Missing screens

- Not applicable to Slice 0 implementation.

### Implement now

- Build a minimal Next.js App Router shell sufficient for build/smoke validation and future routing.
- Do not implement applicant, assessor, admin, mobile, public map, or marketing flows.

### Stub/mock now

- The web shell may render a foundation status page backed by static contract metadata, clearly not a production workflow screen.

### Wait for future screens

- All applicant, assessor, admin, mobile, and public route implementations wait for their owning slices/contracts.

### Reopen triggers

- Not applicable for Slice 0 UI delivery. Future frontend reopen triggers remain governed by `ui-slice-map.yaml`.

## Design coverage check

### Expected UI surfaces for this slice

- Foundation web shell/status page only.

### PNG matches

- Expected surface: Foundation web shell/status page
  - Matched PNG: none
  - Confidence: no match required
  - Notes: Slice 0 is not delivering a user workflow UI. The page exists only to prove the web app scaffold builds and runs.

### PNG-backed surface inventory

| Surface | Route | PNG path | Viewport / variant | Visual inventory | Approved fallback | Internal-copy rule |
| --- | --- | --- | --- | --- | --- | --- |
| Foundation status shell | `/` | N/A | responsive scaffold only | No production workflow UI | Minimal scaffold page | Must not claim later slice functionality |

### Missing or unclear design coverage

- No design blocker for Slice 0.
- Live Figma freshness is unknown; no frontend workflow implementation depends on it in this slice.

### Existing implementation overlap

- None. Repo is docs-only.

### Design traceability

- Surface: Foundation status shell
  - Verified route: `/`
  - PNG: N/A
  - Variant notes: scaffold proof only.

### Visual / route-inspection gates

- Route: `/`
  - Screenshot artifact: optional if app can run locally.
  - Semantic anchors: foundation status text, package boundary list, no production workflow claims.
  - Negative copy assertions: no official scoring/fee/legal/provider values; no Mystery raw state.

### Ambiguities requiring user decision

- None for Slice 0.

### User-approved design decisions

- Default scaffold stack from foundation goal: pnpm workspace, TypeScript, Next.js App Router, Fastify, shared TypeScript/Zod contracts, PostgreSQL/PostGIS migration package, Vitest, ESLint/Prettier where practical.

### Deferred affordance policy

- Element: future workflow navigation
  - Treatment: hidden
  - Notes: Later slices add workflow routes/components when contracted.

## Planned file zones

Advisory only; implementation may choose better locations if repo conventions require it.

- package.json
- pnpm-workspace.yaml
- tsconfig.base.json
- eslint.config.mjs
- prettier.config.mjs
- .gitignore
- README.md
- apps/api/**
- apps/web/**
- packages/contracts/**
- packages/db/**
- packages/shared/**
- openapi/**
- docker-compose.yml if used for local PostGIS
- docs/implementation/working/**
- docs/implementation/slice-contracts/**
- docs/implementation/delivery-records/**
- docs/implementation/system_state.md
- docs/implementation/slice-backlog.yaml

## Verification matrix

| Check | Command / Artifact | Status | Evidence |
| --- | --- | --- | --- |
| Repo/app scaffold check | inspect root/apps/packages files | Pending | Must show actual scaffold exists |
| Workspace install | `pnpm install --frozen-lockfile` if lockfile exists, otherwise initial `pnpm install` | Pending | Must record success or network/tooling blocker |
| Backend lint | `pnpm lint` | Pending | Must pass or record exact failure |
| Backend typecheck | `pnpm typecheck` | Pending | Must pass or record exact failure |
| Backend tests | `pnpm test` | Pending | Must pass or record exact failure |
| Backend build | `pnpm build` | Pending | Must pass or record exact failure |
| Frontend lint | `pnpm lint` | Pending | Shared root command covers web |
| Frontend typecheck | `pnpm typecheck` | Pending | Shared root command covers web |
| Frontend tests | `pnpm test` | Pending | Shared root command covers web |
| Frontend build | `pnpm build` | Pending | Shared root command covers web |
| API/contract validation | `pnpm contracts:check` and `pnpm openapi:check` | Pending | Must validate exported DTOs/OpenAPI skeleton |
| Migration check | `pnpm db:migrate:check` and `pnpm db:seed:check` | Pending | Must validate migration and safe seed conventions without live DB unless configured |
| Browser/route inspection check | start web app if practical | Pending | Optional; if not run, record exact reason |
| Manual vertical path check | inspect health/contract metadata if API can run | Pending | Optional; if not run, record exact reason |

## Stop triggers

Stop instead of guessing if:

- The contract conflicts with product or architecture truth.
- Implementation requires real identity, RBAC, audit persistence, domain schema, or business workflows from later slices.
- Missing production values would need to be invented.
- Any fixture would need official fees, VAT, legal wording, scoring criteria, score bands, provider credentials, or approvals.
- Mystery redaction or application/episode ownership becomes ambiguous.
- Package install/build cannot proceed because network/tooling is unavailable after recording the blocker.
- Figma snapshot is stale and a production UI workflow would depend on it.

## Contract review notes

Pending.

## Implementation review notes

PASS on 2026-05-04.

- Root lint, typecheck, test, build, contracts, OpenAPI, migration, and seed checks all passed.
- API smoke check confirmed `GET /health` and `GET /api/v1/contract-metadata`.
- Web smoke check confirmed the foundation shell served `/` successfully.
- No later-slice identity, RBAC, audit, or workflow behavior was introduced.

## Closure note

Slice 0 is complete. The repository now has a runnable foundation scaffold, stable shared contracts, safe lower-env conventions, and validation commands for future slices.

### Closure Inputs

- Close summary: Slice 0 scaffold completed and stabilized with passing validation checks.
- Client impact: Future slices can build on a runnable monorepo foundation with a health API, a foundation web shell, and validated shared contracts.
- Frontend handoff: The app shell at `/` is intentionally minimal and ready for later workflow routes.
- Backend handoff: API health and contract-metadata endpoints are ready for later identity/RBAC/audit/domain work.
- Remaining frontend gaps: None for Slice 0.
- Reopen triggers: None for Slice 0.
