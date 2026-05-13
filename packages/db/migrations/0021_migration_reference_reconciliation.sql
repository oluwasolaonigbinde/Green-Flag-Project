-- Goal 1 migration reference and reconciliation sidecar schema.
-- These tables record migration provenance only. They do not own runtime lifecycle state.

CREATE TABLE IF NOT EXISTS migration_source_table_catalog (
  id uuid PRIMARY KEY,
  source_system text NOT NULL,
  source_database text NOT NULL,
  source_schema text NOT NULL,
  source_table text NOT NULL,
  source_group text NOT NULL,
  business_owner text,
  classification text NOT NULL CHECK (classification IN (
    'core_business',
    'reference',
    'finance',
    'document',
    'communications',
    'identity',
    'cms_business',
    'cms_archive',
    'archive_only',
    'excluded_noise',
    'unclassified_pending_review'
  )),
  primary_key_columns text[] NOT NULL,
  natural_key_columns text[] NOT NULL DEFAULT '{}',
  retention_decision text NOT NULL CHECK (retention_decision IN (
    'migrate',
    'link_only',
    'archive_only',
    'exclude_pending_signoff'
  )),
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_database, source_schema, source_table)
);

CREATE TABLE IF NOT EXISTS migration_import_batches (
  id uuid PRIMARY KEY,
  batch_key text NOT NULL UNIQUE,
  source_system text NOT NULL,
  source_database text NOT NULL,
  source_export_label text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('local', 'ci', 'uat', 'staging', 'production')),
  batch_kind text NOT NULL CHECK (batch_kind IN ('dry_run', 'test_import', 'uat_rehearsal', 'cutover', 'rollback_rehearsal')),
  status text NOT NULL CHECK (status IN ('created', 'running', 'completed', 'completed_with_warnings', 'failed', 'superseded', 'voided')),
  started_at_utc timestamptz,
  completed_at_utc timestamptz,
  source_exported_at_utc timestamptz,
  source_file_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  initiated_by_actor_id uuid REFERENCES internal_users(id) ON DELETE RESTRICT,
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_import_batch_source_tables (
  id uuid PRIMARY KEY,
  import_batch_id uuid NOT NULL REFERENCES migration_import_batches(id) ON DELETE RESTRICT,
  catalog_id uuid NOT NULL REFERENCES migration_source_table_catalog(id) ON DELETE RESTRICT,
  source_system text NOT NULL,
  source_database text NOT NULL,
  source_schema text NOT NULL,
  source_table text NOT NULL,
  source_export_file text,
  source_export_file_checksum text,
  source_export_hash_algorithm text NOT NULL DEFAULT 'sha256',
  expected_row_count integer NOT NULL CHECK (expected_row_count >= 0),
  expected_source_hash text,
  actual_registered_row_count integer CHECK (actual_registered_row_count IS NULL OR actual_registered_row_count >= 0),
  actual_registered_source_hash text,
  manifest_status text NOT NULL CHECK (manifest_status IN ('expected', 'registered', 'matched', 'mismatched', 'missing_export', 'voided')),
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, catalog_id),
  UNIQUE (import_batch_id, source_system, source_database, source_schema, source_table)
);

CREATE TABLE IF NOT EXISTS migration_target_entity_types (
  code text PRIMARY KEY,
  label text NOT NULL,
  target_table text NOT NULL,
  id_column text NOT NULL DEFAULT 'id',
  validation_mode text NOT NULL CHECK (validation_mode IN ('uuid_table_lookup', 'external_archive_manifest', 'not_linkable')),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_mapping_rules (
  id uuid PRIMARY KEY,
  catalog_id uuid NOT NULL REFERENCES migration_source_table_catalog(id) ON DELETE RESTRICT,
  source_group text NOT NULL,
  mapping_version text NOT NULL,
  required_target_entity_types text[] NOT NULL DEFAULT '{}',
  optional_target_entity_types text[] NOT NULL DEFAULT '{}',
  archive_required boolean NOT NULL DEFAULT false,
  allow_unlinked_source boolean NOT NULL DEFAULT false,
  missing_target_severity text NOT NULL CHECK (missing_target_severity IN ('info', 'warning', 'error', 'blocker')),
  rule_status text NOT NULL CHECK (rule_status IN ('draft', 'active', 'superseded', 'voided')),
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, mapping_version)
);

