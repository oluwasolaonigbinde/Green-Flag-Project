# Migration Guidance

Migration files use `NNNN_descriptive_name.sql` and must include a `-- migrate:down` marker.

The migration directory is now broad backend schema history, not an early-slice placeholder. It includes the episode-first model, applicant package state, RBAC/audit, operational workflow tables, PostgreSQL read-model hardening, and retry/idempotency support.

## Required checks

- `corepack pnpm db:migrate:check`
- `corepack pnpm db:migration:apply:check` only with the disposable local/CI database opt-in

Do not run the clean migration apply check against staging, production, shared UAT, or personal databases.

## Ownership rules

- Preserve `assessment_episodes` as the operational lifecycle root.
- Preserve `applications` for applicant package/draft/submission state only.
- Do not add migrations that clone legacy schema ownership or move lifecycle state into `applications.status`.
