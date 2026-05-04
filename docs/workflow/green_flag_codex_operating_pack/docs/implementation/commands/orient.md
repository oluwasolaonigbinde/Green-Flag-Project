# Command: orient

Read the Green Flag workflow state and report the deterministic next step. Do not modify files.

## Read

1. `AGENTS.md`
2. `docs/implementation/agent-operating-model.md`
3. `docs/implementation/slice-backlog.yaml`
4. `docs/implementation/system_state.md`
5. `docs/implementation/gap-register.md`
6. `docs/implementation/ui-slice-map.yaml`
7. `docs/implementation/figma-snapshot-lock.json`
8. `docs/figma-manifest.json` and `docs/figma-manifest.md` if present
9. Active contract from `docs/implementation/slice-contracts/` only if exactly one active slice exists

## Validate

1. Count slices with status `CONTRACT_REVIEW`.
2. Count slices with status `IN_PROGRESS`.
3. Count slices with status `REOPENED_FOR_UI`.
4. If more than one exists across those statuses, report workflow violation and stop.
5. If a `BLOCKED` slice appears before the first eligible `TODO`, report that unblock/reorder is required.
6. Check if repo is docs-only from `system_state.md` and actual file inspection.
7. Check whether Figma exports/manifests exist.

## Output

Return a concise report:

- Workflow state
- Active slice, if any
- Contract state
- Current project reality
- Major gaps
- Figma/design state
- Next legal command

## Write behavior

Do not modify backlog, contracts, code, `system_state.md`, or `gap-register.md`.
