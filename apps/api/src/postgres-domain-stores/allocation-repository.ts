import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { SqlClient, UnitOfWork } from "@green-flag/db";
import {
  allocationCandidatesResponseSchema,
  allocationCommandResponseSchema,
  allocationPolicySchema,
  allocationReadyEpisodesResponseSchema,
  assessorAssignmentDecisionResponseSchema,
  assessorAssignmentsResponseSchema,
  lowerEnvironmentAwardCycle2026Fixture,
  lowerEnvironmentParkFixture
} from "@green-flag/contracts";
import { canAccessResource, type ResourceOwnership } from "../authorization.js";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile } from "../auth.js";
import { buildAdminOverrideEvent } from "../overrides.js";
import { flushAdminOverrideEvents } from "./overrides.js";
import { iso } from "./shared.js";

type Allocation = ReturnType<typeof allocationCommandResponseSchema.parse>;
type Policy = ReturnType<typeof allocationPolicySchema.parse>;

type AllocationRow = {
  id: string;
  assessment_episode_id: string;
  status: string;
  final_judge_count: number;
  suggested_judge_count: number;
  contact_reveal_available: boolean;
  notification_intents: string[];
  audit_event_id: string | null;
};

type AssignmentRow = {
  id: string;
  allocation_id: string;
  assessment_episode_id: string;
  assessor_profile_id: string;
  status: string;
  assignment_role: AssignmentRole | null;
  required_for_contact_reveal: boolean;
  contact_reveal_available: boolean;
  version: number;
  updated_at_utc: Date | string;
};

type AssignmentRole = "PRIMARY_JUDGE" | "SECONDARY_JUDGE" | "MYSTERY_JUDGE" | "TRAINING_OBSERVER";

type EpisodeContext = {
  episodeId: string;
  episodeType: "FULL_ASSESSMENT" | "MYSTERY_SHOP";
  episodeStatus: string;
  applicationId: string;
  parkId: string;
  organisationId: string;
  countryCode: string;
  cycleYear: number;
  parkName: string;
};

function requestMetadata(request: FastifyRequest, idempotencyKey?: string) {
  return {
    requestId: request.id,
    idempotencyKey,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  };
}

function buildAuditEvent({
  action,
  entityType = "allocation",
  entityId,
  actor,
  request,
  beforeState,
  afterState,
  reason
}: {
  action: string;
  entityType?: string;
  entityId?: string;
  actor: SessionProfile["actor"];
  request: ReturnType<typeof requestMetadata>;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | undefined;
}): AuditEvent {
  return {
    id: randomUUID(),
    actor,
    action,
    entityType,
    entityId,
    beforeState,
    afterState,
    request,
    reason,
    createdAt: new Date().toISOString()
  };
}

async function currentPolicy(client: SqlClient): Promise<Policy> {
  const row = (await client.query<{
    id: string;
    country_code: string;
    cycle_year: number;
    default_distance_km: number;
    distance_weight: string | number;
    cluster_weight: string | number;
    rotation_penalty: number;
    training_third_judge_allowed: boolean;
    source: string;
  }>("SELECT * FROM allocation_policy_configs ORDER BY updated_at_utc DESC LIMIT 1")).rows[0];
  if (!row) {
    throw new ApiError("dependency_missing", 404, "Allocation policy configuration was not found.");
  }
  return allocationPolicySchema.parse({
    policyId: row.id,
    countryCode: row.country_code,
    cycleYear: row.cycle_year,
    defaultDistanceKm: row.default_distance_km,
    distanceWeight: Number(row.distance_weight),
    clusterWeight: Number(row.cluster_weight),
    rotationPenalty: row.rotation_penalty,
    trainingThirdJudgeAllowed: row.training_third_judge_allowed,
    source: row.source
  });
}