CREATE TABLE IF NOT EXISTS migration_source_records (
  id uuid PRIMARY KEY,
  import_batch_id uuid NOT NULL REFERENCES migration_import_batches(id) ON DELETE RESTRICT,
  catalog_id uuid NOT NULL REFERENCES migration_source_table_catalog(id) ON DELETE RESTRICT,
  batch_source_table_id uuid NOT NULL REFERENCES migration_import_batch_source_tables(id) ON DELETE RESTRICT,
  source_system text NOT NULL,
  source_database text NOT NULL,
  source_schema text NOT NULL,
  source_table text NOT NULL,
  source_primary_key text NOT NULL,
  source_primary_key_json jsonb,
  source_natural_key text,
  source_natural_key_json jsonb,
  source_row_checksum text NOT NULL,
  source_row_hash_algorithm text NOT NULL DEFAULT 'sha256',
  source_row_fingerprint jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint_sensitivity text NOT NULL CHECK (fingerprint_sensitivity IN ('none', 'low', 'personal_data', 'special_category', 'secret_or_credential')),
  import_status text NOT NULL CHECK (import_status IN ('registered', 'linked', 'partially_linked', 'duplicate_source', 'orphan_source', 'missing_target', 'ignored_archive_only', 'failed')),
  duplicate_of_source_record_id uuid REFERENCES migration_source_records(id) ON DELETE RESTRICT,
  error_code text,
  error_detail text,
  registered_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, source_system, source_database, source_schema, source_table, source_primary_key)
);

CREATE INDEX IF NOT EXISTS idx_migration_source_records_source
  ON migration_source_records (source_system, source_database, source_schema, source_table, source_primary_key);
CREATE INDEX IF NOT EXISTS idx_migration_source_records_natural_key
  ON migration_source_records (source_natural_key) WHERE source_natural_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_migration_source_records_checksum
  ON migration_source_records (source_row_checksum);

CREATE TABLE IF NOT EXISTS migration_entity_links (
  id uuid PRIMARY KEY,
  source_record_id uuid NOT NULL REFERENCES migration_source_records(id) ON DELETE RESTRICT,
  import_batch_id uuid NOT NULL REFERENCES migration_import_batches(id) ON DELETE RESTRICT,
  target_entity_type text NOT NULL REFERENCES migration_target_entity_types(code) ON DELETE RESTRICT,
  target_entity_id uuid NOT NULL,
  link_role text NOT NULL,
  link_status text NOT NULL CHECK (link_status IN ('proposed', 'confirmed', 'superseded', 'rejected', 'requires_review')),
  confidence text NOT NULL CHECK (confidence IN ('exact', 'strong', 'inferred', 'manual_review', 'unknown')),
  mapping_version text NOT NULL,
  created_by_process text NOT NULL,
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_record_id, target_entity_type, target_entity_id, link_role, mapping_version)
);

