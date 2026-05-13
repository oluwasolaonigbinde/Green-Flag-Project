-- Goal 3A document migration schema foundation.
-- Inert/additive schema only: no runtime behavior, DTO, route, storage, scanner, or real-file-import changes.

CREATE TABLE IF NOT EXISTS document_subtypes (
  code text PRIMARY KEY,
  taxonomy_version text NOT NULL,
  label text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'planned', 'external_approval_required', 'superseded', 'voided')),
  coarse_document_type text NOT NULL,
  default_visibility text NOT NULL,
  default_redaction_classification text NOT NULL,
  default_retention_category text NOT NULL,
  default_sensitivity_classification text NOT NULL,
  storage_policy text NOT NULL,
  allowed_owner_types text[] NOT NULL DEFAULT '{}'::text[],
  allowed_mime_types text[] NOT NULL DEFAULT '{}'::text[],
  max_byte_size integer CHECK (max_byte_size IS NULL OR max_byte_size > 0),
  migration_required boolean NOT NULL DEFAULT false,
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  CHECK (code <> ''),
  CHECK (taxonomy_version <> ''),
  CHECK (label <> '')
);

ALTER TABLE document_assets
  ADD COLUMN IF NOT EXISTS document_subtype text REFERENCES document_subtypes(code) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_origin text,
  ADD COLUMN IF NOT EXISTS retention_category text,
  ADD COLUMN IF NOT EXISTS sensitivity_classification text,
  ADD COLUMN IF NOT EXISTS redaction_classification text,
  ADD COLUMN IF NOT EXISTS import_status text,
  ADD COLUMN IF NOT EXISTS display_filename text,
  ADD COLUMN IF NOT EXISTS filename_sensitivity text,
  ADD COLUMN IF NOT EXISTS original_filename_hash text;

CREATE INDEX IF NOT EXISTS idx_document_assets_document_subtype
  ON document_assets (document_subtype)
  WHERE document_subtype IS NOT NULL;

CREATE TABLE IF NOT EXISTS document_asset_ownerships (
  id uuid PRIMARY KEY,
  document_asset_id uuid NOT NULL REFERENCES document_assets(id) ON DELETE CASCADE,
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  owner_context_role text NOT NULL,
  required_for_access boolean NOT NULL DEFAULT true,
  visibility_override text,
  redaction_override text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  created_by_process text NOT NULL DEFAULT 'goal_3a_schema_foundation',
  notes text,
  CHECK (owner_type <> ''),
  CHECK (owner_context_role <> ''),
  UNIQUE (document_asset_id, owner_type, owner_id, owner_context_role)
);

CREATE INDEX IF NOT EXISTS idx_document_asset_ownerships_asset
  ON document_asset_ownerships (document_asset_id);

