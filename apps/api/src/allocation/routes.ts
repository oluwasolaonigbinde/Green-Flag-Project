
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  allocationCandidatesResponseSchema,
  allocationCommandResponseSchema,
  allocationReadyEpisodesResponseSchema,
  assessorAssignmentDecisionRequestSchema,
  assessorAssignmentDecisionResponseSchema,
  assessorAssignmentsResponseSchema,
  holdAllocationRequestSchema,
  lowerEnvironmentAwardCycle2026Fixture,
  lowerEnvironmentParkFixture,
  releaseAllocationRequestSchema,
  reassignAllocationRequestSchema,
  type AssignmentStatus
} from "@green-flag/contracts";
import type { ApplicantStore } from "../applicant.js";
import type { AssessorStore } from "../assessor.js";
import {
  ApiError,
  appendAuditEvent,
  type AuditEvent,
  type AuditLedger,
  type SessionResolver
} from "../auth.js";
import { buildAdminOverrideEvent } from "../overrides.js";
import { buildAuditEvent, defaultAuditLedger, requestMetadata } from "./audit.js";
import { candidatesFor } from "./candidates.service.js";
import { contactRevealAvailable, existingAllocationForEpisode, matchingAuditByIdempotency } from "./commands.service.js";
import { requireAdminForEpisode, requireAllocation, requireAllocationAdmin } from "./policies.js";
import { readyEpisodeItems } from "./read-models.js";
import type { AllocationAssignment, AllocationCommand, AllocationStore } from "./store.js";
import type { AllocationRepository } from "../postgres-domain-stores/allocation-repository.js";

