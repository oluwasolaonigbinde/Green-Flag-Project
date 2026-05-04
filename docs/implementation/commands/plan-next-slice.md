# Command: plan-next-slice

Create the draft contract for the next executable slice. Do not implement code.

## Read

1. `AGENTS.md`
2. `docs/implementation/agent-operating-model.md`
3. `docs/implementation/slice-backlog.yaml`
4. `docs/implementation/system_state.md`
5. `docs/implementation/gap-register.md`
6. `docs/implementation/ui-slice-map.yaml`
7. `docs/implementation/figma-snapshot-lock.json`
8. Source docs under `docs/source/`
9. Architecture/implementation docs under `docs/implementation/`
10. Figma manifests and PNG exports when the slice has UI surfaces

## Preconditions

- No slice is `CONTRACT_REVIEW`, `IN_PROGRESS`, or `REOPENED_FOR_UI`.
- No earlier `BLOCKED` slice prevents the first TODO from being planned.
- At least one slice is `TODO`.
- Dependencies for the first eligible TODO are `DONE_BACKEND` or `DONE_FULL`, except Slice 0.

If any precondition fails, stop and report the exact reason.

## Slice selection

Select the first eligible `TODO` in `slice-backlog.yaml`. Do not allow the user to skip ahead unless they explicitly edit/reorder the backlog.

## Planning requirements

Write `docs/implementation/working/current-plan.md` using the contract template. Populate at least:

- selected slice and why it is legal
- objective
- primary user/system path
- source mapping
- backend scope
- API/DTO scope
- frontend scope
- available screens
- partial screens
- missing screens
- mock/stub plan
- frontend gap records required
- external blockers
- forbidden work
- planned file zones
- verification matrix
- stop triggers

## UI evidence handling

For the selected slice:

1. Check `ui-slice-map.yaml`.
2. Check `docs/figma-manifest.json` and `docs/figma-manifest.md`.
3. Search `docs/figma/**` for matching PNGs.
4. Check `figma-snapshot-lock.json`.
5. If live Figma freshness cannot be verified, proceed from local snapshot and record that freshness is unverified.
6. If live Figma is known newer than the local lock, stop unless the user explicitly approves building against the local snapshot.

## Writes

- Create/replace `docs/implementation/working/current-plan.md`.
- Update the selected slice in `slice-backlog.yaml` from `TODO` to `CONTRACT_REVIEW`.

## Prohibited writes

- Do not implement product code.
- Do not create migrations except as planned text.
- Do not modify `system_state.md`.
- Do not modify `gap-register.md` except to list proposed gap records in the plan.
- Do not create delivery records.
