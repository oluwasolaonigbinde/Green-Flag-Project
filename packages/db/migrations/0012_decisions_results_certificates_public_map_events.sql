-- Slice 12 decisions, result publication, certificates, and public map event outbox.

CREATE TABLE IF NOT EXISTS decision_results (
  id uuid PRIMARY KEY,
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  park_id uuid NOT NULL REFERENCES parks(id),
  application_id uuid REFERENCES applications(id),
  status text NOT NULL CHECK (status IN ('NOT_READY', 'PENDING_REVIEW', 'CONFIRMED_HELD', 'PUBLISHED', 'WITHDRAWN')),
  outcome text NOT NULL CHECK (outcome IN ('THRESHOLD_MET', 'THRESHOLD_NOT_MET', 'WITHHELD_PENDING_REVIEW')),
  threshold_acknowledged boolean NOT NULL DEFAULT false,
  threshold_met boolean NOT NULL DEFAULT false,
  assessment_count integer NOT NULL DEFAULT 0 CHECK (assessment_count >= 0),
  raw_score_total integer NOT NULL DEFAULT 0 CHECK (raw_score_total >= 0),
  max_score_total integer NOT NULL CHECK (max_score_total > 0),
  internal_notes text,
  published_at_utc timestamptz,
  certificate_id uuid,
  public_map_event_id uuid,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_episode_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_results_episode_status ON decision_results (assessment_episode_id, status);
CREATE INDEX IF NOT EXISTS idx_decision_results_park ON decision_results (park_id, status);

CREATE TABLE IF NOT EXISTS result_artifacts (
  id uuid PRIMARY KEY,
  decision_result_id uuid NOT NULL REFERENCES decision_results(id) ON DELETE CASCADE,
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  artifact_type text NOT NULL CHECK (artifact_type IN ('certificate_shell', 'result_summary')),
  storage_provider text NOT NULL,
  storage_key text NOT NULL,
  public_visible boolean NOT NULL DEFAULT false,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_result_artifacts_decision ON result_artifacts (decision_result_id);

CREATE TABLE IF NOT EXISTS park_award_cache (
  park_id uuid PRIMARY KEY REFERENCES parks(id) ON DELETE CASCADE,
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  decision_result_id uuid NOT NULL REFERENCES decision_results(id) ON DELETE CASCADE,
  result_status text NOT NULL CHECK (result_status IN ('NOT_READY', 'PENDING_REVIEW', 'CONFIRMED_HELD', 'PUBLISHED', 'WITHDRAWN')),
  display_label text NOT NULL,
  published_at_utc timestamptz,
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_map_update_events (
  id uuid PRIMARY KEY,
  decision_result_id uuid NOT NULL REFERENCES decision_results(id) ON DELETE CASCADE,
  park_id uuid NOT NULL REFERENCES parks(id),
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('award_published', 'award_withdrawn')),
  status text NOT NULL CHECK (status IN ('PENDING', 'DISPATCHED', 'FAILED')),
  payload jsonb NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_map_update_events_status ON public_map_update_events (status, created_at_utc);

-- migrate:down

DROP INDEX IF EXISTS idx_public_map_update_events_status;
DROP TABLE IF EXISTS public_map_update_events;
DROP TABLE IF EXISTS park_award_cache;
DROP INDEX IF EXISTS idx_result_artifacts_decision;
DROP TABLE IF EXISTS result_artifacts;
DROP INDEX IF EXISTS idx_decision_results_park;
DROP INDEX IF EXISTS idx_decision_results_episode_status;
DROP TABLE IF EXISTS decision_results;
