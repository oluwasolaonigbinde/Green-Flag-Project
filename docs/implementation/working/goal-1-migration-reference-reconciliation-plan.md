# Goal 1 Migration Reference and Reconciliation Plan

## Executive recommendation

Implement a sidecar migration reference and reconciliation layer. Do not copy the legacy schema, do not move lifecycle ownership back into application status fields, and do not make the old database a new runtime dependency. The migration layer should record source-system rows, import batches, source-to-target links, and reconciliation outcomes while preserving the current episode-first backend where `assessment_episodes` remains the operational lifecycle root and `applications` remains the applicant package/draft/submission state.

The minimum viable implementation is:

- Add sidecar tables for import batches, per-batch source table manifests, source table catalog, mapping rules, controlled target entity types, source records, source-to-modern entity links, archive records, reconciliation reports, and reconciliation report items.
- Add a small internal migration repository/service layer for batch creation, source registration, entity linking, idempotent re-registration, and report generation.
- Keep migration metadata off applicant, judge, public, and ordinary operational DTOs.
- Use the layer first for traceability and proof of migration safety; actual domain corrections for finance, documents, contacts/judges/COI, and model gaps belong to Goals 2-5.

This plan should be implemented as backend-internal infrastructure only. It may expose admin/export tooling later, but Goal 1 should not add applicant/judge contract surface and should not change existing frontend behavior.

## Existing repo evidence

### What already exists

- PostgreSQL migration infrastructure exists with `schema_migrations` tracking in `packages/db/src/postgres.ts` and convention checks in `packages/db/scripts/check-migrations.mjs`.
- Canonical modern domain tables exist:
  - `organisations`, `award_tracks`, `parks`, `park_locations`, `award_cycles`, `cycle_windows`, and `assessment_episodes` in `packages/db/migrations/0003_organisations_parks_locations_cycles_episodes.sql`.
  - `applications`, `application_sections`, `application_field_values`, and `application_feedback_responses` in `packages/db/migrations/0005_applicant_dashboard_application_draft_autosave.sql`.
  - `document_assets`, `document_upload_sessions`, and `document_upload_chunks` in `packages/db/migrations/0006_documents_management_plan_upload_link_versioning.sql`.
  - `application_submissions`, `invoices`, `payment_states`, and `payment_notification_intents` in `packages/db/migrations/0007_submission_invoice_po_payment_state.sql`.
  - `assessor_profiles`, preferences, availability, and capacity in `packages/db/migrations/0008_judge_profiles_assessor_management_capacity.sql`.
  - `allocations`, `judge_assignments`, and `allocation_coi_flags` in `packages/db/migrations/0010_allocation_workflow_candidates_coi_release_acceptance.sql`.
  - assessment template, visit, assessment, score, and evidence tables in `packages/db/migrations/0011_visits_assessment_scoring_framework.sql`.
  - `decision_results`, `result_artifacts`, `park_award_cache`, and `public_map_update_events` in `packages/db/migrations/0012_decisions_results_certificates_public_map_events.sql`.
  - notification, message, job, and export tables in `packages/db/migrations/0014_notifications_messaging_jobs_exports_reminders.sql`.
  - `audit_events` and `admin_override_events` in `packages/db/migrations/0002_identity_rbac_audit_foundation.sql`.
- DB-first repository patterns exist under `apps/api/src/postgres-domain-stores/*-repository.ts`; Goal 1 should follow this style for the migration repository rather than adding a new architectural style.
- Idempotency patterns exist in command routes/repositories through idempotency keys, unique indexes, and replay behavior, especially applicant document upload, submission, allocation release, result publication, notification queue, public map event, and export job paths.
- Duplicate detection exists in the registration and document upload flows:
  - Registration uses duplicate warning DTOs/contracts.
  - Documents use SHA-256 duplicate detection.
  These are domain-specific examples to reuse conceptually, not migration reconciliation implementations.
- Lower-env seed files sometimes name import boundaries, for example `packages/db/seeds/lower-env-allocation.json` lists `live_conflict_register` as an import boundary. These are not live migration tooling, but they document intended external handoff points.
- Canonical docs already state migration is an external gate:
  - `docs/implementation/gap-register.md` has EXT-010 for current-system export files, ownership mapping, and import rules.
  - `docs/implementation/external-configuration-register.md` says migration/import currently has synthetic seeds only.
  - `docs/implementation/production-readiness-checklist.md` requires current-system exports, dry run, reconciliation, idempotency, rollback, and restore.

### What does not exist

Repo search found no implemented `legacy_id`, `legacy_source_table`, `legacy_import_batch_id`, `migration_import_batches`, `migration_source_records`, `migration_entity_links`, `migration_reconciliation_reports`, import staging tables, source-record mapping tables, row-count/hash reconciliation reports, or import scripts outside the audit document itself.

The legacy audit therefore remains correct: the modern backend is architecturally healthy, but cannot yet prove it is migration-safe for legacy replacement.

### Partial conventions to reuse

- Use explicit SQL migrations with `-- migrate:down`, following `packages/db/migrations/README.md`.
- Use `uuid` primary keys, `created_at_utc`/`updated_at_utc` style timestamps, and typed `text CHECK (...)` statuses consistent with the current migrations.
- Use DB-first repositories under `apps/api/src/postgres-domain-stores/` and a wiring point in `apps/api/src/postgres-runtime.ts` if runtime services are needed.
- Use append-only or correction-by-new-row behavior for audit-like records. Reconciliation reports should be immutable once completed; later reruns create new reports.
- Do not configure cascading deletes for migration provenance/reporting foreign keys. Use default PostgreSQL `NO ACTION` or explicit `RESTRICT`, and retire records through statuses such as `voided`, `superseded`, `rejected`, `resolved`, or `archived`.
- Use OpenAPI/contracts only if an admin API surface is explicitly approved later. Goal 1 can be internal service/repository plus tests.

## Proposed schema

Plan these as sidecar migration tables. They should live in a new migration, for example `0021_migration_reference_reconciliation.sql`, unless the implementation agent finds a naming conflict. They should not add legacy columns to every domain table.

