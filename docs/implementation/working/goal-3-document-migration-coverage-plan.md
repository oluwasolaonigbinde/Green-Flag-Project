# Goal 3 Document Migration Coverage Plan

Status: PLAN ONLY

Migration reservation checkpoint: repo inspection for this planning pass found migrations ending at `packages/db/migrations/0023_finance_migration_coverage.sql`, so Goal 3A should reserve `packages/db/migrations/0024_document_migration_schema_foundation.sql` if it is still the next available migration at implementation time. Re-check migration numbering before writing any migration.

## Executive recommendation

Implement Goal 3 as an additive document asset, ownership, provenance, and reconciliation layer. Do not copy legacy filename columns into modern runtime tables and do not rebuild `ParkDocument`, judge filename fields, or Umbraco media internals as-is.

The target architecture should keep the current management-plan upload/versioning behavior, then generalize the model enough to cover legacy filename-only references, generated artifacts, assessor/judge documents, public/resource classifications, and archive-only files. Every document must resolve through an owning context before access, and applicant/judge/public DTOs must continue to hide raw storage keys, raw legacy paths, raw sensitive filenames, raw scores, raw `FormsValue`, internal archive locations, and Mystery-sensitive metadata.

Recommended implementation shape:

- Add a controlled, versioned document subtype taxonomy.
- Extend document asset metadata with subtype, retention, sensitivity, redaction, import status, and source-origin fields.
- Add modern document ownership links so a file can belong to an application, management-plan version, assessment evidence item, result artifact, invoice artifact, export run, assessor profile, public resource, or archive-only record without moving lifecycle ownership into legacy-shaped columns.
- Add an internal legacy file reference/provenance table that records source table, source column, source primary key, legacy filename/path evidence, import/archive status, hash/size/mime when available, owner resolution, subtype, visibility, retention, sensitivity, and Goal 1 migration links.
- Use Goal 1 reconciliation reports to prove filename row counts, owner resolution, subtype classification, missing files, duplicate hashes, archive-only decisions, and source-to-target traceability.
- Coordinate invoice/export/certificate/result artifacts with Goal 2 facts and keep Goal 4 responsible for person/judge/contact/onboarding workflow decisions.

This is not production storage approval. Real files, production buckets, scanner behavior, retention/legal positions, invoice PDF wording, certificate wording, and KBT approvals remain external gates.

## Implementation slicing

The architecture direction above is approved only as a staged direction. Do not implement Goal 3 as one broad pass. Execute it as small slices with explicit gates between them.

### Slice dependency order

1. Goal 3A - Additive schema foundation only.
2. Goal 3B - Service/repository validation layer.
3. Goal 3C - Reconciliation/reporting integration.
4. Goal 3D - Runtime document surfaces.
5. Goal 3E - Artifact/domain integrations.

Each later slice must preserve all previous behavior and must not use a schema object added by an earlier slice as a reason to expose new runtime data without an explicit contract/API review.

### Goal 3A - Additive schema foundation only

Purpose: create the inert DB foundation for document subtype classification, owner-context links, and internal legacy file-reference provenance. This slice must not change runtime behavior.

Current evidence inspected for this slice:

- Current migrations end at `0023_finance_migration_coverage.sql`; implementation must re-check before reserving the next number.
- `0006_documents_management_plan_upload_link_versioning.sql` owns `document_assets`, `document_upload_sessions`, and `document_upload_chunks`.
- `0013_postgres_read_model_normalisation_hardening.sql` adds document queue/upload-session indexes.
- `0016_db_first_persistence_safety_indexes.sql` removes the unique per-application SHA-256 index and keeps duplicate detection repository-led.
- Current applicant document routes use `/documents`, `/documents/upload-sessions`, chunk acknowledgement, upload completion, signed access, and version listing.
- Current contracts expose `management_plan` and `supporting_document` as the only document types and applicant-safe document DTOs omit storage provider/key.
- Existing tests cover chunked upload, replacement/archive behavior, signed access, audit failure, and Mystery-safe redaction.

In scope:

- Add a document subtype catalog seeded/versioned as `document-subtypes.v1`, if the repo's migration/seed pattern supports doing so safely.
- Add optional, additive metadata columns to `document_assets` only where current inserts can continue without modification.
- Add `document_asset_ownerships` for future owner-context resolution.
- Add an internal migration file-reference/provenance table for legacy filename/path evidence.
- Add indexes and constraints for schema/catalog/provenance integrity.
- Add schema/catalog/provenance tests only where appropriate.

Out of scope:

- No runtime behavior changes.
- No public/applicant/judge DTO changes.
- No OpenAPI surface changes.
- No signed-download behavior changes.
- No upload route behavior changes.
- No changes to management-plan upload/version/archive semantics.
- No invoice/export/certificate artifact behavior changes.
- No assessment evidence migration.
- No service/repository validation layer beyond what is needed to compile schema tests.
- No real production file import.
- No production storage/scanner/legal assumptions.
- No invoice wording, certificate wording, or KBT decision invention.

Schema proposal for Goal 3A:

- Add `document_subtypes`:
  - `code text primary key`
  - `taxonomy_version text not null`
  - `label text not null`
  - `status text not null`
  - `coarse_document_type text not null`
  - `default_visibility text not null`
  - `default_redaction_classification text not null`
  - `default_retention_category text not null`
  - `default_sensitivity_classification text not null`
  - `storage_policy text not null`
  - `allowed_owner_types text[] not null default '{}'`
  - `notes text`
  - timestamps
- Seed `document-subtypes.v1` with the controlled codes from this plan.
- Add nullable `document_assets.document_subtype` referencing `document_subtypes(code)`.
- Add nullable additive metadata columns to `document_assets` only if safe:
  - `source_origin`
  - `retention_category`
  - `sensitivity_classification`
  - `redaction_classification`
  - `import_status`
  - `display_filename`
  - `filename_sensitivity`
  - `original_filename_hash`
- Do not make these new columns `not null` in Goal 3A unless existing rows and current insert paths are guaranteed to remain green without service changes.
- Do not remove, rename, or tighten existing `document_assets` columns.
- Do not change the existing `document_type` check constraint in Goal 3A unless the implementation proves all current insert paths, DTOs, fixtures, OpenAPI, and tests remain unchanged. Prefer keeping `document_type` as the existing coarse compatibility field and adding nullable subtype for future slices.
- Add `document_asset_ownerships`:
  - `id uuid primary key`
  - `document_asset_id uuid not null references document_assets(id)`
  - `owner_type text not null`
  - `owner_id uuid not null`
  - `owner_context_role text not null`
  - `required_for_access boolean not null default true`
  - `visibility_override text`
  - `redaction_override text`
  - `created_at_utc`
  - `created_by_process`
  - `notes`
