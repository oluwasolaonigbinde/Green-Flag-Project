# S14 Contract - Hardening, UAT readiness, migration, performance, and security review

## Metadata

- Slice ID: 14
- Slug: hardening-uat-migration-performance-security
- Title: Hardening, UAT readiness, migration, performance, and security review
- Contract state: Frozen
- Planned on: 2026-05-06
- Depends on: S00-S13, including S12.5

## Objective

Close the backend/API foundation with production-readiness hardening evidence for permissions, Mystery secrecy, migration/seed checks, provider boundaries, operational readiness, monitoring expectations, and UAT launch gates.

## In Scope

- Targeted API hardening tests for implemented high-risk surfaces:
  - applicant/org versus admin access boundaries
  - Mystery redaction leakage on applicant messages/results/export-adjacent surfaces
  - admin-only notification/export/job/result surfaces
  - applicant result projections that must not expose raw scores, judge/assessment internals, or internal decision detail
- Production readiness documentation:
  - UAT, migration, performance, security, monitoring, backup, provider, and rollback gates
  - external/manual configuration checklist linked back to implemented slices
  - residual launch risks before production activation
- Workflow truth updates:
  - system state
  - gap register
  - current implementation review
  - delivery record
  - backlog closure once checks pass

## Out of Scope

- Frontend implementation or visual QA; S14 has `frontend_reopen_allowed: false`.
- Real provider credentials, real email/SMS dispatch, Business Central automation, production payment provider automation, public-map worker automation, production storage/signing/virus scanning, or official scoring/fee/legal copy.
- Replacing legacy JSON compatibility envelopes beyond the S12.5 normalisation pass.
- Large architectural rewrites of completed slices unless a blocker is found by S14 checks.

## Acceptance Criteria

- Existing required repo checks pass:
  - `corepack pnpm install --frozen-lockfile`
  - `corepack pnpm contracts:check`
  - `corepack pnpm openapi:check`
  - `corepack pnpm db:migrate:check`
  - `corepack pnpm db:seed:check`
  - `corepack pnpm lint`
  - `corepack pnpm test`
  - `corepack pnpm build`
  - `corepack pnpm typecheck`
- DB integration check passes where available.
- Added hardening tests fail closed on applicant/admin authorization and Mystery leakage regressions.
- Production readiness docs explicitly separate implemented durable code from external/manual configuration and UAT sign-off work.
- S14 delivery record states remaining launch risks honestly.

## Stop Triggers

- Any earlier slice found to have an active production blocker in RBAC, Mystery secrecy, audit, migrations, or transaction behavior that cannot be fixed with a narrow hardening patch.
- Any source-truth contradiction not already covered by `docs/implementation/source-reconciliation.md`.
- Required checks cannot run and the reason is not environmental.
