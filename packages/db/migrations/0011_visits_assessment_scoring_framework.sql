-- Slice 11 visits and configurable assessment/scoring framework.

CREATE TABLE IF NOT EXISTS assessment_template_configs (
  id uuid PRIMARY KEY,
  award_track_code text NOT NULL REFERENCES award_tracks(code),
  cycle_year integer NOT NULL CHECK (cycle_year >= 2000),
  source text NOT NULL,
  pass_threshold_percent integer NOT NULL CHECK (pass_threshold_percent BETWEEN 0 AND 100),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (award_track_code, cycle_year)
);

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

CREATE TABLE IF NOT EXISTS assessment_visits (
  id uuid PRIMARY KEY,
  judge_assignment_id uuid NOT NULL REFERENCES judge_assignments(id) ON DELETE CASCADE,
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  assessor_profile_id uuid NOT NULL REFERENCES assessor_profiles(id),
  status text NOT NULL CHECK (status IN ('UNSCHEDULED', 'SCHEDULED', 'COMPLETED', 'CANCELLED')),
  scheduled_start_at_utc timestamptz,
  scheduled_end_at_utc timestamptz,
  location_disclosure text NOT NULL CHECK (location_disclosure IN ('visible_to_assessor_only', 'mystery_restricted')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  CHECK (scheduled_end_at_utc IS NULL OR scheduled_start_at_utc IS NULL OR scheduled_end_at_utc > scheduled_start_at_utc)
);

CREATE INDEX IF NOT EXISTS idx_assessment_visits_assessor ON assessment_visits (assessor_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_assessment_visits_episode ON assessment_visits (assessment_episode_id);

CREATE TABLE IF NOT EXISTS judge_assessments (
  id uuid PRIMARY KEY,
  judge_assignment_id uuid NOT NULL REFERENCES judge_assignments(id) ON DELETE CASCADE,
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  assessor_profile_id uuid NOT NULL REFERENCES assessor_profiles(id),
  status text NOT NULL CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED_FOR_CLARIFICATION', 'ACCEPTED')),
  raw_score_total integer NOT NULL DEFAULT 0 CHECK (raw_score_total >= 0),
  max_score_total integer NOT NULL CHECK (max_score_total > 0),
  threshold_met boolean NOT NULL DEFAULT false,
  offline_sync_version integer NOT NULL DEFAULT 0 CHECK (offline_sync_version >= 0),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (judge_assignment_id)
);

CREATE INDEX IF NOT EXISTS idx_judge_assessments_episode ON judge_assessments (assessment_episode_id, status);

CREATE TABLE IF NOT EXISTS assessment_evidence (
  id uuid PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES judge_assessments(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN ('photo', 'note', 'document')),
  filename text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('admin_and_assessor', 'mystery_restricted')),
  storage_provider text NOT NULL,
  storage_key text NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_evidence_assessment ON assessment_evidence (assessment_id);

-- migrate:down

DROP INDEX IF EXISTS idx_assessment_evidence_assessment;
DROP TABLE IF EXISTS assessment_evidence;
DROP INDEX IF EXISTS idx_judge_assessments_episode;
DROP TABLE IF EXISTS judge_assessments;
DROP INDEX IF EXISTS idx_assessment_visits_episode;
DROP INDEX IF EXISTS idx_assessment_visits_assessor;
DROP TABLE IF EXISTS assessment_visits;
DROP INDEX IF EXISTS idx_assessment_template_criteria_template;
DROP TABLE IF EXISTS assessment_template_criteria;
DROP TABLE IF EXISTS assessment_template_configs;
