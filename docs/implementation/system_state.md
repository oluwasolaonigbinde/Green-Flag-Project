# Green Flag Award - System State

This is the normal first-read current-state handoff for future agents. Long reports under `docs/implementation/working/` are historical evidence only.

## Current verdict

- Backend status: ready for AWS staging/UAT handoff with external gates.
- This is not production launch approval.
- The backend is episode-first and DB-first for production-like runtime.
- Provider-backed actions, official KBT/business inputs, frontend completion, infrastructure, UAT, monitoring, and signoff remain outside backend completion.

## Architecture invariants

- `assessment_episodes` is the operational lifecycle root.
- `applications` owns applicant package, draft, submission, document, and payment package state only.
- The backend owns workflow rules, state machines, RBAC, Mystery redaction, audit, and API contracts.
- Production-like runtime must use PostgreSQL-backed repositories and must reject canonical mutable Map persistence.
- Product/requirements docs win for business rules. UI/Figma/PNG assets shape layout, read models, and visual acceptance only.
- Do not clone legacy schema ownership or move lifecycle state into `applications.status`.

## Backend hardening status

- Production-like command paths are DB-first for implemented registration, applicant/application, document, payment/manual payment, allocation, assessor, assessment, communications/jobs/exports/reminders, and results/publication domains.
- Production-like startup rejects missing DB/runtime wiring and mutable store fallbacks.
- Mystery suppression is server-side for implemented surfaces, including applicant projections, allocation contact reveal, documents, messages, results, notifications/jobs where modeled, exports/search counts where modeled, and public map event payloads.
- Applicant/public DTOs are safe for implemented surfaces and do not expose storage keys, raw scores, internal notes, actor IDs, or Mystery metadata.
- Tuple-aware authorization and scoped read models are in place for hardened endpoints.
- Signed document access is audited.
- Retry/idempotency, GitHub CI, DB integration, and clean migration apply checks are in place.

## Implemented backend capabilities

Identity, RBAC, and audit:
- Cognito-style identity mapping, internal users, role assignments, authenticated session/profile resolution, tuple-aware scoped checks, mutation denial for read-only patterns, and append-only audit events.

Episodes, organisations, parks, and cycles:
- Canonical organisations, parks, locations, award tracks/categories, cycles, windows, and `assessment_episodes`.

Applicant package lifecycle:
- Registration, eligibility, verification, admin review, application draft/autosave, previous feedback draft response, submission, document metadata/upload sessions/versioning, signed access, invoice/payment summary, PO/no-PO capture, manual mark-paid, and payment override contracts.

Admin and operational read models:
- Admin dashboards, queues, registration/application/payment/document/result views, allocation readiness, filters, pagination, scoped access, and audit-backed commands.

Assessor and allocation:
- Assessor profiles, accreditation markers, preferences, availability/capacity, allocation policy, candidate filtering, COI, rotation, hold/release/reassign, judge accept/decline, and Full Assessment contact reveal after required acceptance.

Assessment and results:
- Configurable lower-env assessment templates, visits, scoring/evidence/offline sync, threshold calculation, submission, held/published/withdrawn decisions, certificate artifact shell, applicant-safe result projection, derived award cache, and public map event outbox.

Communications, jobs, exports, and reminders:
- Provider-neutral notification queue/log/suppression records, applicant/admin messages with Mystery suppression, renewal reminder runs, export job shells, retry/idempotency handling, and audit-backed commands.

Persistence and verification:
- PostgreSQL/PostGIS migrations, DB-backed runtime repositories, relational read models for hardened paths, DB integration tests, migration convention checks, lower-env seed checks, clean disposable migration apply checks, contract/OpenAPI checks, and GitHub Actions workflow.

## Frontend status and where to look next

- Frontend exists but is partial against available Figma/PNG evidence.
- Use `docs/implementation/frontend-contract-handoff.md` for API/DTO rules and safe projection requirements.
- Use `docs/implementation/gap-register.md` for active frontend/design gaps.
- Use `docs/implementation/ui-slice-map.yaml`, `docs/figma-manifest.md`, `docs/figma-manifest.json`, and `docs/figma/**` for visual evidence.
- Do not infer or display Mystery metadata from UI assumptions.

## Runtime and verification

Known root commands:
- `corepack pnpm install --frozen-lockfile`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm build`
- `corepack pnpm contracts:check`
- `corepack pnpm openapi:check`
- `corepack pnpm db:migrate:check`
- `corepack pnpm db:seed:check`
- `corepack pnpm db:integration:test`
- `corepack pnpm db:migration:apply:check`

Runtime posture:
- `DATABASE_URL` must point to PostgreSQL/PostGIS for production-like runtime.
- Cognito issuer, audience, and JWKS URL are deployment configuration.
- `API_RUNTIME_MODE=staging` and `API_RUNTIME_MODE=production` are production-like and fail closed with lower-env providers unless approved staging-safe adapters/configuration are supplied.
- Clean migration apply checks are only for disposable local/CI databases and must not target staging, production, shared UAT, or personal databases.
- Remote GitHub Actions evidence should be captured before deployment handoff.

## External gates

Use `docs/implementation/external-configuration-register.md` and `docs/implementation/production-readiness-checklist.md`.

External gates include AWS staging/prod infrastructure, provider credentials/adapters, storage/scanning, email/SMS, payment, Business Central, public map dispatch, certificate generation, official scoring/bands, finance/legal wording, migration imports, UAT, accessibility, load/security testing, monitoring, backup/rollback, and signoff.

## Product decisions not backend bugs

- Official scoring criteria, subcriteria, threshold guidance, applicant bands, certificate wording, fees, VAT treatment, invoice/legal text, provider payloads, credentials, and KBT approvals must not be invented.
- Republish/revision/reissue/history semantics are future product/contract decisions.
- Renewal reminder target-level dedupe awaits an approved certificate/park/episode/recipient/offset/expiry model.
- Community, Heritage, and Group activation remains blocked/draft until official criteria/processes are supplied.

## Do-not-regress rules

- Preserve episode-first lifecycle ownership.
- Preserve DB-first production-like runtime and fail-closed provider guards.
- Preserve safe applicant/public DTOs, Mystery redaction, tuple-aware RBAC, scoped read models, audit events, and retry/idempotency behavior.
- Do not reintroduce Map/flush persistence as canonical production-like behavior.
- Do not treat external gates as backend bugs or hardcode unapproved business values.

## Future agent read order

- General/backend: this file, `docs/implementation/agent-operating-model.md`, `docs/implementation/source-reconciliation.md`, `docs/implementation/gap-register.md`, `docs/implementation/external-configuration-register.md`, then OpenAPI/contracts as needed.
- Frontend: this file, `docs/implementation/frontend-contract-handoff.md`, `docs/implementation/gap-register.md`, `docs/implementation/ui-slice-map.yaml`, Figma manifests/assets, `openapi/openapi.json`, and `packages/contracts/src/schemas.ts`.
- DevOps/AWS: this file, `docs/implementation/devops-aws-handoff.md`, `docs/implementation/external-configuration-register.md`, `docs/implementation/production-readiness-checklist.md`, `package.json`, and `.github/workflows/ci.yml`.
- QA/UAT: this file, `docs/implementation/production-readiness-checklist.md`, `docs/implementation/gap-register.md`, `docs/implementation/frontend-contract-handoff.md`, and OpenAPI/contracts.

## Archive note

`docs/implementation/working/*.md` files are archive/evidence only. Read them only when investigating a specific historical remediation or audit trail.
