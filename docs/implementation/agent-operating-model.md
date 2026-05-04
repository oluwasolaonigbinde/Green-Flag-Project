# Green Flag Award - Agent Operating Model

## Purpose

This repo is operated as a deterministic Codex factory. Work is shipped in ordered vertical slices, but the Green Flag project has one special constraint: frontend design is not fully complete. Therefore a slice may be backend/API complete while frontend is partial, stubbed, or waiting for new Figma screens.

The workflow supports this by allowing slices to close as `DONE_BACKEND`, then later reopen as `REOPENED_FOR_UI` when new or changed design evidence arrives.

## Conceptual truth layers

Agents must read truth layers before interpreting the active slice.

1. **Product / domain truth**  
   PRD, requirements spec files, client requirements, and source docs. These define what the system must do.

2. **Operational / architecture truth**  
   System architecture, final engineering decisions, backend blueprint, and implementation playbook. These define technical interpretation, backend rules, state ownership, RBAC, audit, redaction, episode-first model, and adapter boundaries.

3. **Platform reality**  
   `docs/implementation/system_state.md` records what actually exists today: implemented, partial, stubbed, not implemented, fragile, or blocked.

4. **Gap analysis**  
   `docs/implementation/gap-register.md` records missing screens, external production dependencies, missing scoring/fee values, missing provider credentials, and known risks.

5. **Executable backlog**  
   `docs/implementation/slice-backlog.yaml` is the single ordered list of slices. Only this file selects the next slice and drives status changes.

6. **UI evidence**  
   `docs/implementation/ui-slice-map.yaml`, `docs/figma-manifest.json`, `docs/figma-manifest.md`, and `docs/figma/**` define current design evidence. UI assets shape frontend layout and read models; they do not override product or architecture rules.

## Slice statuses

- `TODO` - not yet active.
- `CONTRACT_REVIEW` - draft contract exists; review before coding.
- `IN_PROGRESS` - contract frozen; implementation allowed.
- `DONE_BACKEND` - backend/API/tests passed; frontend is partial, stubbed, or waiting for more screens.
- `DONE_FULL` - backend/API/frontend/review all passed against currently available UI evidence.
- `REOPENED_FOR_UI` - previously closed slice reopened only because new or changed UI evidence arrived.
- `BLOCKED` - stop until resolved or backlog is reordered.

## Active slice invariant

At any time there must be at most one slice in `CONTRACT_REVIEW`, `IN_PROGRESS`, or `REOPENED_FOR_UI` combined.

- If zero active slices exist, `plan-next-slice` selects the first eligible `TODO` from `slice-backlog.yaml`.
- If one active slice exists, all build/review/close work refers only to that slice.
- If more than one active slice exists, stop and reconcile the backlog.
- If a `BLOCKED` slice appears before the next intended `TODO`, stop until a human explicitly unblocks or reorders the backlog.

## Green Flag non-negotiables

- `assessment_episodes` is the lifecycle root.
- `applications` owns applicant package state only.
- Server-side Mystery redaction is mandatory across APIs, read models, notifications, documents, messages, exports, search, and status labels.
- RBAC and scope checks are API-level responsibilities.
- Audit events are append-only once Slice 1 introduces audit.
- Official scoring criteria, applicant bands, fees, VAT, legal wording, provider credentials, and KBT approvals are external production dependencies; do not invent them.
- Community, Heritage, and Group are represented as draft/blocked categories until official criteria/processes are supplied.

## Lifecycle

### 1. Orient

Read-only. Load truth docs, backlog, system state, gap register, UI map, and active contract if one exists. Report workflow state and next legal command. Do not edit files.

### 2. Plan next slice

Preconditions: no active slice, no earlier blocking item, and the first eligible `TODO` has dependencies satisfied.

Actions:

- Select the first eligible `TODO` from `slice-backlog.yaml`.
- Create `docs/implementation/working/current-plan.md` as a draft slice contract.
- Move the slice to `CONTRACT_REVIEW`.
- Map backend scope, API scope, frontend scope, UI evidence, missing screens, tests, mocks, forbidden work, external blockers, and stop triggers.
- Do not implement code.

