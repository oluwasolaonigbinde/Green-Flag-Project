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
| EXT-011 | Persistence | Production PostgreSQL repository adapters/API runtime wiring for Slices 1-8 | Lower-env/test stores are explicit and transaction-capable; API no longer silently defaults to them | Production deployment / UAT against durable data |

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
| FE-011 | 3 | Email verification landing page | `SCR-REG-02` is required by source docs but no exact PNG export is present | Functional fallback route at `/register/verify` backed by verification DTO | Registration verification PNG export arrives |
| FE-012 | 3 | Exact admin registration review queue | `SCR-ADM-02` is required by source docs but no exact registration-specific queue PNG is present | Fallback route at `/admin/registrations` using available Super Admin queue evidence and registration DTOs | Exact admin registration review queue PNG export arrives |
| FE-013 | 4 | Applicant autosave loading/conflict/empty states | Exact exported variants are not separately confirmed | Contract-backed compact states only; backend conflict response verified by API tests | Exact autosave state PNGs arrive |
| FE-014 | 4 | Previous feedback response UI | Requirement exists and draft DTO/API exists; exact screen export is not separately confirmed | Simple draft section/field only | Exact previous-feedback response screen arrives |
| FE-015 | 4 | Applicant wizard mobile layout | Desktop wizard PNG family exists; exact mobile PNG exports are not available | Responsive route shell without pixel-level mobile acceptance | Mobile applicant wizard PNG exports arrive |
| FE-016 | 5 | Document upload progress/retry/failure states | Document step PNG exists; exact progress, retry, and failure variants are not separately exported | Contract-backed progress and retry-safe API states | Exact upload progress/retry/failure PNGs arrive |
| FE-017 | 5 | Duplicate document warning | SHA-256 duplicate handling exists in API; exact duplicate warning UI is not exported | Contract-backed duplicate response/fallback state | Exact duplicate-file warning PNG arrives |
| FE-018 | 5 | Management-plan version history/archive UI | Current/archived document metadata exists; exact version history UI is not exported | Compact version/archive summary | Exact version history/archive screen arrives |
| FE-019 | 5 | Virus-scan pending/rejected UI | Scan status modeled as lower-env metadata; exact pending/rejected UI is not exported | Metadata-backed fallback state only | Exact scan pending/rejected screen arrives |
| FE-020 | 5 | Applicant document upload mobile UI | Desktop document step PNG exists; mobile upload exports are not available | Responsive route shell without pixel-level mobile acceptance | Mobile document upload PNG exports arrive |
| FE-021 | 6 | Applicant PO/no-PO selection variants | Submitted/payment PNGs exist, but exact PO/no-PO interaction variants are not separately exported | Contract-backed PO number fixture and no-PO API state; compact frontend summary | Exact PO/no-PO selection screens arrive |
| FE-022 | 6 | Applicant invoice pending/paid/overdue/override variants | Payment PNG exists, but state-specific invoice variants are not separately exported | Contract-backed payment summary with safe lower-env markers | Exact invoice state variants arrive |
| FE-023 | 6 | Admin manual mark-paid and override UI | Backend/API contracts exist; no exact admin payment action screen is exported | API-only manual action/override contracts for now | Exact admin payment action/queue screens arrive |
| FE-024 | 6 | Applicant submitted/payment mobile UI | Desktop submitted/payment PNGs exist; mobile submitted/payment exports are unavailable | Responsive route shell without pixel-level mobile acceptance | Mobile submitted/payment PNG exports arrive |
| FE-025 | 6 | Online card payment UI | Source requires card payment eventually, but provider credentials/sign-off are unavailable | Disabled/deferred frontend affordance; no provider automation | Approved provider contract and card-flow screens arrive |
| FE-026 | 7 | Exact admin application queue status variants | Super Admin dashboard/recent-applications/allocation-list PNGs exist, but exact per-status application queue variants are not separately exported | Contract-backed `/admin/queues` application table with safe status/payment/document/readiness fields | Exact admin application queue status variant PNGs arrive |
| FE-027 | 7 | Exact admin payment queue and manual action UI | Payment read-model and manual action APIs exist; no exact payment queue/manual mark-paid/override screen is exported | Contract-backed payment queue read model; manual actions remain API-only/future UI | Exact admin payment queue/manual action PNGs arrive |
| FE-028 | 7 | Exact document archive/version filter variants | `Super Admin - Document Archieve.png` exists, but exact filters/version detail variants are not separately exported | Contract-backed document queue/archive table with current/archive metadata | Exact document archive filters/version detail PNGs arrive |
| FE-029 | 7 | Admin dashboard/queues mobile variants | Desktop Super Admin dashboard/queue PNG evidence exists; mobile admin exports are unavailable | Responsive route shells without pixel-level mobile acceptance | Mobile admin dashboard/queue PNG exports arrive |
| FE-030 | 7 | Allocation readiness preview without allocation action variants | Allocation application list PNG can shape dense table layout, but no no-allocation-action readiness variant is exported | Safe readiness preview only; no candidates, assignments, or judge data | Exact allocation-readiness preview PNGs arrive |
| FE-031 | 8 | Exact assessor profile edit/accreditation state variants | Assessor dashboard/preference and admin judge-management PNGs exist, but profile edit/accreditation pending/expired/unavailable variants are not separately exported | Contract-backed assessor profile and accreditation marker routes with provider sync deferred | Exact profile edit/accreditation state PNGs arrive |
| FE-032 | 8 | Exact admin create/edit/disable assessor variants | Super Admin assessor management PNG exists, but create/edit/disable modal or detail variants are not separately exported | Contract-backed admin assessor list/detail routes and API commands | Exact admin assessor create/edit/disable PNGs arrive |
| FE-033 | 8 | Availability/capacity conflict and validation variants | Assessor schedule/preference PNGs exist, but validation/conflict/capacity-state variants are not separately exported | Contract-backed availability/capacity summaries with safe form affordances | Exact availability/capacity validation PNGs arrive |
| FE-034 | 8 | Assessor/admin management mobile variants | Desktop assessor/admin PNG evidence exists; mobile management/preference exports are unavailable | Responsive route shells without pixel-level mobile acceptance | Mobile assessor/admin management PNG exports arrive |

## Workflow risks

- Slice definitions must be hardened in contracts before coding. The backlog controls order; contracts control scope.
- If application scaffold does not exist, runtime review must not pretend lint/typecheck/build/browser checks passed.
- If Figma live access is unavailable, planning must proceed from local locked snapshot and record freshness not verified.
- If UI conflicts with PRD/architecture, PRD/architecture wins and the conflict must be recorded.
- If a reopened UI slice requires backend/API/schema/rule changes, stop and return to contract review or create a new backlog item.
- Slices 1-8 now have hardened lower-env transaction/authorization/redaction boundaries, but production-grade operation still requires wiring the API to real PostgreSQL repositories and running DB-backed integration tests.
