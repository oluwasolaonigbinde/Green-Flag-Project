# Green Flag Award — Gap Register

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
| FE-001 | 4 | Full applicant dashboard/application list/detail | Applicant applications PNG exists; exact route and states need repo mapping | Contract + available UI alignment + mocks for missing states | New/updated applicant dashboard/application screens |
| FE-002 | 4 | Full application wizard steps | Partial/unknown | API/read-model contracts and stubs | New wizard step screens |
| FE-003 | 5 | Management plan upload/link/versioning UI | Partial/unknown | API/contracts first; frontend stub if needed | Upload/link/version screens arrive |
| FE-004 | 6 | Payment/PO/no-PO/invoice UI | Partial/unknown | Backend/API contracts; frontend stubs | Payment/invoice screens arrive |
| FE-005 | 7 | Admin registration/application/payment/result queues | Partial/unknown | Read-model contracts first | Admin queue screens arrive |
| FE-006 | 8 | Assessor/judge management | Super Admin assessor management and judge role PNGs exist | Use available screens; record missing states | New assessor management variants arrive |
| FE-007 | 9 | Allocation candidate review/map/hold-release/accept-decline | Partial/unknown | Backend/API contracts; no invented UI | Allocation screens arrive |
| FE-008 | 11 | Judge park details/evaluation/assessment mobile flow | Assessor evaluation park details PNG exists | Use available screen; record missing scoring/offline states | New assessment/offline screens arrive |
| FE-009 | 12 | Results/certificate/publication screens | Partial/unknown | Backend contracts and artifact shells | Results/certificate screens arrive |

## Workflow risks

- Slice definitions must be hardened in contracts before coding. The backlog controls order; contracts control scope.
- If application scaffold does not exist, runtime review must not pretend lint/typecheck/build/browser checks passed.
- If Figma live access is unavailable, planning must proceed from local locked snapshot and record freshness not verified.
- If UI conflicts with PRD/architecture, PRD/architecture wins and the conflict must be recorded.
- If a reopened UI slice requires backend/API/schema/rule changes, stop and return to contract review or create a new backlog item.