All provenance/reporting tables in this section should use `NO ACTION`/`RESTRICT` foreign-key behavior. Import evidence must remain queryable after mistakes, reruns, and superseded imports. Corrections are represented by status transitions, replacement rows, report items, and audit events, not cascading deletes.

### `migration_source_table_catalog`

Purpose: whitelist and describe source tables/exports before rows are registered.

Recommended columns:

- `id uuid primary key`
- `source_system text not null`
- `source_database text not null`
- `source_schema text not null`
- `source_table text not null`
- `source_group text not null`
- `business_owner text`
- `classification text not null check (...)`
  - Suggested values: `core_business`, `reference`, `finance`, `document`, `communications`, `identity`, `cms_business`, `cms_archive`, `archive_only`, `excluded_noise`, `unclassified_pending_review`.
- `primary_key_columns text[] not null`
- `natural_key_columns text[] not null default '{}'`
- `retention_decision text not null check (...)`
  - Suggested values: `migrate`, `link_only`, `archive_only`, `exclude_pending_signoff`.
- `notes text`
- `created_at_utc timestamptz not null default now()`
- `updated_at_utc timestamptz not null default now()`
- Unique key on `(source_system, source_database, source_schema, source_table)`.

Design note: the catalog is global table classification, not batch evidence. Expected row counts, export file hashes, and source hashes are batch/export-specific and belong in `migration_import_batch_source_tables`.

### `migration_import_batches`

Purpose: record a dry run, test import, UAT load, or production cutover import.

Recommended columns:

- `id uuid primary key`
- `batch_key text not null unique`
- `source_system text not null`
- `source_database text not null`
- `source_export_label text not null`
- `environment text not null check (environment in ('local', 'ci', 'uat', 'staging', 'production'))`
- `batch_kind text not null check (batch_kind in ('dry_run', 'test_import', 'uat_rehearsal', 'cutover', 'rollback_rehearsal'))`
- `status text not null check (status in ('created', 'running', 'completed', 'completed_with_warnings', 'failed', 'superseded', 'voided'))`
- `started_at_utc timestamptz`
- `completed_at_utc timestamptz`
- `source_exported_at_utc timestamptz`
- `source_file_manifest jsonb not null default '[]'::jsonb`
- `initiated_by_actor_id uuid references internal_users(id)`
- `notes text`
- `created_at_utc timestamptz not null default now()`
- `updated_at_utc timestamptz not null default now()`

Design note: this table records provenance and rerun state. It should not store full raw legacy rows.

Design decision: keep `environment` and `batch_kind` separate. `environment` answers where the batch ran; `batch_kind` answers why it ran. A `uat` dry run and a `uat` cutover rehearsal are materially different, and a `production` rollback rehearsal is not the same thing as a production cutover.

### `migration_import_batch_source_tables`

Purpose: record batch/export-specific source table manifests. This prevents the global catalog from carrying stale expected counts or hashes from a different export.

Recommended columns:

- `id uuid primary key`
- `import_batch_id uuid not null references migration_import_batches(id) on delete restrict`
- `catalog_id uuid not null references migration_source_table_catalog(id) on delete restrict`
- `source_system text not null`
- `source_database text not null`
- `source_schema text not null`
- `source_table text not null`
- `source_export_file text`
- `source_export_file_checksum text`
- `source_export_hash_algorithm text not null default 'sha256'`
- `expected_row_count integer not null check (expected_row_count >= 0)`
- `expected_source_hash text`
- `actual_registered_row_count integer`
- `actual_registered_source_hash text`
- `manifest_status text not null check (manifest_status in ('expected', 'registered', 'matched', 'mismatched', 'missing_export', 'voided'))`
- `notes text`
- `created_at_utc timestamptz not null default now()`
- `updated_at_utc timestamptz not null default now()`
- Unique `(import_batch_id, catalog_id)`.
- Unique `(import_batch_id, source_system, source_database, source_schema, source_table)`.

### `migration_target_entity_types`

Purpose: control `target_entity_type` values and define how confirmed links are validated.

Recommended columns:

- `code text primary key`
- `label text not null`
- `target_table text not null`
- `id_column text not null default 'id'`
- `validation_mode text not null check (validation_mode in ('uuid_table_lookup', 'external_archive_manifest', 'not_linkable'))`
- `active boolean not null default true`
- `notes text`
- `created_at_utc timestamptz not null default now()`
- `updated_at_utc timestamptz not null default now()`

Design note: database-level dynamic foreign keys are not practical for polymorphic targets. The repository/service must validate every `confirmed` link by looking up `(target_table, id_column)` for the controlled `target_entity_type`. `proposed` and `requires_review` links may exist before the target row exists, but cannot be promoted to `confirmed` until validation passes.

### `migration_mapping_rules`

Purpose: make missing-target reconciliation deterministic per source group/table and mapping version.

Recommended columns:

- `id uuid primary key`
- `catalog_id uuid not null references migration_source_table_catalog(id) on delete restrict`
- `source_group text not null`
- `mapping_version text not null`
- `required_target_entity_types text[] not null default '{}'`
- `optional_target_entity_types text[] not null default '{}'`
- `archive_required boolean not null default false`
- `allow_unlinked_source boolean not null default false`
- `missing_target_severity text not null check (missing_target_severity in ('info', 'warning', 'error', 'blocker'))`
- `rule_status text not null check (rule_status in ('draft', 'active', 'superseded', 'voided'))`
- `notes text`
- `created_at_utc timestamptz not null default now()`
- `updated_at_utc timestamptz not null default now()`
- Unique `(catalog_id, mapping_version)`.

Design note: `missing_target` report items must be generated from active mapping rules. A source row is missing a target only when its active rule requires a target entity type or archive record that is absent. Archive-only and excluded rows must still have explicit rules; they are not silently ignored.

### `migration_source_records`

Purpose: one row per legacy source row or export row, with checksums and status.

Recommended columns:

