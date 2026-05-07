
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import {
  adminResultDetailResponseSchema,
  applicantResultResponseSchema,
  holdDecisionRequestSchema,
  publishDecisionRequestSchema,
  resultCommandResponseSchema,
  withdrawDecisionRequestSchema
} from "@green-flag/contracts";
import type { ApplicantStore } from "../applicant.js";
import type { AssessmentStore } from "../assessment.js";
import { appendAuditEvent, ApiError, type AuditEvent, type AuditLedger, type SessionResolver } from "../auth.js";
import { buildAuditEvent, defaultAuditLedger, requestMetadata } from "./audit.js";
import { matchingAuditByIdempotency, summarizeAssessments } from "./commands.service.js";
import { requireAdminForEpisode, requireApplicantForEpisode } from "./policies.js";
import { assessmentsForEpisode, decisionForEpisode, safeDisplayLabel } from "./read-models.js";
import type { AwardCacheEntry, DecisionResult, PublicMapUpdateEvent, ResultArtifact, ResultsStore } from "./store.js";

export function registerResultsRoutes(
  app: FastifyInstance,
  {
    resolveSession,
    resultsStore,
    assessmentStore,
    applicantStore,
    auditLedger = defaultAuditLedger
  }: {
    resolveSession: SessionResolver;
    resultsStore: ResultsStore;
    assessmentStore: AssessmentStore;
    applicantStore: ApplicantStore;
    auditLedger?: AuditLedger;
  }
) {
  async function audit(event: AuditEvent) {
    resultsStore.audits.push(await appendAuditEvent(auditLedger, event));
    return event.id;
  }

  app.get("/api/v1/admin/results/:episodeId", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { episodeId: string };
    requireAdminForEpisode(session, applicantStore, params.episodeId);
    const decision = decisionForEpisode(resultsStore, params.episodeId);
    return adminResultDetailResponseSchema.parse({
      episodeId: params.episodeId,
      decision,
      assessments: assessmentsForEpisode(assessmentStore, params.episodeId),
      artifacts: [...resultsStore.artifacts.values()].filter((artifact) => artifact.episodeId === params.episodeId),
      awardCache: [...resultsStore.awardCache.values()].find((entry) => entry.episodeId === params.episodeId),
      publicMapEvents: [...resultsStore.publicMapEvents.values()].filter((event) => event.episodeId === params.episodeId)
    });
  });

  app.post("/api/v1/admin/results/:episodeId/hold", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { episodeId: string };
    const input = holdDecisionRequestSchema.parse(request.body);
    const { application } = requireAdminForEpisode(session, applicantStore, params.episodeId);
    const existing = decisionForEpisode(resultsStore, params.episodeId);
    if (existing) {
      if (matchingAuditByIdempotency(resultsStore, "HOLD_DECISION_RESULT", existing.decisionId, input.idempotencyKey)) {
        return resultCommandResponseSchema.parse({ decision: existing, artifacts: [], auditEventId: resultsStore.audits.at(-1)?.id ?? randomUUID() });
      }
      throw new ApiError("invalid_state", 409, "Decision result already exists for this episode.");
    }
    const summary = summarizeAssessments(assessmentStore, params.episodeId);
    let response: z.infer<typeof resultCommandResponseSchema>;
    await resultsStore.withTransaction(async () => {
      const now = new Date().toISOString();
      const decision: DecisionResult = {
        decisionId: randomUUID(),
        episodeId: params.episodeId,
        parkId: application.parkId,
        applicationId: application.applicationId,
        status: "CONFIRMED_HELD",
        outcome: summary.thresholdMet ? "THRESHOLD_MET" : "THRESHOLD_NOT_MET",
        thresholdAcknowledged: input.thresholdAcknowledged,
        thresholdMet: summary.thresholdMet,
        assessmentCount: summary.submitted.length,
        rawScoreTotal: summary.rawScoreTotal,
        maxScoreTotal: summary.maxScoreTotal,
        internalNotes: input.internalNotes,
        version: 0,
        updatedAt: now
      };
      const auditEventId = await audit(buildAuditEvent({
        action: "HOLD_DECISION_RESULT",
        entityId: decision.decisionId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        afterState: decision,
        reason: input.reason
      }));
      resultsStore.decisions.set(decision.decisionId, decision);
      applicantStore.episodeStatuses.set(params.episodeId, "RESULT_CONFIRMED_HELD");
      response = resultCommandResponseSchema.parse({ decision, artifacts: [], auditEventId });
    });
    return response!;
  });

  app.post("/api/v1/admin/results/:decisionId/publish", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { decisionId: string };
    const input = publishDecisionRequestSchema.parse(request.body);
    const decision = resultsStore.decisions.get(params.decisionId);
    if (!decision) throw new ApiError("dependency_missing", 404, "Decision result was not found.");
    requireAdminForEpisode(session, applicantStore, decision.episodeId);
    if (decision.status === "PUBLISHED" && matchingAuditByIdempotency(resultsStore, "PUBLISH_DECISION_RESULT", decision.decisionId, input.idempotencyKey)) {
      const publicMapEvent = decision.publicMapEventId ? resultsStore.publicMapEvents.get(decision.publicMapEventId) : undefined;
      return resultCommandResponseSchema.parse({
        decision,
        artifacts: [...resultsStore.artifacts.values()].filter((artifact) => artifact.decisionId === decision.decisionId),
        awardCache: resultsStore.awardCache.get(decision.parkId),
        publicMapEvent,
        auditEventId: resultsStore.audits.at(-1)?.id ?? randomUUID()
      });
    }
    if (decision.status !== "CONFIRMED_HELD") throw new ApiError("invalid_state", 409, "Only held decisions can be published.");
    let response: z.infer<typeof resultCommandResponseSchema>;
    await resultsStore.withTransaction(async () => {
      const beforeState = structuredClone(decision);
      const now = new Date().toISOString();
      const artifact: ResultArtifact = {
        artifactId: randomUUID(),
        decisionId: decision.decisionId,
        episodeId: decision.episodeId,
        artifactType: "certificate_shell",
        storageProvider: "lower_env_stub",
        storageKey: `lower-env/results/${decision.decisionId}/certificate-shell.pdf`,
        publicVisible: true,
        createdAt: now
      };
      const awardCache: AwardCacheEntry = {
        parkId: decision.parkId,
        episodeId: decision.episodeId,
        decisionId: decision.decisionId,
        resultStatus: "PUBLISHED",
        displayLabel: safeDisplayLabel({ ...decision, status: "PUBLISHED" }),
        publishedAt: now,
        updatedAt: now
      };
      const publicMapEvent: PublicMapUpdateEvent = {
        eventId: randomUUID(),
        decisionId: decision.decisionId,
        parkId: decision.parkId,
        episodeId: decision.episodeId,
        eventType: "award_published",
        status: "PENDING",
        payload: {
          parkId: decision.parkId,
          displayLabel: awardCache.displayLabel,
          published: true
        },
        createdAt: now
      };
      Object.assign(decision, {
        status: "PUBLISHED" as const,
        publishedAt: now,
        certificateId: artifact.artifactId,
        publicMapEventId: publicMapEvent.eventId,
        version: decision.version + 1,
        updatedAt: now
      });
      const auditEventId = await audit(buildAuditEvent({
        action: "PUBLISH_DECISION_RESULT",
        entityId: decision.decisionId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        beforeState,
        afterState: { decision, releaseMode: input.releaseMode }
      }));
      resultsStore.artifacts.set(artifact.artifactId, artifact);
      resultsStore.awardCache.set(decision.parkId, awardCache);
      resultsStore.publicMapEvents.set(publicMapEvent.eventId, publicMapEvent);
      applicantStore.episodeStatuses.set(decision.episodeId, "PUBLISHED");
      response = resultCommandResponseSchema.parse({ decision, artifacts: [artifact], awardCache, publicMapEvent, auditEventId });
    });
    return response!;
  });

  app.post("/api/v1/admin/results/:decisionId/withdraw", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { decisionId: string };
    const input = withdrawDecisionRequestSchema.parse(request.body);
    const decision = resultsStore.decisions.get(params.decisionId);
    if (!decision) throw new ApiError("dependency_missing", 404, "Decision result was not found.");
    requireAdminForEpisode(session, applicantStore, decision.episodeId);
    let response: z.infer<typeof resultCommandResponseSchema>;
    await resultsStore.withTransaction(async () => {
      const beforeState = structuredClone(decision);
      const now = new Date().toISOString();
      Object.assign(decision, { status: "WITHDRAWN" as const, version: decision.version + 1, updatedAt: now });
      const publicMapEvent: PublicMapUpdateEvent = {
        eventId: randomUUID(),
        decisionId: decision.decisionId,
        parkId: decision.parkId,
        episodeId: decision.episodeId,
        eventType: "award_withdrawn",
        status: "PENDING",
        payload: { parkId: decision.parkId, displayLabel: safeDisplayLabel(decision), published: false },
        createdAt: now
      };
      const auditEventId = await audit(buildAuditEvent({
        action: "WITHDRAW_DECISION_RESULT",
        entityId: decision.decisionId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        beforeState,
        afterState: decision,
        reason: input.reason
      }));
      resultsStore.publicMapEvents.set(publicMapEvent.eventId, publicMapEvent);
      resultsStore.awardCache.delete(decision.parkId);
      response = resultCommandResponseSchema.parse({ decision, artifacts: [], publicMapEvent, auditEventId });
    });
    return response!;
  });

  app.get("/api/v1/applicant/results/:episodeId", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { episodeId: string };
    const { application } = requireApplicantForEpisode(session, applicantStore, params.episodeId);
    const decision = decisionForEpisode(resultsStore, params.episodeId);
    if (!decision) {
      return applicantResultResponseSchema.parse({ episodeId: params.episodeId, parkId: application.parkId, status: "not_available" });
    }
    if (decision.status === "WITHDRAWN") {
      return applicantResultResponseSchema.parse({ episodeId: params.episodeId, parkId: application.parkId, status: "withdrawn", displayLabel: "Result withdrawn" });
    }
    if (decision.status !== "PUBLISHED") {
      return applicantResultResponseSchema.parse({ episodeId: params.episodeId, parkId: application.parkId, status: "not_available" });
    }
    return applicantResultResponseSchema.parse({
      episodeId: params.episodeId,
      parkId: application.parkId,
      status: "published",
      displayLabel: safeDisplayLabel(decision),
      certificate: decision.certificateId
        ? { certificateId: decision.certificateId, downloadAvailable: true, storageProvider: "lower_env_stub" }
        : undefined
    });
  });
}
