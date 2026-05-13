# Production Readiness Checklist

## Status

- Last updated: 2026-05-10.
- Backend posture: AWS staging/UAT handoff-ready with external gates.
- Launch posture: not production launch approved.
- Production launch requires frontend completion, AWS infrastructure, provider configuration, official inputs, UAT, accessibility, load/security testing, monitoring, backup/rollback, and formal signoff.

## Staging/UAT handoff

- Backend code can be handed to AWS staging/UAT if external gates are tracked and provider-backed actions are disabled or configured with approved staging-safe adapters.
- `API_RUNTIME_MODE=staging` is production-like and fails closed with lower-env providers unless staging-safe config is supplied.
- Remote GitHub Actions evidence should be captured before deployment.
- Do not weaken runtime guards to make staging boot; replace lower-env providers with approved disabled or real adapters.

## Automated gates

Run the relevant quick gate set before a release candidate:

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

The clean migration apply check must use only a disposable local/CI database with explicit opt-in. Never run it against staging, production, shared UAT, or personal databases.

## UAT gates

- Confirm role/scope matrix for Super Admin, KBT Admin, Finance Admin, Org Admin, Park Manager, Judge/Assessor, and read-only personas.
- Run applicant UAT for registration, verification, draft, documents, submission, invoice/payment, messages, results, and renewals.
- Run admin UAT for registration review, queues, allocation, assessment review, result hold/publish/withdraw, exports, jobs, overrides, and audit visibility.
- Run assessor UAT for profile, availability, allocation acceptance/decline, visit scheduling, scoring, evidence, offline sync, and submission.
- Run Mystery UAT to verify applicant/org secrecy and admin visibility across implemented surfaces.
- Capture acceptance for workflow labels, notification copy, result wording, certificate shell, and public map behavior.

## Migration gates

- Obtain current-system export files and field ownership.
- Perform at least one full dry run into a disposable PostgreSQL database.
- Reconcile organisations, parks, locations, cycles, applications, documents, assessor profiles, allocations, results, and public award state.
- Validate rerun/idempotency, rollback, restore, and separation from lower-env seeds.

## Performance and security gates

- Load test applicant dashboard, admin queues, allocation candidate search, assessment detail, result publication, notifications, messages, exports, and jobs.
- Capture query plans under representative data volume before adding indexes/projections.
- Verify Cognito claims, role sync, session TTL, MFA, disabled-user behavior, secret handling, RBAC, Mystery redaction, audit retention, and data retention/deletion/export policy.
- Run a pre-launch security scan over API routes, migrations, seed scripts, and frontend routes.

## Provider and manual configuration gates

Use `docs/implementation/external-configuration-register.md` as the setup register. Before production activation, supply and verify:

- Storage, signed URLs, scanning, and document retention.
- Email/SMS providers and approved templates.
- Fees, VAT treatment, invoice/legal wording, Business Central, payment provider/webhooks if enabled, and manual fallback process.
- Public map endpoint/data contract and dispatch worker.
- Official scoring criteria, guidance, applicant bands, certificate wording, and KBT approvals.
- Allocation policy overrides, live COI source, distance/cluster enrichment, and training third-judge rules.

## Monitoring and operations gates

- Enable structured logs with request/correlation IDs.
- Add metrics and alerts for API/DB health, migrations, jobs, exports, notification dispatch/suppression, payment overrides, public map outbox lag, authorization denials, and audit write failures.
- Document incident response for payment, document exposure, Mystery leakage, allocation errors, and result withdrawal/republication.
- Rehearse backup/restore and rollback.

## Launch verdict rule

The verdict is `production-ready` only when automated gates pass, external/manual configuration is supplied, frontend/UAT/accessibility acceptance is signed, migration rehearsal succeeds, provider smoke tests pass, and monitoring/rollback are in place.