- `id uuid primary key`
- `import_batch_id uuid not null references migration_import_batches(id) on delete restrict`
- `catalog_id uuid not null references migration_source_table_catalog(id) on delete restrict`
- `batch_source_table_id uuid not null references migration_import_batch_source_tables(id) on delete restrict`
- `source_system text not null`
- `source_database text not null`
- `source_schema text not null`
- `source_table text not null`
- `source_primary_key text not null`
- `source_primary_key_json jsonb`
- `source_natural_key text`
- `source_natural_key_json jsonb`
- `source_row_checksum text not null`
- `source_row_hash_algorithm text not null default 'sha256'`
- `source_row_fingerprint jsonb not null default '{}'::jsonb`
- `fingerprint_sensitivity text not null check (fingerprint_sensitivity in ('none', 'low', 'personal_data', 'special_category', 'secret_or_credential'))`
- `import_status text not null check (import_status in ('registered', 'linked', 'partially_linked', 'duplicate_source', 'orphan_source', 'missing_target', 'ignored_archive_only', 'failed'))`
- `duplicate_of_source_record_id uuid references migration_source_records(id) on delete restrict`
- `error_code text`
- `error_detail text`
- `registered_at_utc timestamptz not null default now()`
- `updated_at_utc timestamptz not null default now()`

Recommended constraints/indexes:

- Unique `(import_batch_id, source_system, source_database, source_schema, source_table, source_primary_key)`.
- Index `(source_system, source_database, source_schema, source_table, source_primary_key)`.
- Index `(source_natural_key)` where not null.
- Index `(source_row_checksum)`.

Design note: catalog_id is required. If a source table is not understood yet, register it in the catalog as `unclassified_pending_review` with `retention_decision = exclude_pending_signoff`; source records in that state cannot be reconciled as passed or linked as confirmed until classification is updated. `source_row_fingerprint` may store minimized summary fields needed for reconciliation, such as normalized name, year, country, amount totals, or document filename. It must not contain full raw rows, passwords, secrets, raw contact notes, unrestricted PII, or document contents. Sensitive values should be omitted, tokenized, or represented as salted hashes where evidence is still needed.

### `migration_entity_links`

Purpose: many-to-many mapping between source records and modern entities.

This table is the core reason to use a sidecar design:

- One legacy row can map to multiple modern rows, for example `ParkAwardApplication` maps to `applications`, `assessment_episodes`, `application_field_values`, `invoices`, and possibly documents.
- One modern row can trace back to multiple source rows, for example a modern `parks` row may combine `Park`, `ParkFacility`, `ParksContact`, and geography reference data.

Recommended columns:

- `id uuid primary key`
- `source_record_id uuid not null references migration_source_records(id) on delete restrict`
- `import_batch_id uuid not null references migration_import_batches(id) on delete restrict`
- `target_entity_type text not null references migration_target_entity_types(code) on delete restrict`
- `target_entity_id uuid not null`
- `link_role text not null`
- `link_status text not null check (link_status in ('proposed', 'confirmed', 'superseded', 'rejected', 'requires_review'))`
- `confidence text not null check (confidence in ('exact', 'strong', 'inferred', 'manual_review', 'unknown'))`
- `mapping_version text not null`
- `created_by_process text not null`
- `notes text`
- `created_at_utc timestamptz not null default now()`
- `updated_at_utc timestamptz not null default now()`

Recommended constraints/indexes:

- Unique `(source_record_id, target_entity_type, target_entity_id, link_role, mapping_version)` for idempotent link creation.
- Index `(target_entity_type, target_entity_id)`.
- Index `(import_batch_id, target_entity_type)`.
- Index `(source_record_id, link_status)`.

Confirmed-link validation:

- `link_status = confirmed` is allowed only when `target_entity_type` is active and the target row exists according to `migration_target_entity_types.validation_mode`.
- Repository methods must reject confirmed links for unknown target entity types, inactive target entity types, missing target rows, or target types marked `not_linkable`.
- Links to archive-only material use the controlled `archive_record` target type and must point to `migration_archive_records`, or use an explicitly configured external archive manifest target type.

Target entity types must be registered in `migration_target_entity_types` and enforced by repository/service code. Initial controlled values may include:

- `organisation`
- `park`
- `park_location`
- `award_cycle`
- `cycle_window`
- `assessment_episode`
- `application`
- `application_section`
- `application_field_value`
- `application_feedback_response`
- `document_asset`
- `application_submission`
- `invoice`
- `payment_state`
- `internal_user`
- `role_assignment`
- `assessor_profile`
- `assessor_preference`
- `assessor_capacity_declaration`
- `allocation`
- `judge_assignment`
- `allocation_coi_flag`
- `assessment_visit`
- `judge_assessment`
- `assessment_score_entry`
- `assessment_evidence`
- `decision_result`
- `result_artifact`
- `park_award_cache`
- `public_map_update_event`
- `notification_queue`
- `notification_log`
- `message_thread`
- `message_entry`
- `archive_record`

Link roles should describe purpose, not only ownership. Suggested examples:

- `canonical_identity`
- `derived_episode`
- `application_package`
- `field_value_source`
- `document_file_source`
- `finance_source`
- `billing_snapshot_source`
- `payment_source`
- `allocation_source`
- `judge_profile_source`
- `coi_source`
- `assessment_score_source`
- `feedback_source`
- `notification_history_source`
- `public_award_state_source`
- `reference_lookup_source`
- `archive_reference`

### `migration_archive_records`

Purpose: preserve first-class archive provenance for source rows that are intentionally not imported into modern operational tables but still need archive/search/export traceability.

Recommended columns:

- `id uuid primary key`
- `source_record_id uuid not null references migration_source_records(id) on delete restrict`
- `import_batch_id uuid not null references migration_import_batches(id) on delete restrict`
- `archive_kind text not null check (archive_kind in ('internal_archive_record', 'external_archive_manifest'))`
- `archive_location text not null`
- `archive_reference text not null`
- `archive_checksum text`
- `retention_category text not null`
- `sensitivity text not null check (sensitivity in ('none', 'low', 'personal_data', 'special_category', 'secret_or_credential'))`
- `access_notes text`
- `created_at_utc timestamptz not null default now()`
- `updated_at_utc timestamptz not null default now()`
- Unique `(source_record_id, archive_kind, archive_reference)`.

Design note: archive-only handling is explicit, not optional. A source row is excluded from missing-target failures only when an active mapping rule permits archive-only handling and the row has a matching `migration_archive_records` entry or confirmed archive manifest link.

