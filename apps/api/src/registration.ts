import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  actorContextSchema,
  adminRegistrationDecisionRequestSchema,
  adminRegistrationReviewQueueResponseSchema,
  emailVerificationRequestSchema,
  globalAdminSessionFixture,
  parkActivationResponseSchema,
  registrationLocationLookupRequestSchema,
  registrationLocationSuggestionSchema,
  registrationSubmissionRequestSchema,
  registrationSubmissionResponseSchema,
  registrationSummarySchema,
  type RegistrationStatus
} from "@green-flag/contracts";
import {
  ApiError,
  appendAuditEvent,
  type AuditEvent,
  type AuditLedger,
  type SessionProfile,
  type SessionResolver
} from "./auth.js";
import type { RegistrationRepository } from "./postgres-domain-stores/registration-repository.js";

type RegistrationRecord = {
  registrationId: string;
  parkName: string;
  organisationName: string;
  contactEmail: string;
  submittedAt: string;
  status: RegistrationStatus;
  eligibility: {
    eligible: boolean;
    failedCriteria: Array<"publicly_accessible" | "free_to_enter" | "minimum_size">;
  };
  duplicateWarning: {
    hasPotentialDuplicate: boolean;
    matchedFields: Array<"park_name" | "postcode" | "address">;
    acknowledged: boolean;
  };
  token: string;
  parkId?: string;
};

export interface RegistrationStore {
  records: Map<string, RegistrationRecord>;
  audits: AuditEvent[];
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export function createRegistrationStore(): RegistrationStore {
  const store: RegistrationStore = {
    records: new Map(),
    audits: [],
    async withTransaction(work) {
      const records = structuredClone([...store.records.entries()]);
      const audits = structuredClone(store.audits);
      try {
        return await work();
      } catch (error) {
        store.records = new Map(records);
        store.audits = audits;
        throw error;
      }
    }
  };
  return store;
}

const publicRegistrationActor = actorContextSchema.parse({
  actorId: "00000000-0000-4000-8000-000000000003",
  cognitoSubject: "public-registration",
  role: "SYSTEM",
  scopes: [{ type: "GLOBAL" }],
  redactionProfile: "public_result"
});

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
    entityType: "registration_submission",
    entityId,
    beforeState,
    afterState,
    request,
    reason,
    createdAt: new Date().toISOString()
  };
}

function evaluateEligibility(input: {
  publiclyAccessible: boolean;
  freeToEnter: boolean;
  minimumSizeConfirmed: boolean;
}) {
  const failedCriteria: RegistrationRecord["eligibility"]["failedCriteria"] = [];
  if (!input.publiclyAccessible) failedCriteria.push("publicly_accessible");
  if (!input.freeToEnter) failedCriteria.push("free_to_enter");
  if (!input.minimumSizeConfirmed) failedCriteria.push("minimum_size");
  return {
    eligible: failedCriteria.length === 0,
    failedCriteria
  };
}

function detectDuplicate(input: {
  parkName: string;
  postcode?: string | undefined;
  duplicateAcknowledged: boolean;
}) {
  const matchedFields: RegistrationRecord["duplicateWarning"]["matchedFields"] = [];
  if (/lower environment park/i.test(input.parkName)) matchedFields.push("park_name");
  if (input.postcode?.toUpperCase() === "LE1 2AB") matchedFields.push("postcode");
  return {
    hasPotentialDuplicate: matchedFields.length > 0,
    matchedFields,
    acknowledged: matchedFields.length === 0 ? false : input.duplicateAcknowledged
  };
}

function requireAdmin(session: SessionProfile) {
  if (session.actor.role !== "KBT_ADMIN" && session.actor.role !== "SUPER_ADMIN") {
    throw new ApiError("forbidden", 403, "Registration review requires an admin role.");
  }
}

