# Goal 5 High-Risk Model Corrections

Status: READY for Backend Track A Goal 5.

## Implemented model corrections

- `assessment_episodes` remains the operational lifecycle root.
- `applications` remains applicant package/draft/submission state only.
- `assessment_episodes.operational_year` is stored from the operational `award_cycle_id`.
- `assessment_episodes.source_cycle_id` references `award_cycles` for carryover provenance/reporting only.
- Operational uniqueness remains anchored on the existing `park_id + award_cycle_id + episode_type` constraint.
- Standard-only MVP continues to use `award_track_code`; `award_category_id` is deferred unless separately approved.
- `cycle_window_id`, `award_cycle_id`, and `episode_type` are validated together through a composite foreign key.
- `judge_assignments.assignment_role` is assignment-level metadata, not a global user role.
- `judge_assignments.required_for_contact_reveal` gates Full Assessment reveal; Mystery reveal remains hard false.
- `park_area_measurements` records source-tracked current/history area.
- `application_area_snapshots` records immutable application-time area for fee matching and historical reconciliation.

## Migration provenance

Domain tables remain runtime source of truth. Goal 5 does not add direct runtime foreign keys from domain tables to `migration_source_records`.

Migration provenance must continue to use Goal 1 sidecar records:

- `migration_source_table_catalog` for source tables.
- `migration_mapping_rules` with `mapping_version = legacy-field-mapping.v1` where imports use the Goal 5 manifest.
- `migration_source_records` for imported source rows.
- `migration_entity_links` for links to `assessment_episode`, `judge_assignment`, `park_area_measurement`, `application_area_snapshot`, and other domain entities.
- `migration_archive_records` for raw legacy scoring/form payloads and archive-only public/CMS fields.
- `migration_reconciliation_reports/items` for ambiguous assignment-role rows and unclassified `AdditionalField` definitions.

## Manifest/config

`packages/db/config/legacy-field-mapping.v1.json` classifies legacy `Park`, `ParkAwardApplication`, `ParkApplicationNote`, public/CMS, ResetLog, Votes/ParksVote, Settings, and InvoicingOrganisation inputs into approved Goal 5 categories.

Unknown `AdditionalField`, `AdditionalFieldData`, or `ContactTypeAdditionalField` definitions must block passed reconciliation until classified.

## Contract posture

No ordinary applicant, judge, public, or operational DTO may expose:

- migration provenance internals,
- raw legacy `FormsValue` payloads,
- source-cycle internals that reveal Mystery,
- assignment-role metadata that leaks Mystery.

Any future DTO/OpenAPI change in this area requires deliberate contract review.

## Verification

Goal 5 implementation passed:

- migration convention check,
- clean migration apply check against disposable PostgreSQL,
- DB integration suite,
- seed safety check,
- typecheck,
- lint,
- unit test suite.

## Follow-on goals

- Goal 2 should consume `application_area_snapshots` for fee matching without recalculating historic fees from later current-area overrides.
- Goal 3 should consume the manifest and archive/provenance hooks for documents and raw scoring/form assets.
- Goal 4 should consume assignment-level role provenance for contact/judge/COI migration without copying old schema roles.