### `migration_reconciliation_reports`

Purpose: immutable summary of a reconciliation run.

Recommended columns:

- `id uuid primary key`
- `import_batch_id uuid not null references migration_import_batches(id) on delete restrict`
- `baseline_import_batch_id uuid references migration_import_batches(id) on delete restrict`
- `compared_import_batch_id uuid references migration_import_batches(id) on delete restrict`
- `report_key text not null`
- `report_type text not null check (report_type in ('count', 'hash', 'duplicate', 'missing_target', 'orphan_source', 'finance_totals', 'document_assets', 'cross_entity', 'full_batch'))`
- `scope text not null`
- `status text not null check (status in ('running', 'passed', 'passed_with_warnings', 'failed', 'requires_review'))`
- `source_system text not null`
- `source_database text`
- `summary jsonb not null default '{}'::jsonb`
- `summary_sensitivity text not null check (summary_sensitivity in ('none', 'low', 'personal_data', 'special_category', 'secret_or_credential')) default 'low'`
- `generated_by_process text not null`
- `generated_at_utc timestamptz not null default now()`
- `completed_at_utc timestamptz`
- `notes text`
- Unique `(import_batch_id, report_key)`.

Design note: count/current-batch reports use `import_batch_id`. Cross-batch checksum/hash reconciliation must also set `baseline_import_batch_id` and `compared_import_batch_id`, comparing the same source table and source primary key across those two batches. Report completion is a status transition and must emit an audit event.

The `summary` should include totals such as:

- `sourceRowCount`
- `registeredSourceRecordCount`
- `linkedSourceRecordCount`
- `targetEntityCount`
- `duplicateSourceCount`
- `missingTargetCount`
- `orphanSourceCount`
- `checksumMismatchCount`
- `baselineBatchKey`
- `comparedBatchKey`
- `financeTotalSource`
- `financeTotalTarget`
- `financeTotalDifference`

Finance totals can be `null` until Goal 2 adds the finance destination tables.

### `migration_reconciliation_report_items`

Purpose: individual discrepancies and evidence rows.

Recommended columns:

- `id uuid primary key`
- `report_id uuid not null references migration_reconciliation_reports(id) on delete restrict`
- `source_record_id uuid references migration_source_records(id) on delete restrict`
- `target_entity_type text references migration_target_entity_types(code) on delete restrict`
- `target_entity_id uuid`
- `item_type text not null check (item_type in ('duplicate_source', 'missing_target', 'orphan_source', 'count_mismatch', 'checksum_mismatch', 'hash_mismatch', 'finance_total_mismatch', 'invalid_mapping', 'manual_review_required', 'archive_only_confirmed'))`
- `severity text not null check (severity in ('info', 'warning', 'error', 'blocker'))`
- `outcome text not null check (outcome in ('open', 'accepted', 'resolved', 'false_positive', 'deferred'))`
- `source_value jsonb`
- `target_value jsonb`
- `expected_value jsonb`
- `actual_value jsonb`
- `evidence_sensitivity text not null check (evidence_sensitivity in ('none', 'low', 'personal_data', 'special_category', 'secret_or_credential')) default 'low'`
- `notes text`
- `created_at_utc timestamptz not null default now()`
- `resolved_at_utc timestamptz`
- `resolved_by_actor_id uuid references internal_users(id)`

Recommended indexes:

- `(report_id, severity, outcome)`
- `(source_record_id)`
- `(target_entity_type, target_entity_id)`

Design note: report item JSON must be sanitized evidence, not raw legacy rows. It may include counts, hashes, normalized names, masked identifiers, and small transformed values needed to explain the mismatch. It must not include passwords, API credentials, raw auth/member secrets, unrestricted contact payloads, full document text/binary content, or unnecessary PII. Resolving or accepting a report item is a status transition and must emit an audit event with reason.

## Proposed services/repositories

Create a small backend-internal migration module. Suggested files:

- `apps/api/src/migration-reference.ts` for service types and pure helpers.
- `apps/api/src/postgres-domain-stores/migration-reference-repository.ts` for DB implementation.
- Optional `apps/api/src/migration-reference.test.ts` and integration coverage in `apps/api/src/postgres-domain-stores.integration.test.ts`.

Avoid public API routes unless explicitly approved. If an admin route is later needed, put it behind Super Admin/KBT Admin permissions and ensure it does not leak into applicant or judge surfaces.

### Repository capabilities

Plan an interface with these operations:

- `createImportBatch(input)`
  - Creates a batch with a unique `batch_key`.
  - Supports status transitions from `created` to `running` to final states.
  - Records source manifest and source export timestamp.
  - Separates `environment` from `batch_kind`.
  - Emits audit events for status changes with prior status, after status, actor/process, and reason.
- `registerBatchSourceTableManifest(input)`
  - Registers expected row count, export file checksum, expected source hash, and manifest status for a specific source table in a specific batch.
  - Reconciliation count/hash checks must read expected values from this per-batch manifest, not from the global catalog.
- `registerSourceTable(input)`
  - Upserts catalog entries for approved source tables.
  - Stores source group, ownership, classification, and retention decision.
- `registerMappingRule(input)`
  - Defines required targets, optional targets, archive requirements, missing-target severity, and mapping version for a cataloged source table.
  - Missing-target reconciliation must fail closed when an active mapping rule is absent for a `migrate` or `link_only` source group.
- `registerTargetEntityType(input)`
  - Registers controlled target entity types and their validation mode.
  - Unknown target entity types are rejected.
- `registerSourceRecord(input)`
  - Idempotently registers one source row by `(batch, source table, source primary key)`.
  - Requires a catalog entry and batch source table manifest.
  - If the same checksum is re-registered, returns the existing record without changing identity.
  - If the same source primary key is re-registered with a different checksum in the same batch, marks/report as changed or fails according to import policy.
- `registerSourceRecords(input[])`
  - Bulk version of the same behavior for import scripts.
- `linkSourceRecordToEntity(input)`
  - Creates a source-to-target link.
  - Allows many links per source and many sources per target.
  - Requires `link_role`, `confidence`, `link_status`, and `mapping_version`.
  - Validates target entity type and, for `confirmed` links, validates that the target row exists.
