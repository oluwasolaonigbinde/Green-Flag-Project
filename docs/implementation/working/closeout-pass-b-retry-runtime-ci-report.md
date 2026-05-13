# Closeout Pass B Retry, Runtime, CI Report

Date: 2026-05-09

## Closure status

Status: CLOSED - PASS WITH CAVEATS

Static closeout verification on 2026-05-10 confirmed the report accurately reflects the current repo. The verification found no blockers and preserved the caveats below.

Closed scope recorded:

- Retry/idempotency hardening completed for the targeted provider-adjacent backend edges.
- Upload-session same-key replay, concurrent replay, and conflicting metadata handling are fixed.
- Result publish artifact and public-map event replay dedupe is fixed with nullable `dedupe_key` columns and narrow partial unique indexes.
- Renewal reminder and export replay handling is completed within the documented caveat.
- Production-like runtime guard tests were added for production/staging mode spellings and provider/manual-MVP gates.
- GitHub CI workflow was added with PostgreSQL/PostGIS service coverage.
- Clean migration apply check was added with disposable-test opt-in and production/staging/shared database refusals.
- No broad uniqueness constraints were introduced on result artifact or public-map event business fields.
- No frontend, provider implementation, official content, legacy-schema cloning, or lifecycle-state movement into `applications` was introduced.

Closure caveats:

- Renewal reminder notification-level dedupe is only target-safe with an explicit idempotency key until a real certificate/park/episode/recipient/offset/expiry target model exists.
- CI was added and locally inspected/tested, but no remote GitHub Actions run exists from this local session.
- Provider-backed actions remain disabled until real staging/provider configuration is supplied.

## Summary

Implemented Closeout Pass B reliability hardening for retry/idempotency edges, production-like runtime proof, GitHub CI, and clean migration apply readiness.

This pass did not add frontend work, provider implementations, official scoring/bands, fee/VAT/legal content, legacy schema cloning, lifecycle state in `applications`, or broad infrastructure-as-code.

## Additional safety constraints honored

- Do not introduce broad uniqueness constraints that prevent future artifact, map-event, withdrawal, republish, reissue, revision, archive, or history rows.
- If the schema has no current/superseded/status distinction for result artifacts or public map events, prefer a nullable `dedupe_key` strategy plus narrow partial unique indexes over blanket uniqueness on fields such as `(decision_result_id, artifact_type)`, `(decision_result_id, event_type)`, or `(assessment_episode_id, event_type)`.
- Result/map/artifact dedupe must protect retries and concurrent duplicate side effects without making future contract-managed republish/revision/reissue/history impossible.
- Do not derive renewal reminder dedupe from only cycle year, run date, and actor/system actor.
- Renewal reminder dedupe must include the reminder target where available: certificate, park, episode, recipient, template, reminder offset, and expiry date/certificate expiry context.
- If a safe reminder target cannot be derived, dedupe only the job run and report notification-level dedupe as a caveat.
- Any migration must be limited to dedupe keys, narrow indexes, and minimal runtime-safety/CI support.
- Do not add new business workflow tables unless stopping and reporting first.
- The clean migration apply check must explicitly refuse production/staging databases, checking more than `NODE_ENV` where practical, including database URL/name/host markers and an explicit disposable-test-database opt-in flag.
- The clean migration apply check must fail with a clear actionable message if local/CI database create/drop permissions are unavailable.
- Do not run clean migration apply checks against real staging, production, shared UAT, or developer personal databases. Use only a disposable local/CI database.

## Files changed

Files intentionally changed or added by this pass:

- `.github/workflows/ci.yml`
- `apps/api/src/postgres-domain-stores/applicant-repository.ts`
- `apps/api/src/postgres-domain-stores/communications-repository.ts`
- `apps/api/src/postgres-domain-stores/results-repository.ts`
- `apps/api/src/postgres-domain-stores.integration.test.ts`
- `apps/api/src/postgres-runtime.test.ts`
- `apps/api/src/runtime-safety.test.ts`
- `package.json`
- `packages/db/migrations/0020_closeout_pass_b_retry_runtime_ci.sql`
- `scripts/check-clean-migration-apply.mjs`
- `docs/implementation/working/closeout-pass-b-retry-runtime-ci-report.md`

## Migrations added

Added `packages/db/migrations/0020_closeout_pass_b_retry_runtime_ci.sql`.

The migration is limited to nullable `dedupe_key` columns and partial unique indexes:

- `result_artifacts.dedupe_key`
- `public_map_update_events.dedupe_key`
- `notification_queue.dedupe_key`
- `job_runs.dedupe_key`
- `export_jobs.dedupe_key`

No broad uniqueness was added on `(decision_result_id, artifact_type)`, `(decision_result_id, event_type)`, or `(assessment_episode_id, event_type)`.

## Idempotency and retry fixes

Upload sessions:

- `PostgresApplicantRepository.createUploadSession` first reloads an existing same-application/idempotency-key upload session.
- Concurrent same-key insert uses `ON CONFLICT ... DO NOTHING` plus reload.
- PostgreSQL unique violation `23505` is caught and converted to replay reload.
- Same key with conflicting upload metadata returns `idempotency_conflict`, not a raw database error.
- Existing same-hash active-session behavior remains intact.

Result publication:

- Publish side effects now receive nullable dedupe keys when an idempotency key is supplied.
- Certificate-shell artifact and `award_published` public-map event inserts use `ON CONFLICT (dedupe_key) ... DO NOTHING` and reload existing side effects.
- Same-key publish replay returns the existing published decision, artifact, award cache, and public-map event.
- Different-key stale double publish remains a safe conflict under the existing one-decision-per-episode model.

Renewal reminders and exports:

