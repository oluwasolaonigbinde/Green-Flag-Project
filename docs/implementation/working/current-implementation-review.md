# Current Implementation Review

## Post-S14 backend modularity and persistence adapter decomposition

- Verdict: pass for behavior-preserving backend modularity hardening.
- Scope reviewed: runtime-payload removal sanity check, domain-split PostgreSQL persistence adapters behind the stable `createPostgresDomainStores` facade, preserved UnitOfWork flush ordering, strengthened DB integration assertions for facade shape, relational cold-start hydration, allocation/result episode-status persistence, and rollback of parent/child/audit state.
- API module decomposition completed for admin query/read-model helpers, applicant store/routes/policies/read-model/service/audit helpers, allocation store/routes/policies/candidates/commands/read-model/audit helpers, and results store/routes/policies/commands/read-model/audit helpers.
- Checks: baseline and final `corepack pnpm install --frozen-lockfile`, `contracts:check`, `openapi:check`, `db:migrate:check`, `db:seed:check`, `lint`, `test`, `build`, `typecheck`, and `db:integration:test` passed on 2026-05-07. An intermediate parallel `build`/`typecheck` run collided in `.next`; rerunning `typecheck` alone passed.
- Remaining risk: route files still retain orchestration code for some complex commands; further service extraction should be incremental and test-backed, not a generic framework rewrite.

## S14 hardening/UAT/migration/performance/security review

- Verdict: production-grade for S14 hardening/readiness scope; not a standalone production launch approval.
- Scope reviewed: permission fail-closed behavior on admin-only communication/export/result surfaces, applicant-safe result projections, Mystery message suppression/listing redaction, production readiness checklist, migration/UAT/performance/security/monitoring launch gates, and full repo verification matrix.
- Checks: `corepack pnpm install --frozen-lockfile`, `contracts:check`, `openapi:check`, `db:migrate:check`, `db:seed:check`, `lint`, `test`, `build`, `typecheck`, and `db:integration:test` passed on 2026-05-06.
- Remaining risk: production activation still requires external/manual configuration, migration rehearsal, UAT acceptance, monitoring/alerting, backup/rollback, and provider setup.

## S13 notifications/messaging/jobs/exports/reminders review

- Verdict: production-grade for S13 provider-neutral foundation scope.
- Scope reviewed: notification queue/log/suppression records, dispatch stubs, applicant/admin message threads, Mystery message suppression, renewal reminder job runs, generic export job shells, PostgreSQL migration/runtime persistence, audit-backed commands, OpenAPI/contracts, external configuration register, and DB integration coverage.
- Checks: `corepack pnpm install --frozen-lockfile`, `contracts:check`, `openapi:check`, `db:migrate:check`, `db:seed:check`, `lint`, `test`, `build`, `typecheck`, and `db:integration:test` passed on 2026-05-06.
- Remaining risk: real email/SMS delivery, approved notification copy, production export formats, public-map dispatch, and Business Central automation require external/manual configuration and S14 hardening.

## Previous S12.5 PostgreSQL read-model normalisation hardening review

- Verdict: production-grade for S12.5 first-pass normalization scope.
- Scope reviewed: compatibility-preserving relational projection writes for application sections/field values, document upload chunks, assessor preference/availability/capacity, assessment score entries, targeted indexes for queue/export/publication paths, migration validation, and DB integration coverage.
- Checks: `corepack pnpm install --frozen-lockfile`, `contracts:check`, `openapi:check`, `db:migrate:check`, `db:seed:check`, `lint`, `test`, `build`, `typecheck`, and `db:integration:test` passed on 2026-05-06. Initial `typecheck` wrapper timed out at 180s; rerun with a longer timeout passed.
- Remaining risk: deeper read-model tuning should use real workload/query-plan data rather than speculative normalization.

## Previous S12 decisions/results/certificates/public map events review

- Verdict: production-grade for S12 foundation scope.
- Scope reviewed: episode-rooted decision results, threshold acknowledgement, result hold/publish/withdraw commands, certificate shell/artifact metadata, derived park award cache, public map update event outbox, applicant-safe result projection, PostgreSQL migration/runtime persistence, audit, RBAC, and Mystery boundaries.
- Checks: `corepack pnpm install --frozen-lockfile`, `contracts:check`, `openapi:check`, `db:migrate:check`, `db:seed:check`, `lint`, `test`, `build`, `typecheck`, and `db:integration:test` passed on 2026-05-06.
- Remaining risk: official applicant bands, legal certificate wording, public-map provider contract, notification sending, messaging, jobs, and exports remain later slices/dependencies. S12.5 must normalize high-value SQL read-model fields before S13/S14.

## Previous S11 visits and configurable assessment/scoring review

- Verdict: production-grade for S11 configurable foundation scope.
- Scope reviewed: lower-env configurable templates, visit scheduling, score/evidence entry, offline sync versioning, threshold calculation, submit flow, admin read model, PostgreSQL migration/runtime persistence, audit, RBAC, and Mystery boundaries.
- Checks: `corepack pnpm install --frozen-lockfile`, `contracts:check`, `openapi:check`, `db:migrate:check`, `db:seed:check`, `lint`, `test`, `build`, `typecheck`, and `db:integration:test` passed on 2026-05-06.
- Remaining risk: official scoring criteria, applicant bands, decisions, certificates, publication, messaging, notification sending, exports, and public map behavior remain later slices/dependencies.

## Previous S10 Mystery redaction hardening review

- Verdict: production-grade for S10 scope.
- Scope reviewed: central Mystery redaction policy, applicant/org dashboard/document/signed-access behavior, notification/message/search/export/status redaction boundaries, admin visibility, contracts, fixtures, and tests.
- Checks: `corepack pnpm install --frozen-lockfile`, `contracts:check`, `openapi:check`, `db:migrate:check`, `db:seed:check`, `lint`, `test`, `build`, `typecheck`, and `db:integration:test` passed on 2026-05-06.
- Remaining risk: actual notification sending, message storage, exports, visits, scoring, and results are later slices; S10 provides safe projectors/policy boundaries only.

## Previous S09 allocation workflow review

- Verdict: production-grade foundation for the configured S09 scope.
- Scope reviewed: configurable allocation policy, allocation-ready episodes, candidate query, COI/rotation flags, hold/release/reassign, judge accept/decline, contact reveal, audit/override events, PostgreSQL migration/runtime persistence, OpenAPI/contracts, and lower-env seeds.
- Checks: `corepack pnpm install --frozen-lockfile`, `contracts:check`, `openapi:check`, `db:migrate:check`, `db:seed:check`, `lint`, `test`, `build`, `typecheck`, and `db:integration:test` passed on 2026-05-06.
- Remaining risk: production-specific allocation inputs are intentionally configurable/import-backed, not hardcoded. Exact allocation UI variants remain frontend gaps.
