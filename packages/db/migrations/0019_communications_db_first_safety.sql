-- Pass 2C DB-first communications safety indexes and optimistic version column.

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0 CHECK (version >= 0);

CREATE INDEX IF NOT EXISTS idx_message_threads_visible_applicant
  ON message_threads (visible_to_applicant, status, updated_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_message_threads_participants
  ON message_threads USING gin (participant_actor_ids);

CREATE INDEX IF NOT EXISTS idx_notification_logs_notification_created
  ON notification_logs (notification_id, created_at_utc);

CREATE INDEX IF NOT EXISTS idx_notification_suppressions_related
  ON notification_suppressions (related_entity_type, related_entity_id, created_at_utc);

-- migrate:down

DROP INDEX IF EXISTS idx_notification_suppressions_related;
DROP INDEX IF EXISTS idx_notification_logs_notification_created;
DROP INDEX IF EXISTS idx_message_threads_participants;
DROP INDEX IF EXISTS idx_message_threads_visible_applicant;

ALTER TABLE message_threads
  DROP COLUMN IF EXISTS version;