async function allocationFromRow(client: SqlClient, row: AllocationRow): Promise<Allocation> {
  const assignments = await client.query<AssignmentRow>(
    "SELECT * FROM judge_assignments WHERE allocation_id = $1 ORDER BY created_at_utc, id",
    [row.id]
  );
  const overrides = await client.query<{ id: string }>(
    "SELECT id FROM admin_override_events WHERE target_type = 'allocation' AND target_id = $1 ORDER BY created_at_utc",
    [row.id]
  );
  return allocationCommandResponseSchema.parse({
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
}

async function loadAllocation(client: SqlClient, allocationId: string, lock = false) {
  const row = (await client.query<AllocationRow>(
    `SELECT * FROM allocations WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [allocationId]
  )).rows[0];
  return row ? allocationFromRow(client, row) : null;
}

async function loadAllocationByEpisode(client: SqlClient, episodeId: string, lock = false) {
  const row = (await client.query<AllocationRow>(
    `SELECT * FROM allocations WHERE assessment_episode_id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [episodeId]
  )).rows[0];
  return row ? allocationFromRow(client, row) : null;
}

async function episodeContext(client: SqlClient, episodeId: string, lock = false): Promise<EpisodeContext> {
  const row = (await client.query<{
    episode_id: string;
    episode_type: string;
    episode_status: string;
    application_id: string;
    park_id: string;
    organisation_id: string;
    country_code: string | null;
    cycle_year: number;
    park_name: string;
  }>(
    `
      SELECT ae.id AS episode_id, ae.episode_type, ae.status AS episode_status,
        a.id AS application_id, p.id AS park_id, p.organisation_id,
        ac.country_code, ac.cycle_year, p.name AS park_name
      FROM assessment_episodes ae
      JOIN applications a ON a.assessment_episode_id = ae.id
      JOIN parks p ON p.id = ae.park_id
      JOIN award_cycles ac ON ac.id = ae.award_cycle_id
      WHERE ae.id = $1
      ${lock ? "FOR UPDATE OF ae" : ""}
    `,
    [episodeId]
  )).rows[0];
  if (!row) throw new ApiError("dependency_missing", 404, "Assessment episode was not found.");
  return {
    episodeId: row.episode_id,
    episodeType: row.episode_type as EpisodeContext["episodeType"],
    episodeStatus: row.episode_status,
    applicationId: row.application_id,
    parkId: row.park_id,
    organisationId: row.organisation_id,
    countryCode: row.country_code ?? "lower-env",
    cycleYear: row.cycle_year,
    parkName: row.park_name
  };
}

function ensureAccess(session: SessionProfile, context: EpisodeContext) {
  const ownership: ResourceOwnership = {
    parkId: context.parkId,
    organisationId: context.organisationId,
    countryCode: context.countryCode
  };
  if (!canAccessResource(session, ownership)) {
    throw new ApiError("forbidden", 403, "Actor is not allowed to access this episode.");
  }
}

function assignmentRoleFor(episodeType: EpisodeContext["episodeType"], index: number): AssignmentRole {
  if (episodeType === "MYSTERY_SHOP") return "MYSTERY_JUDGE";
  if (index === 0) return "PRIMARY_JUDGE";
  if (index === 1) return "SECONDARY_JUDGE";
  return "TRAINING_OBSERVER";
}

function requiresContactRevealAcceptance(role: AssignmentRole) {
  return role !== "TRAINING_OBSERVER";
}

function revealFor(episodeType: EpisodeContext["episodeType"], assignments: AssignmentRow[]) {
  if (episodeType !== "FULL_ASSESSMENT") return false;
  const required = assignments.filter((assignment) => assignment.required_for_contact_reveal);
  return required.length > 0 && required.every((assignment) => assignment.status === "ACCEPTED");
}

async function judgeCountForEpisode(client: SqlClient, episodeId: string) {
  const area = (await client.query<{ area_hectares: string | number | null }>(
    `
      SELECT COALESCE(aas.area_hectares, pam.area_hectares) AS area_hectares
      FROM assessment_episodes ae
      LEFT JOIN applications a ON a.assessment_episode_id = ae.id
      LEFT JOIN application_area_snapshots aas ON aas.application_id = a.id
      LEFT JOIN LATERAL (
        SELECT area_hectares
        FROM park_area_measurements
        WHERE park_id = ae.park_id AND is_current
        ORDER BY captured_at_utc DESC, id
        LIMIT 1
      ) pam ON true
      WHERE ae.id = $1
      ORDER BY aas.captured_at_utc DESC NULLS LAST
      LIMIT 1
    `,
    [episodeId]
  )).rows[0];
  const hectares = area?.area_hectares === null || area?.area_hectares === undefined
    ? null
    : Number(area.area_hectares);
  if (hectares !== null && hectares > 25) {
    return { suggestedJudgeCount: 2, judgeCountReasons: ["over_25_hectares"] };
  }
  return { suggestedJudgeCount: 2, judgeCountReasons: ["new_site"] };
}

async function hasIdempotentAudit(client: SqlClient, action: string, entityId: string, idempotencyKey?: string) {
  if (!idempotencyKey) return false;
  const result = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_events WHERE action = $1 AND entity_id = $2 AND idempotency_key = $3",
    [action, entityId, idempotencyKey]
  );
  return Number(result.rows[0]?.count ?? 0) > 0;
}

async function validateCandidates(client: SqlClient, episodeId: string, assessorIds: string[], acknowledgedFlagTypes: string[]) {
  const candidates = await client.query<{ id: string }>(
    "SELECT id FROM assessor_profiles WHERE id = ANY($1::uuid[]) AND profile_status = 'ACTIVE' FOR UPDATE",
    [assessorIds]
  );
  const active = new Set(candidates.rows.map((row) => row.id));
  if (assessorIds.some((id) => !active.has(id))) {
    throw new ApiError("invalid_state", 409, "Selected assessor is not an allocatable candidate.");
  }
  const flags = await client.query<{ assessor_profile_id: string; flag_type: string; severity: string }>(
    `
      SELECT assessor_profile_id, flag_type, severity
      FROM allocation_coi_flags
      WHERE (assessment_episode_id = $1 OR assessment_episode_id IS NULL)
        AND assessor_profile_id = ANY($2::uuid[])
    `,
    [episodeId, assessorIds]
  );
  const hard = flags.rows.find((flag) => flag.severity === "hard_exclude");
  if (hard) {
    throw new ApiError("invalid_state", 409, "Selected assessor has a hard conflict and cannot be allocated.");
  }
  const acknowledged = new Set(acknowledgedFlagTypes);
  const unacknowledged = [...new Set(flags.rows
    .filter((flag) => flag.severity !== "hard_exclude")
    .map((flag) => flag.flag_type))]
    .filter((flag) => !acknowledged.has(flag));
  if (unacknowledged.length > 0) {
    throw new ApiError("conflict", 409, "Soft COI or rotation flags require acknowledgement.", { unacknowledged });
  }
}

export interface AllocationRepository {
  readyEpisodes(session: SessionProfile): Promise<unknown>;
  candidates(episodeId: string): Promise<unknown>;
  hold(input: { episodeId: string; body: { assessorIds: string[]; finalJudgeCount: number; reason?: string | undefined; acknowledgedFlagTypes: string[]; idempotencyKey?: string | undefined }; actor: SessionProfile["actor"]; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  release(input: { allocationId: string; body: { releaseMode: string; scheduledReleaseAt?: string | undefined; idempotencyKey?: string | undefined }; actor: SessionProfile["actor"]; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  reassign(input: { allocationId: string; body: { replaceAssignmentId: string; replacementAssessorId: string; reason: string; acknowledgedFlagTypes: string[]; idempotencyKey?: string | undefined }; actor: SessionProfile["actor"]; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  listAssignments(actorId: string): Promise<unknown>;
  decideAssignment(input: { assignmentId: string; status: "ACCEPTED" | "DECLINED"; clientVersion: number; reason?: string | undefined; idempotencyKey?: string | undefined; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
}

export class PostgresAllocationRepository implements AllocationRepository {
  constructor(
    private readonly client: SqlClient,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditLedger: AuditLedger
  ) {}

  async readyEpisodes(session: SessionProfile) {
    const policy = await currentPolicy(this.client);
    const rows = await this.client.query<{
      episode_id: string;
      application_id: string;
      park_id: string;
      park_name: string;
      organisation_id: string;
      country_code: string | null;
      cycle_year: number;
      episode_type: string;
      episode_status: string;
      allocation_status: string | null;
    }>(
      `
        SELECT ae.id AS episode_id, a.id AS application_id, p.id AS park_id, p.name AS park_name,
          p.organisation_id, ac.country_code, ac.cycle_year, ae.episode_type, ae.status AS episode_status,
          al.status AS allocation_status
        FROM applications a
        JOIN assessment_episodes ae ON ae.id = a.assessment_episode_id
        JOIN parks p ON p.id = ae.park_id
        JOIN award_cycles ac ON ac.id = ae.award_cycle_id
        LEFT JOIN allocations al ON al.assessment_episode_id = ae.id
        WHERE ae.status = 'READY_FOR_ALLOCATION'
        ORDER BY ae.updated_at_utc DESC
      `
    );
    const items = await Promise.all(rows.rows
      .filter((row) => canAccessResource(session, {
        parkId: row.park_id,
        organisationId: row.organisation_id,
        countryCode: row.country_code ?? "lower-env"
      }))
      .map(async (row) => {
        const judgeCount = await judgeCountForEpisode(this.client, row.episode_id);
        return {
          episodeId: row.episode_id,
          applicationId: row.application_id,
          parkId: row.park_id,
          parkName: row.park_name,
          cycleYear: row.cycle_year,
          episodeType: row.episode_type,
          episodeStatus: row.episode_status,
          paymentStatus: "PAID",
          documentStatus: "complete",
          suggestedJudgeCount: judgeCount.suggestedJudgeCount,
          judgeCountReasons: judgeCount.judgeCountReasons,
          allocationStatus: row.allocation_status === "HELD" ? "held" : row.allocation_status ? "released" : "not_started"
        };
      }));
    return allocationReadyEpisodesResponseSchema.parse({
      policy,
      items
    });
  }

  async candidates(episodeId: string) {
    const policy = await currentPolicy(this.client);
    const judgeCount = await judgeCountForEpisode(this.client, episodeId);
    const rows = await this.client.query<{
      id: string;
      display_name: string;
      primary_region: string | null;
      accreditation_status: string;
      capacity_status: string | null;
      current_assigned_count: number | null;
      max_assignments: number | null;
      flag_type: string | null;
      severity: string | null;
      reason: string | null;
      requires_acknowledgement: boolean | null;
    }>(
      `
        SELECT ap.id, ap.display_name, ap.primary_region, ap.accreditation_status,
          acd.capacity_status, acd.current_assigned_count, acd.max_assignments,
          acf.flag_type, acf.severity, acf.reason, acf.requires_acknowledgement
        FROM assessor_profiles ap
        LEFT JOIN assessor_capacity_declarations acd ON acd.assessor_profile_id = ap.id AND acd.cycle_year = $2
        LEFT JOIN allocation_coi_flags acf ON acf.assessor_profile_id = ap.id AND (acf.assessment_episode_id = $1 OR acf.assessment_episode_id IS NULL)
        WHERE ap.profile_status = 'ACTIVE'
        ORDER BY ap.display_name, ap.id
      `,
      [episodeId, policy.cycleYear]
    );
    const byId = new Map<string, typeof rows.rows>();
    for (const row of rows.rows) byId.set(row.id, [...(byId.get(row.id) ?? []), row]);
    const candidates = [...byId.values()].flatMap((group) => {
      const first = group[0]!;
      if (group.some((row) => row.severity === "hard_exclude")) return [];
      return [{
        assessorId: first.id,
        displayName: first.display_name,
        ...(first.primary_region ? { primaryRegion: first.primary_region } : {}),
        accreditationStatus: first.accreditation_status,
        capacityStatus: first.capacity_status ?? "unavailable",
        currentAssignedCount: first.current_assigned_count ?? 0,
        maxAssignments: first.max_assignments ?? 0,
        distanceKm: policy.defaultDistanceKm,
        score: 80 - (group.some((row) => row.flag_type === "rotation") ? policy.rotationPenalty : 0),
        hardExcluded: false,
        flags: group
          .filter((row) => row.flag_type && row.severity !== "hard_exclude")
          .map((row) => ({
            type: row.flag_type,
            severity: row.severity === "deprioritise" ? "deprioritise" : "soft",
            reason: row.reason ?? "Source-backed allocation flag.",
            requiresAcknowledgement: row.requires_acknowledgement ?? true
          })),
        contactPreviewAvailable: false
      }];
    });
    return allocationCandidatesResponseSchema.parse({
      episodeId,
      suggestedJudgeCount: judgeCount.suggestedJudgeCount,
      policy,
      candidates,
      excludedCandidateCount: rows.rows.filter((row) => row.severity === "hard_exclude").length
    });
  }

  async hold({ episodeId, body, actor, session, request }: Parameters<AllocationRepository["hold"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const context = await episodeContext(client, episodeId, true);
      ensureAccess(session, context);
      const existing = await loadAllocationByEpisode(client, episodeId, true);
      if (existing) {
        if (await hasIdempotentAudit(client, "HOLD_ALLOCATION", existing.allocationId, body.idempotencyKey)) return existing;
        throw new ApiError("invalid_state", 409, "Allocation has already been held for this episode.");
      }
      if (body.assessorIds.length !== body.finalJudgeCount) {
        throw new ApiError("validation_failed", 400, "Final judge count must match selected assessor count.");
      }
      const judgeCount = await judgeCountForEpisode(client, episodeId);
      const suggestedJudgeCount = judgeCount.suggestedJudgeCount;
      if (body.finalJudgeCount !== suggestedJudgeCount && !body.reason) {
        throw new ApiError("validation_failed", 400, "Judge-count override requires a reason.");
      }
      await validateCandidates(client, episodeId, body.assessorIds, body.acknowledgedFlagTypes);
      const allocationId = randomUUID();
      const now = new Date().toISOString();
      await client.query(
        `
          INSERT INTO allocations (
            id, assessment_episode_id, status, final_judge_count, suggested_judge_count, contact_reveal_available, notification_intents
          )
          VALUES ($1, $2, 'HELD', $3, $4, false, ARRAY[]::text[])
        `,
        [allocationId, episodeId, body.finalJudgeCount, suggestedJudgeCount]
      );
      for (const [index, assessorId] of body.assessorIds.entries()) {
        const assignmentRole = assignmentRoleFor(context.episodeType, index);
        await client.query(
          `
            INSERT INTO judge_assignments (
              id, allocation_id, assessment_episode_id, assessor_profile_id, status,
              assignment_role, required_for_contact_reveal, contact_reveal_available, version, updated_at_utc
            )
            VALUES ($1, $2, $3, $4, 'HELD', $5, $6, false, 0, $7::timestamptz)
          `,
          [
            randomUUID(),
            allocationId,
            episodeId,
            assessorId,
            assignmentRole,
            requiresContactRevealAcceptance(assignmentRole),
            now
          ]
        );
      }
      await client.query("UPDATE assessment_episodes SET status = 'ALLOCATED_HELD', updated_at_utc = now() WHERE id = $1", [episodeId]);
      const audit = buildAuditEvent({
        action: "HOLD_ALLOCATION",
        entityId: allocationId,
        actor,
        request: requestMetadata(request, body.idempotencyKey),
        afterState: { episodeId, assessorIds: body.assessorIds, finalJudgeCount: body.finalJudgeCount },
        reason: body.reason
      });
      await appendAuditEvent(this.auditLedger, audit);
      const overrideEvents = [];
      if (body.finalJudgeCount !== suggestedJudgeCount) {
        overrideEvents.push(buildAdminOverrideEvent({
          overrideType: "JUDGE_COUNT_OVERRIDE",
          targetType: "allocation",
          targetId: allocationId,
          authority: actor.role,
          reason: body.reason ?? "Judge count override.",
          actor,
          priorState: { suggestedJudgeCount },
          afterState: { finalJudgeCount: body.finalJudgeCount },
          linkedAuditEventId: audit.id,
          requestId: request.id,
          ...(body.idempotencyKey ? { correlationId: body.idempotencyKey } : {})
        }));
      }
      await flushAdminOverrideEvents(client, overrideEvents);
      await client.query("UPDATE allocations SET audit_event_id = $2, updated_at_utc = now() WHERE id = $1", [allocationId, audit.id]);
      const allocation = await loadAllocation(client, allocationId);
      return allocationCommandResponseSchema.parse(allocation);
    });
  }

  async release({ allocationId, body, actor, session, request }: Parameters<AllocationRepository["release"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const allocation = await loadAllocation(client, allocationId, true);
      if (!allocation) throw new ApiError("dependency_missing", 404, "Allocation was not found.");
      ensureAccess(session, await episodeContext(client, allocation.episodeId, true));
      if (allocation.status !== "HELD") {
        if (allocation.status === "RELEASED" && await hasIdempotentAudit(client, "RELEASE_ALLOCATION", allocationId, body.idempotencyKey)) return allocation;
        throw new ApiError("invalid_state", 409, "Only held allocations can be released.");
      }
      await client.query("SELECT id FROM judge_assignments WHERE allocation_id = $1 FOR UPDATE", [allocationId]);
      await client.query(
        "UPDATE allocations SET status = 'RELEASED', notification_intents = ARRAY['assignment_release_email_batch']::text[], contact_reveal_available = false, updated_at_utc = now() WHERE id = $1",
        [allocationId]
      );
      await client.query(
        "UPDATE judge_assignments SET status = 'RELEASED', contact_reveal_available = false, version = version + 1, updated_at_utc = now() WHERE allocation_id = $1 AND status = 'HELD'",
        [allocationId]
      );
      await client.query("UPDATE assessment_episodes SET status = 'ALLOCATED_RELEASED', updated_at_utc = now() WHERE id = $1", [allocation.episodeId]);
      const audit = buildAuditEvent({
        action: "RELEASE_ALLOCATION",
        entityId: allocationId,
        actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: allocation,
        afterState: { releaseMode: body.releaseMode, scheduledReleaseAt: body.scheduledReleaseAt }
      });
      await appendAuditEvent(this.auditLedger, audit);
      await client.query("UPDATE allocations SET audit_event_id = $2, updated_at_utc = now() WHERE id = $1", [allocationId, audit.id]);
      return allocationCommandResponseSchema.parse(await loadAllocation(client, allocationId));
    });
  }

  async reassign({ allocationId, body, actor, session, request }: Parameters<AllocationRepository["reassign"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const allocation = await loadAllocation(client, allocationId, true);
      if (!allocation) throw new ApiError("dependency_missing", 404, "Allocation was not found.");
      const context = await episodeContext(client, allocation.episodeId, true);
      ensureAccess(session, context);
      await validateCandidates(client, allocation.episodeId, [body.replacementAssessorId], body.acknowledgedFlagTypes);
      const replacing = (await client.query<AssignmentRow>(
        "SELECT * FROM judge_assignments WHERE id = $1 AND allocation_id = $2 FOR UPDATE",
        [body.replaceAssignmentId, allocationId]
      )).rows[0];
      if (!replacing) throw new ApiError("dependency_missing", 404, "Assignment to replace was not found.");
      await client.query(
        "UPDATE judge_assignments SET status = 'WITHDRAWN', contact_reveal_available = false, version = version + 1, updated_at_utc = now() WHERE id = $1",
        [body.replaceAssignmentId]
      );
      await client.query(
        `
          INSERT INTO judge_assignments (
            id, allocation_id, assessment_episode_id, assessor_profile_id, status,
            assignment_role, required_for_contact_reveal, contact_reveal_available, version, updated_at_utc
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, false, 0, now())
        `,
        [
          randomUUID(),
          allocationId,
          allocation.episodeId,
          body.replacementAssessorId,
          allocation.status === "RELEASED" ? "RELEASED" : "HELD",
          replacing.assignment_role,
          replacing.required_for_contact_reveal
        ]
      );
      await client.query("UPDATE allocations SET contact_reveal_available = false, updated_at_utc = now() WHERE id = $1", [allocationId]);
      await client.query(
        "UPDATE judge_assignments SET contact_reveal_available = false, updated_at_utc = now() WHERE allocation_id = $1 AND status IN ('RELEASED', 'ACCEPTED')",
        [allocationId]
      );
      const audit = buildAuditEvent({
        action: "REASSIGN_ALLOCATION",
        entityId: allocationId,
        actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: allocation,
        afterState: { replaceAssignmentId: body.replaceAssignmentId, replacementAssessorId: body.replacementAssessorId },
        reason: body.reason
      });
      await appendAuditEvent(this.auditLedger, audit);
      await client.query("UPDATE allocations SET audit_event_id = $2 WHERE id = $1", [allocationId, audit.id]);
      return allocationCommandResponseSchema.parse(await loadAllocation(client, allocationId));
    });
  }

  async listAssignments(actorId: string) {
    const rows = await this.client.query<{
      assignment_id: string;
      allocation_id: string;
      episode_id: string;
      status: string;
      contact_reveal_available: boolean;
      version: number;
      park_name: string;
      cycle_year: number;
    }>(
      `
        SELECT ja.id AS assignment_id, ja.allocation_id, ja.assessment_episode_id AS episode_id,
          ja.status, ja.contact_reveal_available, ja.version, p.name AS park_name, ac.cycle_year
        FROM judge_assignments ja
        JOIN allocations al ON al.id = ja.allocation_id
        JOIN assessor_profiles ap ON ap.id = ja.assessor_profile_id
        JOIN assessment_episodes ae ON ae.id = ja.assessment_episode_id
        JOIN parks p ON p.id = ae.park_id
        JOIN award_cycles ac ON ac.id = ae.award_cycle_id
        WHERE al.status = 'RELEASED'
          AND ja.status IN ('RELEASED', 'ACCEPTED', 'DECLINED')
          AND ap.internal_user_id = $1
        ORDER BY ja.updated_at_utc DESC
      `,
      [actorId]
    );
    return assessorAssignmentsResponseSchema.parse({
      items: rows.rows.map((row) => ({
        assignmentId: row.assignment_id,
        allocationId: row.allocation_id,
        episodeId: row.episode_id,
        parkName: row.park_name || lowerEnvironmentParkFixture.name,
        cycleYear: row.cycle_year || lowerEnvironmentAwardCycle2026Fixture.cycleYear,
        status: row.status,
        contactRevealAvailable: row.contact_reveal_available,
        version: row.version
      }))
    });
  }

  async decideAssignment({ assignmentId, status, clientVersion, reason, idempotencyKey, actor, request }: Parameters<AllocationRepository["decideAssignment"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const assignmentRow = (await client.query<AssignmentRow>(
        `
          SELECT ja.*
          FROM judge_assignments ja
          JOIN assessor_profiles ap ON ap.id = ja.assessor_profile_id
          JOIN allocations al ON al.id = ja.allocation_id
          WHERE ja.id = $1 AND ap.internal_user_id = $2 AND al.status = 'RELEASED'
          FOR UPDATE OF ja
        `,
        [assignmentId, actor.actorId]
      )).rows[0];
      if (!assignmentRow) throw new ApiError("dependency_missing", 404, "Released assignment was not found.");
      const allocation = await loadAllocation(client, assignmentRow.allocation_id, true);
      if (!allocation) throw new ApiError("dependency_missing", 404, "Allocation was not found.");
      if (assignmentRow.version !== clientVersion) {
        throw new ApiError("idempotency_conflict", 409, "Assignment version has changed.");
      }
      if (!["RELEASED", "ACCEPTED", "DECLINED"].includes(assignmentRow.status)) {
        throw new ApiError("invalid_state", 409, "Assignment cannot be decided from its current state.");
      }
      const context = await episodeContext(client, allocation.episodeId, true);
      await client.query(
        "UPDATE judge_assignments SET status = $2, version = version + 1, updated_at_utc = now() WHERE id = $1 AND version = $3",
        [assignmentId, status, clientVersion]
      );
      const afterRows = await client.query<AssignmentRow>("SELECT * FROM judge_assignments WHERE allocation_id = $1 FOR UPDATE", [allocation.allocationId]);
      const reveal = revealFor(context.episodeType, afterRows.rows);
      await client.query("UPDATE allocations SET contact_reveal_available = $2, updated_at_utc = now() WHERE id = $1", [allocation.allocationId, reveal]);
      await client.query(
        "UPDATE judge_assignments SET contact_reveal_available = $2, updated_at_utc = now() WHERE allocation_id = $1 AND status IN ('RELEASED', 'ACCEPTED')",
        [allocation.allocationId, reveal]
      );
      if (status === "DECLINED") {
        await client.query("UPDATE judge_assignments SET contact_reveal_available = false WHERE id = $1", [assignmentId]);
      }
      const audit = buildAuditEvent({
        action: status === "ACCEPTED" ? "ACCEPT_ASSIGNMENT" : "DECLINE_ASSIGNMENT",
        entityType: "judge_assignment",
        entityId: assignmentId,
        actor,
        request: requestMetadata(request, idempotencyKey),
        afterState: { status, contactRevealAvailable: reveal },
        reason
      });
      await appendAuditEvent(this.auditLedger, audit);
      const updated = await client.query<AssignmentRow>("SELECT * FROM judge_assignments WHERE id = $1", [assignmentId]);
      const row = updated.rows[0]!;
      return assessorAssignmentDecisionResponseSchema.parse({
        assignment: {
          assignmentId: row.id,
          allocationId: row.allocation_id,
          episodeId: row.assessment_episode_id,
          assessorId: row.assessor_profile_id,
          status: row.status,
          contactRevealAvailable: row.contact_reveal_available,
          version: row.version,
          updatedAt: iso(row.updated_at_utc)
        },
        auditEventId: audit.id
      });
    });
  }
}
