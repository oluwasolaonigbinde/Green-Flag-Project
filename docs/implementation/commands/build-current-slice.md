# Command: build-current-slice

Implement the active frozen slice contract. Build only the approved scope.

## Read

1. `AGENTS.md`
2. `docs/implementation/agent-operating-model.md`
3. `docs/implementation/slice-backlog.yaml`
4. Active frozen contract under `docs/implementation/slice-contracts/`
5. `docs/implementation/system_state.md`
6. `docs/implementation/gap-register.md`
7. Source/architecture docs relevant to the slice
8. Existing code relevant to the slice
9. UI evidence relevant to the slice

## Preconditions

- Exactly one slice is `IN_PROGRESS` or `REOPENED_FOR_UI`.
- No slice is `CONTRACT_REVIEW`.
- Frozen contract exists for the active slice.

If any precondition fails, stop and report.

## Implementation rules

- Implement only the frozen contract.
- Do not drift into later slices.
- Do not invent APIs, fields, statuses, business rules, state transitions, permissions, scoring bands, fees, legal wording, or provider behavior.
- Keep backend/API/frontend changes aligned to the contract.
- If screens are missing and the contract allows stubs/mocks, implement stubs/mocks and gap records only.
- If implementation reveals the contract is wrong, stop and return the slice to `CONTRACT_REVIEW` rather than improvising.
- Preserve episode-first architecture.
- Enforce RBAC/scope where relevant.
- Emit audit events where relevant once audit foundation exists.
- Enforce Mystery redaction where relevant.

## Extra rules when status is REOPENED_FOR_UI

Allowed:

- frontend routes
- components
- layout/styling
- replacing mocks with already-approved DTOs
- frontend tests
- visual alignment against approved UI evidence
- updating frontend gap records

Forbidden:

- backend business rules
- database schema
- RBAC/scope rules
- audit behaviour
- Mystery redaction policy
- state machines
- core API behaviour
- production assumptions

If UI completion requires any forbidden change, stop and return the slice to `CONTRACT_REVIEW` or propose a new backlog item rather than continuing as `REOPENED_FOR_UI`.

## If the contract is wrong

1. Stop implementation.
2. Update backlog from `IN_PROGRESS` or `REOPENED_FOR_UI` to `CONTRACT_REVIEW`.
3. Change contract state from `Frozen` to `Draft`.
4. Append a return-to-contract-review note explaining the mismatch.
5. Do not guess and continue.

## Prohibited writes

- Do not mark the slice done.
- Do not update `system_state.md`.
- Do not create delivery records.
- Do not mutate unrelated workflow files except to return the slice to contract review when required.