export function registerRegistrationRoutes(
  app: FastifyInstance,
  {
    resolveSession,
    store,
    repository,
    auditLedger = defaultAuditLedger
  }: {
    resolveSession: SessionResolver;
    store?: RegistrationStore;
    repository?: RegistrationRepository;
    auditLedger?: AuditLedger;
  }
) {
  async function audit(event: AuditEvent) {
    if (!store) {
      throw new ApiError("dependency_missing", 503, "Registration map store is not configured for this route.");
    }
    store.audits.push(await appendAuditEvent(auditLedger, event));
  }

  app.post("/api/v1/registrations", async (request, reply) => {
    const input = registrationSubmissionRequestSchema.parse(request.body);
    const idempotencyKey = request.headers["idempotency-key"]?.toString();
    if (repository) {
      const response = await repository.submit({ body: input, idempotencyKey, request });
      reply.status(201);
      return response;
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Registration persistence is not configured.");
    const eligibility = evaluateEligibility(input.eligibility);
    const duplicateWarning = detectDuplicate({
      parkName: input.parkName,
      postcode: input.postcode,
      duplicateAcknowledged: input.duplicateAcknowledged
    });
    if (duplicateWarning.hasPotentialDuplicate && !duplicateWarning.acknowledged) {
      throw new ApiError("conflict", 409, "Potential duplicate park requires acknowledgement.", {
        duplicateWarning
      });
    }

    const existing = [...store.records.values()].find(
      (record) => record.contactEmail === input.contactEmail && record.parkName === input.parkName
    );
    if (existing && idempotencyKey) {
      return registrationSubmissionResponseSchema.parse({
        registrationId: existing.registrationId,
        status: existing.status,
        eligibility: existing.eligibility,
        duplicateWarning: existing.duplicateWarning,
        verificationRequired: existing.status === "PENDING_VERIFICATION",
        notificationIntents: ["registration_verification_email"]
      });
    }

    const registrationId = randomUUID();
    const status: RegistrationStatus = eligibility.eligible ? "PENDING_VERIFICATION" : "ELIGIBILITY_FAILED";
    const record: RegistrationRecord = {
      registrationId,
      parkName: input.parkName,
      organisationName: input.organisationName,
      contactEmail: input.contactEmail,
      submittedAt: new Date().toISOString(),
      status,
      eligibility,
      duplicateWarning,
      token: "lower-env-verification-token"
    };
    await store.withTransaction(async () => {
      store.records.set(registrationId, record);
      await audit(
        buildAuditEvent({
          action: "SUBMIT_REGISTRATION",
          entityId: registrationId,
          actor: publicRegistrationActor,
          request: requestMetadata(request, idempotencyKey),
          afterState: record
        })
      );
    });

    reply.status(201);
    return registrationSubmissionResponseSchema.parse({
      registrationId,
      status,
      eligibility,
      duplicateWarning,
      verificationRequired: status === "PENDING_VERIFICATION",
      notificationIntents: duplicateWarning.hasPotentialDuplicate
        ? ["registration_verification_email", "admin_duplicate_alert"]
        : ["registration_verification_email"]
    });
  });

  app.post("/api/v1/registrations/:registrationId/location-lookup", async (request) => {
    const input = registrationLocationLookupRequestSchema.parse(request.body);
    const params = request.params as { registrationId: string };
    if (repository) {
      return repository.recordLocationLookup({ registrationId: params.registrationId, body: input, request });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Registration persistence is not configured.");
    if (!store.records.has(params.registrationId)) {
      throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
    }

    await audit(
      buildAuditEvent({
        action: "RESOLVE_REGISTRATION_LOCATION",
        entityId: params.registrationId,
        actor: publicRegistrationActor,
        request: requestMetadata(request),
        afterState: input
      })
    );

    return registrationLocationSuggestionSchema.parse({
      source: "ons_geography_mock",
      label: "Mock location enrichment",
      latitude: input.latitude,
      longitude: input.longitude,
      w3wAddress: input.w3wAddress ?? "///lower.environment.park",
      parkNameSuggestion: "Lower Environment Park",
      sizeBand: "suggested_from_os_open_greenspace",
      localAuthority: "Lower Environment Borough",
      region: "North West",
      country: "England",
      constituency: "Lower Environment North",
      requiresApplicantConfirmation: true
    });
  });

  app.get("/api/v1/registrations/:registrationId", async (request) => {
    const params = request.params as { registrationId: string };
    if (repository) {
      return repository.getSummary(params.registrationId);
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Registration persistence is not configured.");
    const record = store.records.get(params.registrationId);
    if (!record) {
      throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
    }

    return registrationSummarySchema.parse({
      ...record,
      verificationRequired: record.status === "PENDING_VERIFICATION",
      notificationIntents: ["registration_verification_email"]
    });
  });

  app.post("/api/v1/registrations/:registrationId/verify-email", async (request) => {
    const params = request.params as { registrationId: string };
    const input = emailVerificationRequestSchema.parse(request.body);
    if (repository) {
      return repository.verifyEmail({ registrationId: params.registrationId, token: input.token, request });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Registration persistence is not configured.");
    const record = store.records.get(params.registrationId);
    if (!record) {
      throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
    }

    const beforeState = { status: record.status };
    if (record.status === "VERIFIED_PENDING_REVIEW") {
      return {
        registrationId: record.registrationId,
        status: record.status,
        emailVerified: true,
        nextStep: "already_verified"
      };
    }
    if (record.status !== "PENDING_VERIFICATION" || input.token !== record.token) {
      return {
        registrationId: record.registrationId,
        status: record.status,
        emailVerified: false,
        nextStep: "cannot_verify"
      };
    }

    await store.withTransaction(async () => {
      record.status = "VERIFIED_PENDING_REVIEW";
      await audit(
        buildAuditEvent({
          action: "VERIFY_REGISTRATION_EMAIL",
          entityId: record.registrationId,
          actor: publicRegistrationActor,
          request: requestMetadata(request),
          beforeState,
          afterState: { status: record.status }
        })
      );
    });

    return {
      registrationId: record.registrationId,
      status: record.status,
      emailVerified: true,
      nextStep: "admin_review"
    };
  });

  app.get("/api/v1/admin/registration-review-queue", async (request) => {
    const session = await resolveSession(request);
    requireAdmin(session);
    if (repository) {
      return repository.listPendingReview();
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Registration persistence is not configured.");

    return adminRegistrationReviewQueueResponseSchema.parse({
      items: [...store.records.values()]
        .filter((record) => record.status === "VERIFIED_PENDING_REVIEW")
        .map((record) => ({
          registrationId: record.registrationId,
          status: record.status,
          parkName: record.parkName,
          organisationName: record.organisationName,
          contactEmail: record.contactEmail,
          eligibility: record.eligibility,
          duplicateWarning: record.duplicateWarning,
          submittedAt: record.submittedAt
        }))
    });
  });

  app.post("/api/v1/admin/registration-review-queue/:registrationId/approve", async (request) => {
    const session = await resolveSession(request);
    requireAdmin(session);
    const params = request.params as { registrationId: string };
    if (repository) {
      return repository.approve({
        registrationId: params.registrationId,
        actor: session.actor,
        request,
        idempotencyKey: request.headers["idempotency-key"]?.toString()
      });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Registration persistence is not configured.");
    const record = store.records.get(params.registrationId);
    if (!record) {
      throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
    }
    if (record.status !== "VERIFIED_PENDING_REVIEW" && record.status !== "APPROVED") {
      throw new ApiError("conflict", 409, "Registration cannot be approved from its current state.");
    }

    const beforeState = { status: record.status };
    await store.withTransaction(async () => {
      record.status = "APPROVED";
      record.parkId ??= randomUUID();
      await audit(
        buildAuditEvent({
          action: "APPROVE_REGISTRATION",
          entityId: record.registrationId,
          actor: session.actor,
          request: requestMetadata(request, request.headers["idempotency-key"]?.toString()),
          beforeState,
          afterState: { status: record.status, parkStatus: "ACTIVE", parkId: record.parkId }
        })
      );
    });

    return parkActivationResponseSchema.parse({
      registrationId: record.registrationId,
      registrationStatus: record.status,
      parkId: record.parkId,
      parkStatus: "ACTIVE",
      notificationIntents: ["registration_approved_email"]
    });
  });

  app.post("/api/v1/admin/registration-review-queue/:registrationId/reject", async (request) => {
    const session = await resolveSession(request);
    requireAdmin(session);
    const params = request.params as { registrationId: string };
    const body = adminRegistrationDecisionRequestSchema.parse(request.body ?? {});
    const reason = body.reason;
    if (repository) {
      return repository.reject({
        registrationId: params.registrationId,
        actor: session.actor,
        request,
        idempotencyKey: request.headers["idempotency-key"]?.toString(),
        reason
      });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Registration persistence is not configured.");
    const record = store.records.get(params.registrationId);
    if (!record) {
      throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
    }
    if (record.status !== "VERIFIED_PENDING_REVIEW" && record.status !== "REJECTED") {
      throw new ApiError("conflict", 409, "Registration cannot be rejected from its current state.");
    }

    const beforeState = { status: record.status };
    await store.withTransaction(async () => {
      record.status = "REJECTED";
      await audit(
        buildAuditEvent({
          action: "REJECT_REGISTRATION",
          entityId: record.registrationId,
          actor: session.actor,
          request: requestMetadata(request, request.headers["idempotency-key"]?.toString()),
          beforeState,
          afterState: { status: record.status, parkStatus: "INACTIVE" },
          reason
        })
      );
    });

    return parkActivationResponseSchema.parse({
      registrationId: record.registrationId,
      registrationStatus: record.status,
      parkStatus: "INACTIVE",
      notificationIntents: ["registration_rejected_email"]
    });
  });
}

export const registrationTestAdminSession = globalAdminSessionFixture;
