# Green Flag Award - System State

This file records platform reality. It is updated from closed evidence during `close-current-slice`, not from ad-hoc memory.

## Repo state

- docs_only: false
- app_scaffold_exists: true
- frontend_exists: true
- backend_exists: true
- database_migrations_exist: true
- openapi_contracts_exist: true
- test_commands_known: true
- figma_exports_exist: true
- figma_manifest_exists: true

## Known command state

Root commands are known and runnable through Corepack-backed pnpm:

- `corepack pnpm install`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm contracts:check`
- `corepack pnpm openapi:check`
- `corepack pnpm db:migrate:check`
- `corepack pnpm db:seed:check`

## Implemented capabilities

<!-- DELIVERY-MANAGED:IMPLEMENTED START -->
- pnpm workspace scaffold with Corepack-backed execution.
- TypeScript package baseline and shared path-less workspace resolution.
- Fastify API scaffold with health and contract-metadata endpoints.
- Next.js App Router shell with a foundation status page.
- Shared contract package with enums, schemas, fixtures, and tests.
- PostgreSQL/PostGIS migration convention and lower-env seed safety checks.
- OpenAPI skeleton and validation script.
- Cognito-style identity mapping, scoped role assignment resolution, authenticated session/profile resolution, server-side auth guards, and append-only audit-event foundation.
- Canonical organisations, parks, park locations, award tracks, award cycles, cycle windows, and assessment_episodes domain model with synthetic lower-env seeds.
- Registration submission, eligibility validation, duplicate acknowledgement, mock W3W/OS/ONS location enrichment, email verification, admin registration review, approve/reject decisions, notification intent contracts, audit-backed state transitions, and fallback frontend routes.
- Applicant dashboard read model, Full Assessment application draft package state, create/continue command, section field autosave with optimistic concurrency, previous feedback draft response, progress calculation, audit-backed applicant application commands, Mystery-safe applicant projection, lower-env application seeds, and applicant dashboard/wizard frontend routes.
- Applicant management-plan/document metadata, lower-env chunked upload session contracts, retry-safe chunk acknowledgement, upload completion, SHA-256 duplicate handling, document version/archive metadata, signed document access contracts, document visibility checks, audit-backed document commands, lower-env document seeds, and applicant wizard document step.
- Full Assessment application submission, submitted-with-missing-plan marker, lower-env invoice shell with `external_value_unavailable` amount marker, PO/no-PO capture, applicant payment summary, manual mark-paid, documented payment override, overdue allocation block check, notification intent contracts, audit-backed submission/payment commands, lower-env payment seeds, and applicant review/submitted/payment route state.
- Admin dashboard summary, registration/application/payment/document operational queue read models, application detail read model, safe allocation-readiness preview, filters/pagination DTOs, RBAC-protected admin read APIs, OpenAPI/contracts/fixtures, and admin dashboard/queue/detail frontend routes.
- Judge/assessor profile records, accreditation source-of-truth markers, preferences, availability windows, capacity declarations, admin assessor management read models/commands, assessor self-service APIs, lower-env assessor seeds, audit-backed profile/preference/availability/capacity commands, and assessor/admin management frontend routes.
- Slices 1-8 hardening: API route registration no longer defaults production paths to in-memory stores; lower-env/test stores must be injected explicitly, critical submission/payment commands use transaction wrappers with audit rollback behavior, scoped access checks use central ownership predicates, payment block override records dedicated admin override events, applicant-facing Mystery redaction is centralized for delivered dashboard/document surfaces, and admin read models read episode status from the episode lifecycle state.
- PostgreSQL runtime persistence wiring: `DATABASE_URL` configuration, typed PostgreSQL pool/client utilities, transaction helper, migration runner with `schema_migrations`, DB-backed Cognito subject/role lookup, DB-backed append-only audit ledger, and API startup wiring for production session/audit runtime.
- PostgreSQL domain repository adapters for Slices 3-8 runtime stores, including UnitOfWork transaction context, table-specific runtime payload persistence, production-like startup guard for missing `DATABASE_URL`, and Docker-backed DB integration tests.
<!-- DELIVERY-MANAGED:IMPLEMENTED END -->

## Partial / stubbed capabilities

<!-- DELIVERY-MANAGED:PARTIAL START -->
- Documentation source set exists under `docs/source/`.
- Implementation/architecture source set exists under `docs/implementation/`.
- Figma/PNG exports and manifests exist locally.
- Codex operating layer is being introduced by this pack but has not yet been validated by a repo-aware agent.
- Next.js build emits a non-blocking ESLint-plugin warning in this environment, but the app builds and serves successfully.
- Applicant application frontend is partial against available PNG families; exact autosave loading/conflict, previous feedback response, and mobile wizard variants remain frontend gaps.
- Applicant document upload frontend is partial against available document-step PNG evidence; exact upload retry/failure, duplicate warning, scan pending/rejected, version history, and mobile variants remain frontend gaps.
- Applicant submission/payment frontend is partial against available submitted/payment PNG evidence; exact PO/no-PO variants, invoice state variants, admin manual payment UI, online card flow, and mobile payment/submitted variants remain frontend gaps.
- Admin queues frontend is partial against available Super Admin dashboard/queue/document PNG evidence; exact application status variants, payment manual action UI, document archive filters/version detail variants, mobile admin views, and allocation-readiness preview variants remain frontend gaps.
- Assessor/admin management frontend is partial against available assessor dashboard/preference and Super Admin assessor management PNG evidence; exact profile edit/accreditation states, admin create/edit/disable states, availability/capacity validation states, and mobile variants remain frontend gaps.
- PostgreSQL domain adapters persist current Slices 3-8 DTO payloads through table-specific runtime payload columns; later hardening can normalize additional read-model fields for performance.
<!-- DELIVERY-MANAGED:PARTIAL END -->

## Not implemented

<!-- DELIVERY-MANAGED:NOT-IMPLEMENTED START -->
- Production storage integration, real signed URL generation, real virus scanning, and document upload infrastructure.
- Production payment provider automation, Business Central integration, production fee/VAT/legal invoice wording, and online card payment flow.
- Allocation implementation. S09 contract review is active; source-backed allocation rules exist for judge-count defaults, COI handling, rotation, hold/release, contact reveal, and Mystery suppression, while production-specific allocation policy overrides and live COI import data remain configurable external inputs.
- Mystery redaction policy implementation.
- Visits/assessment/scoring.
- Decisions/results/certificates/public map updates.
- Notifications/messaging/jobs/exports.
<!-- DELIVERY-MANAGED:NOT-IMPLEMENTED END -->

## Current active slice

- active_slice: 9
- active_contract: pending
- planned_contract_path: docs/implementation/slice-contracts/S09-allocation-workflow-candidates-coi-release-acceptance.md
- next_legal_command: review-current-contract after drafting/revising the S09 contract from docs/implementation/working/current-plan.md

## Notes for repo-aware validation

A repo-aware agent should verify actual filenames, manifest paths, PNG counts, and whether any hidden code/config files already exist before the first production slice is planned.
