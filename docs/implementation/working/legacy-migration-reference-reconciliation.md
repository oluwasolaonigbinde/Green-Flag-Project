# Legacy Migration Reference and Reconciliation

## Status

Goal 1 adds a backend-internal migration reference and reconciliation layer. It is a sidecar provenance system only: it does not copy the legacy schema, does not import real production data, and does not move lifecycle state into legacy-style fields.

`assessment_episodes` remains the operational lifecycle root. `applications` remains the applicant package/draft/submission state. Migration links explain where source rows landed; they do not become runtime source of truth.

## What Was Added

- SQL sidecar schema for:
  - `migration_source_table_catalog`
  - `migration_import_batches`
  - `migration_import_batch_source_tables`
  - `migration_target_entity_types`
  - `migration_mapping_rules`
  - `migration_source_records`
  - `migration_entity_links`
  - `migration_archive_records`
  - `migration_reconciliation_reports`
  - `migration_reconciliation_report_items`
- Backend-internal migration reference service/repository utilities for:
  - creating and statusing import batches;
  - registering source table catalog entries and per-batch manifests;
  - registering source records idempotently;
  - linking source records to modern entities;
  - tracing source-to-target and target-to-source;
  - registering archive provenance;
  - generating reconciliation reports and report items;
  - resolving reconciliation report items with audit.

## Guardrails

- Migration provenance/reporting foreign keys use `RESTRICT`/default `NO ACTION`; evidence is retired by status transition, not cascading delete.
- Expected row counts and source hashes live in per-batch manifests, not the global source table catalog.
- Missing-target reports are generated from active `migration_mapping_rules`.
- `target_entity_type` is controlled by `migration_target_entity_types`; confirmed links require target existence validation.
- Source fingerprints and report evidence are sanitized and sensitivity-classified. Do not store old passwords, credentials, raw EmailLog bodies, unrestricted source row payloads, raw document contents, or sensitive document paths.
- Archive-only rows require explicit `migration_archive_records` or external archive manifest links.
- Cross-batch checksum reports use baseline and compared batch IDs.
- Batch status changes, report completion, report item resolution, and confirmed-link promotion emit audit events.
- `catalog_id` is required for source records. Unknown source tables must be cataloged as `unclassified_pending_review`, which blocks passed reconciliation and confirmed links until classified.
- `environment` and `batch_kind` are separate so dry runs, UAT rehearsals, cutovers, and rollback rehearsals remain distinguishable.

## Initial Source Coverage

The migration catalog seeds coverage for the required legacy groups:

- Park, Organisation, Contact, ParksContact
- ParkAwardApplication, Award, ParkApplicationNote, ParkDocument
- Judge, JudgeApplication, JudgeConflictOfInterest
- Fee, Invoice, EmailLog
- Country, Region, County, Authority, CountrySeason
- Selected Umbraco Forms/content/audit candidates as `unclassified_pending_review` until KBT confirms business, retained-public-content, auth/audit/consent, or archive obligations.

## Goal 2-5 Integration

- Goal 2 finance should link `Fee` and `Invoice` rows to future invoice amount, tax, currency, billing snapshot, payment event, and Business Central/export records, then use finance total reconciliation summaries.
- Goal 3 documents should link legacy filename/file rows to `document_assets`, `assessment_evidence`, `result_artifacts`, or archive records, then reconcile file hashes and missing storage targets.
- Goal 4 contacts/judges/COI should link `Contact`, `ParksContact`, `Judge`, `JudgeApplication`, and `JudgeConflictOfInterest` rows to user/contact/assessor/COI targets or archive records.
- Goal 5 model corrections should use reconciliation failures as evidence before adding typed domain schema, such as operational year/source cycle, assignment role metadata, contact models, or park profile fields.

## Visibility

No applicant, judge, public, or ordinary operational DTO includes migration metadata. The layer is internal and admin/go-live evidence oriented. Any future admin API or export must go through explicit RBAC, redaction, and contract review.
