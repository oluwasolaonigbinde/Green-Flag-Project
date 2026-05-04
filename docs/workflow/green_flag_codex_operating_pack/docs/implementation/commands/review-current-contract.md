# Command: review-current-contract

Review the active draft plan/contract. Freeze it on PASS. Do not implement code.

## Read

1. `AGENTS.md`
2. `docs/implementation/agent-operating-model.md`
3. `docs/implementation/plan-review-checklist.md`
4. `docs/implementation/slice-backlog.yaml`
5. `docs/implementation/system_state.md`
6. `docs/implementation/gap-register.md`
7. `docs/implementation/ui-slice-map.yaml`
8. `docs/implementation/working/current-plan.md`
9. Source and architecture docs relevant to the slice
10. Figma manifests/PNGs relevant to the slice

## Preconditions

- Exactly one slice is `CONTRACT_REVIEW`.
- No slice is `IN_PROGRESS` or `REOPENED_FOR_UI`.
- `working/current-plan.md` exists.
- The current plan states `Contract state: Draft`.

If any precondition fails, stop.

## Review

Use `plan-review-checklist.md`.

Check:

- correct slice selected
- dependencies satisfied
- source docs mapped
- backend/API/frontend scopes concrete
- missing UI screens recorded
- external blockers separated
- forbidden work explicit
- no invented production values
- Green Flag non-negotiables preserved
- verification matrix complete
- stop triggers clear

## PASS behavior

If the contract passes:

1. Create/replace `docs/implementation/slice-contracts/Sxx-<slug>.md` from `working/current-plan.md`.
2. Set contract state to `Frozen`.
3. Update backlog status from `CONTRACT_REVIEW` to `IN_PROGRESS`.
4. Write PASS notes to `working/current-plan-review.md`.
5. Keep `working/current-plan.md` as the latest working copy unless repo policy prefers clearing it.

## FAIL behavior

If the contract fails:

1. Keep backlog status `CONTRACT_REVIEW`.
2. Keep contract state `Draft`.
3. Write exact required corrections to `working/current-plan-review.md`.
4. Do not modify product code.

## Prohibited writes

- Do not implement product code.
- Do not modify `system_state.md`.
- Do not modify `gap-register.md` except if the user explicitly asks to record a planning blocker.