- Use service-layer validation for polymorphic `owner_id` existence in Goal 3B; Goal 3A should not attempt dynamic SQL foreign keys.
- Add an internal migration file-reference/provenance table, suggested name `migration_document_file_references`:
  - `id uuid primary key`
  - `import_batch_id uuid references migration_import_batches(id)`
  - `source_record_id uuid references migration_source_records(id)`
  - `migration_entity_link_id uuid references migration_entity_links(id)`
  - `source_table text not null`
  - `source_column text not null`
  - `source_primary_key text not null`
  - `legacy_filename text`
  - `legacy_filename_hash text`
  - `original_relative_path text`
  - `original_relative_path_hash text`
  - `resolved_storage_key text`
  - `external_archive_location text`
  - `sha256 text`
  - `file_size_bytes bigint`
  - `mime_type text`
  - `import_status text not null`
  - `missing_file_reason text`
  - `owner_entity_type text`
  - `owner_entity_id uuid`
  - `document_subtype text references document_subtypes(code)`
  - `visibility_classification text`
  - `redaction_classification text`
  - `retention_category text`
  - `sensitivity_classification text`
  - `archive_record_id uuid references migration_archive_records(id)`
  - timestamps and notes
- Keep this table internal-only. It is for migration evidence and reconciliation, not a runtime DTO source.

Goal 3A tests to plan:

- Migration check passes with the new additive migration.
- Existing `document_assets` inserts still work without setting `document_subtype` or new metadata columns.
- Existing document upload/session/chunk tests still pass unchanged.
- Existing applicant DTO/OpenAPI contract tests remain unchanged.
- Subtype catalog contains every required `document-subtypes.v1` code.
- Unknown non-null `document_assets.document_subtype` is rejected by FK/constraint.
- `document_asset_ownerships` rejects ownership rows for missing `document_assets`.
- `migration_document_file_references` rejects unknown document subtype when a subtype is provided.
- Provenance table enforces required source table/column/primary-key/import-status fields.
- Schema tests confirm no existing document columns were removed or renamed.

Goal 3A acceptance gate:

- Only additive schema/catalog/provenance changes are present.
- Current management-plan upload, duplicate detection, replacement/archive, signed access, and redaction behavior is unchanged.
- No runtime route, DTO, OpenAPI, signed access, invoice/export/certificate, assessment evidence, or frontend changes are included.
- No real file import or production storage/scanner/legal assumptions are introduced.

### Goal 3B - Service/repository validation layer

Purpose: make the Goal 3A schema safe to use through internal service/repository methods, still without changing public/applicant/judge runtime surfaces.

In scope:

- Subtype validation against the catalog.
- Owner-context validation for known owner types.
- Visibility, redaction, retention, and sensitivity default resolution from subtype catalog.
- Archive-only classification support.
- Internal-only registration paths for document ownerships and migration file references.
- Internal audit events for migration/document classification commands where existing audit patterns require them.
- Repository methods that refuse ownerless runtime documents unless explicitly archive-only.

Out of scope:

- No applicant/judge/public DTO changes.
- No signed-download behavior changes.
- No invoice/export/certificate runtime behavior.
- No assessment evidence migration.
- No production file import.

Goal 3B tests:

- Valid subtype plus valid owner creates internal ownership.
- Unknown subtype fails closed.
- Unknown owner type or unresolved owner fails closed unless archive-only is explicit.
- Defaults resolve deterministically from the subtype catalog.
- Archive-only references can be registered without creating a runtime document asset.
- Sensitive filename/path inputs are accepted only in internal provenance paths, never in public DTO serializers.

Goal 3B acceptance gate:

- Internal services can create valid classifications and reject invalid ones.
- Existing management-plan behavior and DTOs remain unchanged.
- No reconciliation reports or runtime document surfaces depend on unvalidated owner contexts.

### Goal 3C - Reconciliation/reporting integration

Purpose: connect legacy filename coverage to the Goal 1 migration layer and produce actionable document reconciliation reports.

In scope:

- Goal 1 mapping rules for source table/column to document subtype and owner expectations.
- Source filename row-count coverage.
- Missing file references.
- Unresolved owners.
- Duplicate hash reporting.
- Missing subtype/visibility/redaction/retention/sensitivity reporting.
- Archive-only confirmations.
- Source-to-target and target-to-source traceability.
- Mystery-sensitive filename/metadata risk reporting.

Out of scope:

- No public/applicant/judge DTO changes.
- No real production file import.
- No runtime document access changes.
- No domain artifact integration beyond reporting coverage.

Goal 3C tests:

- Legacy filename rows produce expected report counts.
- Missing files produce report items instead of false successful links.
- Duplicate hashes produce duplicate report items.
- Unresolved owners block passed reconciliation.
- Archive-only confirmations suppress missing-target failures only when mapping rules allow archive-only handling.
- Source-to-target and target-to-source traceability can be queried for document assets, archive records, and external archive manifests.

Goal 3C acceptance gate:

- Reconciliation can prove coverage for legacy filename-only fields without importing real production files.
- Report failures are specific enough for storage/export/KBT/legal follow-up.
- Existing runtime behavior remains unchanged.

### Goal 3D - Runtime document surfaces

Purpose: expose owner-context-aware document behavior only after schema, validation, and reconciliation are proven.

In scope:

- Runtime use of subtype and ownership metadata where contract review approves it.
- Signed access resolving through owner context.
- Applicant/admin/judge read models that preserve redaction rules.
- Management-plan behavior preservation while adding approved link/subtype metadata.
- Contract/OpenAPI changes only after explicit review.

Out of scope:

- No artifact/domain integrations that belong to Goal 3E.
- No broad public exposure of provenance or storage internals.
- No raw legacy filename/path surfaces.

Goal 3D tests:

- Signed access fails when owner context is missing.
- Applicant cannot access admin-only, judge-only, or Mystery-restricted documents.
- Judge access follows assigned Full Assessment release/acceptance rules.
- Applicant/judge/public payloads hide provenance, storage keys, raw legacy paths, raw sensitive filenames, raw scores, raw `FormsValue`, and Mystery metadata.
- Current management-plan upload/version/archive tests remain green.

Goal 3D acceptance gate:

- Runtime document access is owner-context based.
- Public/applicant/judge surfaces remain safe.
- Contract changes are reviewed and covered by tests.

### Goal 3E - Artifact/domain integrations

Purpose: integrate the document foundation with domain-specific artifact areas after the core document layer is proven. Treat this as a family of small sub-slices, not one pass.

