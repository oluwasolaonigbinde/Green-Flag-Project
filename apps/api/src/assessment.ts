import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { z } from "zod";
import {
  addAssessmentEvidenceRequestSchema,
  adminAssessmentDetailResponseSchema,
  assessmentCommandResponseSchema,
  assessmentTemplateFixture,
  assessorVisitsResponseSchema,
  judgeAssessmentResponseSchema,
  scheduleVisitRequestSchema,
  submitAssessmentRequestSchema,
  updateAssessmentScoresRequestSchema
} from "@green-flag/contracts";
import type { AllocationStore } from "./allocation.js";
import type { AssessorStore } from "./assessor.js";
import { requireOperationalResourceAccess } from "./authorization.js";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile, type SessionResolver } from "./auth.js";
import { requireMutationAllowed } from "./authorization.js";
import type { ApplicantStore } from "./applicant.js";
import type { AssessmentRepository } from "./postgres-domain-stores/assessment-repository.js";

type AssessmentTemplate = typeof assessmentTemplateFixture;
type AssessmentVisit = z.infer<typeof assessorVisitsResponseSchema>["items"][number];
type JudgeAssessment = z.infer<typeof judgeAssessmentResponseSchema>["assessment"];

export interface AssessmentStore {
  visits: Map<string, AssessmentVisit>;
  assessments: Map<string, JudgeAssessment>;
  template: AssessmentTemplate;
  audits: AuditEvent[];
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export function createAssessmentStore(): AssessmentStore {
  const store: AssessmentStore = {
    visits: new Map(),
    assessments: new Map(),
    template: assessmentTemplateFixture,
    audits: [],
    async withTransaction(work) {
      const snapshot = {
        visits: structuredClone([...store.visits.entries()]),
        assessments: structuredClone([...store.assessments.entries()]),
        audits: structuredClone(store.audits)
      };
      try {
        return await work();
      } catch (error) {
        store.visits = new Map(snapshot.visits);
        store.assessments = new Map(snapshot.assessments);
        store.audits = snapshot.audits;
        throw error;
      }
    }
  };
  return store;
}

const defaultAuditLedger: AuditLedger = { async append() { return; } };

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
  afterState
}: {
  action: string;
  entityId?: string;
  actor: SessionProfile["actor"];
  request: ReturnType<typeof requestMetadata>;
  beforeState?: unknown;
  afterState?: unknown;
}): AuditEvent {
  return {
    id: randomUUID(),
    actor,
    action,
    entityType: "judge_assessment",
    entityId,
    beforeState,
    afterState,
    request,
    createdAt: new Date().toISOString()
  };
}

function profileIdForActor(assessorStore: AssessorStore, session: SessionProfile) {
  const profile = [...assessorStore.profiles.values()].find((candidate) => candidate.internalUserId === session.actor.actorId);
  return profile?.assessorId ?? session.actor.actorId;
}

function assignmentForActor(allocationStore: AllocationStore, assessorStore: AssessorStore, session: SessionProfile, assignmentId: string) {
  if (session.actor.role !== "JUDGE") {
    throw new ApiError("forbidden", 403, "Assessment access requires judge role.");
  }
  const assessorId = profileIdForActor(assessorStore, session);
  for (const allocation of allocationStore.allocations.values()) {
    const assignment = allocation.assignments.find((candidate) => candidate.assignmentId === assignmentId);
    if (assignment) {
      if (assignment.assessorId !== assessorId && assignment.assessorId !== session.actor.actorId) {
        throw new ApiError("forbidden", 403, "Judge is not assigned to this assessment.");
      }
      if (!["RELEASED", "ACCEPTED"].includes(assignment.status)) {
        throw new ApiError("invalid_state", 409, "Assessment requires a released or accepted assignment.");
      }
      return assignment;
    }
  }
  throw new ApiError("dependency_missing", 404, "Assignment was not found.");
}

