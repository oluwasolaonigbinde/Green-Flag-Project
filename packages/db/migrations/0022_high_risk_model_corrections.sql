-- Goal 5 high-risk model corrections.
-- Keeps assessment_episodes as the lifecycle root while adding carryover provenance,
-- assignment-level judge semantics, and typed park/application area records.

ALTER TABLE cycle_windows
  ADD CONSTRAINT cycle_windows_id_award_cycle_episode_type_unique
  UNIQUE (id, award_cycle_id, episode_type);

ALTER TABLE assessment_episodes
  ADD COLUMN operational_year integer,
  ADD COLUMN source_cycle_id uuid;

UPDATE assessment_episodes ae
SET
  operational_year = ac.cycle_year,
  source_cycle_id = ae.award_cycle_id
FROM award_cycles ac
WHERE ac.id = ae.award_cycle_id
  AND (ae.operational_year IS NULL OR ae.source_cycle_id IS NULL);

CREATE OR REPLACE FUNCTION set_assessment_episode_goal5_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_cycle_year integer;
BEGIN
  IF NEW.source_cycle_id IS NULL THEN
    NEW.source_cycle_id := NEW.award_cycle_id;
  END IF;

  IF NEW.operational_year IS NULL
    OR (TG_OP = 'UPDATE' AND NEW.award_cycle_id IS DISTINCT FROM OLD.award_cycle_id)
  THEN
    SELECT cycle_year INTO selected_cycle_year FROM award_cycles WHERE id = NEW.award_cycle_id;
    NEW.operational_year := selected_cycle_year;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assessment_episode_goal5_defaults
BEFORE INSERT OR UPDATE OF award_cycle_id, source_cycle_id, operational_year
ON assessment_episodes
FOR EACH ROW
EXECUTE FUNCTION set_assessment_episode_goal5_defaults();

ALTER TABLE assessment_episodes
  ALTER COLUMN operational_year SET NOT NULL,
  ALTER COLUMN source_cycle_id SET NOT NULL,
  ADD CONSTRAINT assessment_episodes_source_cycle_fk
    FOREIGN KEY (source_cycle_id) REFERENCES award_cycles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT assessment_episodes_operational_year_positive_check
    CHECK (operational_year BETWEEN 1900 AND 2200),
  ADD CONSTRAINT assessment_episodes_cycle_window_integrity_fk
    FOREIGN KEY (cycle_window_id, award_cycle_id, episode_type)
    REFERENCES cycle_windows (id, award_cycle_id, episode_type) ON DELETE RESTRICT;

CREATE INDEX idx_assessment_episodes_operational_year
  ON assessment_episodes (operational_year, episode_type);

CREATE INDEX idx_assessment_episodes_source_cycle
  ON assessment_episodes (source_cycle_id);

CREATE INDEX idx_assessment_episodes_park_source_cycle
  ON assessment_episodes (park_id, source_cycle_id, episode_type);

ALTER TABLE judge_assignments
  ADD COLUMN assignment_role text,
  ADD COLUMN required_for_contact_reveal boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT judge_assignments_assignment_role_check
    CHECK (
      assignment_role IS NULL OR assignment_role IN (
        'PRIMARY_JUDGE',
        'SECONDARY_JUDGE',
        'MYSTERY_JUDGE',
        'TRAINING_OBSERVER'
      )
    );

WITH ranked AS (
  SELECT
    ja.id,
    ae.episode_type,
    row_number() OVER (
      PARTITION BY ja.allocation_id, ja.assessment_episode_id
      ORDER BY ja.created_at_utc, ja.id
    ) AS role_order,
    count(*) OVER (PARTITION BY ja.allocation_id, ja.assessment_episode_id) AS role_count
  FROM judge_assignments ja
  JOIN assessment_episodes ae ON ae.id = ja.assessment_episode_id
  WHERE ja.assignment_role IS NULL
)
UPDATE judge_assignments ja
SET
  assignment_role = CASE
    WHEN ranked.episode_type = 'MYSTERY_SHOP' THEN 'MYSTERY_JUDGE'
    WHEN ranked.episode_type = 'FULL_ASSESSMENT' AND ranked.role_count <= 3 AND ranked.role_order = 1 THEN 'PRIMARY_JUDGE'
    WHEN ranked.episode_type = 'FULL_ASSESSMENT' AND ranked.role_count <= 3 AND ranked.role_order = 2 THEN 'SECONDARY_JUDGE'
    WHEN ranked.episode_type = 'FULL_ASSESSMENT' AND ranked.role_count <= 3 THEN 'TRAINING_OBSERVER'
    ELSE NULL
  END,
  required_for_contact_reveal = CASE
    WHEN ranked.episode_type = 'FULL_ASSESSMENT' AND ranked.role_count <= 3 AND ranked.role_order > 2 THEN false
    ELSE true
  END