- `registerArchiveRecord(input)`
  - Records internal archive or external archive manifest provenance for archive-only rows.
  - Required before archive-only rows can be excluded from missing-target failures.
- `getSourceRecordsForTarget(targetEntityType, targetEntityId)`
  - Traces a modern entity back to legacy references.
- `getTargetsForSourceRecord(sourceRecordId)`
  - Explains where a legacy row landed.
- `markSourceRecordStatus(input)`
  - Sets status such as `linked`, `partially_linked`, `duplicate_source`, `orphan_source`, or `ignored_archive_only`.
- `generateReconciliationReport(input)`
  - Creates a report and item rows from registered counts/links.
  - Accepts optional `baselineImportBatchId` and `comparedImportBatchId` for cross-batch checksum/hash reconciliation.
  - Emits audit events when the report transitions to a completed status.
- `listOpenReconciliationItems(input)`
  - Supports implementation/test diagnostics and later admin exports.
- `resolveReconciliationItem(input)`
  - Updates item outcome/resolution fields.
  - Emits an audit event with actor, prior outcome, after outcome, report/item IDs, and reason.

### Reconciliation utilities

Add pure utilities for:

- Normalizing source identifiers: source system/database/schema/table plus primary key.
- Creating row checksums from canonical export JSON with stable key ordering.
- Comparing count/hash expectations by source table and target entity type from `migration_import_batch_source_tables`.
- Detecting duplicate source rows by:
  - Same source primary key inside a batch.
  - Same natural key within a source table.
  - Same checksum across rows where source primary keys differ.
  - Domain-specific duplicate profiles, for example park name plus postcode plus organisation.
- Detecting missing targets:
  - Use active `migration_mapping_rules` for the source record's catalog entry and mapping version.
  - Create `missing_target` items when a required target entity type or required archive record is absent.
  - Treat missing active rules for `migrate`/`link_only` rows as `manual_review_required` or blocker failures, not as passes.
- Detecting orphan source rows:
  - Source row is registered but not linked and not explicitly allowed by active mapping rules plus archive records.
- Detecting target orphan risk:
  - Modern imported target has no source link when created by migration process.
- Capturing checksum/hash mismatches:
  - Source record checksum changed between dry runs.
  - Cross-batch comparisons use `baseline_import_batch_id` and `compared_import_batch_id`.
  - Target fingerprint does not match the mapped source fingerprint where deterministic transformation is expected.
- Preparing finance total hooks:
  - Count and sum source `Fee`/`Invoice` amounts by country, season, status, VAT/currency markers, and application.
  - Store source totals in report `summary` even before Goal 2 creates final target finance columns.

### Import status behavior

Use explicit statuses rather than boolean flags:

- `registered`: source row known, not yet linked.
- `linked`: all required target links exist.
- `partially_linked`: at least one target link exists, but not all required links exist.
- `duplicate_source`: row duplicates another source row by configured rule.
- `orphan_source`: no target link and no archive/exclusion decision.
- `missing_target`: target should exist but does not.
- `ignored_archive_only`: row intentionally archive-only.
- `failed`: row could not be processed.

### Access and redaction expectations

- Migration metadata is internal operational metadata.
- Applicant and judge routes must not include source system names, legacy IDs, import batch IDs, checksums, raw source fingerprints, duplicate diagnostics, or reconciliation outcomes.
- Admin exports may include migration metadata only after explicit route/contract approval and RBAC review.
- Mystery redaction must continue to apply to any imported episode, notification, document, message, result, export, and search projection. The migration layer must never become a bypass.
- Source fingerprints, report summaries, and report item JSON require sensitivity classification. The service must reject `secret_or_credential` fingerprints/report evidence except for approved hashed indicators, and must reject raw passwords, API keys, auth tokens, raw source rows, and full document contents.
- Internal admin/debug views must render sanitized report evidence only. If a future export includes migration evidence, it must use the same redaction and RBAC discipline as existing safe export/read-model paths.

### Audit expectations

The migration layer is not applicant-facing, but it changes operational evidence used for go/no-go decisions. These actions must emit append-only `audit_events`:

- Import batch status changes, including `created -> running`, completion, failure, supersession, and voiding.
- Batch source table manifest status changes when expected counts/hashes are matched or mismatched.
- Reconciliation report completion or failure.
- Reconciliation report item outcome changes, including accepted, resolved, false positive, or deferred.
- Promotion of an entity link to `confirmed`, because confirmed links become migration proof.

Audit events should include actor/process identity, batch/report/item/link IDs, prior status/outcome, after status/outcome, request/correlation ID where available, and a reason for manual transitions.

## Proposed tests

Add focused tests before or alongside implementation. The implementation agent should keep tests close to the new repository/service and add DB integration coverage because this layer is mostly relational.

Required tests:

- A source row can map to multiple modern target entities.
  - Example: legacy `ParkAwardApplication` source record links to one `application`, one `assessment_episode`, several `application_field_value` rows, and an `invoice`.
- A modern target entity can be traced back to legacy source.
  - Example: a modern `assessment_episode` returns links to `ParkAwardApplication`, `Award`, and possibly `CountrySeason`.
- Duplicate source rows are detected.
  - Cover duplicate primary key in the same batch.
  - Cover duplicate natural key with different source primary keys.
- Orphan source rows are reported.
  - A `ParkDocument` or `EmailLog` source row registered with retention decision `migrate` but no confirmed link produces an `orphan_source` report item.
- Missing target rows are reported.
  - A `ParkAwardApplication` source row requiring `application` and `assessment_episode` links but missing the episode link produces a `missing_target` report item.
  - The requirement comes from `migration_mapping_rules`, not hardcoded report logic.
- Repeated import registration is idempotent.
  - Same batch/table/primary key/checksum returns the same `migration_source_records.id`.
  - Same source-to-target link registered twice returns or preserves one link.
- Per-batch source table manifests drive count/hash reconciliation.
  - Two batches for the same source table can carry different expected counts and expected hashes without changing the global catalog.