CREATE INDEX IF NOT EXISTS idx_document_asset_ownerships_owner
  ON document_asset_ownerships (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS migration_document_file_references (
  id uuid PRIMARY KEY,
  import_batch_id uuid NOT NULL REFERENCES migration_import_batches(id) ON DELETE RESTRICT,
  source_record_id uuid REFERENCES migration_source_records(id) ON DELETE RESTRICT,
  migration_entity_link_id uuid REFERENCES migration_entity_links(id) ON DELETE RESTRICT,
  source_table text NOT NULL,
  source_column text NOT NULL,
  source_primary_key text NOT NULL,
  source_reference_key text NOT NULL DEFAULT 'default',
  legacy_filename text,
  legacy_filename_hash text,
  original_relative_path text,
  original_relative_path_hash text,
  resolved_storage_key text,
  external_archive_location text,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
  mime_type text,
  import_status text NOT NULL CHECK (import_status IN (
    'pending_manifest',
    'metadata_only',
    'imported',
    'linked_existing_asset',
    'external_archive_only',
    'missing_file',
    'owner_unresolved',
    'subtype_unresolved',
    'visibility_unresolved',
    'retention_unresolved',
    'rejected_sensitive',
    'intentionally_not_needed'
  )),
  missing_file_reason text,
  owner_entity_type text,
  owner_entity_id uuid,
  document_subtype text REFERENCES document_subtypes(code) ON DELETE RESTRICT,
  visibility_classification text,
  redaction_classification text,
  retention_category text,
  sensitivity_classification text,
  archive_record_id uuid REFERENCES migration_archive_records(id) ON DELETE RESTRICT,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  notes text,
  CHECK (source_table <> ''),
  CHECK (source_column <> ''),
  CHECK (source_primary_key <> ''),
  CHECK (source_reference_key <> ''),
  UNIQUE (import_batch_id, source_table, source_column, source_primary_key, source_reference_key)
);

CREATE INDEX IF NOT EXISTS idx_migration_document_file_refs_source_record
  ON migration_document_file_references (source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_migration_document_file_refs_source_lookup
  ON migration_document_file_references (import_batch_id, source_table, source_column, source_primary_key);

CREATE INDEX IF NOT EXISTS idx_migration_document_file_refs_status
  ON migration_document_file_references (import_status);

CREATE INDEX IF NOT EXISTS idx_migration_document_file_refs_subtype
  ON migration_document_file_references (document_subtype)
  WHERE document_subtype IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_migration_document_file_refs_owner
  ON migration_document_file_references (owner_entity_type, owner_entity_id)
  WHERE owner_entity_type IS NOT NULL AND owner_entity_id IS NOT NULL;

INSERT INTO document_subtypes (
  code,
  taxonomy_version,
  label,
  status,
  coarse_document_type,
  default_visibility,
  default_redaction_classification,
  default_retention_category,
  default_sensitivity_classification,
  storage_policy,
  allowed_owner_types,
  allowed_mime_types,
  max_byte_size,
  migration_required,
  notes
)
VALUES
  ('management_plan', 'document-subtypes.v1', 'Management plan', 'active', 'application_document', 'APPLICANT_AND_ADMIN', 'standard', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application','management_plan_version','assessment_episode'], ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 52428800, true, 'Existing lower-env upload/version/archive behavior. PPT/PPTX and external link support remain future contract work.'),
  ('constitution', 'document-subtypes.v1', 'Constitution', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'standard', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Legacy application supporting document classification only in Goal 3A.'),
  ('lease', 'document-subtypes.v1', 'Lease', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'standard', 'assessment_record_min_7_years', 'personal_data', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Legacy lease file classification only in Goal 3A.'),
  ('insurance', 'document-subtypes.v1', 'Insurance', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'standard', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Legacy insurance file classification only in Goal 3A.'),
  ('risk_assessment', 'document-subtypes.v1', 'Risk assessment', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'standard', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Legacy risk assessment file classification only in Goal 3A.'),
  ('financial_statement', 'document-subtypes.v1', 'Financial statement', 'planned', 'application_supporting_document', 'ADMIN_ONLY', 'standard', 'finance_or_assessment_record', 'personal_data', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Higher-sensitivity supporting document. Runtime access rules are future work.'),
  ('plan_of_green_space', 'document-subtypes.v1', 'Plan of green space', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'standard', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Legacy plan of green space classification only in Goal 3A.'),
  ('travel_directions', 'document-subtypes.v1', 'Travel directions', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'mystery_sensitive_review', 'assessment_record_min_7_years', 'personal_data', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Potential location-sensitive metadata; runtime access is future work.'),
  ('previous_feedback_response', 'document-subtypes.v1', 'Previous feedback response', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'score_safe_summary_only', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application_field','application_supporting_document','assessment_episode'], ARRAY[]::text[], NULL, true, 'Modern runtime response remains typed unless later approved.'),
  ('conservation_plan', 'document-subtypes.v1', 'Conservation plan', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'standard', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Legacy conservation document classification only in Goal 3A.'),
  ('heritage_response', 'document-subtypes.v1', 'Heritage response', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'standard', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Legacy heritage/GHA response classification only in Goal 3A.'),
  ('innovation_supporting_document', 'document-subtypes.v1', 'Innovation supporting document', 'planned', 'application_supporting_document', 'APPLICANT_AND_ADMIN', 'standard', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application_supporting_document','application_field'], ARRAY[]::text[], NULL, true, 'Legacy innovation file classification only in Goal 3A.'),
  ('park_photo', 'document-subtypes.v1', 'Park photo', 'planned', 'application_media', 'APPLICANT_AND_ADMIN', 'public_release_required', 'assessment_record_min_7_years', 'low', 'private_signed_download', ARRAY['application_supporting_document','application_field','public_profile_media'], ARRAY[]::text[], NULL, true, 'Public use requires later approval and runtime rules.'),
  ('feedback_report', 'document-subtypes.v1', 'Feedback report', 'planned', 'result_document', 'ADMIN_ONLY', 'score_safe_summary_only', 'assessment_record_min_7_years', 'personal_data', 'private_signed_download', ARRAY['result_artifact','assessment_episode','archive_only_record'], ARRAY[]::text[], NULL, true, 'ParkApplicationNote feedback file classification; applicant-safe surfaces are future work.'),
  ('assessment_photo', 'document-subtypes.v1', 'Assessment photo', 'planned', 'assessment_evidence', 'ADMIN_ONLY', 'mystery_sensitive_review', 'assessment_record_min_7_years', 'personal_data', 'private_signed_download', ARRAY['assessment_evidence','judge_assessment','assessment_visit'], ARRAY[]::text[], NULL, true, 'Assessment evidence integration is future work.'),
  ('assessment_evidence_file', 'document-subtypes.v1', 'Assessment evidence file', 'planned', 'assessment_evidence', 'ADMIN_ONLY', 'mystery_sensitive_review', 'assessment_record_min_7_years', 'personal_data', 'private_signed_download', ARRAY['assessment_evidence','assessment_score_entry','judge_assessment'], ARRAY[]::text[], NULL, true, 'Assessment evidence integration is future work.'),
  ('voice_note', 'document-subtypes.v1', 'Voice note', 'external_approval_required', 'assessment_evidence', 'ADMIN_ONLY', 'mystery_sensitive_review', 'assessment_record_min_7_years', 'personal_data', 'private_signed_download', ARRAY['assessment_evidence','judge_assessment'], ARRAY[]::text[], NULL, true, 'Voice note capture/storage requires product, legal, and provider approval.'),
  ('transcript', 'document-subtypes.v1', 'Transcript', 'external_approval_required', 'assessment_evidence', 'ADMIN_ONLY', 'mystery_sensitive_review', 'assessment_record_min_7_years', 'personal_data', 'private_signed_download', ARRAY['assessment_evidence','judge_assessment'], ARRAY[]::text[], NULL, true, 'Transcript generation/storage requires product, legal, and provider approval.'),
  ('assessor_cv', 'document-subtypes.v1', 'Assessor CV', 'external_approval_required', 'assessor_profile_document', 'ADMIN_ONLY', 'personal_private', 'judge_onboarding_retention_pending', 'personal_data', 'private_signed_download', ARRAY['assessor_profile_document','judge_application_document'], ARRAY[]::text[], NULL, true, 'Goal 4 owns identity/onboarding decisions.'),
  ('assessor_application', 'document-subtypes.v1', 'Assessor application', 'external_approval_required', 'assessor_profile_document', 'ADMIN_ONLY', 'personal_private', 'judge_onboarding_retention_pending', 'personal_data', 'private_signed_download', ARRAY['assessor_profile_document','judge_application_document'], ARRAY[]::text[], NULL, true, 'Goal 4 owns identity/onboarding decisions.'),
  ('assessor_cover_letter', 'document-subtypes.v1', 'Assessor cover letter', 'external_approval_required', 'assessor_profile_document', 'ADMIN_ONLY', 'personal_private', 'judge_onboarding_retention_pending', 'personal_data', 'private_signed_download', ARRAY['assessor_profile_document','judge_application_document'], ARRAY[]::text[], NULL, true, 'Goal 4 owns identity/onboarding decisions.'),
  ('assessor_photo', 'document-subtypes.v1', 'Assessor photo', 'external_approval_required', 'assessor_profile_document', 'ADMIN_ONLY', 'personal_private', 'judge_onboarding_retention_pending', 'personal_data', 'private_signed_download', ARRAY['assessor_profile_document','public_profile_media'], ARRAY[]::text[], NULL, true, 'Public/profile use requires explicit approval.'),
  ('invoice_artifact', 'document-subtypes.v1', 'Invoice artifact', 'external_approval_required', 'finance_artifact', 'ADMIN_ONLY', 'finance_private', 'finance_retention_pending', 'personal_data', 'private_signed_download', ARRAY['invoice_artifact'], ARRAY[]::text[], NULL, true, 'Goal 2 owns invoice facts; rendered artifacts require finance/legal approval.'),
  ('certificate', 'document-subtypes.v1', 'Certificate', 'external_approval_required', 'result_artifact', 'PUBLIC_AFTER_RELEASE', 'public_release_required', 'certificate_permanent_pending', 'low', 'private_signed_download', ARRAY['certificate','result_artifact'], ARRAY[]::text[], NULL, true, 'Certificate wording/template/public release require approval.'),
  ('result_report', 'document-subtypes.v1', 'Result report', 'planned', 'result_artifact', 'ADMIN_ONLY', 'score_safe_summary_only', 'assessment_record_min_7_years', 'personal_data', 'private_signed_download', ARRAY['result_artifact','assessment_episode'], ARRAY[]::text[], NULL, true, 'Applicant-safe result report surfaces are future work.'),
  ('export_file', 'document-subtypes.v1', 'Export file', 'planned', 'generated_artifact', 'ADMIN_ONLY', 'internal_export', 'export_retention_pending', 'personal_data', 'private_signed_download', ARRAY['finance_export_artifact','export_job'], ARRAY[]::text[], NULL, true, 'Export artifact linkage is future work.'),
  ('public_resource', 'document-subtypes.v1', 'Public resource', 'external_approval_required', 'public_resource', 'PUBLIC_AFTER_RELEASE', 'public_release_required', 'public_content_retention_pending', 'low', 'public_or_signed_download_pending', ARRAY['public_resource'], ARRAY[]::text[], NULL, true, 'Do not rebuild CMS internals; ownership requires approval.'),
  ('public_profile_media', 'document-subtypes.v1', 'Public profile media', 'external_approval_required', 'public_media', 'PUBLIC_AFTER_RELEASE', 'public_release_required', 'public_content_retention_pending', 'low', 'public_or_signed_download_pending', ARRAY['public_profile_media'], ARRAY[]::text[], NULL, true, 'Public park/assessor media requires approval.'),
  ('archive_only_file', 'document-subtypes.v1', 'Archive-only file', 'planned', 'archive_only', 'ADMIN_ONLY', 'internal_archive_only', 'archive_retention_pending', 'personal_data', 'external_archive_or_metadata_only', ARRAY['archive_only_record'], ARRAY[]::text[], NULL, true, 'Internal migration evidence only; no runtime document surface in Goal 3A.')
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version = EXCLUDED.taxonomy_version,
  label = EXCLUDED.label,
  status = EXCLUDED.status,
  coarse_document_type = EXCLUDED.coarse_document_type,
  default_visibility = EXCLUDED.default_visibility,
  default_redaction_classification = EXCLUDED.default_redaction_classification,
  default_retention_category = EXCLUDED.default_retention_category,
  default_sensitivity_classification = EXCLUDED.default_sensitivity_classification,
  storage_policy = EXCLUDED.storage_policy,
  allowed_owner_types = EXCLUDED.allowed_owner_types,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  max_byte_size = EXCLUDED.max_byte_size,
  migration_required = EXCLUDED.migration_required,
  notes = EXCLUDED.notes,
  updated_at_utc = now();

-- migrate:down

DROP INDEX IF EXISTS idx_migration_document_file_refs_owner;
DROP INDEX IF EXISTS idx_migration_document_file_refs_subtype;
DROP INDEX IF EXISTS idx_migration_document_file_refs_status;
DROP INDEX IF EXISTS idx_migration_document_file_refs_source_lookup;
DROP INDEX IF EXISTS idx_migration_document_file_refs_source_record;
DROP TABLE IF EXISTS migration_document_file_references;

DROP INDEX IF EXISTS idx_document_asset_ownerships_owner;
DROP INDEX IF EXISTS idx_document_asset_ownerships_asset;
DROP TABLE IF EXISTS document_asset_ownerships;

DROP INDEX IF EXISTS idx_document_assets_document_subtype;

ALTER TABLE document_assets
  DROP COLUMN IF EXISTS original_filename_hash,
  DROP COLUMN IF EXISTS filename_sensitivity,
  DROP COLUMN IF EXISTS display_filename,
  DROP COLUMN IF EXISTS import_status,
  DROP COLUMN IF EXISTS redaction_classification,
  DROP COLUMN IF EXISTS sensitivity_classification,
  DROP COLUMN IF EXISTS retention_category,
  DROP COLUMN IF EXISTS source_origin,
  DROP COLUMN IF EXISTS document_subtype;

DROP TABLE IF EXISTS document_subtypes;
