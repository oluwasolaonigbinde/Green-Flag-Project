# Slice Delivery Record

## Metadata

- Slice ID: 6
- Title: Submission, invoice, PO/no-PO, and manual payment state
- Closed status: DONE_BACKEND
- Closed at: 2026-05-05
- Contract path: docs/implementation/slice-contracts/S06-submission-invoice-po-payment-state.md

## Delivered capability

Delivered Full Assessment application submission, submitted-with-missing-plan support, lower-env invoice shell creation with `external_value_unavailable` amount marker, PO/no-PO capture, applicant submission/payment summary reads, manual mark-paid, documented Super Admin payment override, payment deadline block checks, notification intent contracts, audit-backed data-changing commands, OpenAPI/contracts/fixtures, migrations/seeds, API tests, and applicant review/submitted/payment route states.

Post-review hardening on 2026-05-05 added transaction-wrapper execution for submit/payment mutation paths in the lower-env API store, rollback coverage for audit failure, idempotent submit replay coverage, append-only `admin_override_events` database schema, and dedicated override-event emission for payment block override.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Contracts | PASS | `corepack pnpm contracts:check` passed, 10 tests |
| OpenAPI | PASS | `corepack pnpm openapi:check` passed with S06 paths/schemas |
| Migration check | PASS | `corepack pnpm db:migrate:check` passed for 7 files |
| Seed check | PASS | `corepack pnpm db:seed:check` passed for 6 files |
| Lint | PASS | `corepack pnpm lint` passed |
| Tests | PASS | `corepack pnpm test` passed, 6 files / 38 tests |
| Build/typecheck | PASS | `corepack pnpm typecheck` completed full build and package typechecks successfully |
| API smoke | PASS | Submit 200, submission 200, payment summary 200, deadline check 200, override 200, mark-paid 200 |
| Frontend route smoke | PASS | Next dev server on `http://127.0.0.1:3004` served the applicant route with Submit application, `external_value_unavailable`, and online card deferred copy |
| Mystery leakage | PASS | Submitted/payment contract and route checks avoid raw Mystery metadata and the route smoke found no VAT text |

## Frontend status

- Status: partial
- Gaps recorded: FE-004, FE-021, FE-022, FE-023, FE-024, FE-025
- Reopen trigger: new or changed PO/no-PO, invoice status, admin manual payment/override, online card payment, or mobile submitted/payment screens; approved production fee/VAT/legal invoice wording; approved provider or Business Central contract.

## Backend handoff

S06 backend/API contracts are complete for lower-env submission and payment state. Finance values remain placeholder-only, payment provider automation and Business Central integration are not implemented, and `assessment_episodes` remains the operational lifecycle root while `applications` holds only applicant package state.

## Frontend handoff

The applicant application route now includes review/submitted/payment sections and the dashboard reflects submitted/payment placeholders through contract fixtures. Missing exact variants are tracked as frontend gaps; online card payment is explicitly deferred.

## Client-safe summary

Applicants can submit a Full Assessment package, provide PO/no-PO state, and see a lower-env invoice/payment status while finance/admin actors can manually manage payment state through audited API contracts.

## Residual risks

Production fee schedule, VAT treatment, legal invoice wording, Business Central details, and payment provider credentials remain external dependencies. Admin payment queues and exact invoice/payment UI variants remain future-slice or reopen work.

Production PostgreSQL repository wiring remains required before production deployment; lower-env stores are explicit test doubles and must not be treated as production persistence.
