# Current Plan Review

## Slice

- Slice ID: 9
- Title: Allocation workflow: candidates, COI, hold/release, and acceptance
- Review date: 2026-05-05
- Outcome: HUMAN_DECISION_REQUIRED

## Review Notes

- Slice 9 is the first legal slice selected by `slice-backlog.yaml`; no active-slice invariant violation exists.
- Dependencies S06 and S08 are satisfied.
- The draft contract correctly identifies allocation-ready episodes, candidate assessor queries, COI, hold/release, accept/decline, reassignment, and contact reveal controls as the intended S09 scope.
- The draft also correctly excludes scoring, assessment forms, actual visit execution, notifications, messages, exports, results, certificates, public map publication, and full Mystery redaction hardening.
- However, the currently available repo-readable evidence is not specific enough to freeze safe product rules for hard vs soft COI taxonomy, held/released transition rules, accept/decline deadlines, reassignment constraints, and exact contact reveal timing.
- This matters because S09 is a backend-owned workflow/risk slice. Guessing these rules would violate the repo instruction that product scope may not be inferred.
- Direct source extraction from `docs/source/GFA_Integrated_Architecture (3).docx` confirms a draft Judge Allocation Engine with `judge_exclusions`, `judge_assignment_history`, clusters, draft assignments, conflict checks, distance filtering, capacity, rotation, and admin confirmation before judge visibility.
- Direct source extraction from `docs/source/GFA_PRD_v1_1 (1).docx` also confirms the decisive open inputs: `OI-004` full judge allocation rules, `OI-005` distance threshold configurability, `OI-006` second judge requirement rule, and `OI-007` current COI register format are all `PENDING KBT INPUT`.
- The same PRD action list says to finalise the judge allocation engine only after KBT answers `OI-004` through `OI-007`, with status `BLOCKED — awaiting KBT input`.

## Required Decision / Evidence Before Freeze

Provide or point to authoritative product/architecture evidence for:

- hard COI reason codes and blocking behavior,
- soft COI reason codes and admin override behavior,
- suggested vs final judge-count rule,
- hold/release transition rules,
- accept/decline deadline and reassignment behavior,
- judge/applicant/admin contact reveal timing,
- Mystery-specific allocation/contact visibility before S10 hardening.

Partial architecture evidence currently available but not sufficient for production freeze:

- draft assignment state names: `draft`, `pending_acceptance`, `accepted`, `declined`, `completed`;
- conflict result names: `clear`, `soft_flag`, `hard_conflict`;
- exclusion types: `hard_conflict`, `self_declared`, `soft_flag`, `admin_set`;
- draft allocation is not visible to judges until admin review/confirmation.

## Freeze Result

Not frozen. Keep Slice 9 in `CONTRACT_REVIEW`.