Recommended sub-slices:

- Goal 3E.1 - invoice artifacts and manual/offline invoice artifact shells, coordinated with Goal 2.
- Goal 3E.2 - finance export files, coordinated with `export_jobs` and `finance_export_runs`.
- Goal 3E.3 - result reports and certificates, coordinated with result/certificate publication rules.
- Goal 3E.4 - assessment evidence files, photos, voice notes, and transcripts.
- Goal 3E.5 - assessor/judge documents, coordinated with Goal 4 identity/onboarding decisions.
- Goal 3E.6 - public/CMS resource classification, without rebuilding Umbraco internals.

In scope:

- Domain-owned document asset links.
- Retention/sensitivity/visibility per domain.
- Archive provenance and reconciliation coverage.
- Signed access only through domain owner context.

Out of scope:

- No invoice wording, VAT/legal wording, certificate wording, KBT decisions, production storage, or scanner assumptions.
- No Goal 4 identity/contact/onboarding decisions inside Goal 3E.
- No Umbraco CMS rebuild.

Goal 3E tests:

- Each sub-slice includes its own owner-context, redaction, signed-access, provenance, and reconciliation tests.
- Invoice/export artifacts do not become finance facts.
- Result/certificate artifacts do not expose raw scores/internal scoring artifacts.
- Assessment evidence does not leak Mystery-sensitive metadata.
- Assessor/judge documents do not bypass Goal 4 ownership decisions.
- Public/CMS resources are classified without copying CMS internals into backend runtime tables.

Goal 3E acceptance gate:

- Each domain integration is independently shippable and testable.
- No artifact integration weakens existing document, finance, result, assessment, or Mystery redaction rules.

## Existing repo evidence

### Current document assets, upload sessions, and chunks

The repo already has a lower-env document foundation:

- `document_assets` stores application/episode/park-linked file metadata, `document_type`, filename, content type, byte size, SHA-256, storage provider/key, status, visibility, version/current flags, replacement links, uploaded actor, scan status, and timestamps.
- `document_upload_sessions` stores document upload intent, file metadata, SHA-256, total chunks, uploaded count, status, idempotency key, expiry, and optimistic version.
- `document_upload_chunks` records accepted chunk indexes and retry-safe chunk acknowledgement metadata.
- Current `document_type` values are only `management_plan` and `supporting_document`.
- Current content type support is PDF and DOCX in the shared contract. The source requirements also call for PPT/PPTX and URL-link support, so those are current gaps to plan, not evidence of delivered runtime behavior.

### Current management plan behavior

Delivered Slice 5 behavior includes:

- Applicant document listing for the management-plan slot.
- Lower-env chunked upload sessions and retry-safe chunk acknowledgement.
- 50 MB max byte-size validation.
- SHA-256 duplicate detection.
- Replacement that archives the previous current management plan and marks the new asset current.
- Version listing for applicant-owned management-plan versions.
- Signed download/read access responses after ownership and visibility checks.
- Audit events for data-changing document operations and access attempts.
- Applicant-safe DTOs that omit raw storage keys and storage providers.
- Mystery redaction tests that hide Mystery-restricted document filenames and block applicant access.

Current implementation detail to preserve: duplicate detection is service/repository hash behavior, not a canonical mutable Map or a unique runtime persistence shortcut. Migration `0016_db_first_persistence_safety_indexes.sql` changed the SHA index to support repository-level duplicate decisions.

Current gap to verify during implementation: source requirements say a management plan can be uploaded after submission until judge allocation. Existing document upload behavior should be explicitly tested against the submission/allocation boundary before Goal 3 is marked ready.

### Current document replacement and archive behavior

The DB repository archives the previous current management plan by setting it non-current, marking it `ARCHIVED`, linking it to the replacing document, and inserting the new `AVAILABLE` current version. Applicant tests already cover replacement and archive metadata.

Goal 3 should preserve this behavior and broaden archive semantics without turning archive state into a legacy filename field copy.

### Current visibility and safe access behavior

Current document visibility values are:

- `APPLICANT_PRIVATE`
- `APPLICANT_AND_ADMIN`
- `ASSIGNED_JUDGES`
- `ADMIN_ONLY`
- `PUBLIC_AFTER_RELEASE`
- `MYSTERY_RESTRICTED`

Applicant routes forbid applicant access to `ADMIN_ONLY` and `MYSTERY_RESTRICTED` documents. Redaction code suppresses Mystery-sensitive applicant document projections and signed-document metadata. Existing applicant tests assert no lower-env storage key/provider or Mystery terms leak in applicant document payloads.

Goal 3 must keep signed access scoped through the document owner context and must not expose raw storage keys, raw legacy paths, raw sensitive filenames, internal archive locations, or Goal 1 provenance to applicant, judge, or public DTOs.

### Current assessment evidence, result artifact, and certificate behavior

Assessment scoring already has `assessment_evidence` with `evidence_type` values `photo`, `note`, and `document`, plus filename, visibility, storage provider/key, assessment visit, judge assessment, and score-entry links. Evidence mutations require accepted judge assignments in the DB repository; read access follows release/acceptance rules.

Result publishing already has `result_artifacts` with `certificate_shell` and `result_summary` artifact types, storage provider/key, public visibility flag, and dedupe support. Applicant result projections are intentionally safe and do not expose raw scores or internal artifact storage keys.

Goal 3 should connect these surfaces to the subtype/ownership/provenance model and review any storage-key exposure in admin/internal contracts before adding new public or judge surfaces.

### Current invoice/export artifact behavior after Goal 2

Goal 2 added finance facts and exportable data:

- fee schedules and fee schedule lines
- expanded invoices and invoice lines
- payment events
- finance export runs

Current `export_jobs` and `finance_export_runs` store lower-env storage keys for generated export files. There is no approved invoice PDF/rendered artifact storage model yet. Goal 2 deliberately left rendered invoice artifacts/PDF/document storage to Goal 3.

Goal 3 should own file artifact storage, signed access, visibility, retention, and archive provenance for invoice artifacts and finance export files. Goal 2 remains the owner of invoice facts, payment events, exportable finance state, and Business Central/payment-provider coordination.

### Current assessor/judge document support

The repo has `assessor_profiles`, judge assignment, availability, capacity, allocation, visit, and scoring support. It does not currently have first-class assessor/judge profile document assets for CV, application file, cover letter, or personal photo filename migration.

Goal 3 should provide document asset/subtype/storage/archive support for assessor profile and judge onboarding files. Goal 4 should decide identity/contact/judge onboarding workflow mapping, person ownership, and COI/contact semantics.

### Current message attachment support

