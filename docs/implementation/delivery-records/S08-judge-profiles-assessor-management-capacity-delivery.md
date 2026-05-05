# Slice Delivery Record

## Metadata

- Slice ID: 8
- Title: Judge profiles, assessor management, availability, and capacity
- Closed status: DONE_BACKEND
- Closed at: 2026-05-05
- Contract path: docs/implementation/slice-contracts/S08-judge-profiles-assessor-management-capacity.md

## Delivered capability

Delivered the judge/assessor management foundation: assessor profiles linked to internal users, accreditation source-of-truth markers, preferences, availability windows, capacity declarations, admin assessor list/detail/create/disable contracts, assessor self-service profile/preference/availability/capacity contracts, lower-env seeds, OpenAPI entries, migration policy updates, audit-backed commands, API tests, and frontend assessor/admin management routes.

Post-review hardening on 2026-05-05 removed implicit production default registration of lower-env assessor stores; assessor APIs now require explicit store/repository injection in app construction.

No allocation candidates, judge assignments, COI, visit scheduling workflow, scoring, result decisions, messages, exports, notification sending, production accreditation-provider integration, credentials, or official approval workflow were introduced.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Contracts validation | PASS | `corepack pnpm contracts:check` passed with S08 assessor DTO fixture coverage |
| OpenAPI validation | PASS | `corepack pnpm openapi:check` passed with S08 paths/schemas required |
| Migration check | PASS | `corepack pnpm db:migrate:check` passed for 8 migrations with S08 assessor tables allowed |
| Seed check | PASS | `corepack pnpm db:seed:check` passed for 7 lower-env seed files |
| Lint | PASS | `corepack pnpm lint` passed |
| Tests | PASS | `corepack pnpm test` passed, including `apps/api/src/assessor.test.ts` |
| Build/typecheck | PASS | `corepack pnpm typecheck` passed and built Next.js assessor/admin routes; existing non-blocking Next.js ESLint-plugin warning remains |
| API smoke | PASS | Assessor self-profile, preference, availability, capacity, admin list/detail/create/disable, and applicant-denied paths verified in tests |
| Mystery leakage | PASS | S08 fixtures and API smoke assert no raw `MYSTERY_SHOP`; read models do not expose assignment IDs, visit timing, or candidate IDs |
| Audit | PASS | Preference, availability, capacity, create, and disable commands append audit events |

## Frontend status

- Status: partial
- Gaps recorded: FE-031, FE-032, FE-033, FE-034
- Reopen trigger: new or changed assessor profile/accreditation variants, admin create/edit/disable screens, availability/capacity validation screens, mobile assessor/admin management screens, or approved production accreditation provider contract.

## Backend handoff

Assessor/admin management APIs are available under:

- `GET /api/v1/assessor/profile`
- `PATCH /api/v1/assessor/profile/preferences`
- `PATCH /api/v1/assessor/profile/availability`
- `PATCH /api/v1/assessor/profile/capacity`
- `GET /api/v1/admin/assessors`
- `POST /api/v1/admin/assessors`
- `GET /api/v1/admin/assessors/:assessorId`
- `PATCH /api/v1/admin/assessors/:assessorId`
- `POST /api/v1/admin/assessors/:assessorId/disable`

S9 can consume S8 profile/preference/availability/capacity data for allocation, but S8 itself generates no candidates or assignments.

## Frontend handoff

Routes exist for `/assessor/profile`, `/admin/assessors`, and `/admin/assessors/[assessorId]`. Visit schedule and allocation controls remain deferred placeholders.

## Client-safe summary

Admins can now manage assessor profiles and see readiness, accreditation markers, preferences, and capacity. Assessors can maintain their own preference, availability, and capacity declarations. Allocation remains a later workflow.

## Residual risks

Exact profile edit/accreditation states, admin create/edit/disable variants, capacity/availability validation states, mobile layouts, and production accreditation-provider behavior remain unavailable and recorded as gaps/external dependencies.

Production PostgreSQL repository wiring remains required before production deployment. Allocation, COI, assignments, and visit scheduling are still S09/later work and are not claimed complete in this S08 record.
