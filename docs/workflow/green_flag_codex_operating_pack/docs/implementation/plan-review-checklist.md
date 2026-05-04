# Plan / Contract Review Checklist

Use this checklist when running `review-current-contract`.

## Workflow gates

- Exactly one slice is `CONTRACT_REVIEW`.
- No slice is `IN_PROGRESS` or `REOPENED_FOR_UI`.
- The active slice is the first legal slice from `slice-backlog.yaml`.
- `working/current-plan.md` exists and identifies the selected slice.
- The contract is `Draft`.

## Source alignment

- Product/domain truth was checked.
- Architecture/implementation truth was checked.
- `system_state.md` reality was checked.
- `gap-register.md` was checked.
- UI map / Figma manifests / PNG exports were checked when the slice touches UI.
- PRD/requirements win over UI for business rules.
- Missing production values are recorded as dependencies, not invented.

## Contract completeness

- Objective is clear.
- Primary user/system path is specific.
- In-scope and out-of-scope are explicit.
- Backend scope is concrete.
- API/DTO scope is concrete.
- Frontend scope is concrete or explicitly stubbed.
- Missing screens are listed.
- Reopen triggers are listed for frontend gaps.
- Forbidden work is explicit.
- External blockers are separated from implementation choices.
- Acceptance criteria are testable.
- Verification matrix is present.
- Stop conditions are clear.

## Green Flag architecture checks

- `assessment_episodes` lifecycle ownership is preserved where relevant.
- `applications` does not absorb payment/allocation/assessment/decision/publication lifecycle state.
- RBAC/scope expectations are defined where relevant.
- Audit requirements are defined for data-changing commands.
- Mystery redaction policy is included where relevant.
- Lifecycle-critical state uses typed fields/enums.
- JSONB is used only for approved flexible payload/config/snapshot cases.

## UI / Figma checks

- Available screens are mapped with exact path if possible.
- Missing screens are not treated as blockers when backend/API is clear.
- Missing screens are recorded as frontend gaps.
- PNG-backed surfaces are not replaced with generic shells unless explicitly allowed.
- UI copy does not override domain meaning.

## Outcomes

Return one of:

- `PASS`
- `FAIL_REVISE_PLAN`
- `BLOCKED`

On PASS, freeze the contract and move the backlog item to `IN_PROGRESS`.