Current messaging tables and repositories model threads and entries, including Mystery suppression, but no message attachment table or document-asset link was found. Goal 3 should only plan message attachment ownership if the existing messaging model is extended later; it should not invent an attachment workflow during this planning goal.

### Current gaps against legacy filename-only migration and production retention

The main gaps are:

- No controlled subtype taxonomy beyond `management_plan` and `supporting_document`.
- No internal legacy filename/path reference model.
- No source table/column/primary-key/file-reference mapping for legacy filename-only columns.
- No generalized document ownership link table.
- No import/archive status for missing files, external archive-only records, or manifest-only references.
- No explicit retention category or sensitivity classification on document assets.
- No subtype-level visibility/redaction defaults.
- No direct mapping for `ParkApplicationNote.FeedbackFile`.
- No destination for judge CV/application/cover-letter/photo files.
- No invoice artifact/PDF model.
- No document asset linkage for export files beyond existing storage key fields.
- No classification model for Umbraco media/resource files.
- No real production storage, virus scanning, signed URL adapter, retention lifecycle, or export manifest input.

## Proposed schema/model corrections

This section describes future implementation direction only.

### Document subtype catalog

Add a controlled, versioned subtype catalog, either as a seeded DB table plus shared contract enum, or as a DB-backed catalog with generated shared types after contract review.

Proposed fields:

- `code`
- `taxonomy_version`
- `label`
- `status`
- `coarse_document_type`
- `allowed_owner_types`
- `default_visibility`
- `default_redaction_classification`
- `default_retention_category`
- `default_sensitivity_classification`
- `storage_policy`
- `allowed_mime_types`
- `max_byte_size`
- `migration_required`
- `notes`
- `created_at_utc`
- `updated_at_utc`

The first taxonomy version should be treated as `document-subtypes.v1`.

### Document asset evolution

Keep existing management-plan behavior, but extend the modern asset model so `document_assets` can represent more than application-level management plans.

Recommended additions:

- `document_subtype`
- `source_origin` with values such as `user_upload`, `url_link`, `generated_artifact`, `legacy_import`, `external_archive`, `metadata_only`
- `import_status` for migration-created references
- `retention_category`
- `sensitivity_classification`
- `redaction_classification`
- `display_filename`
- `filename_sensitivity`
- `original_filename_hash`
- `external_url_status` and checked-at metadata for approved URL-link management plans
- `content_hash_algorithm`, keeping SHA-256 as the required default when bytes are available
- `migration_file_reference_id` or equivalent internal provenance pointer

Existing `filename` should not become an authoritative legacy filename field. For imported legacy files, use a safe display filename only when it is approved for the current viewer. Preserve raw/sensitive legacy filename evidence only in internal migration/file-reference storage with strict access controls or as salted/hash evidence when raw values are not needed.

### Modern ownership links

Add a document ownership/link model so every file resolves through an owning context before access.

Recommended table: `document_asset_ownerships`.

Proposed fields:

- `id`
- `document_asset_id`
- `owner_type`
- `owner_id`
- `owner_context_role`
- `required_for_access`
- `visibility_override`
- `redaction_override`
- `created_at_utc`
- `created_by_process`
- `notes`

Required owner types:

- `application`
- `application_section`
- `application_field`
- `management_plan_version`
- `application_supporting_document`
- `assessment_episode`
- `assessment_visit`
- `judge_assessment`
- `assessment_score_entry`
- `assessment_evidence`
- `result_artifact`
- `certificate`
- `invoice_artifact`
- `finance_export_artifact`
- `assessor_profile_document`
- `judge_application_document`
- `message_attachment`
- `public_resource`
- `public_profile_media`
- `archive_only_record`

The repository/service layer must validate owner existence before creating a confirmed ownership link. Access checks must first load the owner context, then evaluate RBAC, assignment status, visibility, redaction, and signed-download policy.

### Legacy file reference/provenance model

Add an internal-only legacy file reference table. Suggested name: `migration_document_file_references`.

Required fields:

- `id`
- `import_batch_id`
- `source_record_id`
- `migration_entity_link_id` when linked to a target
- `source_table`
- `source_column`
- `source_primary_key`
- `legacy_filename`
- `legacy_filename_hash`
- `original_relative_path`
- `original_relative_path_hash`
- `resolved_storage_key`
- `external_archive_location`
- `sha256`
- `file_size_bytes`
- `mime_type`
- `import_status`
- `missing_file_reason`
- `owner_entity_type`
- `owner_entity_id`
- `document_subtype`
- `visibility_classification`
- `redaction_classification`
- `retention_category`
- `sensitivity_classification`
- `archive_record_id`
- `created_at_utc`
- `updated_at_utc`
- `notes`

Important constraints:

- Raw legacy paths and raw sensitive filenames are internal migration evidence only.
- Public, applicant, and judge DTOs must never expose raw legacy paths, raw storage keys, internal archive locations, or raw sensitive filenames.
- If raw filename/path evidence is not required for runtime support, store salted/hash evidence in Goal 1 fingerprints and place raw values only in a controlled external archive manifest.
- `import_status` should include at least `pending_manifest`, `metadata_only`, `imported`, `linked_existing_asset`, `external_archive_only`, `missing_file`, `owner_unresolved`, `subtype_unresolved`, `visibility_unresolved`, `rejected_sensitive`, and `intentionally_not_needed`.
- Goal 1 `assertMigrationSafeJson` currently rejects risky key names in generic fingerprints. Goal 3 should use dedicated typed columns and sanitized fingerprints rather than stuffing raw paths/storage keys into generic JSON.

### Generated artifact links

Add or extend artifact/document links for:

- invoice artifacts or manual/offline invoice artifact shells
- finance export files
- result reports
- certificates
- public map/export outputs

Generated files should become document assets with subtype, owner link, retention, sensitivity, and visibility. Existing domain facts remain in their own tables; document storage must not become the source of truth for invoice/payment/result decisions.

### Assessment evidence alignment

Plan either:

- Add hash, size, mime, subtype, retention, sensitivity, and document-asset link columns to `assessment_evidence`, or
- Move stored file metadata into `document_assets` and keep `assessment_evidence` as the assessment-context row linked to the asset.

The second option is cleaner for consistency, but implementation should preserve existing assessment evidence contracts while migrating safely.

## Proposed document subtype taxonomy

