# Green Flag Award — Codex Agent Rules

This repo uses a state-driven slice workflow. Do not guess scope. Resolve work from the files under `docs/implementation/` before planning, building, or reviewing.

## Read first

1. `docs/implementation/agent-operating-model.md`
2. `docs/implementation/slice-backlog.yaml`
3. `docs/implementation/system_state.md`
4. `docs/implementation/gap-register.md`
5. `docs/implementation/ui-slice-map.yaml`
6. Source truth docs under `docs/source/`
7. Architecture / implementation docs under `docs/implementation/`
8. Figma exports and manifests under `docs/figma/`, `docs/figma-manifest.json`, and `docs/figma-manifest.md`

## Non-negotiable Green Flag rules

- `assessment_episodes` is the operational lifecycle root.
- `applications` owns only applicant package state.
- The backend owns workflow rules, state machines, RBAC, redaction, audit, and API contracts.
- Product/requirements docs win over UI for business rules.
- UI/Figma/PNG assets shape layout, read models, and visual acceptance only.
- Mystery Shop secrecy is enforced server-side across APIs, read models, notifications, documents, messages, exports, search, and status labels.
- Every data-changing command must emit `audit_events` once the audit foundation exists.
- Do not invent production fees, VAT values, official scoring criteria, applicant score bands, legal wording, provider credentials, or KBT approvals.
- If frontend screens are missing but backend/API requirements are clear, proceed with contracts, mocks, stubs, and explicit frontend gap records.

## Normal commands

Use the markdown command files in `docs/implementation/commands/`:

- `orient.md`
- `status.md`
- `plan-next-slice.md`
- `review-current-contract.md`
- `build-current-slice.md`
- `review-current-slice.md`
- `close-current-slice.md`
- `resume-from-new-screens.md`

Do not manually skip ahead to a later slice. The backlog selects the next legal slice.

## Active-slice invariant

At most one slice may be `CONTRACT_REVIEW`, `IN_PROGRESS`, or `REOPENED_FOR_UI` at the same time. If this invariant is broken, stop and report the workflow violation.

## Scope rule

You may infer file placement from the repo. You may not infer product scope.
