# Green Flag Award — System State

This file records platform reality. It is updated from closed evidence during `close-current-slice`, not from ad-hoc memory.

## Repo state

- docs_only: true
- app_scaffold_exists: false
- frontend_exists: false
- backend_exists: false
- database_migrations_exist: false
- openapi_contracts_exist: false
- test_commands_known: false
- figma_exports_exist: true
- figma_manifest_exists: true

## Known command state

No application commands are known yet. Slice 0 must establish package manager, scaffold, lint/typecheck/test/build commands, run instructions, and any contract generation commands.

## Implemented capabilities

<!-- DELIVERY-MANAGED:IMPLEMENTED START -->
None yet.
<!-- DELIVERY-MANAGED:IMPLEMENTED END -->

## Partial / stubbed capabilities

<!-- DELIVERY-MANAGED:PARTIAL START -->
- Documentation source set exists under `docs/source/`.
- Implementation/architecture source set exists under `docs/implementation/`.
- Figma/PNG exports and manifests exist locally.
- Codex operating layer is being introduced by this pack but has not yet been validated by a repo-aware agent.
<!-- DELIVERY-MANAGED:PARTIAL END -->

## Not implemented

<!-- DELIVERY-MANAGED:NOT-IMPLEMENTED START -->
- Application code scaffold.
- Backend API.
- Frontend application.
- Database migrations.
- Authentication/RBAC.
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
- next_legal_command: orient or plan-next-slice

## Notes for repo-aware validation

A repo-aware agent should verify actual filenames, manifest paths, PNG counts, and whether any hidden code/config files already exist before the first production slice is planned.