| Subtype | Primary owners | Default visibility/redaction | Migration notes |
| --- | --- | --- | --- |
| `management_plan` | application, management plan version, assessment episode | applicant/admin; assigned judges after release/acceptance; Mystery-safe metadata | Preserve current upload/version/archive/hash behavior. Map old management-plan filenames here. |
| `constitution` | application supporting document, application field | applicant/admin; assigned judges if required | Map old constitution filename fields and `ParkDocument.ConstitutionPlan`. |
| `lease` | application supporting document, application field | applicant/admin; assigned judges if required | Map old lease filename fields and `ParkDocument.Lease`. |
| `insurance` | application supporting document, application field | applicant/admin; assigned judges if required | Map old insurance filename fields and `ParkDocument.Insurance`. |
| `risk_assessment` | application supporting document, application field | applicant/admin; assigned judges if required | Map old risk-assessment filename fields and `ParkDocument.RiskAssessment`. |
| `financial_statement` | application supporting document, application field | admin/applicant; judge access only if approved | Financial sensitivity should default higher than ordinary supporting docs. |
| `plan_of_green_space` | application supporting document, application field | applicant/admin; assigned judges if required | Map old plan-of-green-space fields. |
| `travel_directions` | application supporting document, application field | applicant/admin; assigned judges if required | Treat as potentially location-sensitive in Mystery contexts. |
| `previous_feedback_response` | application field, application supporting document, assessment episode | applicant/admin; assigned judges when assessment context allows | New runtime response is typed in source requirements. Legacy files can map here or archive-only. |
| `conservation_plan` | application supporting document, application field | applicant/admin; assigned judges if required | Map old conservation/site heritage document fields. |
| `heritage_response` | application supporting document, application field | applicant/admin; assigned judges if required | Map old GHA/heritage feedback response files. |
| `innovation_supporting_document` | application supporting document, application field | applicant/admin; assigned judges if required | Map old innovation supporting document files. |
| `park_photo` | application supporting document, public profile media after approval | applicant/admin; public only after explicit approval/release | Map `PhotoName1/2/3` and `ParkDocument.Photo1/2/3`. |
| `feedback_report` | result artifact, assessment episode, archive record | applicant-safe result surface only after approval; admin internal otherwise | Map `ParkApplicationNote.FeedbackFile`; must not expose raw scores or internal scoring artifacts. |
| `assessment_photo` | assessment evidence, judge assessment, assessment visit | admin/assessor; Mystery restricted when applicable | Evidence photo subtype; applicant access only through approved result/report surfaces. |
| `assessment_evidence_file` | assessment evidence, score entry, judge assessment | admin/assessor; Mystery restricted when applicable | Generic evidence file subtype. |
| `voice_note` | assessment evidence, judge assessment | admin/assessor; Mystery restricted when applicable | Treat audio as personal/sensitive; transcript linkage required if generated. |
| `transcript` | assessment evidence, judge assessment | admin/assessor; Mystery restricted when applicable | Generated from voice notes; may contain sensitive comments. |
| `assessor_cv` | assessor profile document, judge onboarding archive | admin and assessor-own private | Goal 3 owns storage/archive; Goal 4 owns identity/onboarding mapping. |
| `assessor_application` | assessor profile document, judge application document | admin and assessor-own private | Map judge application filename fields. |
| `assessor_cover_letter` | assessor profile document, judge application document | admin and assessor-own private | Map judge cover-letter filename fields. |
| `assessor_photo` | assessor profile document, public profile media if approved | assessor-own/admin; public only by explicit approval | Map personal photo filename fields. |
| `invoice_artifact` | invoice, finance package, application | applicant/admin if approved; finance/internal otherwise | Goal 2 owns invoice facts; Goal 3 owns rendered artifact if approved. |
| `certificate` | certificate, result artifact, assessment episode | applicant/admin; public only after release/approval | Keep certificate wording/template external. Certificates have long/permanent retention. |
| `result_report` | result artifact, assessment episode | applicant-safe published report or admin internal variant | No raw scores/internal scoring artifacts in applicant payloads. |
| `export_file` | export job, finance export run, public map export | admin/internal; public only if explicitly public map output | Link existing export storage keys to document provenance and retention. |
| `public_resource` | backend-owned public resource or CMS adapter | public after approval; admin-managed | Only for retained backend-owned public content. Do not rebuild Umbraco internals. |
| `public_profile_media` | park profile, assessor profile if approved | public after approval; owner/admin before release | Use for public park/profile media where backend ownership is approved. |
| `archive_only_file` | migration archive record, external archive manifest | no runtime signed download by default | For legacy references retained for evidence but not used by modern runtime. |

Subtype names should follow these codes unless implementation-time contract review finds an existing repo enum that should be preserved for backward compatibility. If `document_type` remains, it should be a coarse compatibility field; subtype should become the meaningful taxonomy.

## Source filename/path mapping

The backend should preserve legacy source references without making legacy filenames authoritative runtime state.

### Required provenance fields

For every filename-only source reference, capture:

- legacy source table
- legacy source column
- legacy source primary key
- legacy filename
- original relative path, if known
- resolved storage key, if imported
- external archive location, if not imported
- SHA-256/content hash where file bytes are available
- file size
- mime type
- import status
- missing-file reason
- owner entity
- document subtype
- visibility/redaction classification
- retention category
- sensitivity classification
- Goal 1 `migration_source_records` and `migration_entity_links` provenance

### Legacy field mapping plan

