# Slice Delivery Record

## Metadata

- Slice ID: 7
- Title: Admin read models and operational queues
- Closed status: DONE_BACKEND
- Closed at: 2026-05-05
- Contract path: docs/implementation/slice-contracts/S07-admin-read-models-queues.md

## Delivered capability

Delivered admin-facing read-model foundations for the already-implemented registration, application, document, and payment states: dashboard summary metrics, registration/application/payment/document queues, admin application detail, safe allocation-readiness preview, queue filters/pagination DTOs, RBAC-protected API routes, OpenAPI entries, contract fixtures, API smoke tests, and frontend admin dashboard/queue/detail routes.

Post-review hardening on 2026-05-05 added central ownership/scope predicates for admin queues, country/global scope-boundary tests, and changed application queue episode status to read from episode lifecycle state rather than deriving it solely from application/payment status.

No allocation candidates, assessor management, scoring, result decisions, certificates, public map publication, exports, notification sending, Business Central integration, provider automation, production finance values, VAT treatment, or legal invoice wording were introduced.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Contracts validation | PASS | `corepack pnpm contracts:check` passed with S07 admin DTO fixture coverage |
| OpenAPI validation | PASS | `corepack pnpm openapi:check` passed with S07 paths/schemas required |
| Migration check | PASS | `corepack pnpm db:migrate:check` passed; no S07 schema tables added |
| Seed check | PASS | `corepack pnpm db:seed:check` passed; no production-looking values introduced |
| Lint | PASS | `corepack pnpm lint` passed |
| Tests | PASS | `corepack pnpm test` passed, including `apps/api/src/admin.test.ts` |
| Build/typecheck | PASS | `corepack pnpm typecheck` passed and built Next.js admin routes; existing non-blocking Next.js ESLint-plugin warning remains |
| API smoke | PASS | Admin dashboard, registration queue, application queue, payment queue, document queue, detail, allocation-readiness, and applicant-denied paths verified in tests |
| Mystery leakage | PASS | S07 fixtures and admin detail smoke assert no raw `MYSTERY_SHOP`; read models do not expose judge, assignment, visit timing, or candidate data |

## Frontend status

- Status: partial
- Gaps recorded: FE-026, FE-027, FE-028, FE-029, FE-030
- Reopen trigger: new or changed admin application queue variants, payment/manual action UI, document archive/detail variants, mobile admin views, or allocation-readiness preview screens.

## Backend handoff

Admin reads are available under:

- `GET /api/v1/admin/dashboard-summary`
- `GET /api/v1/admin/queues/registrations`
- `GET /api/v1/admin/queues/applications`
- `GET /api/v1/admin/queues/payments`
- `GET /api/v1/admin/queues/documents`
- `GET /api/v1/admin/applications/:applicationId`
- `GET /api/v1/admin/applications/:applicationId/allocation-readiness`

Payment and registration data-changing commands remain the prior S03/S06 audited commands. S07 adds no new data-changing command.

## Frontend handoff

Routes exist for `/admin`, `/admin/queues`, `/admin/applications/[applicationId]`, and the existing `/admin/registrations` fallback. Result cards and allocation readiness are safe deferred/readiness-only surfaces.

## Client-safe summary

Admins can now see operational dashboard counts, work queues, payment/document attention, and application detail across the delivered registration-through-payment workflow. Allocation readiness is visible only as prerequisite flags, with actual allocation remaining a later slice.

## Residual risks

Exact admin queue variants, payment action screens, document archive filters/version detail variants, mobile layouts, and allocation-readiness UI variants are not fully evidenced by exported designs. Production finance/provider/export/result behavior remains deferred to later slices or external dependencies.

Production DB-backed read repositories remain required before production deployment. Allocation readiness remains prerequisite-only; S09 allocation is still not implemented.