export function registerAllocationRoutes(
  app: FastifyInstance,
  {
    resolveSession,
    allocationStore,
    applicantStore,
    assessorStore,
    repository,
    auditLedger = defaultAuditLedger
  }: {
    resolveSession: SessionResolver;
    allocationStore: AllocationStore;
    applicantStore: ApplicantStore;
    assessorStore: AssessorStore;
    repository?: AllocationRepository;
    auditLedger?: AuditLedger;
  }
) {
  async function audit(event: AuditEvent) {
    allocationStore.audits.push(await appendAuditEvent(auditLedger, event));
    return event.id;
  }

  async function withAllocationTransaction<T>(work: () => Promise<T>) {
    const applicationSnapshot = structuredClone([...applicantStore.applications.entries()]);
    const episodeStatusSnapshot = structuredClone([...applicantStore.episodeStatuses.entries()]);
    const applicantAuditSnapshot = structuredClone(applicantStore.audits);
    const applicantOverrideSnapshot = structuredClone(applicantStore.overrideEvents);
    try {
      return await allocationStore.withTransaction(work);
    } catch (error) {
      applicantStore.applications = new Map(applicationSnapshot);
      applicantStore.episodeStatuses = new Map(episodeStatusSnapshot);
      applicantStore.audits = applicantAuditSnapshot;
      applicantStore.overrideEvents = applicantOverrideSnapshot;
      throw error;
    }
  }

  app.get("/api/v1/admin/allocations/ready-episodes", async (request) => {
    const session = await resolveSession(request);
    requireAllocationAdmin(session);
    if (repository) {
      return repository.readyEpisodes(session);
    }
    return allocationReadyEpisodesResponseSchema.parse({
      policy: allocationStore.policy,
      items: readyEpisodeItems(applicantStore, allocationStore, session)
    });
  });

  app.get("/api/v1/admin/allocations/:episodeId/candidates", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { episodeId: string };
    requireAdminForEpisode(session, applicantStore, params.episodeId);
    if (repository) {
      return repository.candidates(params.episodeId);
    }
    const candidateSet = candidatesFor(allocationStore, assessorStore);
    return allocationCandidatesResponseSchema.parse({
      episodeId: params.episodeId,
      suggestedJudgeCount: 2,
      policy: allocationStore.policy,
      ...candidateSet
    });
  });

  app.post("/api/v1/admin/allocations/:episodeId/hold", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { episodeId: string };
    requireAdminForEpisode(session, applicantStore, params.episodeId);
    const input = holdAllocationRequestSchema.parse(request.body);
    if (repository) {
      return repository.hold({ episodeId: params.episodeId, body: input, actor: session.actor, session, request });
    }
    const existing = existingAllocationForEpisode(allocationStore, params.episodeId);
    if (existing) {
      if (matchingAuditByIdempotency(allocationStore, "HOLD_ALLOCATION", existing.allocationId, input.idempotencyKey)) {
        return allocationCommandResponseSchema.parse(existing);
      }
      throw new ApiError("invalid_state", 409, "Allocation has already been held for this episode.");
    }
    const candidateSet = candidatesFor(allocationStore, assessorStore);
    const selected = input.assessorIds.map((assessorId) => {
      const candidate = candidateSet.candidates.find((item) => item.assessorId === assessorId);
      if (!candidate) {
        throw new ApiError("invalid_state", 409, "Selected assessor is not an allocatable candidate.");
      }
      return candidate;
    });
    const selectedFlagTypes = new Set(selected.flatMap((candidate) => candidate.flags.map((flag) => flag.type)));
    const unacknowledged = [...selectedFlagTypes].filter((flag) => !input.acknowledgedFlagTypes.includes(flag));
    if (unacknowledged.length > 0) {
      throw new ApiError("conflict", 409, "Soft COI or rotation flags require acknowledgement.", { unacknowledged });
    }
    const suggestedJudgeCount = 2;
    if (input.assessorIds.length !== input.finalJudgeCount) {
      throw new ApiError("validation_failed", 400, "Final judge count must match selected assessor count.");
    }
    if (input.finalJudgeCount !== suggestedJudgeCount && !input.reason) {
      throw new ApiError("validation_failed", 400, "Judge-count override requires a reason.");
    }

    const now = new Date().toISOString();
    const allocationId = randomUUID();
    let response: AllocationCommand;
    await withAllocationTransaction(async () => {
      const assignments: AllocationAssignment[] = input.assessorIds.map((assessorId) => ({
        assignmentId: randomUUID(),
        allocationId,
        episodeId: params.episodeId,
        assessorId,
        status: "HELD",
        contactRevealAvailable: false,
        version: 0,
        updatedAt: now
      }));
      const auditEventId = await audit(buildAuditEvent({
        action: "HOLD_ALLOCATION",
        entityId: allocationId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        afterState: { episodeId: params.episodeId, assessorIds: input.assessorIds, finalJudgeCount: input.finalJudgeCount },
        reason: input.reason
      }));
      const overrideEventIds: string[] = [];
      if (input.finalJudgeCount !== suggestedJudgeCount) {
        const override = buildAdminOverrideEvent({
          overrideType: "JUDGE_COUNT_OVERRIDE",
          targetType: "allocation",
          targetId: allocationId,
          authority: session.actor.role,
          reason: input.reason ?? "Judge count override.",
          actor: session.actor,
          priorState: { suggestedJudgeCount },
          afterState: { finalJudgeCount: input.finalJudgeCount },
          linkedAuditEventId: auditEventId,
          requestId: request.id,
          ...(input.idempotencyKey ? { correlationId: input.idempotencyKey } : {})
        });
        allocationStore.overrideEvents.push(override);
        overrideEventIds.push(override.id);
      }
      response = allocationCommandResponseSchema.parse({
        allocationId,
        episodeId: params.episodeId,
        status: "HELD",
        finalJudgeCount: input.finalJudgeCount,
        suggestedJudgeCount,
        contactRevealAvailable: false,
        notificationIntents: [],
        assignments,
        auditEventId,
        overrideEventIds
      });
      allocationStore.allocations.set(allocationId, response);
      applicantStore.episodeStatuses.set(params.episodeId, "ALLOCATED_HELD");
    });
    return response!;
  });

  app.post("/api/v1/admin/allocations/:allocationId/release", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { allocationId: string };
    const input = releaseAllocationRequestSchema.parse(request.body);
    if (repository) {
      return repository.release({ allocationId: params.allocationId, body: input, actor: session.actor, session, request });
    }
    const allocation = requireAllocation(allocationStore, params.allocationId);
    requireAdminForEpisode(session, applicantStore, allocation.episodeId);
    if (allocation.status !== "HELD") {
      if (allocation.status === "RELEASED" && matchingAuditByIdempotency(allocationStore, "RELEASE_ALLOCATION", allocation.allocationId, input.idempotencyKey)) {
        return allocationCommandResponseSchema.parse(allocation);
      }
      throw new ApiError("invalid_state", 409, "Only held allocations can be released.");
    }
    let response: AllocationCommand;
    await withAllocationTransaction(async () => {
      const beforeState = structuredClone(allocation);
      allocation.status = "RELEASED";
      allocation.notificationIntents = ["assignment_release_email_batch"];
      allocation.assignments = allocation.assignments.map((assignment) => ({
        ...assignment,
        status: "RELEASED",
        version: assignment.version + 1,
        updatedAt: new Date().toISOString()
      }));
      allocation.contactRevealAvailable = false;
      allocation.auditEventId = await audit(buildAuditEvent({
        action: "RELEASE_ALLOCATION",
        entityId: allocation.allocationId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        beforeState,
        afterState: { releaseMode: input.releaseMode, scheduledReleaseAt: input.scheduledReleaseAt }
      }));
      applicantStore.episodeStatuses.set(allocation.episodeId, "ALLOCATED_RELEASED");
      response = allocationCommandResponseSchema.parse(allocation);
    });
    return response!;
  });

  app.post("/api/v1/admin/allocations/:allocationId/reassign", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { allocationId: string };
    const input = reassignAllocationRequestSchema.parse(request.body);
    if (repository) {
      return repository.reassign({ allocationId: params.allocationId, body: input, actor: session.actor, session, request });
    }
    const allocation = requireAllocation(allocationStore, params.allocationId);
    requireAdminForEpisode(session, applicantStore, allocation.episodeId);
    const candidateSet = candidatesFor(allocationStore, assessorStore);
    if (!candidateSet.candidates.some((candidate) => candidate.assessorId === input.replacementAssessorId)) {
      throw new ApiError("invalid_state", 409, "Replacement assessor is not an allocatable candidate.");
    }
    let response: AllocationCommand;
    await withAllocationTransaction(async () => {
      const beforeState = structuredClone(allocation);
      if (!allocation.assignments.some((assignment) => assignment.assignmentId === input.replaceAssignmentId)) {
        throw new ApiError("dependency_missing", 404, "Assignment to replace was not found.");
      }
      allocation.assignments = allocation.assignments.map((assignment) =>
        assignment.assignmentId === input.replaceAssignmentId
          ? { ...assignment, status: "WITHDRAWN" as AssignmentStatus, version: assignment.version + 1, updatedAt: new Date().toISOString() }
          : assignment
      );
      allocation.assignments.push({
        assignmentId: randomUUID(),
        allocationId: allocation.allocationId,
        episodeId: allocation.episodeId,
        assessorId: input.replacementAssessorId,
        status: allocation.status === "RELEASED" ? "RELEASED" : "HELD",
        contactRevealAvailable: false,
        version: 0,
        updatedAt: new Date().toISOString()
      });
      allocation.auditEventId = await audit(buildAuditEvent({
        action: "REASSIGN_ALLOCATION",
        entityId: allocation.allocationId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        beforeState,
        afterState: { replaceAssignmentId: input.replaceAssignmentId, replacementAssessorId: input.replacementAssessorId },
        reason: input.reason
      }));
      response = allocationCommandResponseSchema.parse(allocation);
    });
    return response!;
  });

  app.get("/api/v1/assessor/assignments", async (request) => {
    const session = await resolveSession(request);
    if (session.actor.role !== "JUDGE") {
      throw new ApiError("forbidden", 403, "Assignment access requires judge role.");
    }
    if (repository) {
      return repository.listAssignments(session.actor.actorId);
    }
    const items = [...allocationStore.allocations.values()]
      .filter((allocation) => allocation.status === "RELEASED")
      .flatMap((allocation) =>
        allocation.assignments
          .filter((assignment) => assignment.assessorId === session.actor.actorId || assessorStore.profiles.get(assignment.assessorId)?.internalUserId === session.actor.actorId)
          .map((assignment) => ({
            assignmentId: assignment.assignmentId,
            allocationId: allocation.allocationId,
            episodeId: allocation.episodeId,
            parkName: lowerEnvironmentParkFixture.name,
            cycleYear: lowerEnvironmentAwardCycle2026Fixture.cycleYear,
            status: assignment.status,
            contactRevealAvailable: assignment.contactRevealAvailable,
            ...(assignment.contactRevealAvailable
              ? { contact: { parkContactName: "Alex Park Manager", parkContactEmail: "park.manager@example.invalid" } }
              : {}),
            version: assignment.version
          }))
      );
    return assessorAssignmentsResponseSchema.parse({ items });
  });

  async function decideAssignment(request: FastifyRequest, status: "ACCEPTED" | "DECLINED") {
    const session = await resolveSession(request);
    if (session.actor.role !== "JUDGE") {
      throw new ApiError("forbidden", 403, "Assignment decisions require judge role.");
    }
    const params = request.params as { assignmentId: string };
    const input = assessorAssignmentDecisionRequestSchema.parse(request.body);
    if (repository) {
      return repository.decideAssignment({
        assignmentId: params.assignmentId,
        status,
        clientVersion: input.clientVersion,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        actor: session.actor,
        request
      });
    }
    const allocation = [...allocationStore.allocations.values()].find((item) =>
      item.assignments.some((assignment) => assignment.assignmentId === params.assignmentId)
    );
    if (!allocation || allocation.status !== "RELEASED") {
      throw new ApiError("dependency_missing", 404, "Released assignment was not found.");
    }
    const assignment = allocation.assignments.find((item) => item.assignmentId === params.assignmentId);
    if (!assignment) {
      throw new ApiError("dependency_missing", 404, "Assignment was not found.");
    }
    const profile = assessorStore.profiles.get(assignment.assessorId);
    if (assignment.assessorId !== session.actor.actorId && profile?.internalUserId !== session.actor.actorId) {
      throw new ApiError("forbidden", 403, "Judge is not assigned to this allocation.");
    }
    if (assignment.version !== input.clientVersion) {
      throw new ApiError("idempotency_conflict", 409, "Assignment version has changed.");
    }
    let responseAssignment: AllocationAssignment;
    let auditEventId = "";
    await withAllocationTransaction(async () => {
      assignment.status = status;
      assignment.version += 1;
      assignment.updatedAt = new Date().toISOString();
      const reveal = contactRevealAvailable(allocation, "FULL_ASSESSMENT");
      allocation.contactRevealAvailable = reveal;
      allocation.assignments = allocation.assignments.map((candidate) => ({
        ...candidate,
        contactRevealAvailable: reveal
      }));
      responseAssignment = allocation.assignments.find((candidate) => candidate.assignmentId === assignment.assignmentId)!;
      auditEventId = await audit(buildAuditEvent({
        action: status === "ACCEPTED" ? "ACCEPT_ASSIGNMENT" : "DECLINE_ASSIGNMENT",
        entityType: "judge_assignment",
        entityId: assignment.assignmentId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        afterState: { status, contactRevealAvailable: reveal },
        reason: input.reason
      }));
    });
    return assessorAssignmentDecisionResponseSchema.parse({
      assignment: responseAssignment!,
      auditEventId
    });
  }

  app.post("/api/v1/assessor/assignments/:assignmentId/accept", async (request) => decideAssignment(request, "ACCEPTED"));
  app.post("/api/v1/assessor/assignments/:assignmentId/decline", async (request) => decideAssignment(request, "DECLINED"));
}