- Reconciliation reports capture counts and outcomes.
  - Report summary includes source row count, linked count, duplicate count, missing target count, orphan count, and status.
  - Report items are created with severity and outcome.
- Source row checksum/hash reconciliation is captured.
  - Same source primary key with changed checksum across baseline and compared batches is visible in report output.
- Target entity type controls are enforced.
  - Unknown target types are rejected.
  - Confirmed links to missing target rows are rejected.
- Archive-only rows require explicit archive provenance.
  - Archive-only rows have a `migration_archive_records` entry or configured external archive manifest link before they are excluded from missing-target failures.
- Privacy and audit controls are enforced.
  - Raw source rows, secrets, and unnecessary PII are rejected from source fingerprints and report item JSON.
  - Import batch status changes, report completion, report item resolution, and confirmed-link promotion emit audit events.
- Finance total hooks exist without inventing final finance behavior.
  - Report can store source invoice/fee totals in JSON summary and flag that target finance totals are unavailable until Goal 2.
- Sensitive migration metadata is not exposed to applicant or judge surfaces.
  - Existing applicant dashboard/application/detail/result/message/document routes should not serialize migration tables or source IDs.
  - Existing judge assigned-episode/assessment routes should not serialize migration tables or source IDs.
- Existing do-not-regress behavior still passes.
  - DB migration convention check.
  - Contracts/OpenAPI checks if contracts are touched later. Goal 1 should avoid public contract changes.
  - Mystery redaction tests remain green.

Optional tests:

- Reconciliation reports are immutable after completion except item resolution fields if the implementation allows manual resolution.
- Archive-only rows do not count as missing targets.
- One target linked to multiple source rows can distinguish link roles.
- A source table not present in the catalog is rejected unless the implementation creates an explicit `unclassified_pending_review` catalog entry that blocks passed reconciliation and confirmed links until classified.

## Legacy source group coverage

The source table catalog should be seeded or registered for at least the groups below. The classification here is the planning default; KBT/export owners may refine it.

### Core master/reference records

- `Park`
  - Modern destinations: `parks`, `park_locations`, `park_award_cache`, application field values, optional future park profile/archive.
  - Required links: `park`, usually `park_location`.
  - Reconciliation: row count, duplicate park name/postcode/organisation, missing target park, geospatial checksum/fingerprint.
- `Organisation`
  - Modern destinations: `organisations`, role scopes, possibly billing/contact snapshots in later goals.
  - Required links: `organisation`.
  - Reconciliation: duplicate normalized names, missing target organisation.
- `Country`, `Region`, `County`, `Authority`
  - Modern destinations: country codes in `award_cycles`/RBAC; text geography in `park_locations`; optional reference/archive records.
  - Required links: `reference_lookup_source` or `archive_reference`, unless KBT decides to add normalized reference tables.
  - Reconciliation: lookup coverage and canonical-name duplicates.
- `CountrySeason`
  - Modern destinations: `award_cycles`, `cycle_windows`, and episode carryover mapping.
  - Required links: `award_cycle` and relevant `cycle_window` rows.
  - Reconciliation: season/year counts by country, source cycle to modern cycle/window mapping.

### Contacts and relationships

- `Contact`
  - Modern destinations: `internal_users` where login identity is provisioned, application contact fields, future park/organisation contact tables if Goal 4 adds them, archive otherwise.
  - Required links: depends on contact role. Must not assume every contact is a login user.
- `ParksContact`
  - Modern destinations: modern park/contact relationship tables if added in Goal 4, application contact snapshots/fields, or archive references.
  - Required links: `park` plus contact target/archive target.
  - Reconciliation: orphan contact relationships, duplicate contacts by email/name, missing park target.

### Applications, awards, assessment history

- `ParkAwardApplication`
  - Modern destinations: `applications`, `assessment_episodes`, `application_sections`, `application_field_values`, `application_submissions`, invoices/payment state where applicable.
  - Required links: `application` and `assessment_episode`.
  - Reconciliation: source application count by season/type/status, missing episode, state translation review, duplicate application for park/cycle/type.
- `Award`
  - Modern destinations: `allocations`, `judge_assignments`, `assessment_visits`, `judge_assessments`, `decision_results`, `park_award_cache`, `public_map_update_events`.
  - Required links: at least `assessment_episode`; additional links depend on imported historical depth.
  - Reconciliation: primary/secondary judge mapping, award/application link integrity, result/publication state.
- `ParkApplicationNote`
  - Modern destinations: `judge_assessments`, `assessment_score_entries`, `assessment_evidence`, `application_feedback_responses`, `result_artifacts`, or archive where old `FormsValue` cannot be mapped to an approved template.
  - Required links: `assessment_episode` or `application`, plus archive if not structured.
  - Reconciliation: missing application/award targets, score/form count, feedback-file coverage.

### Documents

- `ParkDocument`
  - Modern destinations: `document_assets`, `result_artifacts`, `assessment_evidence`, or archive manifest.
  - Required links: document target or archive record for every retained file reference.
  - Reconciliation: filename/source-path coverage, storage key/hash coverage, duplicate hashes, missing target documents.
  - Goal 1 should only create reference/link capability; Goal 3 owns document subtype and storage mapping completion.

### Judges and conflicts

- `Judge`
  - Modern destinations: `internal_users`, `assessor_profiles`, `assessor_preferences`, `assessor_capacity_declarations`, role assignments.
  - Required links: `assessor_profile` for active judges; archive or internal user links for inactive/historical judges according to KBT retention.
  - Reconciliation: duplicate judge identities, active/inactive status translation, accreditation/source markers.
- `JudgeApplication`
  - Modern destinations: future onboarding/review/archive model, `assessor_profiles` where approved, document assets/archive for CV/letters/photos.
  - Required links: to assessor profile or archive.
  - Reconciliation: application status counts and missing assessor profile for approved applicants.
- `JudgeConflictOfInterest`
  - Modern destinations: `allocation_coi_flags` and/or future global COI records if Goal 4 adds them.
  - Required links: assessor profile plus park/organisation/episode target depending on source shape.
  - Reconciliation: hard/soft severity mapping, missing assessor/park target, source owner/format gaps.

