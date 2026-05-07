import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { z } from "zod";
import {
  adminAssessorDetailResponseSchema,
  adminAssessorListResponseSchema,
  adminAssessorQueueQuerySchema,
  assessorProfileCommandResponseSchema,
  assessorSelfProfileFixture,
  assessorSelfProfileResponseSchema,
  updateAssessorAvailabilityRequestSchema,
  updateAssessorCapacityRequestSchema,
  updateAssessorPreferencesRequestSchema,
  upsertAssessorProfileRequestSchema,
  type RoleType
} from "@green-flag/contracts";
import {
  ApiError,
  appendAuditEvent,
  type AuditEvent,
  type AuditLedger,
  type SessionProfile,
  type SessionResolver
} from "./auth.js";
import type { AssessorRepository } from "./postgres-domain-stores/assessor-repository.js";

type AssessorProfile = typeof assessorSelfProfileFixture.profile;
type AssessorQueueQuery = ReturnType<typeof adminAssessorQueueQuerySchema.parse>;

export interface AssessorStore {
  profiles: Map<string, AssessorProfile>;
  audits: AuditEvent[];
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export function createAssessorStore(): AssessorStore {
  const store: AssessorStore = {
    profiles: new Map([[assessorSelfProfileFixture.profile.assessorId, structuredClone(assessorSelfProfileFixture.profile)]]),
    audits: [],
    async withTransaction(work) {
      const profiles = structuredClone([...store.profiles.entries()]);
      const audits = structuredClone(store.audits);
      try {
        return await work();
      } catch (error) {
        store.profiles = new Map(profiles);
        store.audits = audits;
        throw error;
      }
    }
  };
  return store;
}

const defaultAuditLedger: AuditLedger = {
  async append() {
    return;
  }
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

function requireAdmin(session: SessionProfile) {
  if (!["SUPER_ADMIN", "KBT_ADMIN"].includes(session.actor.role)) {
    throw new ApiError("forbidden", 403, "Assessor management requires admin access.");
  }
}

function requireAssessorSelf(session: SessionProfile) {
  if (session.actor.role !== "JUDGE") {
    throw new ApiError("forbidden", 403, "Assessor profile access requires a judge role.");
  }
}

function requireProfile(store: AssessorStore, assessorId: string) {
  const profile = store.profiles.get(assessorId);
  if (!profile) {
    throw new ApiError("dependency_missing", 404, "Assessor profile was not found.");
  }
  return profile;
}

function profileForActor(store: AssessorStore, session: SessionProfile) {
  const profile = [...store.profiles.values()].find(
    (candidate) => candidate.internalUserId === session.actor.actorId
  );
  if (!profile) {
    throw new ApiError("dependency_missing", 404, "Assessor profile was not found for this actor.");
  }
  return profile;
}

function parseAdminQuery(request: FastifyRequest) {
  return adminAssessorQueueQuerySchema.parse(request.query ?? {});
}

function textMatches(query: AssessorQueueQuery, ...values: Array<string | undefined>) {
  if (!query.search) {
    return true;
  }
  const needle = query.search.toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(needle));
}

function capacitySummary(profile: AssessorProfile, cycleYear?: number) {
  const capacity = profile.capacity.find((candidate) => !cycleYear || candidate.cycleYear === cycleYear)
    ?? profile.capacity[0];
  return {
    capacityStatus: capacity?.capacityStatus ?? "unavailable" as const,
    maxAssignments: capacity?.maxAssignments ?? 0,
    currentAssignedCount: capacity?.currentAssignedCount ?? 0
  };
}

function listItems(store: AssessorStore, query: AssessorQueueQuery) {
  return [...store.profiles.values()]
    .filter((profile) => textMatches(query, profile.displayName, profile.email, profile.primaryRegion))
    .filter((profile) => !query.profileStatus || profile.profileStatus === query.profileStatus)
    .filter((profile) => !query.accreditationStatus || profile.accreditationStatus === query.accreditationStatus)
    .filter((profile) => !query.region || profile.primaryRegion === query.region)
    .filter((profile) => {
      const capacity = capacitySummary(profile, query.cycleYear);
      return !query.capacityStatus || capacity.capacityStatus === query.capacityStatus;
    })
    .map((profile) => {
      const capacity = capacitySummary(profile, query.cycleYear);
      return {
        assessorId: profile.assessorId,
        internalUserId: profile.internalUserId,
        displayName: profile.displayName,
        email: profile.email,
        profileStatus: profile.profileStatus,
        accreditationStatus: profile.accreditationStatus,
        primaryRegion: profile.primaryRegion,
        capacityStatus: capacity.capacityStatus,
        maxAssignments: capacity.maxAssignments,
        currentAssignedCount: capacity.currentAssignedCount,
        updatedAt: profile.updatedAt
      };
    });
}

function pageMeta(totalItems: number, query: AssessorQueueQuery) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    availableFilters: ["profileStatus", "accreditationStatus", "region", "cycleYear", "capacityStatus"]
  };
}

