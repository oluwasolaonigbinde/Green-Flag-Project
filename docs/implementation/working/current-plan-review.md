# Current Plan Review

## Slice

- Slice ID: 9
- Title: Allocation workflow: candidates, COI, hold/release, and acceptance
- Review date: 2026-05-06
- Outcome: REVISE_AND_CONTINUE

## Review Notes

- S09 is the first legal slice selected by `slice-backlog.yaml`.
- Dependencies S06, S08, S08.5, and S08.6 are satisfied.
- The active-slice invariant is valid: S09 is the only `CONTRACT_REVIEW` slice and no slice is `IN_PROGRESS` or `REOPENED_FOR_UI`.
- The draft plan correctly preserves `assessment_episodes` as the lifecycle root and keeps applications from owning allocation, assessment, decision, publication, payment, or Mystery secrecy.
- Backend, API, frontend, verification, RBAC, audit, transaction, and redaction expectations are concrete enough as engineering boundaries.
- UI evidence is mapped correctly as layout/read-model evidence only; it does not define allocation business rules.
- Source requirements and architecture provide enough allocation behavior for a configurable S09 foundation.

## Required Plan Corrections

The prior review overstated the blocker. Repo-readable source truth does answer the core S09 allocation behaviors:

- `REQ-ALO-001` defines default judge-count suggestions: 2 judges for new sites, parks over 25 hectares, heritage, and failed sites; 1 judge for passed sites under 25 hectares; optional 3rd judge for training; admin override requires reason and audit.
- `REQ-ALO-002` defines hard/soft COI handling: hard COI candidates are excluded; soft COI candidates are visible with an admin acknowledgement flag; both are logged.
- `REQ-ALO-003` defines rotation behavior: previous Full Assessment same-park judge is deprioritised, not blocked; rural override requires reason and audit.
- `REQ-ALO-004` defines allocation map/cluster expectations.
- `REQ-ALO-005` defines hold/release: admin can allocate without sending emails, then release now or schedule batch release.
- `REQ-ALO-006` defines contact reveal: Full Assessment contact details reveal only after all required judges accept; Mystery Shop never reveals contact details.
- `REQ-CYC-002` defines Mystery applicant visibility: applicant-facing status remains `APPLICATION_UNDER_REVIEW` with assessor, visit, assignment, and assessment type suppressed.
- `docs/source/GFA_Integrated_Architecture (3).docx` Section 7 defines the candidate engine model: `cycle_id` input; draft `judge_assignments` output; active/current-accredited judges within configured distance and under capacity; hard/self-declared conflicts excluded; soft flags preserved; rotation penalty; distance and cluster-fit scoring; draft assignments hidden until admin confirmation.

The S09 plan should therefore be revised to implement the source-backed behavior above using configurable policy values where production-specific details remain open.

The remaining open items are production configuration and migration inputs, not slice-stopping blockers:

- `OI-004`: country/operator-specific final judge-count variants beyond the confirmed default rule.
- `OI-005`: whether distance thresholds are fixed nationally or configurable by country/region. The architecture already models configurable thresholds.
- `OI-006`: final production combination of park size, site complexity, and admin flags for second-judge policy. The confirmed default rule remains implementable.
- `OI-007`: live COI register owner/format. S09 can implement tables/import boundaries and lower-env records without inventing live migration data.

## Risk

The remaining risk is hardcoding production-specific policy values instead of making them configurable. Contract review should fail only if the S09 contract requires live KBT data, production-specific policy constants, notification sending, or later-slice visit/scoring/result behavior.

## Required Next Action

Revise the S09 contract/plan so the normal scope reflects the source-backed rules and treats remaining `OI-004` through `OI-007` items as configurable production inputs. Then rerun contract review.

## Freeze Result

Not frozen yet. Keep S09 in `CONTRACT_REVIEW` only until the contract is revised against the source-backed rules above, then continue through the normal review/build/close workflow.
