# Command: close-current-slice

Close the active slice after review passes. This updates state and delivery artifacts; it does not implement code.

## Read

1. `AGENTS.md`
2. `docs/implementation/agent-operating-model.md`
3. `docs/implementation/slice-backlog.yaml`
4. Active frozen contract
5. `docs/implementation/working/current-implementation-review.md`
6. `docs/implementation/system_state.md`
7. `docs/implementation/gap-register.md`
8. `docs/implementation/delivery-records/templates/delivery-record-template.md`
9. Relevant code/evidence only as needed to capture close-time state

## Preconditions

- Exactly one slice is `IN_PROGRESS` or `REOPENED_FOR_UI`.
- Frozen contract exists.
- Contract review passed.
- Implementation review outcome is `PASS` or `PASS_WITH_FRONTEND_GAPS`.
- Verification matrix is complete with PASS or approved N/A for required checks.
- Closure inputs are concrete.

If any precondition fails, refuse closure and report exact missing gate.

## Behavior

If implementation review outcome is `PASS_WITH_FRONTEND_GAPS` or frontend evidence remains missing/partial:

- Mark slice `DONE_BACKEND`.
- Record frontend gaps and reopen triggers in `gap-register.md`.
- Update `system_state.md` from evidence.
- Create delivery record.
- Update backlog status last.

## Working file policy

- Keep permanent truth in `docs/implementation/slice-contracts/` and `docs/implementation/delivery-records/`.
- After successful close, clear or reset `docs/implementation/working/current-plan.md`, `docs/implementation/working/current-plan-review.md`, and `docs/implementation/working/current-implementation-review.md` to placeholder state.
- Do not delete frozen contracts or delivery records.

If implementation review outcome is `PASS` and frontend/API/backend all passed against available UI evidence:

- Mark slice `DONE_FULL`.
- Update `system_state.md` from evidence.
- Create delivery record.
- Update backlog status last.

For `REOPENED_FOR_UI`, close back to `DONE_FULL` if the UI gap is resolved, or `DONE_BACKEND` if gaps remain.

## Writes

- `docs/implementation/system_state.md`
- `docs/implementation/gap-register.md` only for closed frontend gaps/reopen triggers
- `docs/implementation/delivery-records/Sxx-<slug>-delivery.md`
- Active contract closure note
- `docs/implementation/slice-backlog.yaml` last

## Prohibited writes

- Do not implement code.
- Do not reopen the contract in this command.
- Do not invent delivered claims without evidence.