| Legacy source | Planned subtype | Planned owner/context | Notes |
| --- | --- | --- | --- |
| `ParkAwardApplication.PhotoName1` | `park_photo` | application supporting document, application field, park/profile media if approved | Do not expose raw legacy filename when sensitive. |
| `ParkAwardApplication.PhotoName2` | `park_photo` | application supporting document, application field, park/profile media if approved | Same as PhotoName1. |
| `ParkAwardApplication.PhotoName3` | `park_photo` | application supporting document, application field, park/profile media if approved | Same as PhotoName1. |
| `ParkAwardApplication` management plan filename fields | `management_plan` | application, management-plan version, assessment episode | Link to current/archived version or archive-only if file unavailable. |
| `ParkAwardApplication` constitution file | `constitution` | application supporting document/field | Supporting document subtype. |
| `ParkAwardApplication` lease file | `lease` | application supporting document/field | Supporting document subtype. |
| `ParkAwardApplication` insurance file | `insurance` | application supporting document/field | Supporting document subtype. |
| `ParkAwardApplication` risk assessment file | `risk_assessment` | application supporting document/field | Supporting document subtype. |
| `ParkAwardApplication` financial statements file | `financial_statement` | application supporting document/field | Higher sensitivity default. |
| `ParkAwardApplication` plan of green space | `plan_of_green_space` | application supporting document/field | Supporting document subtype. |
| `ParkAwardApplication` travel directions | `travel_directions` | application supporting document/field | Apply Mystery/location-sensitive checks. |
| `ParkAwardApplication` response to judges feedback | `previous_feedback_response` | application field/supporting document | Modern runtime should prefer typed response where applicable. |
| `ParkAwardApplication` conservation/site heritage documents | `conservation_plan` | application supporting document/field | If the source field is heritage-specific, map to `heritage_response`. |
| `ParkAwardApplication` GHA response to judges feedback | `heritage_response` | application supporting document/field | Preserve as subtype, not old column. |
| `ParkAwardApplication` innovation supporting document | `innovation_supporting_document` | application supporting document/field | Supporting document subtype. |
| `ParkDocument.ManagementPlan` | `management_plan` | application, management-plan version, assessment episode | Prefer resolved modern application/episode owner. |
| `ParkDocument.ConstitutionPlan` | `constitution` | application supporting document/field | Link or archive-only. |
| `ParkDocument.Lease` | `lease` | application supporting document/field | Link or archive-only. |
| `ParkDocument.FinancialStatements` | `financial_statement` | application supporting document/field | Higher sensitivity. |
| `ParkDocument.PlanOfGreenSpace` | `plan_of_green_space` | application supporting document/field | Link or archive-only. |
| `ParkDocument.Insurance` | `insurance` | application supporting document/field | Link or archive-only. |
| `ParkDocument.RiskAssessment` | `risk_assessment` | application supporting document/field | Link or archive-only. |
| `ParkDocument.TravelDirections` | `travel_directions` | application supporting document/field | Link or archive-only. |
| `ParkDocument.ResponseToJudgesFeedBack` | `previous_feedback_response` | application field/supporting document | New runtime response remains typed unless product approves document UX. |
| `ParkDocument.SiteConservationPlan` | `conservation_plan` | application supporting document/field | Link or archive-only. |
| `ParkDocument.GHAResponseToJudgesFeedBack` | `heritage_response` | application supporting document/field | Link or archive-only. |
| `ParkDocument.InnovationAwardSupportingDoc` | `innovation_supporting_document` | application supporting document/field | Link or archive-only. |
| `ParkDocument.Photo1/Photo2/Photo3` | `park_photo` | application supporting document or public profile media if approved | Public use requires explicit approval. |
| `ParkApplicationNote.FeedbackFile` | `feedback_report` | result artifact, assessment episode, archive record | Never expose raw scores or internal scoring artifacts to applicants. |
| `Judge.PersonalPhotoFileName` | `assessor_photo` | assessor profile document or public profile media if approved | Coordinate identity/profile owner with Goal 4. |
| `Judge.CVFileName` | `assessor_cv` | assessor profile document | Private/admin/assessor-own. |
| `Judge.ApplicationFilename` | `assessor_application` | judge onboarding archive/application document | Goal 4 owns onboarding workflow mapping. |
| `Judge.CoverLetterFilename` | `assessor_cover_letter` | judge onboarding archive/application document | Goal 4 owns onboarding workflow mapping. |
| `JudgeApplication.CVFileName` | `assessor_cv` | judge application/onboarding document | May link to assessor profile after Goal 4 identity resolution. |
| `JudgeApplication.ApplicationFilename` | `assessor_application` | judge application/onboarding document | Archive if no active profile owner. |
| `JudgeApplication.CoverLetterFilename` | `assessor_cover_letter` | judge application/onboarding document | Archive if no active profile owner. |
| Invoice PDF/rendered invoice file | `invoice_artifact` | invoice, application finance package | Only if invoice artifact generation/storage is approved. |
| Finance export CSV | `export_file` | export job, finance export run | Link existing export storage keys to document asset/provenance. |
| Certificate file | `certificate` | certificate/result artifact/episode | Wording/template external; public only after release rules. |
| Result report file | `result_report` | result artifact/episode | Applicant-safe variant only; internal scoring artifacts hidden. |
| Public map/export output | `export_file` or `public_resource` | public map export/cache | Classify based on ownership and public release approval. |
| Umbraco media/content/resource files | `public_resource`, `public_profile_media`, `archive_only_file`, or intentionally not needed | backend-owned public resource, CMS adapter, external archive | Do not rebuild Umbraco CMS internals. |

## Proposed service/repository changes

### Document write path

Preserve the current management-plan repository behavior and add a generalized service layer for:

- subtype validation
- owner-context validation
- visibility/redaction default resolution
- retention/sensitivity default resolution
- upload session creation for supported subtypes
- URL-link registration for management plans when approved
- generated artifact registration
- legacy file-reference registration
- archive-only file-reference registration
- signed access through owner context
- audit event emission

The service should reject any document asset creation that lacks:

- a subtype
- at least one valid owner context, or explicit archive-only owner
- visibility/redaction classification
- retention category
- sensitivity classification

### Management plan behavior to preserve and verify

Keep and expand tests around:

- file upload support
- external URL link support when implemented
- chunked upload
- file size limits
- retry-safe chunk acknowledgement
- SHA-256 hash duplicate detection
- warning/duplicate marker for identical upload
- archive previous version on replacement
- upload after submission until allocation where required
- signed download/access policy
- no Mystery leak through filename, metadata, or URL/link details

For URL-link management plans, the backend should store a versioned link record with access-check status, checked timestamp, and safe display metadata. It should not expose raw third-party URL details to unauthorized actors.

### Legacy import/reference path

Add internal services for:

- registering legacy filename-only source records
- resolving likely modern owner context using Goal 1 and Goal 5 entity links
- assigning subtype and classifications from mapping rules
- linking imported files to document assets when bytes and storage keys are available
- creating archive-only records when files are unavailable or intentionally not needed
- recording missing-file reasons
- producing reconciliation reports

Do not import real production files as part of this implementation goal unless a later explicit data-migration task provides approved manifests, storage locations, and legal/KBT signoff.

### Access path

Signed access must:

- load the document asset
- load required owner context
- evaluate actor RBAC/scope
- evaluate assignment/release/acceptance rules for judges
- apply Mystery redaction and visibility restrictions
- reject missing/invalid owner context
- audit access attempts
- return only a signed URL or approved adapter URL, expiry, safe filename, content type, and visibility/status fields

### Archive behavior

Archive behavior should distinguish:

- replaced current document versions
- migrated archive-only references
- missing files with retained source evidence
- intentionally not needed source references
- external archive manifest references
- generated artifacts superseded by newer outputs

Archive-only records should not become runtime downloadable documents unless a later approved process imports the file and creates a valid owner-linked document asset.

## Proposed contract/API/read-model changes

No frontend implementation is part of Goal 3. Any DTO/OpenAPI change requires implementation-time contract review.

Plan only the minimum backend/internal surfaces needed:

