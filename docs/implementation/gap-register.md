# Green Flag Award - Gap Register

This file records known missing inputs, external dependencies, frontend gaps, and risks. It informs planning. It should not be casually edited during normal implementation except through explicit planning/close/reopen workflows.

## External production dependencies

| Gap ID | Area | Dependency | Current handling | Required before |
| --- | --- | --- | --- | --- |
| EXT-001 | Scoring | Official Standard Green Flag criteria, subcriteria, guidance text | Build configurable scoring framework with lower-env placeholders only | Production assessment form / UAT scoring sign-off |
| EXT-002 | Scoring | Applicant band labels and ranges | Store raw totals internally; block or withhold applicant band publication until approved | Applicant result publication |
| EXT-003 | Finance | Production fee schedule, VAT treatment, legal invoice wording | Build fee/invoice schema and use lower-env test seed only | Production invoice generation |
| EXT-004 | Finance | Business Central data contract and credentials | CSV/manual export first; API adapter later | Automated finance integration |
| EXT-005 | Payments | Production payment provider account, keys, webhook sign-off | Manual mark-paid MVP; provider automation feature-flagged | Online card automation |
| EXT-006 | Awards | Community, Heritage, Group criteria/processes | Keep categories blocked/draft | Activation beyond Standard Green Flag |
| EXT-007 | SMS | Production SMS provider account/credentials | Model SMS events/templates; email primary | Production SMS sending |
| EXT-008 | Public map | Final public map endpoint/data contract | Emit/retry public_map_update_events; adapter boundary | Automated public map sync |
| EXT-009 | Migration | Current system export files | Build import tooling and synthetic seeds | Migration dry run/go-live load |
| EXT-010 | Governance | Legal/compliance/formal KBT sign-off | Implement hooks; do not invent approvals | Go-live approval |

## Frontend/design gaps

| Gap ID | Related slice | Expected screen/surface | Current evidence | Current handling | Reopen trigger |
| --- | --- | --- | --- | --- | --- |
| FE-001 | 4 | Full applicant dashboard/application list/detail | Applicant dashboard/list/detail PNGs available; some node-to-PNG mapping remains family-level | Contract + available UI alignment + mocks for missing states | New/updated applicant dashboard/application screens |
| FE-002 | 4 | Full application wizard steps | Wizard PNGs available for main flow; exact one-to-one node-to-PNG mapping remains partial | API/read-model contracts plus available UI alignment; stub only missing states | New/changed wizard step screens |
| FE-003 | 5 | Management plan upload/link/versioning UI | Document step PNG available; dedicated versioning/link states not confirmed | API/contracts first; frontend stub if needed | Upload/link/version screens arrive |
| FE-004 | 6 | Payment/PO/no-PO/invoice UI | Payment/submitted PNGs available; production fee/VAT/legal values unavailable | Backend/API contracts; available UI alignment; frontend stubs for missing invoice states | Payment/invoice variants arrive |
| FE-005 | 7 | Admin registration/application/payment/result queues | Multiple Super Admin dashboard/queue PNGs available; registration queue specifics uncertain | Read-model contracts plus available UI alignment | Admin queue variants arrive |
| FE-006 | 8 | Assessor/judge management | Super Admin assessor management and judge role PNGs exist | Use available screens; record missing states | New assessor management variants arrive |
| FE-007 | 9 | Allocation candidate review/map/hold-release/accept-decline | Super Admin allocation application list and assessor schedule PNGs available; candidate/hold-release details uncertain | Backend/API contracts; no invented UI | Allocation variants arrive |
| FE-008 | 11 | Judge park details/evaluation/assessment mobile flow | Assessor evaluation/scoring PNGs available; mobile node IDs exist but no mobile PNG exports | Use available desktop screens; record missing mobile/offline states | Mobile/offline assessment PNG exports arrive |
| FE-009 | 12 | Results/certificate/publication screens | Evaluation result, finalist, shortlisted, past-winner, and map/admin PNGs available; certificate/public map frontend not confirmed | Backend contracts and artifact shells | Results/certificate/public map screens arrive |
| FE-010 | 12 | Public winner map / public park profile UI | Public map update requirement exists; no public visitor PNGs currently exported | Emit/update public map events and keep frontend/public surface pending unless contract scopes it | Public map/profile screens or endpoint contract arrives |

## Workflow risks

- Slice definitions must be hardened in contracts before coding. The backlog controls order; contracts control scope.
- If application scaffold does not exist, runtime review must not pretend lint/typecheck/build/browser checks passed.
- If Figma live access is unavailable, planning must proceed from local locked snapshot and record freshness not verified.
- If UI conflicts with PRD/architecture, PRD/architecture wins and the conflict must be recorded.
- If a reopened UI slice requires backend/API/schema/rule changes, stop and return to contract review or create a new backlog item.
