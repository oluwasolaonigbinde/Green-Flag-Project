# Current Plan

## Metadata

- Slice ID: 9
- Title: Allocation workflow: candidates, COI, hold/release, and acceptance
- Backlog status: CONTRACT_REVIEW
- Contract state: Draft
- Contract path: docs/implementation/slice-contracts/S09-allocation-workflow-candidates-coi-release-acceptance.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/slice-contracts/S06-submission-invoice-po-payment-state.md
  - docs/implementation/slice-contracts/S07-admin-read-models-queues.md
  - docs/implementation/slice-contracts/S08-judge-profiles-assessor-management-capacity.md
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
- Related UI evidence:
  - docs/figma/Super Admin - Assessor Allocation - Application List.png
  - docs/figma/Assessor - Schedule Visit.png
  - docs/figma/Assessor - Dashboard.png
  - docs/figma/Applicant - Dasboard - site visit - list view.png
  - docs/figma/Applicant - Dashboard- site visit - calender view.png

## Objective

Deliver the allocation workflow foundation after payment and assessor management: allocation-ready episode selection, candidate assessor query/read model, hard/soft conflict-of-interest markers, rotation flags, suggested/final judge count, held/released assignment participants, accept/decline responses, reassignment, and contact reveal controls. This slice must not implement scoring, assessment forms, actual visit execution, messaging, notification sending, results, certificates, public map publication, exports, or full Mystery redaction hardening.

## Legality

This slice is the first eligible `TODO` after Slice 8. Dependencies `[6, 8]` are satisfied. No earlier `BLOCKED` slice precedes it and no active slice existed before this planning step.

## Draft Scope

### In Scope

- Allocation-ready application/episode query using S06 payment state and S05 document state through existing read models.
- Candidate assessor read model using S08 profile, accreditation, preference, availability, and capacity data.
- COI marker model with hard/soft reason codes and admin-visible resolution state.
- Assignment participant records with held/released/accepted/declined/withdrawn states.
- Hold/release commands for admin allocation decisions.
- Assessor accept/decline commands.
- Reassignment command that preserves audit trail.
- Contact reveal controls that default to hidden until an assignment is released/accepted under approved rules.
- RBAC checks for Super Admin/KBT Admin allocation actions and assigned judge self-actions.
- Audit events for every allocation/assignment command.
- DTOs, fixtures, OpenAPI paths, migrations/seeds, tests, and frontend allocation routes where evidence is sufficient.

### Out Of Scope

- Scoring, assessment templates/forms, evidence capture, offline sync, thresholds, decisions, results, certificates, public map, notifications, exports, message threads, and production provider integrations.
- Full Mystery redaction hardening across all surfaces; Slice 10 owns central hardening.
- Actual visit scheduling workflow beyond safe assignment/contact visibility prerequisites.
- Applicant-facing visit details unless product rules explicitly authorize visibility.

### Draft Stop Triggers

Stop or fail contract review if exact product/architecture evidence cannot validate:

- hard vs soft COI reason taxonomy,
- when held assignments may be released,
- when judge/applicant contact details may be revealed,
- accept/decline deadline and reassignment rules,
- Mystery-specific allocation/contact visibility before Slice 10 hardening.

## Planned Backend/API Shape

- `GET /api/v1/admin/allocations/ready-applications`
- `GET /api/v1/admin/allocations/:applicationId/candidates`
- `POST /api/v1/admin/allocations/:applicationId/hold`
- `POST /api/v1/admin/allocations/:allocationId/release`
- `POST /api/v1/admin/allocations/:allocationId/reassign`
- `GET /api/v1/assessor/assignments`
- `POST /api/v1/assessor/assignments/:assignmentId/accept`
- `POST /api/v1/assessor/assignments/:assignmentId/decline`

## Frontend Evidence Classification

- Available: admin allocation application list, assessor dashboard/schedule screens, applicant site visit list/calendar screens.
- Partial: candidate/COI/release/accept/decline variants are not separately confirmed.
- Missing: exact reassignment flow, COI resolution variants, contact reveal variants, Mystery-specific allocation visibility variants, mobile variants.

## Verification Matrix

| Check | Command / Artifact | Status | Evidence |
| --- | --- | --- | --- |
| Contract validation | source/product docs and current slice contracts | Pending | Must validate COI/release/contact rules before freeze |
| Contracts/OpenAPI | `corepack pnpm contracts:check`, `corepack pnpm openapi:check` | Pending | Required if contract freezes |
| Migration/seed | `corepack pnpm db:migrate:check`, `corepack pnpm db:seed:check` | Pending | Required if contract freezes |
| Lint/test/typecheck | `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm typecheck` | Pending | Required if contract freezes |
| Mystery leakage | allocation/contact payload review | Pending | Must prove no premature Mystery or contact reveal |

## Contract Review Notes

HUMAN_DECISION_REQUIRED on 2026-05-05.

- The slice is legal and dependencies are satisfied.
- The draft scope matches the backlog at a high level.
- The contract is not safe to freeze because repo-readable evidence is not specific enough for hard/soft COI taxonomy, hold/release transitions, accept/decline deadlines, reassignment constraints, suggested/final judge-count rules, contact reveal timing, or Mystery-specific allocation visibility before S10.
- Direct source extraction confirms that `docs/source/GFA_Integrated_Architecture (3).docx` contains a draft allocation engine model and algorithm, but `docs/source/GFA_PRD_v1_1 (1).docx` marks the decisive allocation inputs as open: `OI-004` full judge allocation rules, `OI-005` distance thresholds, `OI-006` second-judge requirements, and `OI-007` COI register format are `PENDING KBT INPUT`, with the allocation engine action blocked until KBT answers.
- Product scope may not be inferred. Keep S09 in `CONTRACT_REVIEW` until authoritative product/architecture evidence is supplied or identified.

## Implementation Review Notes

Pending.

## Closure Note

Pending.