function assessmentForAssignment(store: AssessmentStore, assignment: { assignmentId: string; episodeId: string; assessorId: string }) {
  const existing = [...store.assessments.values()].find((assessment) => assessment.assignmentId === assignment.assignmentId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const maxScoreTotal = store.template.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
  const assessment = judgeAssessmentResponseSchema.shape.assessment.parse({
    assessmentId: randomUUID(),
    assignmentId: assignment.assignmentId,
    episodeId: assignment.episodeId,
    assessorId: assignment.assessorId,
    status: "NOT_STARTED",
    template: store.template,
    scores: [],
    rawScoreTotal: 0,
    maxScoreTotal,
    thresholdMet: false,
    evidence: [],
    offlineSyncVersion: 0,
    version: 0,
    updatedAt: now
  });
  store.assessments.set(assessment.assessmentId, assessment);
  return assessment;
}

function recalculate(assessment: JudgeAssessment) {
  assessment.rawScoreTotal = assessment.scores.reduce((sum, score) => sum + score.score, 0);
  assessment.maxScoreTotal = assessment.template.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
  assessment.thresholdMet = (assessment.rawScoreTotal / assessment.maxScoreTotal) * 100 >= assessment.template.passThresholdPercent;
  assessment.version += 1;
  assessment.updatedAt = new Date().toISOString();
}

function requireAdminForEpisode(session: SessionProfile, applicantStore: ApplicantStore, episodeId: string) {
  const application = [...applicantStore.applications.values()].find((candidate) => candidate.episodeId === episodeId);
  if (!application) throw new ApiError("dependency_missing", 404, "Episode application was not found.");
  const ownership = applicantStore.parkOwnerships.get(application.parkId);
  if (!ownership) throw new ApiError("dependency_missing", 404, "Park ownership metadata was not found.");
  requireOperationalResourceAccess(session, ownership);
}

export function registerAssessmentRoutes(
  app: FastifyInstance,
  {
    resolveSession,
    assessmentStore,
    allocationStore,
    assessorStore,
    applicantStore,
    repository,
    auditLedger = defaultAuditLedger
  }: {
    resolveSession: SessionResolver;
    assessmentStore: AssessmentStore;
    allocationStore: AllocationStore;
    assessorStore: AssessorStore;
    applicantStore: ApplicantStore;
    repository?: AssessmentRepository;
    auditLedger?: AuditLedger;
  }
) {
  async function audit(event: AuditEvent) {
    assessmentStore.audits.push(await appendAuditEvent(auditLedger, event));
    return event.id;
  }

  app.get("/api/v1/assessor/visits", async (request) => {
    const session = await resolveSession(request);
    if (repository) return repository.listVisits(session.actor.actorId);
    const assessorId = profileIdForActor(assessorStore, session);
    return assessorVisitsResponseSchema.parse({
      items: [...assessmentStore.visits.values()].filter((visit) => visit.assessorId === assessorId)
    });
  });

  app.post("/api/v1/assessor/visits/:assignmentId/schedule", async (request) => {
    const session = await resolveSession(request);
    requireMutationAllowed(session);
    const params = request.params as { assignmentId: string };
    const input = scheduleVisitRequestSchema.parse(request.body);
    if (repository) {
      return repository.scheduleVisit({ assignmentId: params.assignmentId, body: input, session, request });
    }
    const assignment = assignmentForActor(allocationStore, assessorStore, session, params.assignmentId);
    const existing = [...assessmentStore.visits.values()].find((visit) => visit.assignmentId === params.assignmentId);
    if (existing && existing.version !== input.clientVersion) throw new ApiError("idempotency_conflict", 409, "Visit version has changed.");
    let visit: AssessmentVisit;
    await assessmentStore.withTransaction(async () => {
      const beforeState = existing ? structuredClone(existing) : undefined;
      visit = {
        visitId: existing?.visitId ?? randomUUID(),
        assignmentId: params.assignmentId,
        episodeId: assignment.episodeId,
        assessorId: assignment.assessorId,
        status: "SCHEDULED",
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
        locationDisclosure: "visible_to_assessor_only",
        version: (existing?.version ?? -1) + 1
      };
      assessmentStore.visits.set(visit.visitId, visit);
      await audit(buildAuditEvent({
        action: "SCHEDULE_ASSESSMENT_VISIT",
        entityId: visit.visitId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        beforeState,
        afterState: visit
      }));
    });
    return visit!;
  });

  app.get("/api/v1/assessor/assessments/:assignmentId", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { assignmentId: string };
    if (repository) return repository.getAssessment({ assignmentId: params.assignmentId, session });
    const assignment = assignmentForActor(allocationStore, assessorStore, session, params.assignmentId);
    return judgeAssessmentResponseSchema.parse({ assessment: assessmentForAssignment(assessmentStore, assignment) });
  });

  app.patch("/api/v1/assessor/assessments/:assessmentId/scores", async (request) => {
    const session = await resolveSession(request);
    requireMutationAllowed(session);
    const params = request.params as { assessmentId: string };
    const input = updateAssessmentScoresRequestSchema.parse(request.body);
    if (repository) {
      return repository.updateScores({ assessmentId: params.assessmentId, body: input, session, request });
    }
    const assessment = assessmentStore.assessments.get(params.assessmentId);
    if (!assessment) throw new ApiError("dependency_missing", 404, "Assessment was not found.");
    assignmentForActor(allocationStore, assessorStore, session, assessment.assignmentId);
    if (assessment.version !== input.clientVersion) throw new ApiError("idempotency_conflict", 409, "Assessment version has changed.");
    let auditEventId = "";
    await assessmentStore.withTransaction(async () => {
      const beforeState = structuredClone(assessment);
      assessment.scores = input.scores;
      assessment.status = "IN_PROGRESS";
      assessment.offlineSyncVersion = input.offlineSyncVersion;
      recalculate(assessment);
      auditEventId = await audit(buildAuditEvent({
        action: "UPDATE_ASSESSMENT_SCORES",
        entityId: assessment.assessmentId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        beforeState,
        afterState: assessment
      }));
    });
    return assessmentCommandResponseSchema.parse({ assessment, auditEventId });
  });

  app.post("/api/v1/assessor/assessments/:assessmentId/evidence", async (request) => {
    const session = await resolveSession(request);
    requireMutationAllowed(session);
    const params = request.params as { assessmentId: string };
    const input = addAssessmentEvidenceRequestSchema.parse(request.body);
    if (repository) {
      return repository.addEvidence({ assessmentId: params.assessmentId, body: input, session, request });
    }
    const assessment = assessmentStore.assessments.get(params.assessmentId);
    if (!assessment) throw new ApiError("dependency_missing", 404, "Assessment was not found.");
    assignmentForActor(allocationStore, assessorStore, session, assessment.assignmentId);
    let auditEventId = "";
    await assessmentStore.withTransaction(async () => {
      assessment.evidence.push({
        evidenceId: randomUUID(),
        assessmentId: assessment.assessmentId,
        evidenceType: input.evidenceType,
        filename: input.filename,
        visibility: "admin_and_assessor",
        storageProvider: "lower_env_stub",
        storageKey: `lower-env/assessments/${assessment.assessmentId}/${input.filename}`,
        createdAt: new Date().toISOString()
      });
      recalculate(assessment);
      auditEventId = await audit(buildAuditEvent({
        action: "ADD_ASSESSMENT_EVIDENCE",
        entityId: assessment.assessmentId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        afterState: assessment.evidence.at(-1)
      }));
    });
    return assessmentCommandResponseSchema.parse({ assessment, auditEventId });
  });

  app.post("/api/v1/assessor/assessments/:assessmentId/submit", async (request) => {
    const session = await resolveSession(request);
    requireMutationAllowed(session);
    const params = request.params as { assessmentId: string };
    const input = submitAssessmentRequestSchema.parse(request.body);
    if (repository) {
      return repository.submit({ assessmentId: params.assessmentId, body: input, session, request });
    }
    const assessment = assessmentStore.assessments.get(params.assessmentId);
    if (!assessment) throw new ApiError("dependency_missing", 404, "Assessment was not found.");
    assignmentForActor(allocationStore, assessorStore, session, assessment.assignmentId);
    if (assessment.version !== input.clientVersion) throw new ApiError("idempotency_conflict", 409, "Assessment version has changed.");
    if (assessment.scores.length < assessment.template.criteria.length) throw new ApiError("invalid_state", 409, "All placeholder criteria require a score before submission.");
    let auditEventId = "";
    await assessmentStore.withTransaction(async () => {
      const beforeState = structuredClone(assessment);
      assessment.status = "SUBMITTED";
      recalculate(assessment);
      auditEventId = await audit(buildAuditEvent({
        action: "SUBMIT_ASSESSMENT",
        entityId: assessment.assessmentId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        beforeState,
        afterState: assessment
      }));
    });
    return assessmentCommandResponseSchema.parse({ assessment, auditEventId });
  });

  app.get("/api/v1/admin/assessments/:episodeId", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { episodeId: string };
    if (repository) return repository.adminDetail({ episodeId: params.episodeId, session });
    requireAdminForEpisode(session, applicantStore, params.episodeId);
    return adminAssessmentDetailResponseSchema.parse({
      episodeId: params.episodeId,
      assessments: [...assessmentStore.assessments.values()].filter((assessment) => assessment.episodeId === params.episodeId),
      applicantSafeProjectionAvailable: false
    });
  });
}
