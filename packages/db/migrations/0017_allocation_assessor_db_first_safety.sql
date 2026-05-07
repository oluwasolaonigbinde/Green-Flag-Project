-- Pass 2A: targeted DB-first safety indexes for allocation and assessor command paths.

CREATE UNIQUE INDEX IF NOT EXISTS ux_judge_assignments_active_assessor_per_allocation
  ON judge_assignments (allocation_id, assessor_profile_id)
  WHERE status IN ('HELD', 'RELEASED', 'ACCEPTED');

CREATE INDEX IF NOT EXISTS idx_judge_assignments_active_assignment
  ON judge_assignments (id, allocation_id, assessor_profile_id, version)
  WHERE status IN ('RELEASED', 'ACCEPTED', 'DECLINED');

CREATE INDEX IF NOT EXISTS idx_assessor_profiles_internal_user_version
  ON assessor_profiles (internal_user_id, version);

-- migrate:down

DROP INDEX IF EXISTS idx_assessor_profiles_internal_user_version;
DROP INDEX IF EXISTS idx_judge_assignments_active_assignment;
DROP INDEX IF EXISTS ux_judge_assignments_active_assessor_per_allocation;
