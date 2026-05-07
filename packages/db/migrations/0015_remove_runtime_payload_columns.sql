-- Removes legacy JSON compatibility columns from lower-env databases that have
-- already applied the transitional adapter migrations.

ALTER TABLE allocations
  ADD COLUMN IF NOT EXISTS audit_event_id uuid;

CREATE INDEX IF NOT EXISTS idx_allocations_audit_event_id
  ON allocations (audit_event_id);

ALTER TABLE decision_results
  ADD COLUMN IF NOT EXISTS internal_notes text;

CREATE TABLE IF NOT EXISTS assessment_template_criteria (
  template_config_id uuid NOT NULL REFERENCES assessment_template_configs(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  max_score integer NOT NULL CHECK (max_score > 0),
  placeholder_only boolean NOT NULL DEFAULT true CHECK (placeholder_only),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_config_id, criterion_id),
  UNIQUE (template_config_id, code),
  UNIQUE (template_config_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_assessment_template_criteria_template
  ON assessment_template_criteria (template_config_id, sort_order);

DO $$
DECLARE
  table_name text;
  column_name text := 'runtime_' || 'payload';
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'registration_submissions',
    'applications',
    'document_assets',
    'document_upload_sessions',
    'invoices',
    'payment_states',
    'assessor_profiles',
    'allocation_policy_configs',
    'allocations',
    'judge_assignments',
    'allocation_coi_flags',
    'assessment_template_configs',
    'assessment_visits',
    'judge_assessments',
    'assessment_evidence',
    'decision_results',
    'result_artifacts',
    'park_award_cache',
    'public_map_update_events',
    'notification_template_versions',
    'notification_queue',
    'notification_logs',
    'notification_suppressions',
    'message_threads',
    'message_entries',
    'job_runs',
    'export_jobs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS %I', table_name, column_name);
  END LOOP;
END $$;

-- migrate:down

ALTER TABLE registration_submissions ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE document_assets ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE document_upload_sessions ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE payment_states ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE assessor_profiles ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE allocation_policy_configs ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE allocations ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE judge_assignments ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE allocation_coi_flags ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE assessment_template_configs ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE assessment_visits ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE judge_assessments ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE assessment_evidence ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE decision_results ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE result_artifacts ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE park_award_cache ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE public_map_update_events ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE notification_template_versions ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE notification_suppressions ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE message_entries ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
