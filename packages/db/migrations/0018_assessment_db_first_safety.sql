-- Pass 2B: targeted DB-first safety indexes for assessment command paths.

CREATE UNIQUE INDEX IF NOT EXISTS ux_assessment_visits_judge_assignment
  ON assessment_visits (judge_assignment_id);

CREATE INDEX IF NOT EXISTS idx_judge_assessments_assignment_version
  ON judge_assessments (judge_assignment_id, version);

CREATE INDEX IF NOT EXISTS idx_assessment_evidence_assessment_created
  ON assessment_evidence (assessment_id, created_at_utc, id);

-- migrate:down

DROP INDEX IF EXISTS idx_assessment_evidence_assessment_created;
DROP INDEX IF EXISTS idx_judge_assessments_assignment_version;
DROP INDEX IF EXISTS ux_assessment_visits_judge_assignment;