CREATE INDEX IF NOT EXISTS idx_migration_entity_links_target
  ON migration_entity_links (target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_migration_entity_links_batch_target
  ON migration_entity_links (import_batch_id, target_entity_type);
CREATE INDEX IF NOT EXISTS idx_migration_entity_links_source_status
  ON migration_entity_links (source_record_id, link_status);

CREATE TABLE IF NOT EXISTS migration_archive_records (
  id uuid PRIMARY KEY,
  source_record_id uuid NOT NULL REFERENCES migration_source_records(id) ON DELETE RESTRICT,
  import_batch_id uuid NOT NULL REFERENCES migration_import_batches(id) ON DELETE RESTRICT,
  archive_kind text NOT NULL CHECK (archive_kind IN ('internal_archive_record', 'external_archive_manifest')),
  archive_location text NOT NULL,
  archive_reference text NOT NULL,
  archive_checksum text,
  retention_category text NOT NULL,
  sensitivity text NOT NULL CHECK (sensitivity IN ('none', 'low', 'personal_data', 'special_category', 'secret_or_credential')),
  access_notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_record_id, archive_kind, archive_reference)
);

CREATE TABLE IF NOT EXISTS migration_reconciliation_reports (
  id uuid PRIMARY KEY,
  import_batch_id uuid NOT NULL REFERENCES migration_import_batches(id) ON DELETE RESTRICT,
  baseline_import_batch_id uuid REFERENCES migration_import_batches(id) ON DELETE RESTRICT,
  compared_import_batch_id uuid REFERENCES migration_import_batches(id) ON DELETE RESTRICT,
  report_key text NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('count', 'hash', 'duplicate', 'missing_target', 'orphan_source', 'finance_totals', 'document_assets', 'cross_entity', 'full_batch')),
  scope text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'passed', 'passed_with_warnings', 'failed', 'requires_review')),
  source_system text NOT NULL,
  source_database text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_sensitivity text NOT NULL DEFAULT 'low' CHECK (summary_sensitivity IN ('none', 'low', 'personal_data', 'special_category', 'secret_or_credential')),
  generated_by_process text NOT NULL,
  generated_at_utc timestamptz NOT NULL DEFAULT now(),
  completed_at_utc timestamptz,
  notes text,
  UNIQUE (import_batch_id, report_key)
);

CREATE TABLE IF NOT EXISTS migration_reconciliation_report_items (
  id uuid PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES migration_reconciliation_reports(id) ON DELETE RESTRICT,
  source_record_id uuid REFERENCES migration_source_records(id) ON DELETE RESTRICT,
  target_entity_type text REFERENCES migration_target_entity_types(code) ON DELETE RESTRICT,
  target_entity_id uuid,
  item_type text NOT NULL CHECK (item_type IN ('duplicate_source', 'missing_target', 'orphan_source', 'count_mismatch', 'checksum_mismatch', 'hash_mismatch', 'finance_total_mismatch', 'invalid_mapping', 'manual_review_required', 'archive_only_confirmed')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'blocker')),
  outcome text NOT NULL CHECK (outcome IN ('open', 'accepted', 'resolved', 'false_positive', 'deferred')),
  source_value jsonb,
  target_value jsonb,
  expected_value jsonb,
  actual_value jsonb,
  evidence_sensitivity text NOT NULL DEFAULT 'low' CHECK (evidence_sensitivity IN ('none', 'low', 'personal_data', 'special_category', 'secret_or_credential')),
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  resolved_at_utc timestamptz,
  resolved_by_actor_id uuid REFERENCES internal_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_migration_report_items_report
  ON migration_reconciliation_report_items (report_id, severity, outcome);
CREATE INDEX IF NOT EXISTS idx_migration_report_items_source
  ON migration_reconciliation_report_items (source_record_id);
CREATE INDEX IF NOT EXISTS idx_migration_report_items_target
  ON migration_reconciliation_report_items (target_entity_type, target_entity_id);

