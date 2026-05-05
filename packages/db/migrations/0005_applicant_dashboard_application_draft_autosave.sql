-- Slice 4 applicant dashboard and application draft/autosave foundation.

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY,
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE CASCADE,
  park_id uuid NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  owner_internal_user_id uuid REFERENCES internal_users(id),
  status text NOT NULL CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'READY_TO_SUBMIT', 'SUBMITTED', 'SUBMITTED_WITH_MISSING_PLAN', 'LOCKED_FOR_ALLOCATION', 'WITHDRAWN', 'ARCHIVED')),
  completion_percent integer NOT NULL DEFAULT 0 CHECK (completion_percent >= 0 AND completion_percent <= 100),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_episode_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_park_id ON applications (park_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);

CREATE TABLE IF NOT EXISTS application_sections (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  section_key text NOT NULL CHECK (section_key IN ('location', 'site_information', 'contact_details', 'publicity', 'optional_information', 'previous_feedback', 'review')),
  status text NOT NULL CHECK (status IN ('not_started', 'in_progress', 'complete')),
  completion_percent integer NOT NULL DEFAULT 0 CHECK (completion_percent >= 0 AND completion_percent <= 100),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_application_sections_application_id ON application_sections (application_id);

CREATE TABLE IF NOT EXISTS application_field_values (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  field_key text NOT NULL,
  field_value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, section_key, field_key)
);

CREATE INDEX IF NOT EXISTS idx_application_field_values_application_id ON application_field_values (application_id);

CREATE TABLE IF NOT EXISTS application_feedback_responses (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  response_text text NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id)
);

-- migrate:down
DROP TABLE IF EXISTS application_feedback_responses;
DROP INDEX IF EXISTS idx_application_field_values_application_id;
DROP TABLE IF EXISTS application_field_values;
DROP INDEX IF EXISTS idx_application_sections_application_id;
DROP TABLE IF EXISTS application_sections;
DROP INDEX IF EXISTS idx_applications_status;
DROP INDEX IF EXISTS idx_applications_park_id;
DROP TABLE IF EXISTS applications;
