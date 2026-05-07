-- Slice 12.5 PostgreSQL read-model normalisation hardening.
-- Adds relational rows/indexes for read-heavy paths.

CREATE TABLE IF NOT EXISTS assessment_score_entries (
  assessment_id uuid NOT NULL REFERENCES judge_assessments(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, criterion_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_score_entries_assessment ON assessment_score_entries (assessment_id);
CREATE INDEX IF NOT EXISTS idx_application_sections_status ON application_sections (status, updated_at_utc);
CREATE INDEX IF NOT EXISTS idx_application_field_values_section ON application_field_values (application_id, section_key);
CREATE INDEX IF NOT EXISTS idx_document_assets_queue ON document_assets (assessment_episode_id, document_type, status, is_current);
CREATE INDEX IF NOT EXISTS idx_document_upload_sessions_status ON document_upload_sessions (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices (status, due_at);
CREATE INDEX IF NOT EXISTS idx_payment_states_allocation_block ON payment_states (blocked_for_allocation, updated_at);
CREATE INDEX IF NOT EXISTS idx_assessor_capacity_cycle_status ON assessor_capacity_declarations (cycle_year, capacity_status);
CREATE INDEX IF NOT EXISTS idx_assessor_availability_window ON assessor_availability_windows (assessor_profile_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_assessment_visits_schedule ON assessment_visits (status, scheduled_start_at_utc);
CREATE INDEX IF NOT EXISTS idx_judge_assessments_episode_threshold ON judge_assessments (assessment_episode_id, status, threshold_met);
CREATE INDEX IF NOT EXISTS idx_decision_results_publication ON decision_results (status, published_at_utc);
CREATE INDEX IF NOT EXISTS idx_park_award_cache_status ON park_award_cache (result_status, published_at_utc);

-- migrate:down

DROP INDEX IF EXISTS idx_park_award_cache_status;
DROP INDEX IF EXISTS idx_decision_results_publication;
DROP INDEX IF EXISTS idx_judge_assessments_episode_threshold;
DROP INDEX IF EXISTS idx_assessment_visits_schedule;
DROP INDEX IF EXISTS idx_assessor_availability_window;
DROP INDEX IF EXISTS idx_assessor_capacity_cycle_status;
DROP INDEX IF EXISTS idx_payment_states_allocation_block;
DROP INDEX IF EXISTS idx_invoices_status_due;
DROP INDEX IF EXISTS idx_document_upload_sessions_status;
DROP INDEX IF EXISTS idx_document_assets_queue;
DROP INDEX IF EXISTS idx_application_field_values_section;
DROP INDEX IF EXISTS idx_application_sections_status;
DROP INDEX IF EXISTS idx_assessment_score_entries_assessment;
DROP TABLE IF EXISTS assessment_score_entries;
