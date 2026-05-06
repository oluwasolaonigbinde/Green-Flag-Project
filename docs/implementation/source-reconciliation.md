# Green Flag Award - Source Reconciliation

This file records how repo-readable source documents are interpreted when they appear to overlap or conflict. It does not replace the original files under `docs/source/`; it makes their precedence deterministic for implementation planning and contract review.

## Source Precedence

Use the precedence rules from `docs/implementation/Green_Flag_System_Architecture_Final.docx`:

1. PRD files define product intent, client-facing scope, roles, NFRs, open items, and sign-off framing.
2. Requirements specs define granular functional behavior and acceptance criteria. They are the highest authority for detailed testable requirement behavior.
3. Integrated architecture defines platform direction, event coordination, dual-window design, W3W/ONS/OS handling, and allocation-engine direction unless contradicted by PRD business outcomes.
4. Final implementation/architecture docs synthesize source decisions into the backend baseline.
5. Figma/UI evidence shapes layout, fields, read models, and visual acceptance only. UI never overrides product, requirements, architecture, RBAC, audit, redaction, or state-machine rules.

When a source document has both confirmed requirements and open production questions, implement the confirmed requirement behavior and keep the open production item configurable, adapter-backed, or recorded in `gap-register.md`. Do not treat an open production tuning/input item as a blocker for a slice whose default behavior is already confirmed.

## Allocation Policy

S09 allocation is implementable from the source corpus. The confirmed behavior below is normal S09 scope, not an optional interpretation.

| Area | Implementation truth |
| --- | --- |
| Judge-count default | `REQ-ALO-001` defines the default: 2 judges for new sites, parks over 25 hectares, heritage, and failed sites; 1 judge for passed sites under 25 hectares; optional 3rd judge for training; admin override requires reason and audit. |
| Judge-count production variants | `OI-004` and `OI-006` keep final country/operator/site-complexity variants open. Model judge-count policy as configurable and do not hardcode production-only variants. |
| COI hard/soft handling | `REQ-ALO-002` defines hard COI candidates as excluded before display and soft COI candidates as visible with admin acknowledgement and logging. |
| COI categories | Integrated Architecture Section 7.3 defines hard/self-declared/admin-set/same-operator blocks, soft adjacent-authority flags, and rotation as waivable/deprioritised. |
| COI live migration source | `OI-007` keeps the live COI register owner/format open. Implement COI tables/import boundaries and lower-env fixtures; do not invent live migration data. |
| Rotation | `REQ-ALO-003` defines previous Full Assessment same-park judge as deprioritised, not blocked. Rural override requires reason and audit. |
| Candidate engine | Integrated Architecture Section 7.2 defines `cycle_id` input, draft `judge_assignments` output, active/current-accredited candidates within configured distance and capacity, hard/self-declared conflict exclusion, soft flag preservation, distance/cluster scoring, and draft invisibility until admin confirmation. |
| Distance threshold | Integrated Architecture Section 7.2 models configurable thresholds with defaults. `OI-005` keeps final national/country/regional production values open, so S09 should store thresholds as configuration. |
| Allocation map/cluster view | `REQ-ALO-004` requires map/read-model support for parks by allocation status, judge nearby allocations, and cluster context. |
| Hold/release | `REQ-ALO-005` requires saved allocations without judge emails and release-now or scheduled release that sends the batch simultaneously. |
| Contact reveal | `REQ-ALO-006` requires Full Assessment contact reveal only after all required judges accept; one accepted judge is insufficient; Mystery Shop never reveals contact details. |
| Mystery applicant visibility | `REQ-CYC-002` and final architecture redaction rules require applicant-facing `APPLICATION_UNDER_REVIEW` only, with assessor, visit, assignment, judge count, and assessment type suppressed. |

## S09 Contract Consequence

S09 should proceed as a configurable allocation foundation. Contract review should only stop if the proposed contract requires live KBT data, production-specific constants, notification sending, scoring/visit/result behavior, or applicant-facing Mystery allocation visibility beyond the confirmed rules above.
