# Current Plan

## Metadata

- Slice ID: 9
- Title: Allocation workflow: candidates, COI, hold/release, and acceptance
- Backlog status: CONTRACT_REVIEW
- Contract state: Not yet frozen; plan revision ready for contract drafting
- Planned contract path: docs/implementation/slice-contracts/S09-allocation-workflow-candidates-coi-release-acceptance.md
- Planned on: 2026-05-06
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/source-reconciliation.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/slice-contracts/S06-submission-invoice-po-payment-state.md
  - docs/implementation/slice-contracts/S07-admin-read-models-queues.md
  - docs/implementation/slice-contracts/S08-judge-profiles-assessor-management-capacity.md
  - docs/implementation/slice-contracts/S08-postgres-runtime-persistence-wiring.md
  - docs/implementation/slice-contracts/S08-postgres-domain-repository-adapters.md
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
- Related UI evidence:
  - docs/figma/Super Admin - Assessor Allocation - Application List.png
  - docs/figma/Super Admin - Coverage Map.png
  - docs/figma/Assessor - Schedule Visit.png
  - docs/figma/Assessor - Dashboard.png
  - docs/figma/Applicant - Dasboard - site visit - list view.png
  - docs/figma/Applicant - Dashboard- site visit - calender view.png

## Legality

S09 is the active `CONTRACT_REVIEW` slice in `slice-backlog.yaml`. Dependencies `[6, 8, 8.5, 8.6]` are satisfied. S09 is the only slice with an active status, and no earlier `BLOCKED` slice precedes it.

## Objective

Deliver the allocation workflow foundation after payment and assessor management: allocation-ready episode selection, candidate assessor query/read model, COI markers, rotation/capacity flags, suggested/final judge count, assignment participants, hold/release, accept/decline, reassignment, and contact reveal controls. `assessment_episodes` must remain the operational lifecycle root.

S09 follows the source precedence recorded in `docs/implementation/source-reconciliation.md`: `REQ-ALO-001` through `REQ-ALO-006`, `REQ-CYC-002`, and the Judge Allocation Engine design in `GFA_Integrated_Architecture (3).docx` Section 7 define implementable allocation behavior. Production-specific policy inputs that remain pending must be represented as configuration or import boundaries, not hardcoded guesses.

## Primary Path

1. Admin views allocation-ready assessment episodes.
2. Admin reviews candidate assessor matches with capacity, availability, geography, accreditation, and COI indicators.
3. Admin holds a draft allocation, then releases it only under approved rules.
4. Assigned assessors accept or decline released assignments.
5. Admin reassigns declined/withdrawn assignments while preserving audit/override history.
6. Contact visibility stays hidden until the approved release/acceptance rule allows reveal.

## Backend Scope

- PostgreSQL-backed allocation tables and repository adapters.
- Candidate read model based on delivered S06 payment state, S05 document state, S08 assessor profile/preferences/availability/capacity, assessment episode lifecycle status, active/current accreditation, configured distance thresholds, and cycle capacity.
- Judge-count suggestion implements `REQ-ALO-001`: 2 judges for new sites, parks over 25 hectares, heritage, and failed sites; 1 judge for passed sites under 25 hectares; optional 3rd judge for training; admin override requires reason and audit.
- COI marker records implement source-defined hard, soft, admin-set, self-declared, rotation, and same-operator categories. Hard/self-declared/admin-set/same-operator blocks are excluded where non-overridable; soft flags remain visible with admin acknowledgement; rotation is deprioritised and waivable with reason.
- Candidate scoring follows the architecture model: distance score plus cluster-fit score, with rotation penalty, using configurable weights and distance thresholds.
- Assignment participant records and state transitions.
- Hold, release, accept, decline, and reassign commands. Saved allocations remain unreleased until release-now or scheduled release; judge visibility starts only after release.
- Full Assessment contact reveal occurs only after all required judges accept. One accepted judge is insufficient. Mystery Shop never reveals assessor/contact details to the park.
- Admin override events for any approved high-risk allocation override represented in this slice.
- Audit events for every data-changing command in the same transaction as domain writes.
- Scope-aware RBAC for Super Admin/KBT Admin allocation commands and assigned assessor self-actions.
- Mystery-safe defaults: no applicant/org-facing allocation, assignment, judge, contact, visit-date, or suppressed notification visibility in this slice.

## API / DTO Scope

Planned APIs, subject to contract review:

- `GET /api/v1/admin/allocations/ready-episodes`
- `GET /api/v1/admin/allocations/:episodeId/candidates`
- `POST /api/v1/admin/allocations/:episodeId/hold`
- `POST /api/v1/admin/allocations/:allocationId/release`
- `POST /api/v1/admin/allocations/:allocationId/reassign`
- `GET /api/v1/assessor/assignments`
- `POST /api/v1/assessor/assignments/:assignmentId/accept`
- `POST /api/v1/assessor/assignments/:assignmentId/decline`

