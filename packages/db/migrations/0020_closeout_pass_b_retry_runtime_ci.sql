-- Closeout Pass B: retry/idempotency and provider-adjacent dedupe safety.

ALTER TABLE result_artifacts
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_result_artifacts_dedupe_key
  ON result_artifacts (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public_map_update_events
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_public_map_update_events_dedupe_key
  ON public_map_update_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_queue_dedupe_key
  ON notification_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_job_runs_type_dedupe_key
  ON job_runs (job_type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE export_jobs
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_export_jobs_actor_type_format_dedupe_key
  ON export_jobs (requested_by_actor_id, export_type, format, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS ux_export_jobs_actor_type_format_dedupe_key;
ALTER TABLE export_jobs
  DROP COLUMN IF EXISTS dedupe_key;

DROP INDEX IF EXISTS ux_job_runs_type_dedupe_key;
ALTER TABLE job_runs
  DROP COLUMN IF EXISTS dedupe_key;

DROP INDEX IF EXISTS ux_notification_queue_dedupe_key;
ALTER TABLE notification_queue
  DROP COLUMN IF EXISTS dedupe_key;

DROP INDEX IF EXISTS ux_public_map_update_events_dedupe_key;
ALTER TABLE public_map_update_events
  DROP COLUMN IF EXISTS dedupe_key;

DROP INDEX IF EXISTS ux_result_artifacts_dedupe_key;
ALTER TABLE result_artifacts
  DROP COLUMN IF EXISTS dedupe_key;
