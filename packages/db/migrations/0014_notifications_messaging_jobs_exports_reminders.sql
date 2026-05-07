-- Slice 13 notifications, messaging, jobs, exports, and renewal reminders.

CREATE TABLE IF NOT EXISTS notification_template_versions (
  id uuid PRIMARY KEY,
  template_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'in_app')),
  subject text,
  body_marker text NOT NULL CHECK (body_marker = 'external_template_copy_unavailable'),
  active boolean NOT NULL DEFAULT true,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_key, version, channel)
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id uuid PRIMARY KEY,
  template_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'in_app')),
  recipient_actor_id uuid REFERENCES internal_users(id),
  recipient_address_marker text NOT NULL CHECK (recipient_address_marker = 'provider_address_deferred'),
  status text NOT NULL CHECK (status IN ('QUEUED', 'SUPPRESSED', 'DISPATCH_STUBBED', 'FAILED')),
  suppression_reason text CHECK (suppression_reason IN ('mystery_redaction', 'channel_not_configured', 'recipient_opted_out')),
  related_entity_type text,
  related_entity_id uuid,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue (status, channel, created_at_utc);
CREATE INDEX IF NOT EXISTS idx_notification_queue_related ON notification_queue (related_entity_type, related_entity_id);

CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY,
  notification_id uuid NOT NULL REFERENCES notification_queue(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('QUEUED', 'SUPPRESSED', 'DISPATCH_STUBBED', 'FAILED')),
  provider text NOT NULL CHECK (provider = 'adapter_not_configured'),
  detail text NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_suppressions (
  id uuid PRIMARY KEY,
  notification_id uuid REFERENCES notification_queue(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('mystery_redaction', 'channel_not_configured', 'recipient_opted_out')),
  actor_id uuid REFERENCES internal_users(id),
  related_entity_type text,
  related_entity_id uuid,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_suppressions_reason ON notification_suppressions (reason, created_at_utc);

CREATE TABLE IF NOT EXISTS message_threads (
  id uuid PRIMARY KEY,
  assessment_episode_id uuid REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  park_id uuid REFERENCES parks(id),
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'SUPPRESSED')),
  participant_actor_ids uuid[] NOT NULL DEFAULT '{}',
  visible_to_applicant boolean NOT NULL DEFAULT true,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_threads_episode ON message_threads (assessment_episode_id, status);
CREATE INDEX IF NOT EXISTS idx_message_threads_park ON message_threads (park_id, status);

CREATE TABLE IF NOT EXISTS message_entries (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_actor_id uuid NOT NULL REFERENCES internal_users(id),
  body text NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_entries_thread ON message_entries (thread_id, created_at_utc);

CREATE TABLE IF NOT EXISTS job_runs (
  id uuid PRIMARY KEY,
  job_type text NOT NULL CHECK (job_type IN ('renewal_reminders', 'public_map_outbox', 'export_processing')),
  status text NOT NULL CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED')),
  processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  detail text,
  started_at_utc timestamptz NOT NULL DEFAULT now(),
  completed_at_utc timestamptz
);

CREATE INDEX IF NOT EXISTS idx_job_runs_type_status ON job_runs (job_type, status, started_at_utc);

CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY,
  export_type text NOT NULL CHECK (export_type IN ('applications', 'payments', 'results', 'public_map_events')),
  format text NOT NULL CHECK (format IN ('csv', 'json')),
  status text NOT NULL CHECK (status IN ('REQUESTED', 'COMPLETED', 'FAILED', 'SUPPRESSED')),
  redaction_profile text NOT NULL,
  storage_provider text NOT NULL CHECK (storage_provider = 'lower_env_stub'),
  storage_key text,
  requested_by_actor_id uuid NOT NULL REFERENCES internal_users(id),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  completed_at_utc timestamptz
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_type_status ON export_jobs (export_type, status, created_at_utc);

-- migrate:down

DROP INDEX IF EXISTS idx_export_jobs_type_status;
DROP TABLE IF EXISTS export_jobs;
DROP INDEX IF EXISTS idx_job_runs_type_status;
DROP TABLE IF EXISTS job_runs;
DROP INDEX IF EXISTS idx_message_entries_thread;
DROP TABLE IF EXISTS message_entries;
DROP INDEX IF EXISTS idx_message_threads_park;
DROP INDEX IF EXISTS idx_message_threads_episode;
DROP TABLE IF EXISTS message_threads;
DROP INDEX IF EXISTS idx_notification_suppressions_reason;
DROP TABLE IF EXISTS notification_suppressions;
DROP TABLE IF EXISTS notification_logs;
DROP INDEX IF EXISTS idx_notification_queue_related;
DROP INDEX IF EXISTS idx_notification_queue_status;
DROP TABLE IF EXISTS notification_queue;
DROP TABLE IF EXISTS notification_template_versions;
