import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { z } from "zod";
import {
  createMessageThreadRequestSchema,
  exportCommandResponseSchema,
  exportJobsResponseSchema,
  exportRequestSchema,
  jobRunsResponseSchema,
  applicantMessageThreadsResponseSchema,
  applicantMessageCommandResponseSchema,
  messageCommandResponseSchema,
  messageThreadsResponseSchema,
  notificationDispatchStubResponseSchema,
  notificationQueueResponseSchema,
  renewalReminderRunRequestSchema,
  renewalReminderRunResponseSchema
} from "@green-flag/contracts";
import type { ApplicantStore } from "./applicant.js";
import { requireApplicantResourceAccess, requireMutationAllowed, requireOperationalResourceAccess } from "./authorization.js";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile, type SessionResolver } from "./auth.js";
import type { CommunicationsRepository } from "./postgres-domain-stores/communications-repository.js";
import { projectApplicantMessagesForSession } from "./redaction.js";

type NotificationQueueItem = z.infer<typeof notificationQueueResponseSchema>["items"][number];
type NotificationLogEntry = z.infer<typeof notificationQueueResponseSchema>["logs"][number];
type MessageThread = z.infer<typeof messageThreadsResponseSchema>["threads"][number];
type MessageEntry = z.infer<typeof messageThreadsResponseSchema>["messages"][number];
type ApplicantMessageThreadsResponse = z.infer<typeof applicantMessageThreadsResponseSchema>;
type JobRun = z.infer<typeof jobRunsResponseSchema>["items"][number];
type ExportJob = z.infer<typeof exportJobsResponseSchema>["items"][number];