### Finance

- `Fee`
  - Modern destinations: Goal 2 finance schedule/fee-line tables; temporary report summary hooks in Goal 1.
  - Required links in Goal 1: source record registration and catalog only, with `finance_total` report summaries.
  - Reconciliation: counts by season/country/award type and source fee totals.
- `Invoice`
  - Modern destinations: current `invoices`/`payment_states` plus Goal 2 billing snapshot, amount, tax, currency, payment event, and export status tables.
  - Required links in Goal 1: source record to current `invoice` where it exists; report missing target where finance destination is not yet sufficient.
  - Reconciliation: invoice count, total amounts, paid/unpaid status counts, purchase order/no-PO coverage.

### Communications

- `EmailLog`
  - Modern destinations: `notification_queue`, `notification_logs`, `notification_suppressions`, or archive for historical bodies/errors/resends.
  - Required links: notification log target or archive reference.
  - Reconciliation: status/error/resend count, country scope, missing related application/episode target.

### Umbraco Forms/resource/content records

`schema_KBT_GFA.md` appears mostly to be Umbraco CMS/Forms infrastructure. Do not rebuild the CMS in the operational backend. Catalog only the records that meet one of these tests:

- Business submission: a form record represents an application, registration, contact, payment, judge, complaint, appeal, or other operational submission.
- Retained public content: content/resources must continue to be served, referenced, or archived for the public site.
- Auth/audit/consent obligation: records are needed for legal retention, audit, consent, data subject request, or security investigation.
- Archive candidate: records are not operational but need a searchable/exportable archive manifest.

Relevant candidates:

- `UFForms`, `UFRecords`, `UFRecordFields`, `UFRecordData*`, `UFRecordAudit`, `UFRecordWorkflowAudit`, and `UFWorkflows`, only for business submissions or retained audit obligations.
- `umbracoAudit`, `umbracoConsent`, `umbracoUser`, `cmsMember`, and related auth/security records, only for compliance/archive or Cognito provisioning decisions. Do not migrate old passwords/secrets.
- `umbracoContent`, `umbracoDocument`, `umbracoNode`, `umbracoPropertyData`, media/resource nodes, redirects, and resource logs, only for retained public content or archive.

Everything else should be `archive_only` or `excluded_noise` unless KBT identifies a business requirement.

## Interaction with Goals 2-5

### Goal 2 finance

Goal 2 should use the migration layer as the traceability spine for `Fee`, `Invoice`, payment events, billing contacts, VAT/currency, fee schedule, Business Central/export references, and finance totals.

Expected use:

- Register `Fee` and `Invoice` source rows before transforming them.
- Link each legacy invoice to modern `invoices`, `payment_states`, future invoice line/billing snapshot/payment event rows, and any Business Central export reference rows.
- Generate finance reconciliation reports by country, season, application, invoice status, VAT/currency, and total amount.
- Preserve source totals in `migration_reconciliation_reports.summary` even when exact target totals require future finance tables.

Goal 2 must not invent fees, VAT treatment, invoice/legal wording, or Business Central payloads.

### Goal 3 documents

Goal 3 should use `migration_source_records` and `migration_entity_links` to map filename-only legacy fields to modern document assets/artifacts/evidence.

Expected use:

- Register `ParkDocument` rows and file-specific source fingerprints.
- Link source rows or source columns to `document_assets`, `assessment_evidence`, `result_artifacts`, or archive records.
- Store row/file checksums where available and compare to target `sha256`.
- Report missing storage keys, duplicate hashes, orphan filename references, and unmapped document subtypes.

Goal 3 should add subtype/storage handling as needed without weakening current document access audit or Mystery document redaction.

### Goal 4 contacts, judges, and COI

Goal 4 should use the migration layer to prove identity/contact continuity and conflict coverage.

Expected use:

- Register `Contact`, `ParksContact`, `Judge`, `JudgeApplication`, and `JudgeConflictOfInterest` source records.
- Link contacts to modern users, park/organisation contact destinations, application contact fields, assessor profiles, and archive records according to approved rules.
- Link judge COI records to `allocation_coi_flags` or future global COI records.
- Reconcile missing assessor profiles, duplicate people, missing park/contact relationships, and hard/soft COI severity translation.

Goal 4 must not migrate legacy passwords. Cognito remains the identity provider.

### Goal 5 model corrections

Goal 5 should use reconciliation reports to decide where modern model corrections are actually required.

Likely areas:

- `assessment_episodes` architecture gap for `operational_year` and `source_cycle_id` or a documented equivalent.
- Primary/secondary judge role semantics in `judge_assignments`.
- Typed park size/profile/publicity fields where migration cannot be proven through generic JSON alone.
- Park/organisation contact models if application fields are insufficient.
- Archive-only destinations for CMS/resource/content records.

Goal 5 should be evidence-driven: only add schema when reconciliation proves the current model cannot preserve or trace business data safely.

## Risks / open decisions

### Risks introduced by this plan

- Sidecar tables can become a dumping ground for raw legacy data. Mitigation: store identifiers, hashes, fingerprints, and links, not full unrestricted source rows.
- Entity-type strings can drift. Mitigation: use `migration_target_entity_types` plus repository existence validation for confirmed links.
- Reconciliation can create false confidence if source exports are incomplete. Mitigation: per-batch source table manifests, expected counts/hashes, and KBT signoff are mandatory.
- Missing-target reports can become inconsistent if each report invents its own expectations. Mitigation: generate them only from active `migration_mapping_rules`.
- Checksums can expose sensitive information if generated from predictable PII values alone. Mitigation: checksum complete canonical rows from controlled export files and avoid exposing checksum values outside internal tooling.
- Migration links may be mistaken for authoritative domain state. Mitigation: links are provenance only; domain tables remain source of truth for runtime behavior.
- Report item volume may become large. Mitigation: index by batch/report/severity/source/target and keep raw row payloads out of the tables.
- Cascading deletes would erase migration proof. Mitigation: use `NO ACTION`/`RESTRICT` foreign keys and status transitions.

### External data dependencies