- Renewal reminders now dedupe the job run. With an explicit idempotency key, the queued notification also receives a notification dedupe key.
- Without a safe certificate/park/episode/recipient/offset/expiry target model, notification-level dedupe is intentionally limited to explicit idempotency-key replay; this is a caveat, not a new workflow table.
- Export creation reuses existing export jobs on explicit idempotency-key replay.
- Export requests without idempotency keys keep current one-export-per-request semantics to avoid suppressing legitimate repeated exports.

## Payment and provider guard behavior

- Online payment/provider automation remains blocked in production-like runtime unless real provider replay/signature/config work is added later.
- Manual mark-paid MVP remains allowed only when `PAYMENT_RUNTIME_MODE=manual_mvp`.
- Production-like invoice generation remains blocked unless `INVOICE_RUNTIME_MODE=manual_offline` is explicitly set.
- No Stripe, Business Central, SES/SMS, S3, scanning, certificate provider, export provider, or public-map provider implementation was added.

## Production-like startup tests

Expanded runtime tests prove lower-env/fake providers and mutable store fallbacks are blocked across:

- `NODE_ENV=production`
- `API_RUNTIME_MODE=staging`
- `API_RUNTIME_MODE=production`

The tests cover lower-env fixtures, fake contacts, lower-env storage/result/certificate shells, notification dispatch stubs, export shell, fake/lower-env payment provider, invoice config blocking, missing DB-first repositories, and canonical mutable Map-store rejection.

Local/test/lower-env modes remain allowed.

## CI and migration readiness

Added `.github/workflows/ci.yml` for `pull_request` and pushes to `main`/`develop`.

The workflow uses a PostGIS PostgreSQL service and runs:

- lint
- unit tests
- DB integration tests
- API typecheck
- DB typecheck
- migration convention check
- seed safety check
- contracts check
- OpenAPI check
- clean migration apply check

Added root script:

- `corepack pnpm db:migration:apply:check`

The clean migration script:

- requires `ALLOW_MIGRATION_APPLY_TO_TEST_DATABASE=true`;
- refuses `NODE_ENV=production`, `API_RUNTIME_MODE=production`, and `API_RUNTIME_MODE=staging`;
- refuses URL/name/host markers including production, staging, stage, UAT, and shared;
- refuses non-local database hosts outside CI;
- creates a disposable database, applies all migrations, verifies all discovered migrations applied, then drops the disposable database;
- emits actionable create/drop permission errors.

## Tests added or updated

- PostgreSQL integration test for concurrent upload-session same-key replay and idempotency-key collision.
- PostgreSQL integration test for result publish same-key replay returning existing artifact/map side effects.
- PostgreSQL integration test for renewal reminder retry dedupe.
- PostgreSQL integration test for export idempotency-key replay.
- Runtime safety tests for all production-like mode spellings and provider/manual-MVP gates.
- PostgreSQL runtime startup tests across production/staging mode spellings.

## Verification results

All requested commands passed:

- `corepack pnpm lint` - passed
- `corepack pnpm test` - passed, 104 tests passed and DB integration tests skipped in normal unit run
- `corepack pnpm db:integration:test` - passed, 27 PostgreSQL integration tests passed
- `corepack pnpm --filter @green-flag/api typecheck` - passed
- `corepack pnpm --filter @green-flag/db typecheck` - passed
- `corepack pnpm db:migrate:check` - passed, 20 migration files checked
- `corepack pnpm db:seed:check` - passed, 11 lower-env seed files checked
- `corepack pnpm contracts:check` - passed, 17 contract tests passed
- `corepack pnpm openapi:check` - passed

Additional checks:

- `$env:ALLOW_MIGRATION_APPLY_TO_TEST_DATABASE='true'; corepack pnpm db:migration:apply:check` - passed, 20 migrations applied to a disposable database
- Clean migration guard negative check with `NODE_ENV=production` - failed closed with `Clean migration apply check refuses production/staging runtime modes.`
- Clean migration guard negative check with database name `green_flag_staging` - failed closed with a production-like marker refusal
- CI validation was performed by local inspection plus running the same command families locally; no GitHub remote run exists in this local-only environment.

## Compatibility impact

- Existing API request/response contracts are unchanged.
- Existing result publication semantics remain one decision lifecycle per episode.
- Future republish/revision/reissue/history remains possible through a contract-managed schema extension because this pass uses nullable dedupe keys instead of broad field uniqueness.
- Export idempotency only replays when an idempotency key is supplied.
- Renewal notification-level dedupe is explicit-idempotency-only until a real target/expiry/offset model exists.

## Remaining caveats

- No live AWS staging/production environment exists yet.
- Provider-backed actions remain intentionally disabled in production-like runtime.
- Renewal reminders do not yet have certificate/park/episode/offset/expiry target rows, so target-level notification dedupe is not derivable without a future workflow/table decision.
- Clean migration apply requires local/CI database create/drop permission and explicit disposable-test opt-in.
- CI has been added but not run on GitHub from this local session.

## Repository mutation summary

Before implementation, `git status --short` showed an already dirty workspace with many modified backend/docs/contracts files and untracked S09-S14 reports, repositories, migrations, and output artifacts. Notable pre-existing entries included modified `apps/api/src/postgres-domain-stores/applicant-repository.ts`, `apps/api/src/postgres-domain-stores.integration.test.ts`, `apps/api/src/runtime-safety.ts`, `apps/api/src/postgres-runtime.ts`, `package`-adjacent contract files, and untracked `apps/api/src/postgres-domain-stores/communications-repository.ts`, `apps/api/src/postgres-domain-stores/results-repository.ts`, and `packages/db/migrations/0019_communications_db_first_safety.sql`.

After implementation, the workspace remains dirty with those pre-existing changes plus the Pass B changes listed in this report. No destructive git commands were run and no unrelated changes were reverted.
