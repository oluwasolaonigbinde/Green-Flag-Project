# DevOps AWS Handoff

This is the concise staging/UAT handoff for AWS and DevOps agents.

## Verdict

- Backend is ready for AWS staging/UAT handoff with external gates.
- This is not production launch approval.
- Provider-backed actions must remain disabled or be backed by approved staging-safe/real adapters.
- Capture remote GitHub Actions evidence before deployment.

## Required runtime configuration

- PostgreSQL/PostGIS `DATABASE_URL`.
- Cognito `COGNITO_ISSUER`, `COGNITO_AUDIENCE`, and `COGNITO_JWKS_URL`.
- Approved role assignment/user import or provisioning process.
- `API_RUNTIME_MODE` chosen deliberately:
  - `staging` and `production` are production-like and fail closed with lower-env providers.
  - Lower-env/manual UAT mode may be used only if provider-backed actions remain disabled and the scope is explicit.
- Payment/invoice posture:
  - `PAYMENT_RUNTIME_MODE=manual_mvp` for manual MVP payment handling.
  - `INVOICE_RUNTIME_MODE=manual_offline` for manual/offline invoice posture when real finance config is absent.

## Database and migrations

- PostgreSQL must include PostGIS support. CI uses `postgis/postgis:16-3.4`.
- Run migration convention checks with `corepack pnpm db:migrate:check`.
- Run clean migration apply checks only against disposable local/CI databases with explicit opt-in.
- Do not run clean migration apply against staging, production, shared UAT, or personal databases.
- Preserve episode-first ownership: `assessment_episodes` is lifecycle root; `applications` is applicant package state.

## CI expectations

Expected command families:
- `corepack pnpm install --frozen-lockfile`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm db:integration:test`
- `corepack pnpm --filter @green-flag/api typecheck`
- `corepack pnpm --filter @green-flag/db typecheck`
- `corepack pnpm db:migrate:check`
- `corepack pnpm db:seed:check`
- `corepack pnpm contracts:check`
- `corepack pnpm openapi:check`
- `corepack pnpm db:migration:apply:check`

The local workflow exists in `.github/workflows/ci.yml`; remote run URL/result is still a deployment handoff item.

## Fail-closed gates

Production-like runtime must reject:
- Missing DB/runtime wiring.
- Canonical mutable Map-store fallback.
- Lower-env fixtures/static contacts.
- Lower-env storage, certificate, notification, export, payment, invoice, and public-map shells unless replaced with approved disabled or real adapters.

Do not weaken these guards to make staging boot.

## Provider-backed actions

Disabled until configured:
- Real storage/S3 and signed URL provider.
- Virus scanning.
- Email/SMS dispatch.
- Export delivery.
- Payment provider/webhooks and online card flow.
- Business Central automation.
- Public map dispatch adapter.
- Certificate generation provider.

Manual MVP modes:
- Manual mark-paid and payment overrides are supported and audited.
- Manual/offline invoice posture is acceptable for scoped UAT when approved outside the repo.

## External configuration still required

Use `docs/implementation/external-configuration-register.md` for the full register. Key missing inputs:
- AWS staging/prod infra, secrets, monitoring, backup/rollback, and alerting.
- Official scoring criteria/guidance, applicant bands, certificate wording, fees, VAT/legal text.
- Provider contracts/credentials and staging-safe adapter choices.
- Current-system migration files and reconciliation process.
- UAT, accessibility, load/security testing, and formal signoff.

## Deployment cautions

- Do not put secrets, real credentials, legal text, provider payloads, or official KBT values in docs, seeds, OpenAPI examples, or fixtures.
- Do not claim production readiness from backend checks alone.
- Do not run destructive database checks against real environments.