- Applicant document summary can expose subtype, status, safe display filename, upload/link availability, current/archive count, visibility category, and signed-access availability.
- Admin document archive/read model can expose internal provenance status, owner context, subtype, import status, missing-file reason, archive-only status, and redaction classification, but should still avoid raw unrestricted storage keys/paths in broad list views.
- Assessor/judge document access can expose only documents allowed by assignment, release, acceptance, and subtype rules.
- Invoice artifact/download endpoints should exist only if invoice artifact generation/storage is approved.
- Result artifact/certificate endpoints must preserve applicant-safe result payloads and hide raw scores/internal artifacts.
- Signed download endpoints should remain the only route to file bytes or adapter URLs.

Applicant/judge/public DTOs must not expose:

- Goal 1 provenance internals
- raw storage keys
- raw legacy paths
- raw legacy filenames when sensitive
- raw `FormsValue`
- raw scores
- Mystery-sensitive filenames or metadata
- internal archive locations
- storage provider implementation details

Internal/admin read models should still apply least-privilege redaction. A global admin may need enough evidence for reconciliation, but broad admin queues should use safe summaries and drill-down permissions for raw archive evidence if approved.

## Goal 1 migration-layer usage

Goal 3 should use existing Goal 1 tables as the migration spine:

- `migration_source_table_catalog`: catalog legacy file-bearing tables and classify them as migrate, link-only, archive-only, or intentionally not needed.
- `migration_mapping_rules`: define source table/column to document subtype/owner/retention/sensitivity decisions.
- `migration_source_records`: register source rows with minimized fingerprints, row counts, source checksums, and safe filename/path hashes where needed.
- `migration_entity_links`: link source rows to modern applications, episodes, document assets, assessment evidence, result artifacts, finance export runs, assessor profiles, or archive records.
- `migration_archive_records`: record explicit archive-only handling and external archive manifest references.
- `migration_reconciliation_reports`: create `document_assets` or document-specific reports for each batch.
- `migration_reconciliation_report_items`: capture missing targets, missing files, unresolved owner contexts, duplicate hashes, invalid mappings, orphan sources, archive confirmations, and manual-review items.

Reconciliation must cover:

- legacy filename row counts
- source table/column coverage
- missing file references
- missing or unresolved owner/context
- duplicate hashes
- missing storage keys for imported files
- missing document subtype
- missing visibility/redaction classification
- missing retention category
- missing sensitivity classification
- orphan source filename rows
- source-to-target and target-to-source traceability
- archive-only confirmations
- Mystery-sensitive filename/metadata risk
- invoice artifact coverage
- result artifact coverage
- certificate artifact coverage
- export artifact coverage

Existing Goal 1 report item types should be reused where possible, including `missing_target`, `invalid_mapping`, `manual_review_required`, `archive_only_confirmed`, `duplicate_source`, `hash_mismatch`, and `orphan_source`. Add new report item types only if the current vocabulary cannot express document-specific failures clearly.

## Goal 2 finance artifact coordination

Goal 2 owns:

- invoice facts
- invoice lines
- fee schedules and fee lines
- payment events
- finance export runs
- exportable finance read models
- Business Central/payment-provider coordination points

Goal 3 should own:

- invoice PDF/rendered artifact storage if approved
- manual/offline invoice artifact shell if PDF generation is not approved
- finance export CSV file asset linkage
- signed download and visibility policy for finance artifacts
- retention classification for invoice/export artifacts
- source/archive provenance for legacy invoice/export file references
- generated artifact replacement/archive behavior

Do not let invoice artifact existence become the invoice source of truth. The invoice fact tables remain authoritative for amounts, line items, state, payment events, and export status.

## Goal 4 contact/judge coordination

Goal 3 owns:

- document subtype support for assessor/judge files
- storage metadata
- archive provenance
- signed access policy
- retention/sensitivity classification
- migration reconciliation for filename references

Goal 4 owns:

- person/contact identity mapping
- judge/assessor profile ownership decisions
- judge application/onboarding workflow decisions
- contact scoping
- COI/contact relationships
- whether historic judge application files attach to an active assessor profile, an onboarding archive, or archive-only evidence

Goal 3 implementation should avoid blocking on perfect person matching by allowing `owner_unresolved` and `archive_only_file` classifications with reconciliation report items. Confirmed assessor/judge document links should wait for Goal 4 owner resolution.

## Legacy feedback/scoring document behavior

Plan `ParkApplicationNote.FeedbackFile` as a `feedback_report` candidate with one of these outcomes:

- linked to a modern `result_artifact` when it is an applicant-safe feedback/result report
- linked to internal assessment/episode evidence when it is internal-only and allowed by policy
- retained as `archive_only_file` when it contains raw scoring/internal content or owner/context is uncertain
- marked missing with reason when a filename exists but no file is available

Do not expose raw scores, raw `FormsValue`, internal scoring artifacts, or old judge note internals to applicants. Raw `FormsValue` handling from Goal 5 remains archive/reconciliation coordination, not an applicant document surface.

Previous judge feedback response behavior should respect the source requirement that new runtime responses are typed directly. Legacy files can be retained as `previous_feedback_response` documents only when they are clearly supporting documents and have safe owner/visibility classification; otherwise archive them.

Certificate/result relationships:

- certificates should link to result/certificate owners and use `certificate` subtype
- result reports should use `result_report` subtype
- feedback files should use `feedback_report` subtype
- applicant result payloads should continue to hide raw scores and internal artifacts

## Public/CMS/resource files

Goal 3 should classify legacy public/CMS/media/resource files only unless product/backend ownership is already approved.

Classification outcomes:

- `backend_owned_public_resource`: file is part of the modern backend-owned public resource or public download surface.
- `public_map_cache_media`: file is generated/cache media for public map/export behavior.
- `cms_content_adapter`: file remains owned by an external CMS/content process and is referenced through an adapter.
- `migration_archive_only`: file is retained for evidence but not a runtime asset.
- `intentionally_not_needed`: file has no approved modern runtime, legal, audit, consent, or archive need.

Do not rebuild Umbraco CMS internals. Use KBT_GFA/Umbraco tables only to identify retained public content, business submissions, media, audit/consent obligations, and archive candidates.

## Proposed tests

Plan tests at migration, repository/service, contract, and access-policy levels:

