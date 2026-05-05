-- Slice 2 organisations, parks, locations, cycles, and episodes foundation.

CREATE TABLE IF NOT EXISTS organisations (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS award_tracks (
  code text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  operational_status text NOT NULL CHECK (operational_status IN ('OPERATIONAL', 'DRAFT', 'BLOCKED_PENDING_CRITERIA')),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parks (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  award_track_code text NOT NULL REFERENCES award_tracks(code),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING_VERIFICATION', 'PENDING_ADMIN_REVIEW', 'ACTIVE', 'SUSPENDED', 'INACTIVE')),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, name)
);

CREATE INDEX IF NOT EXISTS idx_parks_organisation_id ON parks (organisation_id);

CREATE TABLE IF NOT EXISTS park_locations (
  id uuid PRIMARY KEY,
  park_id uuid NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  latitude numeric(9,6) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  w3w_address text NOT NULL,
  postcode text,
  local_authority text,
  region text,
  country text,
  constituency text,
  confirmed_at_utc timestamptz,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (park_id)
);

CREATE INDEX IF NOT EXISTS idx_park_locations_park_id ON park_locations (park_id);

CREATE TABLE IF NOT EXISTS award_cycles (
  id uuid PRIMARY KEY,
  country_code text NOT NULL CHECK (char_length(country_code) BETWEEN 2 AND 3),
  cycle_year integer NOT NULL CHECK (cycle_year >= 2000),
  application_window_opens_at_utc timestamptz NOT NULL,
  application_window_closes_at_utc timestamptz NOT NULL,
  result_announced_at_utc timestamptz,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, cycle_year)
);

CREATE INDEX IF NOT EXISTS idx_award_cycles_country_year ON award_cycles (country_code, cycle_year);

CREATE TABLE IF NOT EXISTS cycle_windows (
  id uuid PRIMARY KEY,
  award_cycle_id uuid NOT NULL REFERENCES award_cycles(id) ON DELETE CASCADE,
  episode_type text NOT NULL CHECK (episode_type IN ('FULL_ASSESSMENT', 'MYSTERY_SHOP')),
  opens_at_utc timestamptz NOT NULL,
  closes_at_utc timestamptz NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (award_cycle_id, episode_type)
);

CREATE INDEX IF NOT EXISTS idx_cycle_windows_cycle_id ON cycle_windows (award_cycle_id);

CREATE TABLE IF NOT EXISTS assessment_episodes (
  id uuid PRIMARY KEY,
  park_id uuid NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  award_cycle_id uuid NOT NULL REFERENCES award_cycles(id) ON DELETE CASCADE,
  cycle_window_id uuid NOT NULL REFERENCES cycle_windows(id) ON DELETE CASCADE,
  award_track_code text NOT NULL REFERENCES award_tracks(code),
  episode_type text NOT NULL CHECK (episode_type IN ('FULL_ASSESSMENT', 'MYSTERY_SHOP')),
  status text NOT NULL CHECK (status IN ('APPLICATION_DRAFT', 'APPLICATION_SUBMITTED', 'PAYMENT_PENDING', 'PAYMENT_OVERDUE_BLOCKED', 'READY_FOR_ALLOCATION', 'ALLOCATED_HELD', 'ALLOCATED_RELEASED', 'ASSESSMENT_IN_PROGRESS', 'ASSESSMENT_SUBMITTED', 'DECISION_PENDING', 'RESULT_CONFIRMED_HELD', 'PUBLISHED', 'WITHDRAWN', 'CANCELLED', 'ARCHIVED')),
  mystery_suppressed boolean NOT NULL DEFAULT false,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (park_id, award_cycle_id, episode_type)
);

CREATE INDEX IF NOT EXISTS idx_assessment_episodes_cycle_window_id ON assessment_episodes (cycle_window_id);
CREATE INDEX IF NOT EXISTS idx_assessment_episodes_park_cycle ON assessment_episodes (park_id, award_cycle_id);

-- migrate:down
DROP INDEX IF EXISTS idx_assessment_episodes_park_cycle;
DROP TABLE IF EXISTS assessment_episodes;
DROP INDEX IF EXISTS idx_cycle_windows_cycle_id;
DROP TABLE IF EXISTS cycle_windows;
DROP INDEX IF EXISTS idx_award_cycles_country_year;
DROP TABLE IF EXISTS award_cycles;
DROP INDEX IF EXISTS idx_park_locations_park_id;
DROP TABLE IF EXISTS park_locations;
DROP INDEX IF EXISTS idx_parks_organisation_id;
DROP TABLE IF EXISTS parks;
DROP TABLE IF EXISTS award_tracks;
DROP TABLE IF EXISTS organisations;
