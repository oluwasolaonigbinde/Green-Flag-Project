import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { SqlClient, UnitOfWork } from "@green-flag/db";
import {
  adminAssessorDetailResponseSchema,
  adminAssessorListResponseSchema,
  adminAssessorQueueQuerySchema,
  assessorProfileCommandResponseSchema,
  assessorSelfProfileResponseSchema
} from "@green-flag/contracts";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile } from "../auth.js";
import { iso } from "./shared.js";

type AssessorProfile = ReturnType<typeof assessorSelfProfileResponseSchema.shape.profile.parse>;
type AssessorQuery = ReturnType<typeof adminAssessorQueueQuerySchema.parse>;

type ProfileRow = {
  id: string;
  internal_user_id: string;
  display_name: string;
  email: string | null;
  profile_status: string;
  accreditation_status: string;
  accreditation_provider: string;
  primary_region: string | null;
  version: number;
  updated_at: Date | string;
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
  entityId,
  actor,
  request,
  beforeState,
  afterState,
  reason
}: {
  action: string;
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
    entityType: "assessor_profile",
    entityId,
    beforeState,
    afterState,
    request,
    reason,
    createdAt: new Date().toISOString()
  };
}

async function profileFromRow(client: SqlClient, row: ProfileRow) {
  const preferences = await client.query<{
    preferred_regions: string[];
    preferred_award_track_codes: string[];
    unavailable_notes: string | null;
    accepts_mystery_shop: boolean;
  }>(
    "SELECT preferred_regions, preferred_award_track_codes, unavailable_notes, accepts_mystery_shop FROM assessor_preferences WHERE assessor_profile_id = $1",
    [row.id]
  );
  const availability = await client.query<{
    id: string;
    starts_at: Date | string;
    ends_at: Date | string;
    availability_type: string;
    notes: string | null;
  }>(
    "SELECT id, starts_at, ends_at, availability_type, notes FROM assessor_availability_windows WHERE assessor_profile_id = $1 ORDER BY starts_at, id",
    [row.id]
  );
  const capacity = await client.query<{
    id: string;
    cycle_year: number;
    max_assignments: number;
    current_assigned_count: number;
    capacity_status: string;
  }>(
    "SELECT id, cycle_year, max_assignments, current_assigned_count, capacity_status FROM assessor_capacity_declarations WHERE assessor_profile_id = $1 ORDER BY cycle_year, id",
    [row.id]
  );
  const preference = preferences.rows[0];
  return assessorSelfProfileResponseSchema.shape.profile.parse({
    assessorId: row.id,
    internalUserId: row.internal_user_id,
    displayName: row.display_name,
    ...(row.email ? { email: row.email } : {}),
    profileStatus: row.profile_status,
    accreditationStatus: row.accreditation_status,
    accreditationProvider: row.accreditation_provider,
    ...(row.primary_region ? { primaryRegion: row.primary_region } : {}),
    preferences: {
      preferredRegions: preference?.preferred_regions ?? [],
      preferredAwardTrackCodes: preference?.preferred_award_track_codes ?? [],
      ...(preference?.unavailable_notes ? { unavailableNotes: preference.unavailable_notes } : {}),
      acceptsMysteryShop: preference?.accepts_mystery_shop ?? false
    },
    availability: availability.rows.map((item) => ({
      availabilityId: item.id,
      assessorId: row.id,
      startsAt: iso(item.starts_at),
      endsAt: iso(item.ends_at),
      availabilityType: item.availability_type,
      ...(item.notes ? { notes: item.notes } : {})
    })),
    capacity: capacity.rows.map((item) => ({
      capacityId: item.id,
      assessorId: row.id,
      cycleYear: item.cycle_year,
      maxAssignments: item.max_assignments,
      currentAssignedCount: item.current_assigned_count,
      capacityStatus: item.capacity_status
    })),
    version: row.version,
    updatedAt: iso(row.updated_at)
  });
}

async function loadProfileById(client: SqlClient, assessorId: string, lock = false) {
  const rows = await client.query<ProfileRow>(
    `SELECT * FROM assessor_profiles WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [assessorId]
  );
  return rows.rows[0] ? profileFromRow(client, rows.rows[0]) : null;
}

async function loadProfileByActor(client: SqlClient, actorId: string, lock = false) {
  const rows = await client.query<ProfileRow>(
    `SELECT * FROM assessor_profiles WHERE internal_user_id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [actorId]
  );
  return rows.rows[0] ? profileFromRow(client, rows.rows[0]) : null;
}

