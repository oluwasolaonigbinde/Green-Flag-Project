# Implementation Review Checklist

Use this checklist when running `review-current-slice`.

## Workflow gates

- Exactly one slice is `IN_PROGRESS` or `REOPENED_FOR_UI`.
- Frozen contract exists under `slice-contracts/`.
- The implementation stayed within the frozen contract.
- No later slice scope was accidentally implemented.

## Evidence-based review

Inspect actual repo state. Do not perform theoretical review only.

If code exists, run available commands where configured:

- install / dependency check if needed
- lint
- typecheck
- unit tests
- integration tests
- build
- migration/dry-run checks
- OpenAPI/contract validation
- API smoke checks if runnable
- frontend route/browser checks if runnable

If frontend exists and can run:

- start app
- open relevant routes
- inspect visible states
- compare against mapped PNG/Figma evidence where possible
- record screenshot/evidence if supported

If checks cannot run:

- explain exactly why
- mark affected verification rows as failed or N/A only if pre-approved in the frozen contract
- do not claim runtime or visual review passed

## Green Flag implementation checks

- Backend respects episode-first ownership.
- Applications own only applicant package state.
- RBAC/scope enforcement exists where relevant.
- Data-changing commands emit audit events where relevant.
- Mystery redaction is enforced server-side where relevant.
- No production fees/VAT/scoring bands/legal wording/provider credentials were invented.
- Official scoring text and bands remain configurable seed/config data.
- Manual/payment adapter boundaries are respected.
- LANTRA/accreditation external adapter boundary is respected.
- Public map integration remains event/adapter backed.

## API / DTO checks

- Endpoints match frozen contract.
- DTOs are frontend-usable and stable.
- Mock responses exist where frontend depends on unavailable backend or missing screens.
- Error codes follow the project convention.
- Idempotency exists where required.

## UI checks

- Available screens were implemented/aligned as contracted.
- Missing screens remain stubbed or recorded as gaps.
- UI does not reveal Mystery data.
- UI does not show raw applicant-restricted scores.
- UI does not use internal process copy unless explicitly allowed.

## Outcomes

Return one of:

- `PASS`
- `PASS_WITH_FRONTEND_GAPS`
- `FAIL_NEEDS_FIXES`
- `BLOCKED_BY_EXTERNAL_DEPENDENCY`
- `HUMAN_DECISION_REQUIRED`

Use `HUMAN_DECISION_REQUIRED` only when the implementation appears technically reviewable but a source-truth conflict, scope judgment, or user-approved tradeoff is needed before the reviewer can safely pass or fail it.