FROM ranked
WHERE ranked.id = ja.id;

CREATE INDEX idx_judge_assignments_assignment_role
  ON judge_assignments (assignment_role)
  WHERE assignment_role IS NOT NULL;

CREATE UNIQUE INDEX uq_judge_assignments_active_primary_per_allocation
  ON judge_assignments (allocation_id)
  WHERE assignment_role = 'PRIMARY_JUDGE'
    AND status NOT IN ('DECLINED', 'WITHDRAWN');

CREATE UNIQUE INDEX uq_judge_assignments_active_secondary_per_allocation
  ON judge_assignments (allocation_id)
  WHERE assignment_role = 'SECONDARY_JUDGE'
    AND status NOT IN ('DECLINED', 'WITHDRAWN');

CREATE UNIQUE INDEX uq_judge_assignments_active_primary_per_episode
  ON judge_assignments (assessment_episode_id)
  WHERE assignment_role = 'PRIMARY_JUDGE'
    AND status NOT IN ('DECLINED', 'WITHDRAWN');

CREATE UNIQUE INDEX uq_judge_assignments_active_secondary_per_episode
  ON judge_assignments (assessment_episode_id)
  WHERE assignment_role = 'SECONDARY_JUDGE'
    AND status NOT IN ('DECLINED', 'WITHDRAWN');

CREATE TABLE park_area_measurements (
  id uuid PRIMARY KEY,
  park_id uuid NOT NULL REFERENCES parks(id) ON DELETE RESTRICT,
  area_hectares numeric(10, 2) NOT NULL CHECK (area_hectares > 0),
  source_kind text NOT NULL CHECK (
    source_kind IN (
      'os_open_greenspace_suggestion',
      'applicant_confirmed',
      'manual_entry',
      'legacy_import',
      'admin_override'
    )
  ),
  source_label text,
  admin_override_reason text,
  audit_event_id uuid REFERENCES audit_events(id) ON DELETE RESTRICT,
  admin_override_event_id uuid REFERENCES admin_override_events(id) ON DELETE RESTRICT,
  is_current boolean NOT NULL DEFAULT false,
  captured_by_actor_id uuid REFERENCES internal_users(id) ON DELETE RESTRICT,
  captured_at_utc timestamptz NOT NULL DEFAULT now(),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT park_area_measurements_admin_override_reason_check
    CHECK (source_kind <> 'admin_override' OR NULLIF(trim(admin_override_reason), '') IS NOT NULL)
);

CREATE UNIQUE INDEX uq_park_area_measurements_one_current
  ON park_area_measurements (park_id)
  WHERE is_current;

CREATE INDEX idx_park_area_measurements_park_captured
  ON park_area_measurements (park_id, captured_at_utc DESC);

CREATE INDEX idx_park_area_measurements_source_kind
  ON park_area_measurements (source_kind);

CREATE TABLE application_area_snapshots (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  assessment_episode_id uuid NOT NULL REFERENCES assessment_episodes(id) ON DELETE RESTRICT,
  park_id uuid NOT NULL REFERENCES parks(id) ON DELETE RESTRICT,
  park_area_measurement_id uuid REFERENCES park_area_measurements(id) ON DELETE RESTRICT,
  area_hectares numeric(10, 2) NOT NULL CHECK (area_hectares > 0),
  source_kind text NOT NULL CHECK (
    source_kind IN (
      'os_open_greenspace_suggestion',
      'applicant_confirmed',
      'manual_entry',
      'legacy_import',
      'admin_override'
    )
  ),
  snapshot_reason text NOT NULL CHECK (
    snapshot_reason IN (
      'application_submission',
      'legacy_import',
      'manual_reconciliation',
      'admin_override'
    )
  ),
  captured_at_utc timestamptz NOT NULL DEFAULT now(),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id)
);