function assertVersion(profile: AssessorProfile, clientVersion: number) {
  if (profile.version !== clientVersion) {
    throw new ApiError("idempotency_conflict", 409, "Assessor profile version has changed.");
  }
}

function capacitySummary(profile: AssessorProfile, cycleYear?: number) {
  const capacity = profile.capacity.find((candidate) => !cycleYear || candidate.cycleYear === cycleYear) ?? profile.capacity[0];
  return {
    capacityStatus: capacity?.capacityStatus ?? "unavailable" as const,
    maxAssignments: capacity?.maxAssignments ?? 0,
    currentAssignedCount: capacity?.currentAssignedCount ?? 0
  };
}

export interface AssessorRepository {
  getSelfProfile(actorId: string): Promise<unknown>;
  listAdminProfiles(query: AssessorQuery): Promise<unknown>;
  getAdminProfile(assessorId: string): Promise<unknown>;
  createAdminProfile(input: { body: Record<string, unknown>; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  updateAdminProfile(input: { assessorId: string; body: Record<string, unknown>; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  disableAdminProfile(input: { assessorId: string; reason?: string | undefined; idempotencyKey?: string | undefined; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  updatePreferences(input: { actorId: string; body: { clientVersion: number; preferences: AssessorProfile["preferences"]; idempotencyKey?: string | undefined }; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  updateAvailability(input: { actorId: string; body: { clientVersion: number; availability: Omit<AssessorProfile["availability"][number], "assessorId">[]; idempotencyKey?: string | undefined }; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  updateCapacity(input: { actorId: string; body: { clientVersion: number; capacity: Omit<AssessorProfile["capacity"][number], "assessorId">[]; idempotencyKey?: string | undefined }; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
}

export class PostgresAssessorRepository implements AssessorRepository {
  constructor(
    private readonly client: SqlClient,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditLedger: AuditLedger
  ) {}

  async getSelfProfile(actorId: string) {
    const profile = await loadProfileByActor(this.client, actorId);
    if (!profile) throw new ApiError("dependency_missing", 404, "Assessor profile was not found for this actor.");
    return assessorSelfProfileResponseSchema.parse({ profile, assignmentLoadDeferred: true, visitScheduleDeferred: true });
  }

  async listAdminProfiles(query: AssessorQuery) {
    const rows = await this.client.query<ProfileRow>("SELECT * FROM assessor_profiles ORDER BY display_name, id");
    const profiles = [];
    for (const row of rows.rows) {
      profiles.push(await profileFromRow(this.client, row));
    }
    const filtered = profiles
      .filter((profile) => !query.search || [profile.displayName, profile.email, profile.primaryRegion].some((value) => value?.toLowerCase().includes(query.search!.toLowerCase())))
      .filter((profile) => !query.profileStatus || profile.profileStatus === query.profileStatus)
      .filter((profile) => !query.accreditationStatus || profile.accreditationStatus === query.accreditationStatus)
      .filter((profile) => !query.region || profile.primaryRegion === query.region)
      .filter((profile) => !query.capacityStatus || capacitySummary(profile, query.cycleYear).capacityStatus === query.capacityStatus);
    const start = (query.page - 1) * query.pageSize;
    return adminAssessorListResponseSchema.parse({
      items: filtered.slice(start, start + query.pageSize).map((profile) => ({
        assessorId: profile.assessorId,
        internalUserId: profile.internalUserId,
        displayName: profile.displayName,
        email: profile.email,
        profileStatus: profile.profileStatus,
        accreditationStatus: profile.accreditationStatus,
        primaryRegion: profile.primaryRegion,
        ...capacitySummary(profile, query.cycleYear),
        updatedAt: profile.updatedAt
      })),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: filtered.length,
        availableFilters: ["profileStatus", "accreditationStatus", "region", "cycleYear", "capacityStatus"]
      }
    });
  }

  async getAdminProfile(assessorId: string) {
    const profile = await loadProfileById(this.client, assessorId);
    if (!profile) throw new ApiError("dependency_missing", 404, "Assessor profile was not found.");
    return adminAssessorDetailResponseSchema.parse({
      profile,
      allocationCandidateGenerationAvailable: false,
      providerSyncStatus: "external_value_unavailable"
    });
  }

  async createAdminProfile({ body, actor, request }: Parameters<AssessorRepository["createAdminProfile"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const existing = await client.query<ProfileRow>("SELECT * FROM assessor_profiles WHERE internal_user_id = $1 FOR UPDATE", [body.internalUserId]);
      if (existing.rows[0]) {
        const profile = await profileFromRow(client, existing.rows[0]);
        return assessorProfileCommandResponseSchema.parse({ profile, auditEventId: "00000000-0000-4000-8000-000000000008" });
      }
      const assessorId = randomUUID();
      await client.query(
        `
          INSERT INTO assessor_profiles (
            id, internal_user_id, display_name, email, profile_status, accreditation_status,
            accreditation_provider, primary_region, version
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'external_value_unavailable', $7, 0)
        `,
        [
          assessorId,
          body.internalUserId,
          body.displayName,
          body.email ?? null,
          body.profileStatus,
          body.accreditationStatus,
          body.primaryRegion ?? null
        ]
      );
      await client.query(
        `
          INSERT INTO assessor_preferences (
            assessor_profile_id, preferred_regions, preferred_award_track_codes, accepts_mystery_shop
          )
          VALUES ($1, $2, ARRAY['STANDARD_GREEN_FLAG']::text[], false)
        `,
        [assessorId, body.primaryRegion ? [body.primaryRegion] : []]
      );
      const profile = await loadProfileById(client, assessorId);
      if (!profile) throw new Error("Assessor profile was not readable after creation.");
      const audit = buildAuditEvent({
        action: "CREATE_ASSESSOR_PROFILE",
        entityId: assessorId,
        actor,
        request: requestMetadata(request, body.idempotencyKey as string | undefined),
        afterState: profile
      });
      await appendAuditEvent(this.auditLedger, audit);
      return assessorProfileCommandResponseSchema.parse({ profile, auditEventId: audit.id });
    });
  }

  async updateAdminProfile({ assessorId, body, actor, request }: Parameters<AssessorRepository["updateAdminProfile"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const before = await loadProfileById(client, assessorId, true);
      if (!before) throw new ApiError("dependency_missing", 404, "Assessor profile was not found.");
      await client.query(
        `
          UPDATE assessor_profiles
          SET display_name = $2,
            email = $3,
            profile_status = $4,
            accreditation_status = $5,
            primary_region = $6,
            version = version + 1,
            updated_at = now()
          WHERE id = $1
        `,
        [
          assessorId,
          body.displayName ?? before.displayName,
          body.email ?? before.email ?? null,
          body.profileStatus ?? before.profileStatus,
          body.accreditationStatus ?? before.accreditationStatus,
          body.primaryRegion ?? before.primaryRegion ?? null
        ]
      );
      const profile = await loadProfileById(client, assessorId);
      const audit = buildAuditEvent({
        action: "UPDATE_ASSESSOR_PROFILE",
        entityId: assessorId,
        actor,
        request: requestMetadata(request, body.idempotencyKey as string | undefined),
        beforeState: before,
        afterState: profile
      });
      await appendAuditEvent(this.auditLedger, audit);
      return assessorProfileCommandResponseSchema.parse({ profile, auditEventId: audit.id });
    });
  }

  async disableAdminProfile({ assessorId, reason, idempotencyKey, actor, request }: Parameters<AssessorRepository["disableAdminProfile"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const before = await loadProfileById(client, assessorId, true);
      if (!before) throw new ApiError("dependency_missing", 404, "Assessor profile was not found.");
      await client.query("UPDATE assessor_profiles SET profile_status = 'INACTIVE', version = version + 1, updated_at = now() WHERE id = $1", [assessorId]);
      const profile = await loadProfileById(client, assessorId);
      const audit = buildAuditEvent({
        action: "DISABLE_ASSESSOR_PROFILE",
        entityId: assessorId,
        actor,
        request: requestMetadata(request, idempotencyKey),
        beforeState: { profileStatus: before.profileStatus },
        afterState: { profileStatus: profile?.profileStatus },
        reason
      });
      await appendAuditEvent(this.auditLedger, audit);
      return assessorProfileCommandResponseSchema.parse({ profile, auditEventId: audit.id });
    });
  }

  async updatePreferences({ actorId, body, actor, request }: Parameters<AssessorRepository["updatePreferences"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const before = await loadProfileByActor(client, actorId, true);
      if (!before) throw new ApiError("dependency_missing", 404, "Assessor profile was not found for this actor.");
      assertVersion(before, body.clientVersion);
      await client.query(
        `
          INSERT INTO assessor_preferences (
            assessor_profile_id, preferred_regions, preferred_award_track_codes, unavailable_notes, accepts_mystery_shop, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, now())
          ON CONFLICT (assessor_profile_id) DO UPDATE SET
            preferred_regions = EXCLUDED.preferred_regions,
            preferred_award_track_codes = EXCLUDED.preferred_award_track_codes,
            unavailable_notes = EXCLUDED.unavailable_notes,
            accepts_mystery_shop = EXCLUDED.accepts_mystery_shop,
            updated_at = now()
        `,
        [
          before.assessorId,
          body.preferences.preferredRegions,
          body.preferences.preferredAwardTrackCodes,
          body.preferences.unavailableNotes ?? null,
          body.preferences.acceptsMysteryShop
        ]
      );
      await client.query("UPDATE assessor_profiles SET version = version + 1, updated_at = now() WHERE id = $1", [before.assessorId]);
      const profile = await loadProfileById(client, before.assessorId);
      const audit = buildAuditEvent({
        action: "UPDATE_ASSESSOR_PREFERENCES",
        entityId: before.assessorId,
        actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: before.preferences,
        afterState: profile?.preferences
      });
      await appendAuditEvent(this.auditLedger, audit);
      return assessorProfileCommandResponseSchema.parse({ profile, auditEventId: audit.id });
    });
  }

  async updateAvailability({ actorId, body, actor, request }: Parameters<AssessorRepository["updateAvailability"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const before = await loadProfileByActor(client, actorId, true);
      if (!before) throw new ApiError("dependency_missing", 404, "Assessor profile was not found for this actor.");
      assertVersion(before, body.clientVersion);
      await client.query("DELETE FROM assessor_availability_windows WHERE assessor_profile_id = $1", [before.assessorId]);
      for (const window of body.availability) {
        await client.query(
          `
            INSERT INTO assessor_availability_windows (id, assessor_profile_id, starts_at, ends_at, availability_type, notes)
            VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6)
          `,
          [window.availabilityId, before.assessorId, window.startsAt, window.endsAt, window.availabilityType, window.notes ?? null]
        );
      }
      await client.query("UPDATE assessor_profiles SET version = version + 1, updated_at = now() WHERE id = $1", [before.assessorId]);
      const profile = await loadProfileById(client, before.assessorId);
      const audit = buildAuditEvent({
        action: "UPDATE_ASSESSOR_AVAILABILITY",
        entityId: before.assessorId,
        actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: before.availability,
        afterState: profile?.availability
      });
      await appendAuditEvent(this.auditLedger, audit);
      return assessorProfileCommandResponseSchema.parse({ profile, auditEventId: audit.id });
    });
  }

  async updateCapacity({ actorId, body, actor, request }: Parameters<AssessorRepository["updateCapacity"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const before = await loadProfileByActor(client, actorId, true);
      if (!before) throw new ApiError("dependency_missing", 404, "Assessor profile was not found for this actor.");
      assertVersion(before, body.clientVersion);
      await client.query("DELETE FROM assessor_capacity_declarations WHERE assessor_profile_id = $1", [before.assessorId]);
      for (const capacity of body.capacity) {
        await client.query(
          `
            INSERT INTO assessor_capacity_declarations (
              id, assessor_profile_id, cycle_year, max_assignments, current_assigned_count, capacity_status, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, now())
          `,
          [
            capacity.capacityId,
            before.assessorId,
            capacity.cycleYear,
            capacity.maxAssignments,
            capacity.currentAssignedCount,
            capacity.capacityStatus
          ]
        );
      }
      await client.query("UPDATE assessor_profiles SET version = version + 1, updated_at = now() WHERE id = $1", [before.assessorId]);
      const profile = await loadProfileById(client, before.assessorId);
      const audit = buildAuditEvent({
        action: "UPDATE_ASSESSOR_CAPACITY",
        entityId: before.assessorId,
        actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: before.capacity,
        afterState: profile?.capacity
      });
      await appendAuditEvent(this.auditLedger, audit);
      return assessorProfileCommandResponseSchema.parse({ profile, auditEventId: audit.id });
    });
  }
}