### 3. Review current contract

Preconditions: exactly one `CONTRACT_REVIEW` slice and a draft current plan.

Actions:

- Review the plan against source truth, architecture truth, backlog, system state, gap register, and UI evidence.
- On PASS: freeze the plan into `slice-contracts/Sxx-<slug>.md`, move backlog to `IN_PROGRESS`, and mark contract state `Frozen`.
- On FAIL: keep the slice in `CONTRACT_REVIEW` and write precise required fixes to `working/current-plan-review.md`.

### 4. Build current slice

Preconditions: exactly one `IN_PROGRESS` or `REOPENED_FOR_UI` slice and a frozen contract.

Actions:

- Implement only the frozen contract.
- Build backend/API/tests/docs/mocks as applicable.
- Implement frontend surfaces only where screens/contracts exist.
- Where screens are missing, create allowed stubs/mocks/gap records; do not invent UI or business behaviour.
- If the contract is wrong, stop and return the slice to `CONTRACT_REVIEW` instead of improvising.
- If the slice is `REOPENED_FOR_UI`, only frontend routes/components/layout/styling, approved DTO mock replacement, frontend tests, visual alignment, and frontend gap records may change.

### 5. Review current slice

Preconditions: exactly one `IN_PROGRESS` or `REOPENED_FOR_UI` slice and a frozen contract.

Actions:

Use evidence-based Codex review. Inspect files and run available repo commands. If code exists, run lint/typecheck/tests/build/migration/contract checks where configured. If frontend exists and can run, inspect routes/screens and compare with PNG/Figma evidence where possible. If runtime checks cannot run, record exactly why and do not claim they passed.

Review outcome must be one of:

- `PASS`
- `PASS_WITH_FRONTEND_GAPS`
- `FAIL_NEEDS_FIXES`
- `BLOCKED_BY_EXTERNAL_DEPENDENCY`

### 6. Close current slice

Preconditions: contract review passed, implementation review passed or passed with permitted frontend gaps, verification matrix completed, evidence recorded.

Actions:

- If backend/API passed but frontend is incomplete due to missing/partial screens, mark `DONE_BACKEND` and record frontend gaps/reopen triggers.
- If backend/API/frontend all passed against current UI evidence, mark `DONE_FULL`.
- Update `system_state.md` from closed evidence.
- Create a delivery record.
- Update backlog status last.
- Reset working files after close; permanent truth remains in `slice-contracts/` and `delivery-records/`.

### 7. Resume from new screens

Preconditions: new or changed Figma/PNG evidence exists, or a previously missing screen is now available.

Actions:

- Refresh/check Figma snapshot lock.
- Map new screens to slices using `ui-slice-map.yaml`, Figma manifest, and PNG paths.
- If the work is UI-only and maps to an existing `DONE_BACKEND` or `DONE_FULL` slice, create a UI-only reopening plan, move the slice to `CONTRACT_REVIEW`, and mark `REOPENED_FOR_UI` only after contract review passes.
- If backend/API/business rules need to change, do not treat it as UI-only. Return the relevant slice to `CONTRACT_REVIEW` or create a new backlog item.

Allowed in `REOPENED_FOR_UI`:

- frontend routes
- components
- layout/styling
- replacing mocks with approved DTOs
- frontend tests
- visual comparison

Forbidden in `REOPENED_FOR_UI`:

- backend business rules
- RBAC
- redaction
- audit
- state machines
- schema
- core API behaviour
- production assumptions

## Frontend incompleteness policy

Every slice contract must classify UI evidence:

- available screens
- partial screens
- missing screens
- frontend can implement now
- frontend must stub/mock now
- frontend must wait
- reopen triggers

`DONE_BACKEND` is a successful state, not a failure, when missing frontend evidence is explicitly recorded.

## Optional demo track

If the technical lead requires an early client demo, create or activate a dedicated demo slice from the optional `demo_slices` section in `slice-backlog.yaml`. Demo slices must depend on minimal foundation slices and must not bypass the episode-first architecture.