CREATE INDEX idx_application_area_snapshots_episode
  ON application_area_snapshots (assessment_episode_id);

CREATE INDEX idx_application_area_snapshots_park
  ON application_area_snapshots (park_id);

CREATE OR REPLACE FUNCTION prevent_application_area_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'application_area_snapshots are immutable once captured';
END;
$$;

CREATE TRIGGER application_area_snapshots_no_update
BEFORE UPDATE OR DELETE ON application_area_snapshots
FOR EACH ROW
EXECUTE FUNCTION prevent_application_area_snapshot_update();

INSERT INTO migration_target_entity_types (code, label, target_table, id_column, validation_mode, notes)
VALUES
  ('park_area_measurement', 'Park area measurement', 'park_area_measurements', 'id', 'uuid_table_lookup', 'Source-tracked park area history/current area.'),
  ('application_area_snapshot', 'Application area snapshot', 'application_area_snapshots', 'id', 'uuid_table_lookup', 'Immutable application-time area for fee matching and reconciliation.')
ON CONFLICT (code) DO NOTHING;

-- Ambiguous assignment-role backfills remain nullable and must be reconciled through
-- Goal 1 migration_reconciliation_reports/items before a later migration enforces NOT NULL.

-- migrate:down

DELETE FROM migration_target_entity_types
WHERE code IN ('park_area_measurement', 'application_area_snapshot');

DROP INDEX IF EXISTS idx_application_area_snapshots_park;
DROP INDEX IF EXISTS idx_application_area_snapshots_episode;
DROP TRIGGER IF EXISTS application_area_snapshots_no_update ON application_area_snapshots;
DROP FUNCTION IF EXISTS prevent_application_area_snapshot_update();
DROP TABLE IF EXISTS application_area_snapshots;

DROP INDEX IF EXISTS idx_park_area_measurements_source_kind;
DROP INDEX IF EXISTS idx_park_area_measurements_park_captured;
DROP INDEX IF EXISTS uq_park_area_measurements_one_current;
DROP TABLE IF EXISTS park_area_measurements;

DROP INDEX IF EXISTS uq_judge_assignments_active_secondary_per_episode;
DROP INDEX IF EXISTS uq_judge_assignments_active_primary_per_episode;
DROP INDEX IF EXISTS uq_judge_assignments_active_secondary_per_allocation;
DROP INDEX IF EXISTS uq_judge_assignments_active_primary_per_allocation;
DROP INDEX IF EXISTS idx_judge_assignments_assignment_role;

ALTER TABLE judge_assignments
  DROP CONSTRAINT IF EXISTS judge_assignments_assignment_role_check,
  DROP COLUMN IF EXISTS required_for_contact_reveal,
  DROP COLUMN IF EXISTS assignment_role;

DROP INDEX IF EXISTS idx_assessment_episodes_park_source_cycle;
DROP INDEX IF EXISTS idx_assessment_episodes_source_cycle;
DROP INDEX IF EXISTS idx_assessment_episodes_operational_year;

ALTER TABLE assessment_episodes
  DROP CONSTRAINT IF EXISTS assessment_episodes_cycle_window_integrity_fk,
  DROP CONSTRAINT IF EXISTS assessment_episodes_operational_year_positive_check,
  DROP CONSTRAINT IF EXISTS assessment_episodes_source_cycle_fk;

DROP TRIGGER IF EXISTS trg_assessment_episode_goal5_defaults ON assessment_episodes;
DROP FUNCTION IF EXISTS set_assessment_episode_goal5_defaults();

ALTER TABLE assessment_episodes
  DROP COLUMN IF EXISTS source_cycle_id,
  DROP COLUMN IF EXISTS operational_year;

ALTER TABLE cycle_windows
  DROP CONSTRAINT IF EXISTS cycle_windows_id_award_cycle_episode_type_unique;