- Current-system export files from `GreenFlag_Live`.
- Actual source primary key and natural key definitions for each export.
- Export checksums/manifests and row counts by source table.
- Baseline and compared batch selection rules for cross-batch reconciliation.
- File manifests and storage/archive locations for legacy documents.
- KBT confirmation of source ownership and field ownership.
- COI register owner/format.
- Finance fee schedule, VAT/currency treatment, invoice status semantics, and Business Central contract.
- Retention/archive policy for Umbraco Forms, CMS content, users/members, audit, consent, resources, and logs.

### KBT input still required

- Whether each legacy source group is `migrate`, `link_only`, `archive_only`, or excluded.
- Which `Contact`/`ParksContact` records are active operational contacts versus historical/archive contacts.
- How to interpret legacy `Award`, primary/secondary judge fields, confirmation flags, and historical allocation dates.
- Which `ParkApplicationNote.FormsValue` values must be structured versus archived.
- Which `ParkDocument` filename fields must become current documents, historical documents, evidence, result artifacts, or archive-only records.
- Which Umbraco Forms represent business submissions.
- Which public content/resources must remain available after replacement.
- Finance totals and invoice/legal expectations.

### Archive-only candidates

These should remain archive-only unless KBT provides a concrete operational requirement:

- Umbraco CMS infrastructure tables, document types, templates, macros, cache, webhooks, relations, and most node/version internals.
- Legacy auth secrets/passwords/API credentials.
- Research Centre `RC_*` tables unless confirmed in replacement scope.
- Public votes and resource analytics unless reporting continuity is required.
- CMS redirect/cache/server tables.
- Obsolete generic settings after active values are mapped into typed config.

### Potential conflicts with current schema/migrations

- `assessment_episodes` currently lacks explicit `operational_year` and `source_cycle_id` even though final architecture docs mention them. Goal 1 can link `CountrySeason`/source cycle records through sidecar references; Goal 5 should decide whether the domain schema needs explicit columns.
- `judge_assignments` currently lacks primary/secondary role metadata. Goal 1 can use link roles for legacy `Award.PrimaryJudgeID`/`SecondaryJudgeID`; Goal 5 should decide whether runtime schema needs participant role.
- `invoices` currently has `amount_marker = external_value_unavailable`, not full invoice amount/tax/currency/billing snapshot. Goal 1 should report finance totals and missing destinations; Goal 2 owns finance corrections.
- `document_assets.document_type` is narrow. Goal 1 can trace source documents; Goal 3 owns subtype taxonomy/storage mapping.
- `application_field_values` is flexible JSON. Goal 1 can link field values to legacy source rows, but important reportable fields may need a mapping manifest or typed destinations in Goal 5.
- Existing OpenAPI/contracts do not include migration metadata. Keep it that way unless an explicitly approved admin-only API is added.

## Acceptance criteria for the implementation agent

- A new sidecar migration schema exists for import batches, per-batch source table manifests, source table catalog, mapping rules, controlled target entity types, source records, entity links, archive records, reconciliation reports, and reconciliation report items.
- Migration provenance/reporting foreign keys use `NO ACTION`/`RESTRICT`, not cascading deletes; lifecycle corrections use status transitions and audit events.
- Import batches separate `environment` from `batch_kind`.
- The schema supports source system/database/schema/table, source primary key, natural key, source row checksum/hash, import batch, batch-specific expected row counts/source hashes, import status, target entity type/id, link role, confidence/status, reconciliation outcome, duplicate detection, deterministic missing target detection from mapping rules, orphan source detection, count reconciliation, baseline/compared batch checksum/hash reconciliation, archive-only provenance, and finance-total hooks.
- The schema supports many-to-many mapping between legacy rows and modern entities.
- `catalog_id` is required for source records unless the implementation creates an explicit `unclassified_pending_review` catalog path that blocks passed reconciliation and confirmed links until classification.
- `target_entity_type` is controlled through schema/service configuration, and confirmed links require target existence validation.
- Source fingerprints, report summaries, and report item JSON have sensitivity controls and reject raw source rows, secrets, and unnecessary PII.
- Archive-only handling is explicit through `migration_archive_records` or a first-class external archive manifest link.
- Import batch status changes, report completion, report item resolution, and confirmed-link promotion emit audit events.
- The implementation keeps `assessment_episodes` as the operational lifecycle root and does not move lifecycle state into `applications.status`.
- No legacy schema tables are copied as target architecture.
- Repository/service utilities exist for batch creation, per-batch source table manifest registration, source table registration, mapping-rule registration, target-entity-type registration, source record registration, idempotent re-registration, source-to-target linking, archive record registration, target-to-source tracing, reconciliation report generation, and report item resolution.
- Tests prove:
  - one source row maps to multiple modern target entities;
  - one modern target entity traces back to multiple source references;
  - duplicate source rows are detected;
  - orphan source rows are reported;
  - missing targets are reported deterministically from mapping rules;
  - repeated registration and link creation are idempotent;
  - per-batch manifests drive count/hash expectations;
  - confirmed links validate target existence and reject unknown target entity types;
  - archive-only rows require explicit archive provenance;
  - reconciliation reports capture counts and outcomes;
  - checksum/hash changes can be reported across baseline and compared batches;
  - privacy/sensitivity controls reject raw source rows, secrets, and unnecessary PII in fingerprints/report evidence;
  - audit events are emitted for batch status changes, report completion, report item resolution, and confirmed-link promotion;
  - migration metadata is not exposed to applicant or judge surfaces.
- The initial source table catalog coverage includes at least `Park`, `Organisation`, `Contact`, `ParksContact`, `ParkAwardApplication`, `Award`, `ParkApplicationNote`, `ParkDocument`, `Judge`, `JudgeApplication`, `JudgeConflictOfInterest`, `Fee`, `Invoice`, `EmailLog`, `Country`, `Region`, `County`, `Authority`, `CountrySeason`, and selected Umbraco Forms/resource/content records only when they represent business submissions, retained public content, auth/audit/consent obligations, or archive candidates.
- Existing DB migration checks, test suite, contracts/OpenAPI checks, Mystery redaction tests, and runtime safety posture remain green.
- The implementation agent documents any source group that cannot be mapped yet as KBT/external input required, not as an invented schema copy.
