
import type { SqlClient } from "@green-flag/db";
import { allocationCommandResponseSchema, allocationPolicySchema } from "@green-flag/contracts";
import type { ApplicantStore } from "../applicant.js";
import { createAllocationStore, type AllocationStore } from "../allocation.js";
import { iso } from "./shared.js";
import { flushAdminOverrideEvents } from "./overrides.js";

export async function hydrateAllocationStore(client: SqlClient) {
  const store = createAllocationStore();
  store.allocations.clear();
  const policyRows = await client.query<{
    id: string;
    country_code: string;
    cycle_year: number;
    default_distance_km: number;
    distance_weight: string | number;
    cluster_weight: string | number;
    rotation_penalty: number;
    training_third_judge_allowed: boolean;
    source: string;
  }>("SELECT * FROM allocation_policy_configs ORDER BY updated_at_utc DESC LIMIT 1");
  const policyRow = policyRows.rows[0];
  if (policyRow) {
    store.policy = allocationPolicySchema.parse({
      policyId: policyRow.id,
      countryCode: policyRow.country_code,
      cycleYear: policyRow.cycle_year,
      defaultDistanceKm: policyRow.default_distance_km,
      distanceWeight: Number(policyRow.distance_weight),
      clusterWeight: Number(policyRow.cluster_weight),
      rotationPenalty: policyRow.rotation_penalty,
      trainingThirdJudgeAllowed: policyRow.training_third_judge_allowed,
      source: policyRow.source
    });
  }
  const allocationRows = await client.query<{
    id: string;
    assessment_episode_id: string;
    status: string;
    final_judge_count: number;
    suggested_judge_count: number;
    contact_reveal_available: boolean;
    notification_intents: string[];
    audit_event_id: string | null;
  }>("SELECT * FROM allocations");
  for (const row of allocationRows.rows) {
    const assignments = await client.query<{
      id: string;
      allocation_id: string;
      assessment_episode_id: string;
      assessor_profile_id: string;
      status: string;
      contact_reveal_available: boolean;
      version: number;
      updated_at_utc: Date | string;
    }>("SELECT * FROM judge_assignments WHERE allocation_id = $1 ORDER BY created_at_utc", [row.id]);
    const overrides = await client.query<{ id: string }>(
      "SELECT id FROM admin_override_events WHERE target_type = 'allocation' AND target_id = $1 ORDER BY created_at_utc",
      [row.id]
    );
    const allocation = allocationCommandResponseSchema.parse({
      allocationId: row.id,
      episodeId: row.assessment_episode_id,
      status: row.status,
      finalJudgeCount: row.final_judge_count,
      suggestedJudgeCount: row.suggested_judge_count,
      contactRevealAvailable: row.contact_reveal_available,
      notificationIntents: row.notification_intents,
      assignments: assignments.rows.map((assignment) => ({
        assignmentId: assignment.id,
        allocationId: assignment.allocation_id,
        episodeId: assignment.assessment_episode_id,
        assessorId: assignment.assessor_profile_id,
        status: assignment.status,
        contactRevealAvailable: assignment.contact_reveal_available,
        version: assignment.version,
        updatedAt: iso(assignment.updated_at_utc)
      })),
      auditEventId: row.audit_event_id ?? "00000000-0000-4000-8000-000000000009",
      overrideEventIds: overrides.rows.map((override) => override.id)
    });
    store.allocations.set(row.id, allocation);
  }
  const coiRows = await client.query<{ assessor_profile_id: string; flag_type: string }>("SELECT assessor_profile_id, flag_type FROM allocation_coi_flags");
  for (const row of coiRows.rows) {
    if (row.flag_type === "hard" || row.flag_type === "self_declared" || row.flag_type === "same_operator") {
      store.hardExcludedAssessorIds.add(row.assessor_profile_id);
    }
    if (row.flag_type === "soft" || row.flag_type === "admin_set") {
      store.softFlagAssessorIds.add(row.assessor_profile_id);
    }
    if (row.flag_type === "rotation") {
      store.rotationFlagAssessorIds.add(row.assessor_profile_id);
    }
  }
  return store;
}

export async function flushAllocationStore(client: SqlClient, store: AllocationStore, applicantStore: ApplicantStore) {
  await client.query(
    `
      INSERT INTO allocation_policy_configs (
        id, country_code, cycle_year, default_distance_km, distance_weight,
        cluster_weight, rotation_penalty, training_third_judge_allowed, source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        default_distance_km = EXCLUDED.default_distance_km,
        distance_weight = EXCLUDED.distance_weight,
        cluster_weight = EXCLUDED.cluster_weight,
        rotation_penalty = EXCLUDED.rotation_penalty,
        training_third_judge_allowed = EXCLUDED.training_third_judge_allowed,
        source = EXCLUDED.source,
        updated_at_utc = now()
    `,
    [
      store.policy.policyId,
      store.policy.countryCode,
      store.policy.cycleYear,
      store.policy.defaultDistanceKm,
      store.policy.distanceWeight,
      store.policy.clusterWeight,
      store.policy.rotationPenalty,
      store.policy.trainingThirdJudgeAllowed,
      store.policy.source
    ]
  );

  for (const [episodeId, status] of applicantStore.episodeStatuses) {
    await client.query(
      "UPDATE assessment_episodes SET status = $2, updated_at_utc = now() WHERE id = $1",
      [episodeId, status]
    );
  }

  for (const [id, allocation] of store.allocations) {
    await client.query(
      `
        INSERT INTO allocations (
          id, assessment_episode_id, status, final_judge_count, suggested_judge_count,
          contact_reveal_available, notification_intents, audit_event_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          final_judge_count = EXCLUDED.final_judge_count,
          suggested_judge_count = EXCLUDED.suggested_judge_count,
          contact_reveal_available = EXCLUDED.contact_reveal_available,
          notification_intents = EXCLUDED.notification_intents,
          audit_event_id = EXCLUDED.audit_event_id,
          updated_at_utc = now()
      `,
      [
        id,
        allocation.episodeId,
        allocation.status,
        allocation.finalJudgeCount,
        allocation.suggestedJudgeCount,
        allocation.contactRevealAvailable,
        allocation.notificationIntents,
        allocation.auditEventId
      ]
    );

    for (const assignment of allocation.assignments) {
      await client.query(
        `
          INSERT INTO judge_assignments (
            id, allocation_id, assessment_episode_id, assessor_profile_id, status,
            contact_reveal_available, version, updated_at_utc
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            contact_reveal_available = EXCLUDED.contact_reveal_available,
            version = EXCLUDED.version,
            updated_at_utc = EXCLUDED.updated_at_utc
        `,
        [
          assignment.assignmentId,
          assignment.allocationId,
          assignment.episodeId,
          assignment.assessorId,
          assignment.status,
          assignment.contactRevealAvailable,
          assignment.version,
          assignment.updatedAt
        ]
      );
    }
  }

  await flushAdminOverrideEvents(client, store.overrideEvents);
}
