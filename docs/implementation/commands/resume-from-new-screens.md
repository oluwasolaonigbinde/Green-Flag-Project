# Command: resume-from-new-screens

Reopen a previously closed slice only for frontend completion when new or changed UI evidence arrives.

## Read

1. `AGENTS.md`
2. `docs/implementation/agent-operating-model.md`
3. `docs/implementation/slice-backlog.yaml`
4. `docs/implementation/system_state.md`
5. `docs/implementation/gap-register.md`
6. `docs/implementation/ui-slice-map.yaml`
7. `docs/implementation/figma-snapshot-lock.json`
8. `docs/figma-manifest.json` and `docs/figma-manifest.md`
9. `docs/figma/**`
10. Existing contracts and delivery records for candidate slices

## Preconditions

- No slice is `CONTRACT_REVIEW`, `IN_PROGRESS`, or `REOPENED_FOR_UI`.
- New/changed Figma/PNG evidence exists or user explicitly states new screens have arrived.
- Candidate slice is `DONE_BACKEND` or `DONE_FULL`.

If any precondition fails, stop.

## Actions

1. Check or refresh `figma-snapshot-lock.json` if possible.
2. Compare new/changed screens against `ui-slice-map.yaml` and manifests.
3. Identify related slice(s).
4. If exactly one slice maps cleanly and work is UI-only, create a UI-only reopening plan and move the candidate slice to `CONTRACT_REVIEW`.
5. If multiple slices match, stop and ask for mapping decision or update `ui-slice-map.yaml`.
6. If backend/API/business changes are required, do not reopen as UI. Return slice to `CONTRACT_REVIEW` or propose a new backlog item.
7. Run `review-current-contract` next. Only after the UI-only reopening contract passes review should the slice move to `REOPENED_FOR_UI`.

## Allowed in REOPENED_FOR_UI

- frontend routes
- components
- layout/styling
- replacing mocks with approved DTOs
- frontend tests
- visual evidence comparison with available repo/browser tools
- updating frontend gap records

## Forbidden in REOPENED_FOR_UI

- backend business rules
- RBAC
- Mystery redaction policy
- audit behaviour
- state machines
- database schema
- core API behaviour
- production assumptions

## Writes

- `docs/implementation/working/current-plan.md` as UI-only reopening plan
- `docs/implementation/slice-backlog.yaml` candidate slice to `CONTRACT_REVIEW` while the UI-only reopening plan is being reviewed
- `docs/implementation/ui-slice-map.yaml` if new mapping is unambiguous
- `docs/implementation/figma-snapshot-lock.json` if snapshot is refreshed/checked

## HUMAN_DECISION_REQUIRED

Return `HUMAN_DECISION_REQUIRED` instead of editing when:

- new screens map plausibly to multiple slices
- a screen changes both UI and backend/API expectations
- the UI evidence conflicts with PRD, requirements, architecture, or an existing frozen contract
- the user may need to approve using stale local exports rather than refreshing live Figma

## Prohibited writes

- Do not implement UI in this command.
- Do not modify backend code.
- Do not change core contract rules without returning to contract review.