-- Seed reference metadata only. These are source classifications and target-type controls, not imported data.
INSERT INTO migration_target_entity_types (code, label, target_table, id_column, validation_mode, notes)
VALUES
  ('organisation', 'Organisation', 'organisations', 'id', 'uuid_table_lookup', 'Canonical managing body.'),
  ('park', 'Park', 'parks', 'id', 'uuid_table_lookup', 'Canonical park/site.'),
  ('park_location', 'Park location', 'park_locations', 'id', 'uuid_table_lookup', 'Park geospatial/admin geography.'),
  ('award_cycle', 'Award cycle', 'award_cycles', 'id', 'uuid_table_lookup', 'Country/year award cycle.'),
  ('cycle_window', 'Cycle window', 'cycle_windows', 'id', 'uuid_table_lookup', 'Full or Mystery cycle window.'),
  ('assessment_episode', 'Assessment episode', 'assessment_episodes', 'id', 'uuid_table_lookup', 'Operational lifecycle root.'),
  ('application', 'Application', 'applications', 'id', 'uuid_table_lookup', 'Applicant package.'),
  ('application_section', 'Application section', 'application_sections', 'id', 'uuid_table_lookup', 'Application section state.'),
  ('application_field_value', 'Application field value', 'application_field_values', 'id', 'uuid_table_lookup', 'Application field value.'),
  ('application_feedback_response', 'Application feedback response', 'application_feedback_responses', 'id', 'uuid_table_lookup', 'Previous feedback response.'),
  ('document_asset', 'Document asset', 'document_assets', 'id', 'uuid_table_lookup', 'Uploaded/imported document metadata.'),
  ('application_submission', 'Application submission', 'application_submissions', 'id', 'uuid_table_lookup', 'Submission event.'),
  ('invoice', 'Invoice', 'invoices', 'id', 'uuid_table_lookup', 'Invoice shell.'),
  ('payment_state', 'Payment state', 'payment_states', 'invoice_id', 'uuid_table_lookup', 'Payment state keyed by invoice.'),
  ('internal_user', 'Internal user', 'internal_users', 'id', 'uuid_table_lookup', 'Cognito-linked internal profile.'),
  ('role_assignment', 'Role assignment', 'role_assignments', 'id', 'uuid_table_lookup', 'Scoped role assignment.'),
  ('assessor_profile', 'Assessor profile', 'assessor_profiles', 'id', 'uuid_table_lookup', 'Judge/assessor profile.'),
  ('assessor_preference', 'Assessor preference', 'assessor_preferences', 'assessor_profile_id', 'uuid_table_lookup', 'Assessor preferences.'),
  ('assessor_capacity_declaration', 'Assessor capacity declaration', 'assessor_capacity_declarations', 'id', 'uuid_table_lookup', 'Assessor capacity declaration.'),
  ('allocation', 'Allocation', 'allocations', 'id', 'uuid_table_lookup', 'Allocation holder.'),
  ('judge_assignment', 'Judge assignment', 'judge_assignments', 'id', 'uuid_table_lookup', 'Judge assignment.'),
  ('allocation_coi_flag', 'Allocation COI flag', 'allocation_coi_flags', 'id', 'uuid_table_lookup', 'Conflict/rotation flag.'),
  ('assessment_visit', 'Assessment visit', 'assessment_visits', 'id', 'uuid_table_lookup', 'Visit.'),
  ('judge_assessment', 'Judge assessment', 'judge_assessments', 'id', 'uuid_table_lookup', 'Judge assessment.'),
  ('assessment_score_entry', 'Assessment score entry', 'assessment_score_entries', 'id', 'uuid_table_lookup', 'Score entry.'),
  ('assessment_evidence', 'Assessment evidence', 'assessment_evidence', 'id', 'uuid_table_lookup', 'Assessment evidence.'),
  ('decision_result', 'Decision result', 'decision_results', 'id', 'uuid_table_lookup', 'Decision/result.'),
  ('result_artifact', 'Result artifact', 'result_artifacts', 'id', 'uuid_table_lookup', 'Result artifact.'),
  ('park_award_cache', 'Park award cache', 'park_award_cache', 'park_id', 'uuid_table_lookup', 'Derived public award cache.'),
  ('public_map_update_event', 'Public map update event', 'public_map_update_events', 'id', 'uuid_table_lookup', 'Public map outbox event.'),
  ('notification_queue', 'Notification queue', 'notification_queue', 'id', 'uuid_table_lookup', 'Notification queue row.'),
  ('notification_log', 'Notification log', 'notification_logs', 'id', 'uuid_table_lookup', 'Notification log row.'),
  ('message_thread', 'Message thread', 'message_threads', 'id', 'uuid_table_lookup', 'Message thread.'),
  ('message_entry', 'Message entry', 'message_entries', 'id', 'uuid_table_lookup', 'Message entry.'),
  ('archive_record', 'Archive record', 'migration_archive_records', 'id', 'uuid_table_lookup', 'Migration archive provenance.'),
  ('external_archive_manifest', 'External archive manifest', 'external_archive_manifest', 'id', 'external_archive_manifest', 'Externally managed archive manifest reference.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO migration_source_table_catalog (
  id, source_system, source_database, source_schema, source_table, source_group,
  classification, primary_key_columns, natural_key_columns, retention_decision, notes
)
VALUES
  ('21000000-0000-4000-8000-000000000001', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Park', 'Park', 'core_business', ARRAY['ID'], ARRAY['ParkTitle'], 'migrate', 'Stable park/site master record.'),
  ('21000000-0000-4000-8000-000000000002', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Organisation', 'Organisation', 'core_business', ARRAY['ID'], ARRAY['Organisation'], 'migrate', 'Managing body/operator.'),
  ('21000000-0000-4000-8000-000000000003', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Contact', 'Contact', 'identity', ARRAY['ID'], ARRAY['Email'], 'link_only', 'Legacy contact/person record.'),
  ('21000000-0000-4000-8000-000000000004', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'ParksContact', 'ParksContact', 'core_business', ARRAY['ParkID','ContactID'], ARRAY['ParkID','ContactID'], 'link_only', 'Park-contact relationship.'),
  ('21000000-0000-4000-8000-000000000005', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'ParkAwardApplication', 'ParkAwardApplication', 'core_business', ARRAY['ID'], ARRAY['ParkID','SeasonYear'], 'migrate', 'Main annual application form.'),
  ('21000000-0000-4000-8000-000000000006', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Award', 'Award', 'core_business', ARRAY['ID'], ARRAY['ParkAwardApplicationID'], 'migrate', 'Legacy award/allocation/result record.'),
  ('21000000-0000-4000-8000-000000000007', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'ParkApplicationNote', 'ParkApplicationNote', 'core_business', ARRAY['ID'], ARRAY['ParkAwardApplicationID','JudgeID'], 'link_only', 'Judge notes/forms/feedback source.'),
  ('21000000-0000-4000-8000-000000000008', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'ParkDocument', 'ParkDocument', 'document', ARRAY['ID'], ARRAY['ParkID'], 'link_only', 'Legacy filename document references.'),
  ('21000000-0000-4000-8000-000000000009', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Judge', 'Judge', 'identity', ARRAY['ID'], ARRAY['Email'], 'migrate', 'Judge profile source.'),
  ('21000000-0000-4000-8000-000000000010', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'JudgeApplication', 'JudgeApplication', 'identity', ARRAY['ID'], ARRAY['Email'], 'link_only', 'Judge onboarding/application source.'),
  ('21000000-0000-4000-8000-000000000011', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'JudgeConflictOfInterest', 'JudgeConflictOfInterest', 'core_business', ARRAY['ID'], ARRAY['JudgeID','ParkID'], 'migrate', 'Conflict of interest source.'),
  ('21000000-0000-4000-8000-000000000012', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Fee', 'Fee', 'finance', ARRAY['ID'], ARRAY['CountryID','SeasonYear'], 'link_only', 'Legacy fee source for later finance goal.'),
  ('21000000-0000-4000-8000-000000000013', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Invoice', 'Invoice', 'finance', ARRAY['ID'], ARRAY['ParkAwardApplicationID'], 'link_only', 'Legacy invoice source for later finance goal.'),
  ('21000000-0000-4000-8000-000000000014', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'EmailLog', 'EmailLog', 'communications', ARRAY['ID'], ARRAY['ParkAwardApplicationID'], 'archive_only', 'Legacy notification delivery history.'),
  ('21000000-0000-4000-8000-000000000015', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Country', 'Country', 'reference', ARRAY['ID'], ARRAY['Country'], 'link_only', 'Country reference source.'),
  ('21000000-0000-4000-8000-000000000016', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Region', 'Region', 'reference', ARRAY['ID'], ARRAY['Region'], 'link_only', 'Region reference source.'),
  ('21000000-0000-4000-8000-000000000017', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'County', 'County', 'reference', ARRAY['ID'], ARRAY['County'], 'link_only', 'County reference source.'),
  ('21000000-0000-4000-8000-000000000018', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'Authority', 'Authority', 'reference', ARRAY['ID'], ARRAY['Authority'], 'link_only', 'Authority reference source.'),
  ('21000000-0000-4000-8000-000000000019', 'legacy_greenflag_live', 'GreenFlag_Live', 'dbo', 'CountrySeason', 'CountrySeason', 'reference', ARRAY['ID'], ARRAY['CountryID','SeasonYear'], 'migrate', 'Country season to award cycle/window source.'),
  ('21000000-0000-4000-8000-000000000020', 'legacy_kbt_gfa', 'KBT_GFA', 'dbo', 'UFRecords', 'UmbracoFormsBusiness', 'unclassified_pending_review', ARRAY['Id'], ARRAY['Form'], 'exclude_pending_signoff', 'Umbraco Forms records only when confirmed as business submissions or archive obligations.'),
  ('21000000-0000-4000-8000-000000000021', 'legacy_kbt_gfa', 'KBT_GFA', 'dbo', 'umbracoContent', 'UmbracoContentArchive', 'unclassified_pending_review', ARRAY['id'], ARRAY['nodeId'], 'exclude_pending_signoff', 'Umbraco content only when retained public content or archive candidate.'),
  ('21000000-0000-4000-8000-000000000022', 'legacy_kbt_gfa', 'KBT_GFA', 'dbo', 'umbracoAudit', 'UmbracoAuditConsent', 'unclassified_pending_review', ARRAY['id'], ARRAY['performingUserId','eventDateUtc'], 'exclude_pending_signoff', 'Umbraco audit/consent/security records only where retention obligation applies.')
ON CONFLICT (source_system, source_database, source_schema, source_table) DO NOTHING;

-- migrate:down

DROP INDEX IF EXISTS idx_migration_report_items_target;
DROP INDEX IF EXISTS idx_migration_report_items_source;
DROP INDEX IF EXISTS idx_migration_report_items_report;
DROP TABLE IF EXISTS migration_reconciliation_report_items;
DROP TABLE IF EXISTS migration_reconciliation_reports;
DROP TABLE IF EXISTS migration_archive_records;
DROP INDEX IF EXISTS idx_migration_entity_links_source_status;
DROP INDEX IF EXISTS idx_migration_entity_links_batch_target;
DROP INDEX IF EXISTS idx_migration_entity_links_target;
DROP TABLE IF EXISTS migration_entity_links;
DROP INDEX IF EXISTS idx_migration_source_records_checksum;
DROP INDEX IF EXISTS idx_migration_source_records_natural_key;
DROP INDEX IF EXISTS idx_migration_source_records_source;
DROP TABLE IF EXISTS migration_source_records;
DROP TABLE IF EXISTS migration_mapping_rules;
DROP TABLE IF EXISTS migration_target_entity_types;
DROP TABLE IF EXISTS migration_import_batch_source_tables;
DROP TABLE IF EXISTS migration_import_batches;
DROP TABLE IF EXISTS migration_source_table_catalog;
