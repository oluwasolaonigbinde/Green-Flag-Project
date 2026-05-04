# Command: review-current-slice

Review the active implementation with evidence-based Codex repo/command/browser checks. Do not close the slice here.

## Read

1. `AGENTS.md`
2. `docs/implementation/agent-operating-model.md`
3. `docs/implementation/implementation-review-checklist.md`
4. `docs/implementation/slice-backlog.yaml`
5. Active frozen contract under `docs/implementation/slice-contracts/`
6. `docs/implementation/system_state.md`
7. `docs/implementation/gap-register.md`
8. Relevant source/architecture docs
9. Relevant code, migrations, tests, contracts, fixtures, and UI files
10. Relevant Figma/PNG evidence

## Preconditions

- Exactly one slice is `IN_PROGRESS` or `REOPENED_FOR_UI`.
- Frozen contract exists.
- No other active slice exists.

If any precondition fails, stop.

## Review actions

Inspect actual repo state:

- changed files
- migrations/schema
- OpenAPI/contracts/DTOs/mocks
- frontend routes/components if any
- backend services/controllers/guards if any
- tests/fixtures/seeds
- workflow files touched by the slice

Run available commands where configured:

- install/dependency check if needed
- lint
- typecheck
- unit tests
- integration tests
- build
- migration/dry-run checks
- API/contract validation
- route/API smoke checks if runnable

If frontend exists and can run:

- start the app
- inspect relevant routes/screens
- compare against available PNG/Figma exports where possible
- record screenshot/evidence if supported

If frontend/backend cannot run:

- state exactly why
- fall back to code/contract/doc review
- do not pretend runtime or visual verification passed

## Review focus

- Implementation matches frozen contract.
- Scope lock was respected.
- No later slice scope was pulled in.
- Green Flag non-negotiables are preserved.
- RBAC/scope/audit/redaction are implemented where required.
- Missing frontend screens remain recorded as gaps, not silently invented.
- No production values were invented.

## Outcomes

Write `docs/implementation/working/current-implementation-review.md` with one outcome:

- `PASS`
- `PASS_WITH_FRONTEND_GAPS`
- `FAIL_NEEDS_FIXES`
- `BLOCKED_BY_EXTERNAL_DEPENDENCY`

## PASS behavior

Keep backlog as `IN_PROGRESS` or `REOPENED_FOR_UI`. Record evidence and closure inputs, but do not close.

## FAIL behavior

If issue is local to implementation:

- Keep current active status.
- Keep contract frozen.
- Record exact fixes required.

If the contract is wrong:

- Move slice back to `CONTRACT_REVIEW`.
- Set contract state to `Draft`.
- Record exact contract corrections needed.

If broader foundational issue blocks safe continuation:

- Mark slice `BLOCKED`.
- Record blocker and recommended stabilization/reorder.

## Prohibited writes

- Do not update `system_state.md`.
- Do not close the slice.
- Do not create delivery records unless explicitly part of review evidence policy.