function paginate<T>(items: T[], query: AssessorQueueQuery) {
  const start = (query.page - 1) * query.pageSize;
  return items.slice(start, start + query.pageSize);
}

function assertVersion(profile: AssessorProfile, clientVersion: number) {
  if (profile.version !== clientVersion) {
    throw new ApiError("idempotency_conflict", 409, "Assessor profile version has changed.");
  }
}

function touch(profile: AssessorProfile) {
  profile.version += 1;
  profile.updatedAt = new Date().toISOString();
}

export function registerAssessorRoutes(
  app: FastifyInstance,
  {
    resolveSession,
    store,
    repository,
    auditLedger = defaultAuditLedger
  }: {
    resolveSession: SessionResolver;
    store: AssessorStore;
    repository?: AssessorRepository;
    auditLedger?: AuditLedger;
  }
) {
  async function audit(event: AuditEvent) {
    store.audits.push(await appendAuditEvent(auditLedger, event));
    return event.id;
  }

  app.get("/api/v1/assessor/profile", async (request) => {
    const session = await resolveSession(request);
    requireAssessorSelf(session);
    if (repository) {
      return repository.getSelfProfile(session.actor.actorId);
    }
    return assessorSelfProfileResponseSchema.parse({
      profile: profileForActor(store, session),
      assignmentLoadDeferred: true,
      visitScheduleDeferred: true
    });
  });

  app.patch("/api/v1/assessor/profile/preferences", async (request) => {
    const session = await resolveSession(request);
    requireAssessorSelf(session);
    const input = updateAssessorPreferencesRequestSchema.parse(request.body);
    if (repository) {
      return repository.updatePreferences({ actorId: session.actor.actorId, body: input, actor: session.actor, request });
    }
    const profile = profileForActor(store, session);
    assertVersion(profile, input.clientVersion);
    const beforeState = structuredClone(profile.preferences);
    profile.preferences = input.preferences;
    touch(profile);
    const auditEventId = await audit(buildAuditEvent({
      action: "UPDATE_ASSESSOR_PREFERENCES",
      entityId: profile.assessorId,
      actor: session.actor,
      request: requestMetadata(request, input.idempotencyKey),
      beforeState,
      afterState: profile.preferences
    }));
    return assessorProfileCommandResponseSchema.parse({ profile, auditEventId });
  });

  app.patch("/api/v1/assessor/profile/availability", async (request) => {
    const session = await resolveSession(request);
    requireAssessorSelf(session);
    const input = updateAssessorAvailabilityRequestSchema.parse(request.body);
    if (repository) {
      return repository.updateAvailability({ actorId: session.actor.actorId, body: input, actor: session.actor, request });
    }
    const profile = profileForActor(store, session);
    assertVersion(profile, input.clientVersion);
    const beforeState = structuredClone(profile.availability);
    profile.availability = input.availability.map((window) => ({
      ...window,
      assessorId: profile.assessorId
    }));
    touch(profile);
    const auditEventId = await audit(buildAuditEvent({
      action: "UPDATE_ASSESSOR_AVAILABILITY",
      entityId: profile.assessorId,
      actor: session.actor,
      request: requestMetadata(request, input.idempotencyKey),
      beforeState,
      afterState: profile.availability
    }));
    return assessorProfileCommandResponseSchema.parse({ profile, auditEventId });
  });

  app.patch("/api/v1/assessor/profile/capacity", async (request) => {
    const session = await resolveSession(request);
    requireAssessorSelf(session);
    const input = updateAssessorCapacityRequestSchema.parse(request.body);
    if (repository) {
      return repository.updateCapacity({ actorId: session.actor.actorId, body: input, actor: session.actor, request });
    }
    const profile = profileForActor(store, session);
    assertVersion(profile, input.clientVersion);
    const beforeState = structuredClone(profile.capacity);
    profile.capacity = input.capacity.map((capacity) => ({
      ...capacity,
      assessorId: profile.assessorId
    }));
    touch(profile);
    const auditEventId = await audit(buildAuditEvent({
      action: "UPDATE_ASSESSOR_CAPACITY",
      entityId: profile.assessorId,
      actor: session.actor,
      request: requestMetadata(request, input.idempotencyKey),
      beforeState,
      afterState: profile.capacity
    }));
    return assessorProfileCommandResponseSchema.parse({ profile, auditEventId });
  });

  app.get("/api/v1/admin/assessors", async (request) => {
    const session = await resolveSession(request);
    requireAdmin(session);
    const query = parseAdminQuery(request);
    if (repository) {
      return repository.listAdminProfiles(query);
    }
    const items = listItems(store, query);
    return adminAssessorListResponseSchema.parse({
      items: paginate(items, query),
      page: pageMeta(items.length, query)
    });
  });

  app.post("/api/v1/admin/assessors", async (request, reply) => {
    const session = await resolveSession(request);
    requireAdmin(session);
    const input = upsertAssessorProfileRequestSchema.parse(request.body);
    if (repository) {
      const response = await repository.createAdminProfile({ body: input, actor: session.actor, request });
      reply.status(201);
      return response;
    }
    const existing = [...store.profiles.values()].find(
      (candidate) => candidate.internalUserId === input.internalUserId
    );
    if (existing) {
      return assessorProfileCommandResponseSchema.parse({
        profile: existing,
        auditEventId: "00000000-0000-4000-8000-000000000008"
      });
    }

    const profile = assessorSelfProfileResponseSchema.shape.profile.parse({
      assessorId: randomUUID(),
      internalUserId: input.internalUserId,
      displayName: input.displayName,
      email: input.email,
      profileStatus: input.profileStatus,
      accreditationStatus: input.accreditationStatus,
      accreditationProvider: "external_value_unavailable",
      primaryRegion: input.primaryRegion,
      preferences: {
        preferredRegions: input.primaryRegion ? [input.primaryRegion] : [],
        preferredAwardTrackCodes: ["STANDARD_GREEN_FLAG"],
        acceptsMysteryShop: false
      },
      availability: [],
      capacity: [],
      version: 0,
      updatedAt: new Date().toISOString()
    });
    store.profiles.set(profile.assessorId, profile);
    const auditEventId = await audit(buildAuditEvent({
      action: "CREATE_ASSESSOR_PROFILE",
      entityId: profile.assessorId,
      actor: session.actor,
      request: requestMetadata(request, input.idempotencyKey),
      afterState: profile
    }));
    reply.status(201);
    return assessorProfileCommandResponseSchema.parse({ profile, auditEventId });
  });

  app.get("/api/v1/admin/assessors/:assessorId", async (request) => {
    const session = await resolveSession(request);
    requireAdmin(session);
    const params = request.params as { assessorId: string };
    if (repository) {
      return repository.getAdminProfile(params.assessorId);
    }
    return adminAssessorDetailResponseSchema.parse({
      profile: requireProfile(store, params.assessorId),
      allocationCandidateGenerationAvailable: false,
      providerSyncStatus: "external_value_unavailable"
    });
  });

  app.patch("/api/v1/admin/assessors/:assessorId", async (request) => {
    const session = await resolveSession(request);
    requireAdmin(session);
    const params = request.params as { assessorId: string };
    const input = upsertAssessorProfileRequestSchema.partial({ internalUserId: true }).parse(request.body);
    if (repository) {
      return repository.updateAdminProfile({ assessorId: params.assessorId, body: input, actor: session.actor, request });
    }
    const profile = requireProfile(store, params.assessorId);
    const beforeState = structuredClone(profile);
    Object.assign(profile, {
      displayName: input.displayName ?? profile.displayName,
      email: input.email ?? profile.email,
      profileStatus: input.profileStatus ?? profile.profileStatus,
      accreditationStatus: input.accreditationStatus ?? profile.accreditationStatus,
      primaryRegion: input.primaryRegion ?? profile.primaryRegion
    } satisfies Partial<AssessorProfile>);
    touch(profile);
    const auditEventId = await audit(buildAuditEvent({
      action: "UPDATE_ASSESSOR_PROFILE",
      entityId: profile.assessorId,
      actor: session.actor,
      request: requestMetadata(request, input.idempotencyKey),
      beforeState,
      afterState: profile
    }));
    return assessorProfileCommandResponseSchema.parse({ profile, auditEventId });
  });

  app.post("/api/v1/admin/assessors/:assessorId/disable", async (request) => {
    const session = await resolveSession(request);
    requireAdmin(session);
    const params = request.params as { assessorId: string };
    const body = (request.body ?? {}) as { reason?: string; idempotencyKey?: string };
    if (repository) {
      return repository.disableAdminProfile({
        assessorId: params.assessorId,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
        actor: session.actor,
        request
      });
    }
    const profile = requireProfile(store, params.assessorId);
    const beforeState = { profileStatus: profile.profileStatus };
    profile.profileStatus = "INACTIVE";
    touch(profile);
    const auditEventId = await audit(buildAuditEvent({
      action: "DISABLE_ASSESSOR_PROFILE",
      entityId: profile.assessorId,
      actor: session.actor,
      request: requestMetadata(request, body.idempotencyKey),
      beforeState,
      afterState: { profileStatus: profile.profileStatus },
      reason: body.reason
    }));
    return assessorProfileCommandResponseSchema.parse({ profile, auditEventId });
  });
}

export type AssessorProfileRecord = z.infer<typeof assessorSelfProfileResponseSchema>["profile"];
export type AssessorRole = Extract<RoleType, "JUDGE">;
export type { AssessorRepository } from "./postgres-domain-stores/assessor-repository.js";