export interface CommunicationsStore {
  notifications: Map<string, NotificationQueueItem>;
  notificationLogs: Map<string, NotificationLogEntry>;
  messageThreads: Map<string, MessageThread>;
  messages: Map<string, MessageEntry>;
  jobRuns: Map<string, JobRun>;
  exports: Map<string, ExportJob>;
  audits: AuditEvent[];
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export function createCommunicationsStore(): CommunicationsStore {
  const store: CommunicationsStore = {
    notifications: new Map(),
    notificationLogs: new Map(),
    messageThreads: new Map(),
    messages: new Map(),
    jobRuns: new Map(),
    exports: new Map(),
    audits: [],
    async withTransaction(work) {
      const snapshot = {
        notifications: structuredClone([...store.notifications.entries()]),
        notificationLogs: structuredClone([...store.notificationLogs.entries()]),
        messageThreads: structuredClone([...store.messageThreads.entries()]),
        messages: structuredClone([...store.messages.entries()]),
        jobRuns: structuredClone([...store.jobRuns.entries()]),
        exports: structuredClone([...store.exports.entries()]),
        audits: structuredClone(store.audits)
      };
      try {
        return await work();
      } catch (error) {
        store.notifications = new Map(snapshot.notifications);
        store.notificationLogs = new Map(snapshot.notificationLogs);
        store.messageThreads = new Map(snapshot.messageThreads);
        store.messages = new Map(snapshot.messages);
        store.jobRuns = new Map(snapshot.jobRuns);
        store.exports = new Map(snapshot.exports);
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
  entityType,
  entityId,
  actor,
  request,
  afterState
}: {
  action: string;
  entityType: string;
  entityId?: string;
  actor: SessionProfile["actor"];
  request: ReturnType<typeof requestMetadata>;
  afterState?: unknown;
}): AuditEvent {
  return {
    id: randomUUID(),
    actor,
    action,
    entityType,
    entityId,
    afterState,
    request,
    createdAt: new Date().toISOString()
  };
}

function requireAdmin(session: SessionProfile) {
  if (!["SUPER_ADMIN", "KBT_ADMIN", "FINANCE_ADMIN"].includes(session.actor.role)) {
    throw new ApiError("forbidden", 403, "Administrative communication access requires an admin role.");
  }
}

function resolveEpisodeOwnership(applicantStore: ApplicantStore, episodeId?: string, parkId?: string) {
  if (parkId) {
    const ownership = applicantStore.parkOwnerships.get(parkId);
    if (!ownership) throw new ApiError("dependency_missing", 404, "Park ownership metadata was not found.");
    return ownership;
  }
  if (!episodeId) return undefined;
  const application = [...applicantStore.applications.values()].find((candidate) => candidate.episodeId === episodeId);
  if (!application) throw new ApiError("dependency_missing", 404, "Episode application was not found.");
  const ownership = applicantStore.parkOwnerships.get(application.parkId);
  if (!ownership) throw new ApiError("dependency_missing", 404, "Park ownership metadata was not found.");
  return ownership;
}

function isMysteryApplicantSuppressed(session: SessionProfile, episodeId?: string) {
  return Boolean(episodeId && session.actor.redactionProfile.includes("mystery"));
}

export function registerCommunicationsRoutes(
  app: FastifyInstance,
  {
    resolveSession,
    communicationsStore,
    applicantStore,
    auditLedger = defaultAuditLedger,
    repository
  }: {
    resolveSession: SessionResolver;
    communicationsStore?: CommunicationsStore;
    applicantStore?: ApplicantStore;
    auditLedger?: AuditLedger;
    repository?: CommunicationsRepository;
  }
) {
  async function audit(event: AuditEvent) {
    if (!communicationsStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    communicationsStore.audits.push(await appendAuditEvent(auditLedger, event));
    return event.id;
  }

  app.get("/api/v1/admin/notifications/queue", async (request) => {
    const session = await resolveSession(request);
    if (repository) return repository.listNotificationQueue({ session });
    if (!communicationsStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    requireAdmin(session);
    return notificationQueueResponseSchema.parse({
      items: [...communicationsStore.notifications.values()],
      logs: [...communicationsStore.notificationLogs.values()]
    });
  });

  app.post("/api/v1/admin/notifications/:notificationId/dispatch-stub", async (request) => {
    const session = await resolveSession(request);
    if (repository) {
      const params = request.params as { notificationId: string };
      return repository.dispatchNotificationStub({ notificationId: params.notificationId, session, request });
    }
    if (!communicationsStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    requireAdmin(session);
    const params = request.params as { notificationId: string };
    const notification = communicationsStore.notifications.get(params.notificationId);
    if (!notification) throw new ApiError("dependency_missing", 404, "Notification was not found.");
    if (notification.status === "SUPPRESSED") throw new ApiError("invalid_state", 409, "Suppressed notifications cannot be dispatched.");
    let log: NotificationLogEntry;
    await communicationsStore.withTransaction(async () => {
      notification.status = "DISPATCH_STUBBED";
      notification.updatedAt = new Date().toISOString();
      log = {
        logId: randomUUID(),
        notificationId: notification.notificationId,
        status: "DISPATCH_STUBBED",
        provider: "adapter_not_configured",
        detail: "Provider dispatch is disabled until deployment configuration is supplied.",
        createdAt: notification.updatedAt
      };
      communicationsStore.notificationLogs.set(log.logId, log);
    });
    return notificationDispatchStubResponseSchema.parse({ notification, log: log! });
  });

  app.get("/api/v1/applicant/messages", async (request) => {
    const session = await resolveSession(request);
    if (repository) return repository.listApplicantMessages({ session });
    if (!communicationsStore || !applicantStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    const visibleThreads = [...communicationsStore.messageThreads.values()].filter((thread) => {
      if (!thread.visibleToApplicant || thread.status !== "OPEN") return false;
      if (thread.parkId) {
        const ownership = applicantStore.parkOwnerships.get(thread.parkId);
        if (!ownership) return false;
        try {
          requireApplicantResourceAccess(session, ownership);
          return true;
        } catch {
          return false;
        }
      }
      return thread.participantActorIds.includes(session.actor.actorId);
    });
    const threadIds = new Set(visibleThreads.map((thread) => thread.threadId));
    return applicantMessageThreadsResponseSchema.parse(projectApplicantMessagesForSession({
      threads: visibleThreads,
      messages: [...communicationsStore.messages.values()].filter((message) => threadIds.has(message.threadId))
    }, session) satisfies ApplicantMessageThreadsResponse);
  });

  async function createThread(request: FastifyRequest, admin: boolean) {
    const session = await resolveSession(request);
    const input = createMessageThreadRequestSchema.parse(request.body);
    requireMutationAllowed(session);
    if (repository) return repository.createThread({ body: input, admin, session, request });
    if (!communicationsStore || !applicantStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    const ownership = resolveEpisodeOwnership(applicantStore, input.episodeId, input.parkId);
    if (admin) {
      requireAdmin(session);
      if (ownership) requireOperationalResourceAccess(session, ownership);
    } else if (ownership) {
      requireApplicantResourceAccess(session, ownership);
    }
    const now = new Date().toISOString();
    const suppressed = !admin && isMysteryApplicantSuppressed(session, input.episodeId);
    const thread: MessageThread = {
      threadId: randomUUID(),
      episodeId: input.episodeId,
      parkId: input.parkId ?? ownership?.parkId,
      subject: suppressed ? "Application query" : input.subject,
      status: suppressed ? "SUPPRESSED" : "OPEN",
      participantActorIds: [session.actor.actorId],
      visibleToApplicant: !suppressed,
      createdAt: now,
      updatedAt: now
    };
    const message: MessageEntry = {
      messageId: randomUUID(),
      threadId: thread.threadId,
      senderActorId: session.actor.actorId,
      body: suppressed ? "Message suppressed by Mystery redaction policy." : input.body,
      createdAt: now
    };
    let auditEventId = "";
    await communicationsStore.withTransaction(async () => {
      communicationsStore.messageThreads.set(thread.threadId, thread);
      communicationsStore.messages.set(message.messageId, message);
      auditEventId = await audit(buildAuditEvent({
        action: admin ? "CREATE_ADMIN_MESSAGE_THREAD" : "CREATE_APPLICANT_MESSAGE_THREAD",
        entityType: "message_thread",
        entityId: thread.threadId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        afterState: { status: thread.status, visibleToApplicant: thread.visibleToApplicant }
      }));
    });
    if (!admin) {
      const projected = projectApplicantMessagesForSession({ threads: [thread], messages: [message] }, session);
      return applicantMessageCommandResponseSchema.parse({
        thread: projected.threads[0],
        message: projected.messages[0],
        auditEventId
      });
    }
    return messageCommandResponseSchema.parse({ thread, message, auditEventId });
  }

  app.post("/api/v1/applicant/messages", async (request) => createThread(request, false));

  app.get("/api/v1/admin/messages", async (request) => {
    const session = await resolveSession(request);
    if (repository) return repository.listAdminMessages({ session });
    if (!communicationsStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    requireAdmin(session);
    if (session.actor.role === "FINANCE_ADMIN") {
      return messageThreadsResponseSchema.parse({ threads: [], messages: [] });
    }
    return messageThreadsResponseSchema.parse({
      threads: [...communicationsStore.messageThreads.values()],
      messages: [...communicationsStore.messages.values()]
    });
  });

  app.post("/api/v1/admin/messages", async (request) => createThread(request, true));

  app.post("/api/v1/admin/jobs/renewal-reminders/run", async (request) => {
    const session = await resolveSession(request);
    const input = renewalReminderRunRequestSchema.parse(request.body);
    requireMutationAllowed(session);
    if (repository) return repository.runRenewalReminders({ body: input, session, request });
    if (!communicationsStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    requireAdmin(session);
    const now = new Date().toISOString();
    let response: z.infer<typeof renewalReminderRunResponseSchema>;
    await communicationsStore.withTransaction(async () => {
      const notification: NotificationQueueItem = {
        notificationId: randomUUID(),
        templateKey: "renewal_reminder",
        channel: "email",
        recipientActorId: session.actor.actorId,
        recipientAddressMarker: "provider_address_deferred",
        status: "QUEUED",
        relatedEntityType: "award_cycle",
        createdAt: now,
        updatedAt: now
      };
      const jobRun: JobRun = {
        jobRunId: randomUUID(),
        jobType: "renewal_reminders",
        status: "COMPLETED",
        startedAt: now,
        completedAt: new Date().toISOString(),
        processedCount: 1,
        detail: `Lower-env renewal reminder queue run for ${input.cycleYear}.`
      };
      communicationsStore.notifications.set(notification.notificationId, notification);
      communicationsStore.jobRuns.set(jobRun.jobRunId, jobRun);
      response = renewalReminderRunResponseSchema.parse({ jobRun, queuedNotifications: [notification] });
    });
    return response!;
  });

  app.get("/api/v1/admin/jobs", async (request) => {
    const session = await resolveSession(request);
    if (repository) return repository.listJobs({ session });
    if (!communicationsStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    requireAdmin(session);
    if (session.actor.role !== "SUPER_ADMIN") {
      return jobRunsResponseSchema.parse({ items: [] });
    }
    return jobRunsResponseSchema.parse({ items: [...communicationsStore.jobRuns.values()] });
  });

  app.post("/api/v1/admin/exports", async (request) => {
    const session = await resolveSession(request);
    const input = exportRequestSchema.parse(request.body);
    requireMutationAllowed(session);
    if (repository) return repository.createExport({ body: input, session, request });
    if (!communicationsStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    requireAdmin(session);
    if (session.actor.role === "FINANCE_ADMIN" && input.exportType !== "payments") {
      throw new ApiError("forbidden", 403, "Finance admins can only create payment exports.");
    }
    const now = new Date().toISOString();
    const exportJob: ExportJob = {
      exportId: randomUUID(),
      exportType: input.exportType,
      format: input.format,
      status: session.actor.redactionProfile.includes("mystery") ? "SUPPRESSED" : "COMPLETED",
      redactionProfile: session.actor.redactionProfile,
      storageProvider: "lower_env_stub",
      storageKey: `lower-env/exports/${randomUUID()}.${input.format}`,
      requestedByActorId: session.actor.actorId,
      createdAt: now,
      completedAt: now
    };
    let auditEventId = "";
    await communicationsStore.withTransaction(async () => {
      communicationsStore.exports.set(exportJob.exportId, exportJob);
      auditEventId = await audit(buildAuditEvent({
        action: "CREATE_EXPORT_JOB",
        entityType: "export_job",
        entityId: exportJob.exportId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        afterState: { exportType: exportJob.exportType, status: exportJob.status, redactionProfile: exportJob.redactionProfile }
      }));
    });
    return exportCommandResponseSchema.parse({ exportJob, auditEventId });
  });

  app.get("/api/v1/admin/exports", async (request) => {
    const session = await resolveSession(request);
    if (repository) return repository.listExports({ session });
    if (!communicationsStore) throw new ApiError("dependency_missing", 500, "Communications store is not configured.");
    requireAdmin(session);
    return exportJobsResponseSchema.parse({ items: [...communicationsStore.exports.values()] });
  });
}
