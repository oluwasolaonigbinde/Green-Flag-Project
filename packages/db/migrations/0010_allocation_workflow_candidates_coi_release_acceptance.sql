-- Slice 9 allocation workflow, candidate policy, COI flags, and judge assignments.

CREATE TABLE IF NOT EXISTS allocation_policy_configs (
  id uuid PRIMARY KEY,
  country_code text NOT NULL CHECK (char_length(country_code) BETWEEN 2 AND 3),
  cycle_year integer NOT NULL CHECK (cycle_year >= 2000),
  default_distance_km integer NOT NULL CHECK (default_distance_km > 0),
  distance_weight numeric(5,4) NOT NULL CHECK (distance_weight >= 0 AND distance_weight <= 1),
  cluster_weight numeric(5,4) NOT NULL CHECK (cluster_weight >= 0 AND cluster_weight <= 1),
  rotation_penalty integer NOT NULL CHECK (rotation_penalty >= 0 AND rotation_penalty <= 100),
  training_third_judge_allowed boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, cycle_year)
);

CREATE TABLE IF NOT EXISTS allocations (
  id uuid PRIMARY KEY,
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('HELD', 'RELEASED', 'COMPLETED', 'WITHDRAWN')),
  final_judge_count integer NOT NULL CHECK (final_judge_count BETWEEN 1 AND 3),
  suggested_judge_count integer NOT NULL CHECK (suggested_judge_count BETWEEN 1 AND 3),
  contact_reveal_available boolean NOT NULL DEFAULT false,
  notification_intents text[] NOT NULL DEFAULT '{}',
  audit_event_id uuid,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_episode_id)
);

CREATE INDEX IF NOT EXISTS idx_allocations_episode ON allocations (assessment_episode_id);
CREATE INDEX IF NOT EXISTS idx_allocations_status ON allocations (status);
CREATE INDEX IF NOT EXISTS idx_allocations_audit_event_id ON allocations (audit_event_id);

CREATE TABLE IF NOT EXISTS judge_assignments (
  id uuid PRIMARY KEY,
  allocation_id uuid NOT NULL REFERENCES allocations(id) ON DELETE CASCADE,
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  assessor_profile_id uuid NOT NULL REFERENCES assessor_profiles(id),
  status text NOT NULL CHECK (status IN ('HELD', 'RELEASED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN')),
  contact_reveal_available boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_judge_assignments_assessor ON judge_assignments (assessor_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_judge_assignments_episode ON judge_assignments (assessment_episode_id);

CREATE TABLE IF NOT EXISTS allocation_coi_flags (
  id uuid PRIMARY KEY,
  assessment_episode_id uuid REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  assessor_profile_id uuid NOT NULL REFERENCES assessor_profiles(id) ON DELETE CASCADE,
  flag_type text NOT NULL CHECK (flag_type IN ('hard', 'self_declared', 'admin_set', 'same_operator', 'soft', 'rotation')),
  severity text NOT NULL CHECK (severity IN ('hard_exclude', 'soft', 'deprioritise')),
  reason text NOT NULL,
  requires_acknowledgement boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allocation_coi_flags_episode ON allocation_coi_flags (assessment_episode_id);
CREATE INDEX IF NOT EXISTS idx_allocation_coi_flags_assessor ON allocation_coi_flags (assessor_profile_id);

-- migrate:down

DROP INDEX IF EXISTS idx_allocation_coi_flags_assessor;
DROP INDEX IF EXISTS idx_allocation_coi_flags_episode;
DROP TABLE IF EXISTS allocation_coi_flags;
DROP INDEX IF EXISTS idx_judge_assignments_episode;
DROP INDEX IF EXISTS idx_judge_assignments_assessor;
DROP TABLE IF EXISTS judge_assignments;
DROP INDEX IF EXISTS idx_allocations_audit_event_id;
DROP INDEX IF EXISTS idx_allocations_status;
DROP INDEX IF EXISTS idx_allocations_episode;
DROP TABLE IF EXISTS allocations;
DROP TABLE IF EXISTS allocation_policy_configs;
