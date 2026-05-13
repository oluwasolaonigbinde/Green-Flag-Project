# Green Flag Award - Agent Operating Model

## Post-backend-completion mode

Normal future agents start with `docs/implementation/system_state.md`. The backend slice build is complete, and `docs/implementation/working/*.md` reports are archive/evidence only.

Use this operating model to preserve the current architecture, decide whether work is frontend, DevOps, QA, or explicitly scoped backend work, and avoid reviving stale slice-era assumptions.

## Current read order

General/backend:
1. `docs/implementation/system_state.md`
2. `docs/implementation/source-reconciliation.md`
3. `docs/implementation/gap-register.md`
4. `docs/implementation/external-configuration-register.md`
5. OpenAPI/contracts only as needed

Frontend:
1. `docs/implementation/system_state.md`
2. `docs/implementation/frontend-contract-handoff.md`
3. `docs/implementation/gap-register.md`
4. `docs/implementation/ui-slice-map.yaml`
5. Figma manifests/assets
6. `openapi/openapi.json` and `packages/contracts/src/schemas.ts`

DevOps/AWS:
1. `docs/implementation/system_state.md`
2. `docs/implementation/devops-aws-handoff.md`
3. `docs/implementation/external-configuration-register.md`
4. `docs/implementation/production-readiness-checklist.md`
5. `package.json` and `.github/workflows/ci.yml`

## Non-negotiables

- `assessment_episodes` is the operational lifecycle root.
- `applications` owns applicant package, draft, submission, document, and payment package state only.
- Preserve DB-first production-like runtime and fail-closed guards against lower-env providers and mutable Map persistence.
- Do not reintroduce map/flush persistence as canonical production-like behavior.
- Do not move lifecycle state into `applications.status`.
- Do not clone legacy schema ownership.
- Preserve safe applicant/public DTOs, Mystery redaction, tuple-aware RBAC, scoped read models, retry/idempotency, and audit.
- Do not invent official scoring, applicant bands, fees, VAT/legal wording, certificate wording, provider credentials, or KBT approvals.
- UI/Figma assets shape layout/read models only and never override backend Mystery/RBAC/redaction/state-machine rules.

## Future work rules

- Backend/API changes after completion require explicit product, contract, or bug scope. Do not infer new backend scope from historical backlog momentum.
- Frontend work is allowed only when explicitly tasked; use OpenAPI/contracts as the source of API truth.
- DevOps work must keep provider-backed actions disabled or supply approved staging-safe/real adapters.
- QA/UAT work should verify current behavior and external gates without claiming production launch approval.
- Working reports may be opened for audit evidence, not as normal orientation.

## Archived slice workflow

The slice workflow remains as historical build sequencing and UI-reopen tooling.

Statuses:
- `TODO`
- `CONTRACT_REVIEW`
- `IN_PROGRESS`
- `DONE_BACKEND`
- `DONE_FULL`
- `REOPENED_FOR_UI`
- `BLOCKED`

Active-slice invariant:
- At most one slice may be `CONTRACT_REVIEW`, `IN_PROGRESS`, or `REOPENED_FOR_UI`.
- If the invariant is broken, stop and report the workflow violation.

Backlog role:
- `docs/implementation/slice-backlog.yaml` no longer selects normal backend work while backend slices are complete.
- Use it as completed build history and as a UI reopen reference.
- Keep existing UI reopen metadata.

Commands:
- `orient.md` and `status.md` can still help inspect state.
- `plan-next-slice.md`, `review-current-contract.md`, `build-current-slice.md`, `review-current-slice.md`, and `close-current-slice.md` are archival/reopen tools unless a human explicitly creates new slice work.
- `resume-from-new-screens.md` applies when new or changed UI evidence arrives.

## UI reopen policy

A UI reopen may change frontend routes, components, styling, frontend tests, approved DTO mock replacement, visual alignment, and frontend gap records.

A UI reopen must not change backend business rules, RBAC, redaction, audit, state machines, schema, core API behavior, production assumptions, provider configuration, or official business content.

If new UI evidence requires backend/API/schema/rule changes, stop and require explicit contract/product scope.