DTOs must include predictable errors for forbidden scope, invalid state transition, stale version, COI block, capacity block, payment/document dependency block, and redaction block.

## Frontend Scope

- Admin allocation-ready list and candidate review shell only where current PNG evidence supports it.
- Assessor assignment list/accept-decline shell only after release rules are approved.
- No applicant-facing visit list/calendar behavior unless approved by S09/S10 source rules.
- Use contract-backed placeholders where exact candidate/COI/hold/release/reassignment variants are missing.

## UI Evidence

- Available: Super Admin allocation application list, Super Admin coverage map, assessor dashboard/schedule screens, applicant site visit list/calendar screens.
- Partial: candidate review, COI flag details, hold/release confirmation, reassignment, and accept/decline variants are not separately evidenced.
- Missing: exact contact reveal variants, Mystery-specific allocation visibility variants, mobile allocation/assessor assignment screens.
- Figma freshness: live freshness not verified; planning is based on local snapshot.

## Configurable Production Inputs

The source reconciliation leaves the following production inputs configurable:

- `OI-004`: full judge allocation rules for 1 vs 2 vs 3 judges per country. Implement the confirmed default rule from `REQ-ALO-001`, store policy as configuration, and keep country/operator overrides data-driven.
- `OI-005`: whether distance thresholds are fixed nationally or configurable per country/region. Implement configurable distance thresholds using architecture defaults where lower-env data needs deterministic values.
- `OI-006`: whether second judge requirement uses park size, site complexity, admin flag, or a combination. Implement the confirmed default from `REQ-ALO-001` and model admin override/reason fields so later production policy can extend it.
- `OI-007`: current COI register owner/format. Implement the COI tables/import boundary and lower-env synthetic records; do not invent live migration data.

These pending inputs must be tracked in the gap register and delivery record, but they are no longer a reason to stop S09 entirely.

## Forbidden Work

- Do not implement scoring, visits, assessment forms, decisions, results, certificates, public map publication, notifications, messages, exports, or renewal jobs.
- Do not implement full Mystery redaction hardening; S10 owns central cross-surface hardening.
- Do not infer judge-count, COI, release, reassignment, contact reveal, or Mystery allocation behavior from UI; use `REQ-ALO-001` through `REQ-ALO-006`, `REQ-CYC-002`, and architecture Section 7 instead.
- Do not expose assignment state, judge identity, contact details, visit dates, or candidate counts to applicant/org-facing APIs.
- Do not hardcode production scoring bands, official criteria text, provider details, fees, VAT, or KBT approvals.

## Planned File Zones

- `packages/contracts/src/enums.ts`
- `packages/contracts/src/schemas.ts`
- `packages/contracts/src/fixtures.ts`
- `openapi/openapi.json`
- `scripts/check-openapi.mjs`
- `packages/db/migrations/0009_allocation_workflow_candidates_coi_release_acceptance.sql`
- `packages/db/seeds/lower-env-allocation.json`
- `packages/db/src/**`
- `apps/api/src/allocation.ts`
- `apps/api/src/allocation.test.ts`
- `apps/api/src/app.ts`
- `apps/web/app/admin/allocations/**`
- `apps/web/app/assessor/assignments/**`
- `docs/implementation/slice-contracts/S09-allocation-workflow-candidates-coi-release-acceptance.md`

## Verification Matrix

| Check | Command / Artifact | Required |
| --- | --- | --- |
| Contract review | `review-current-contract` | Must pass before implementation |
| Contracts | `corepack pnpm contracts:check` | Required after build |
| OpenAPI | `corepack pnpm openapi:check` | Required after build |
| Migration | `corepack pnpm db:migrate:check` plus DB-backed migration/integration where supported | Required after build |
| Seeds | `corepack pnpm db:seed:check` | Required after build |
| Lint | `corepack pnpm lint` | Required after build |
| Tests | `corepack pnpm test` | Required after build |
| Build/typecheck | `corepack pnpm build`, `corepack pnpm typecheck` | Required after build |
| Targeted RBAC | allocation/admin/assessor scope tests | Required |
| Targeted Mystery | candidate/assignment/contact redaction tests | Required |
| Transaction/idempotency | hold/release/accept/decline/reassign rollback and replay tests | Required |

## Stop Triggers

Stop and keep S09 in `CONTRACT_REVIEW` only if the contract would require behavior beyond the confirmed source truth above, such as:

- country/operator-specific production policy values that are not represented as configuration,
- live COI register migration data or provider credentials,
- production notification sending rather than notification intent/event records,
- applicant/org-facing Mystery allocation visibility beyond `APPLICATION_UNDER_REVIEW`,
- scoring, visit scheduling, assessment, decision, result, certificate, public map, message, export, or renewal behavior from later slices.