- Legacy filename mapping to document assets.
- Legacy filename mapping to archive-only records.
- Missing file reconciliation.
- Duplicate hash reconciliation.
- Unresolved owner/context reconciliation.
- Document subtype taxonomy validation.
- Required subtype/visibility/retention/sensitivity validation.
- Source table/column/primary-key provenance validation.
- Goal 1 source-to-target and target-to-source traceability for document records.
- Archive-only confirmations suppress false missing-target failures.
- Management plan duplicate detection remains hash-based.
- Management plan replacement archives previous version.
- Management plan upload/link remains available post-submission until allocation.
- Management plan URL-link registration, access checking, and safe metadata behavior when implemented.
- Chunked upload retry and file-size behavior remains green.
- Signed download resolves through owning context.
- Applicant cannot access admin-only, judge-only, or Mystery-restricted documents.
- Judge can access assigned Full Assessment documents only after release/acceptance rules allow it.
- Mystery documents, filenames, links, paths, and metadata never leak to applicant/org/public surfaces.
- `ParkApplicationNote.FeedbackFile` maps to result artifact/document/archive as classified.
- Raw `FormsValue` remains archive/reconciliation only.
- Judge CV/application/cover/photo files map to assessor/judge document support or archive.
- Invoice artifacts/export files coordinate with Goal 2 finance facts.
- Applicant result payload still hides raw scores/internal artifacts.
- Result report/certificate artifacts use safe surfaces and signed access.
- Public/CMS media classification does not create Umbraco-shaped runtime tables.
- Goal 1 reconciliation reports cover filename counts, missing/orphan/duplicate/archive-only outcomes.
- Existing document/upload/redaction tests remain green.

Suggested command coverage by implementation time:

- contract validation after any subtype/API DTO changes
- OpenAPI check after endpoint changes
- migration check for the current next Goal 3A migration, likely `0024_document_migration_schema_foundation.sql` only if no numbering conflict exists at implementation time
- seed check if subtype seeds are added
- API tests for signed access and redaction
- DB integration tests for migration provenance and reconciliation

## Risks / open decisions

- Production storage/export manifest dependency: actual file import requires approved source manifests, storage locations, hash manifests, and export process.
- Legacy file path/base URL dependency: filename-only rows may not resolve without historic base paths or archive manifests.
- File availability: many filename references may point to missing files; missing-file handling must be first-class.
- Retention/legal decisions: financial statements, judge onboarding files, voice notes, transcripts, feedback reports, and certificates need approved retention categories.
- Invoice artifact/PDF ownership: KBT/legal must decide whether rendered invoice PDFs are generated/stored, or whether a manual/offline shell is enough.
- Judge onboarding document retention: CVs, applications, cover letters, and photos need policy before broad runtime access.
- Public/CMS media ownership: product/backend must decide which public resources are backend-owned and which remain CMS/adapter/archive-only.
- Mystery-sensitive file naming risks: old filenames may include Mystery, judge, visit, score, or internal context. Treat filenames as sensitive until classified.
- URL-link management plans: link accessibility checks, third-party URL redaction, content hash behavior, and retention of external references need implementation detail.
- Current internal/admin storage-key exposure: existing assessment/result/export models contain storage key fields. Goal 3 should review these surfaces before adding new DTOs.
- Goal 4 boundary: person/contact/judge/onboarding matching belongs to Goal 4. Goal 3 should allow unresolved owners without inventing identity decisions.

## Items blocked by KBT/legal/storage/export input

- Production storage provider, bucket names, object-key conventions, KMS, CDN, and signed URL adapter details.
- Virus scanning/quarantine provider behavior and production failure policy.
- Approved legacy file export manifest and legacy base path mapping.
- Whether real production files may be imported at all.
- Retention categories and legal holds for documents, financial files, judge onboarding documents, voice notes, transcripts, certificates, and public resources.
- Invoice PDF/rendered artifact generation, legal wording, VAT wording, numbering/branding, and Business Central artifact ownership.
- Certificate template/wording and permanent retention policy.
- Public/CMS media ownership and CMS adapter boundary.
- Whether assessor photos are public profile media or private profile documents.
- Transcription provider and transcript retention/sensitivity policy.
- Any KBT approval needed for award-type-specific supporting documents beyond current backend rules.

## Items that must remain archive-only

These items should not become runtime documents unless a later explicit approval changes classification:

- Raw `FormsValue` and raw scoring payloads.
- Internal scoring artifacts that expose raw scores or judge deliberation.
- Filename rows with no resolved owner/context.
- Filename rows with no approved subtype.
- Missing files where only the legacy filename exists.
- Legacy files with unresolved or unsafe Mystery-sensitive filenames/metadata.
- Old auth/member/password/credential files or credential-like exports.
- Umbraco CMS internals that are not retained public resources, business submissions, audit/consent evidence, or approved media.
- Public/CMS media with no product-approved modern ownership.
- Research centre/resource analytics files with no approved backend requirement.
- Invoice/operator/legal content not approved by Goal 2/KBT/legal.
- Judge onboarding documents where retention and owner identity are unresolved.
- External archive manifests and unrestricted raw legacy paths.

## Acceptance criteria for implementation

Goal 3 implementation can be marked ready only when the staged Goal 3A through Goal 3E acceptance gates are complete. For the full Goal 3 outcome:

- The current next Goal 3A migration adds additive document schema coverage without copying legacy filename columns into runtime tables.
- A versioned document subtype taxonomy exists and includes all required subtypes in this plan.
- Existing management-plan upload, chunking, duplicate detection, replacement/archive, signed access, and Mystery redaction behavior remains green.
- Management-plan URL-link and PPT/PPTX gaps are either implemented from approved requirements or explicitly recorded as deferred external/product decisions.
- Legacy filename-only source references can be registered with source table, source column, source primary key, filename/path evidence, hash/size/mime where available, import status, missing-file reason, owner, subtype, visibility/redaction, retention, sensitivity, and Goal 1 provenance.
- Every runtime document asset has a valid owner context or explicit archive-only classification before access.
- Applicant/judge/public DTOs do not expose Goal 1 provenance, raw storage keys, raw legacy paths, raw sensitive filenames, raw `FormsValue`, raw scores, Mystery-sensitive metadata, or internal archive locations.
- `ParkApplicationNote.FeedbackFile`, judge/assessor files, invoice artifacts, export files, result reports, certificates, public resources, and archive-only files are all classified.
- Goal 1 reconciliation reports cover filename counts, missing files, unresolved owners, duplicate hashes, missing storage keys, missing subtype/classification/retention, orphan rows, archive-only confirmations, and source-to-target/target-to-source traceability.
- Goal 2 finance facts remain authoritative while Goal 3 owns file artifact storage, retention, download, and provenance for invoice/export artifacts.
- Goal 4 remains the owner of contact/judge/person/onboarding workflow decisions.
- Production storage, scanner, legal retention, invoice/certificate wording, and KBT decisions are not invented in code or DTOs.
- Tests listed in this plan are implemented or explicitly deferred with a documented external blocker.
