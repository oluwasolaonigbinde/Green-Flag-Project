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
<!-- DELIVERY-MANAGED:IMPLEMENTED END -->

## Partial / stubbed capabilities

<!-- DELIVERY-MANAGED:PARTIAL START -->
- Documentation source set exists under `docs/source/`.
- Implementation/architecture source set exists under `docs/implementation/`.
- Figma/PNG exports and manifests exist locally.
- Codex operating layer is being introduced by this pack but has not yet been validated by a repo-aware agent.
- Next.js build emits a non-blocking ESLint-plugin warning in this environment, but the app builds and serves successfully.
<!-- DELIVERY-MANAGED:PARTIAL END -->

## Not implemented

<!-- DELIVERY-MANAGED:NOT-IMPLEMENTED START -->
- Authentication/RBAC persistence.
- Audit event persistence.
- Organisations/parks/cycles/episodes.
- Registration flow.
- Applicant application flow.
- Documents/uploads.
- Payments/invoicing.
- Admin queues.
- Judge/assessor management.
- Allocation.
- Mystery redaction policy implementation.
- Visits/assessment/scoring.
- Decisions/results/certificates/public map updates.
- Notifications/messaging/jobs/exports.
<!-- DELIVERY-MANAGED:NOT-IMPLEMENTED END -->

## Current active slice

- active_slice: none
- active_contract: none
- next_legal_command: plan-next-slice

## Notes for repo-aware validation

A repo-aware agent should verify actual filenames, manifest paths, PNG counts, and whether any hidden code/config files already exist before the first production slice is planned.
