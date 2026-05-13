import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { SqlClient, UnitOfWork } from "@green-flag/db";
import {
  applicantMessageThreadsResponseSchema,
  applicantMessageCommandResponseSchema,
  exportCommandResponseSchema,
  exportJobSchema,
  exportJobsResponseSchema,
  jobRunsResponseSchema,
  messageCommandResponseSchema,
  messageEntrySchema,
  messageThreadSchema,
  messageThreadsResponseSchema,
  notificationDispatchStubResponseSchema,
  notificationLogEntrySchema,
  notificationQueueItemSchema,
  notificationQueueResponseSchema,
  renewalReminderRunResponseSchema,
} from "@green-flag/contracts";
import {
  hasRoleAssignmentForResource,
  hasSuperAdminGlobalAccess,
  requireMutationAllowed,
  requireOperationalResourceAccess,
  type ResourceOwnership
} from "../authorization.js";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile } from "../auth.js";
import { assertNoApplicantMysteryLeak, projectApplicantMessagesForSession } from "../redaction.js";
import { iso } from "./shared.js";

type CreateThreadInput = {
  episodeId?: string | undefined;
  parkId?: string | undefined;
  subject: string;
  body: string;
  idempotencyKey?: string | undefined;
};

type ExportInput = {
  exportType: "applications" | "payments" | "results" | "public_map_events";
  format: "csv" | "json";
  idempotencyKey?: string | undefined;
};

type RenewalReminderInput = {
  cycleYear: number;
  idempotencyKey?: string | undefined;
};

type EpisodeContext = ResourceOwnership & {
  episodeId?: string | undefined;
  episodeType?: "FULL_ASSESSMENT" | "MYSTERY_SHOP" | undefined;
  mysterySuppressed: boolean;
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
  if (
    !hasSuperAdminGlobalAccess(session) &&
    !session.roleAssignments.some((assignment) =>
      assignment.status === "ACTIVE" && ["KBT_ADMIN", "FINANCE_ADMIN"].includes(assignment.role)
    )
  ) {
    throw new ApiError("forbidden", 403, "Administrative communication access requires an admin role.");
  }
}

function canAdminReadCommunication(session: SessionProfile, ownership: ResourceOwnership) {
  return hasSuperAdminGlobalAccess(session) ||
    hasRoleAssignmentForResource(session, ownership, ["KBT_ADMIN", "ORG_ADMIN"]);
}

function canCreateExportType(session: SessionProfile, exportType: ExportInput["exportType"]) {
  if (hasSuperAdminGlobalAccess(session)) return true;
  if (exportType === "payments") {
    return session.roleAssignments.some((assignment) =>
      assignment.status === "ACTIVE" && ["KBT_ADMIN", "FINANCE_ADMIN"].includes(assignment.role)
    );
  }
  return session.roleAssignments.some((assignment) =>
    assignment.status === "ACTIVE" && assignment.role === "KBT_ADMIN"
  );
}

function shouldSuppressApplicantVisibility(context: EpisodeContext | undefined) {
  return context?.episodeType === "MYSTERY_SHOP" || context?.mysterySuppressed === true;
}

function rowToNotification(row: {
  id: string;
  template_key: string;
  channel: string;
  recipient_actor_id: string | null;
  recipient_address_marker: string;
  status: string;
  suppression_reason: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at_utc: Date | string;
  updated_at_utc: Date | string;
}) {
  return notificationQueueItemSchema.parse({
    notificationId: row.id,
    templateKey: row.template_key,
    channel: row.channel,
    ...(row.recipient_actor_id ? { recipientActorId: row.recipient_actor_id } : {}),
    recipientAddressMarker: row.recipient_address_marker,
    status: row.status,
    ...(row.suppression_reason ? { suppressionReason: row.suppression_reason } : {}),
    ...(row.related_entity_type ? { relatedEntityType: row.related_entity_type } : {}),
    ...(row.related_entity_id ? { relatedEntityId: row.related_entity_id } : {}),
    createdAt: iso(row.created_at_utc),
    updatedAt: iso(row.updated_at_utc)
  });
}

function rowToLog(row: {
  id: string;
  notification_id: string;
  status: string;
  provider: string;
  detail: string;
  created_at_utc: Date | string;
}) {
  return notificationLogEntrySchema.parse({
    logId: row.id,
    notificationId: row.notification_id,
    status: row.status,
    provider: row.provider,
    detail: row.detail,
    createdAt: iso(row.created_at_utc)
  });
}

function rowToThread(row: {
  id: string;
  assessment_episode_id: string | null;
  park_id: string | null;
  subject: string;
  status: string;
  participant_actor_ids: string[];
  visible_to_applicant: boolean;
  created_at_utc: Date | string;
  updated_at_utc: Date | string;
}) {
  return messageThreadSchema.parse({
    threadId: row.id,
    ...(row.assessment_episode_id ? { episodeId: row.assessment_episode_id } : {}),
    ...(row.park_id ? { parkId: row.park_id } : {}),
    subject: row.subject,
    status: row.status,
    participantActorIds: row.participant_actor_ids,
    visibleToApplicant: row.visible_to_applicant,
    createdAt: iso(row.created_at_utc),
    updatedAt: iso(row.updated_at_utc)
  });
}

function rowToMessage(row: {
  id: string;
  thread_id: string;
  sender_actor_id: string;
  body: string;
  created_at_utc: Date | string;
}) {
  return messageEntrySchema.parse({
    messageId: row.id,
    threadId: row.thread_id,
    senderActorId: row.sender_actor_id,
    body: row.body,
    createdAt: iso(row.created_at_utc)
  });
}

function rowToExport(row: {
  id: string;
  export_type: string;
  format: string;
  status: string;
  redaction_profile: string;
  storage_provider: string;
  storage_key: string | null;
  requested_by_actor_id: string;
  created_at_utc: Date | string;
  completed_at_utc: Date | string | null;
}) {
  return exportJobSchema.parse({
    exportId: row.id,
    exportType: row.export_type,
    format: row.format,
    status: row.status,
    redactionProfile: row.redaction_profile,
    storageProvider: row.storage_provider,
    ...(row.storage_key ? { storageKey: row.storage_key } : {}),
    requestedByActorId: row.requested_by_actor_id,
    createdAt: iso(row.created_at_utc),
    ...(row.completed_at_utc ? { completedAt: iso(row.completed_at_utc) } : {})
  });
}

type JobRunRow = {
  id: string;
  job_type: string;
  status: string;
  started_at_utc: Date | string;
  completed_at_utc: Date | string | null;
  processed_count: number;
  detail: string | null;
};

function rowToJobRun(row: JobRunRow) {
  return {
    jobRunId: row.id,
    jobType: row.job_type,
    status: row.status,
    startedAt: iso(row.started_at_utc),
    ...(row.completed_at_utc ? { completedAt: iso(row.completed_at_utc) } : {}),
    processedCount: row.processed_count,
    ...(row.detail ? { detail: row.detail } : {})
  };
}

async function loadJobRunByDedupeKey(client: SqlClient, jobType: string, dedupeKey: string) {
  return (await client.query<JobRunRow>(
    "SELECT * FROM job_runs WHERE job_type = $1 AND dedupe_key = $2 LIMIT 1",
    [jobType, dedupeKey]
  )).rows[0];
}

async function loadExportByDedupeKey(client: SqlClient, dedupeKey: string) {
  return (await client.query<Parameters<typeof rowToExport>[0]>(
    "SELECT * FROM export_jobs WHERE dedupe_key = $1 LIMIT 1",
    [dedupeKey]
  )).rows[0];
}

async function matchingAuditId(client: SqlClient, action: string, entityId: string, idempotencyKey?: string) {
  if (!idempotencyKey) return undefined;
  return (await client.query<{ id: string }>(
    "SELECT id FROM audit_events WHERE action = $1 AND entity_id = $2 AND idempotency_key = $3 ORDER BY created_at_utc DESC LIMIT 1",
    [action, entityId, idempotencyKey]
  )).rows[0]?.id;
}

async function recordFinancePaymentExport(client: SqlClient, input: {
  exportJob: ReturnType<typeof rowToExport>;
  actorId: string;
  auditEventId: string;
}) {
  const invoices = await client.query<{ id: string; subtotal_amount: string | null; tax_amount: string | null; total_amount: string | null; currency: string | null }>(
    "SELECT id, subtotal_amount::text, tax_amount::text, total_amount::text, currency FROM invoices ORDER BY created_at, id"
  );
  const totals = invoices.rows.reduce(
    (summary, invoice) => {
      const currency = invoice.currency ?? "XXX";
      const group = summary.currencyGroups.get(currency) ?? { count: 0, totalCents: 0 };
      const subtotalCents = Math.round(Number(invoice.subtotal_amount ?? 0) * 100);
      const taxCents = Math.round(Number(invoice.tax_amount ?? 0) * 100);
      const totalCents = Math.round(Number(invoice.total_amount ?? 0) * 100);
      group.count += 1;
      group.totalCents += totalCents;
      summary.subtotalCents += subtotalCents;
      summary.taxCents += taxCents;
      summary.totalCents += totalCents;
      summary.currencyGroups.set(currency, group);
      return summary;
    },
    {
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
      currencyGroups: new Map<string, { count: number; totalCents: number }>()
    }
  );
  const currencyGroupTotals = Object.fromEntries(
    [...totals.currencyGroups.entries()].map(([currency, group]) => [
      currency,
      {
        count: group.count,
        totalAmount: (group.totalCents / 100).toFixed(2)
      }
    ])
  );
  await client.query(
    `
      INSERT INTO finance_export_runs (
        id,
        export_job_id,
        export_type,
        export_format,
        status,
        export_scope,
        requested_by_actor_id,
        exported_row_count,
        exported_subtotal_amount,
        exported_tax_amount,
        exported_total_amount,
        currency_group_totals,
        storage_key,
        reconciliation_summary,
        exported_at_utc
      )
      VALUES (
        $1,
        $2,
        'payment_csv',
        $3,
        $4,
        'batch',
        $5,
        $6,
        $7::numeric,
        $8::numeric,
        $9::numeric,
        $10::jsonb,
        $11,
        $12::jsonb,
        now()
      )
    `,
    [
      randomUUID(),
      input.exportJob.exportId,
      input.exportJob.format,
      input.exportJob.status === "COMPLETED" ? "generated" : "requires_review",
      input.actorId,
      invoices.rows.length,
      (totals.subtotalCents / 100).toFixed(2),
      (totals.taxCents / 100).toFixed(2),
      (totals.totalCents / 100).toFixed(2),
      JSON.stringify(currencyGroupTotals),
      input.exportJob.storageKey ?? null,
      JSON.stringify({
        source: "export_jobs",
        exportJobStatus: input.exportJob.status,
        invoiceCount: invoices.rows.length,
        currencyGroupTotals
      })
    ]
  );

  if (input.exportJob.status !== "COMPLETED") return;
  for (const invoice of invoices.rows) {
    await client.query(
      `
        INSERT INTO payment_events (
          id,
          invoice_id,
          event_type,
          event_status,
          amount,
          currency,
          payment_method,
          source,
          actor_id,
          audit_event_id,
          notes
        )
        VALUES ($1, $2, 'exported', 'accepted', $3::numeric, $4, 'none', 'finance_export', $5, $6, $7)
      `,
      [
        randomUUID(),
        invoice.id,
        invoice.total_amount ?? null,
        invoice.currency ?? null,
        input.actorId,
        input.auditEventId,
        `Payment export job ${input.exportJob.exportId}`
      ]
    );
  }
}

async function loadEpisodeContext(client: SqlClient, input: { episodeId?: string | undefined; parkId?: string | undefined }, lock = false): Promise<EpisodeContext | undefined> {
  if (input.episodeId) {
    const row = (await client.query<{
      episode_id: string;
      episode_type: string;
      mystery_suppressed: boolean;
      park_id: string;
      organisation_id: string;
      country_code: string | null;
    }>(
      `
        SELECT ae.id AS episode_id, ae.episode_type, ae.mystery_suppressed,
          ae.park_id, p.organisation_id, ac.country_code
        FROM assessment_episodes ae
        JOIN parks p ON p.id = ae.park_id
        JOIN award_cycles ac ON ac.id = ae.award_cycle_id
        WHERE ae.id = $1
        ${lock ? "FOR UPDATE OF ae" : ""}
      `,
      [input.episodeId]
    )).rows[0];
    if (!row) throw new ApiError("dependency_missing", 404, "Assessment episode was not found.");
    return {
      episodeId: row.episode_id,
      episodeType: row.episode_type as "FULL_ASSESSMENT" | "MYSTERY_SHOP",
      mysterySuppressed: row.mystery_suppressed,
      parkId: row.park_id,
      organisationId: row.organisation_id,
      countryCode: row.country_code ?? "lower-env"
    };
  }

  if (input.parkId) {
    const row = (await client.query<{
      park_id: string;
      organisation_id: string;
      country_code: string | null;
    }>(
      `
        SELECT p.id AS park_id, p.organisation_id, ac.country_code
        FROM parks p
        LEFT JOIN award_cycles ac ON ac.id = (
          SELECT id FROM award_cycles ORDER BY cycle_year DESC LIMIT 1
        )
        WHERE p.id = $1
      `,
      [input.parkId]
    )).rows[0];
    if (!row) throw new ApiError("dependency_missing", 404, "Park ownership metadata was not found.");
    return {
      mysterySuppressed: false,
      parkId: row.park_id,
      organisationId: row.organisation_id,
      countryCode: row.country_code ?? "lower-env"
    };
  }

  return undefined;
}

async function loadRelatedOwnership(
  client: SqlClient,
  entityType: string | undefined,
  entityId: string | undefined
): Promise<ResourceOwnership | undefined> {
  if (!entityType || !entityId) return undefined;
  if (entityType === "assessment_episode") {
    return loadEpisodeContext(client, { episodeId: entityId });
  }
  if (entityType === "park") {
    return loadEpisodeContext(client, { parkId: entityId });
  }
  if (entityType === "message_thread") {
    const row = (await client.query<{ assessment_episode_id: string | null; park_id: string | null }>(
      "SELECT assessment_episode_id, park_id FROM message_threads WHERE id = $1",
      [entityId]
    )).rows[0];
    if (!row) return undefined;
    return loadEpisodeContext(client, {
      episodeId: row.assessment_episode_id ?? undefined,
      parkId: row.park_id ?? undefined
    });
  }
  if (entityType === "application" || entityType === "document") {
    const row = (await client.query<{
      park_id: string;
      organisation_id: string;
      country_code: string | null;
    }>(
      entityType === "application"
        ? `
          SELECT a.park_id, p.organisation_id, ac.country_code
          FROM applications a
          JOIN parks p ON p.id = a.park_id
          JOIN assessment_episodes ae ON ae.id = a.assessment_episode_id
          JOIN award_cycles ac ON ac.id = ae.award_cycle_id
          WHERE a.id = $1
        `
        : `
          SELECT da.park_id, p.organisation_id, ac.country_code
          FROM document_assets da
          JOIN parks p ON p.id = da.park_id
          JOIN assessment_episodes ae ON ae.id = da.assessment_episode_id
          JOIN award_cycles ac ON ac.id = ae.award_cycle_id
          WHERE da.id = $1
        `,
      [entityId]
    )).rows[0];
    if (!row) return undefined;
    return {
      parkId: row.park_id,
      organisationId: row.organisation_id,
      countryCode: row.country_code ?? "lower-env"
    };
  }
  return undefined;
}

export interface CommunicationsRepository {
  listNotificationQueue(input: { session: SessionProfile }): Promise<unknown>;
  dispatchNotificationStub(input: { notificationId: string; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  listApplicantMessages(input: { session: SessionProfile }): Promise<unknown>;
  createThread(input: { body: CreateThreadInput; admin: boolean; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  listAdminMessages(input: { session: SessionProfile }): Promise<unknown>;
  runRenewalReminders(input: { body: RenewalReminderInput; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  listJobs(input: { session: SessionProfile }): Promise<unknown>;
  createExport(input: { body: ExportInput; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  listExports(input: { session: SessionProfile }): Promise<unknown>;
}

export class PostgresCommunicationsRepository implements CommunicationsRepository {
  constructor(
    private readonly client: SqlClient,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditLedger: AuditLedger
  ) {}

  async listNotificationQueue({ session }: Parameters<CommunicationsRepository["listNotificationQueue"]>[0]) {
    requireAdmin(session);
    const items = await this.client.query<Parameters<typeof rowToNotification>[0]>(
      "SELECT * FROM notification_queue ORDER BY created_at_utc DESC, id"
    );
    const visibleRows = [];
    for (const row of items.rows) {
      if (hasSuperAdminGlobalAccess(session)) {
        visibleRows.push(row);
        continue;
      }
      const ownership = await loadRelatedOwnership(
        this.client,
        row.related_entity_type ?? undefined,
        row.related_entity_id ?? undefined
      );
      if (ownership && canAdminReadCommunication(session, ownership)) {
        visibleRows.push(row);
      } else if (!ownership && row.recipient_actor_id === session.actor.actorId) {
        visibleRows.push(row);
      }
    }
    const visibleNotificationIds = visibleRows.map((row) => row.id);
    const logs = visibleNotificationIds.length === 0
      ? { rows: [] as Parameters<typeof rowToLog>[0][] }
      : await this.client.query<Parameters<typeof rowToLog>[0]>(
          "SELECT * FROM notification_logs WHERE notification_id = ANY($1::uuid[]) ORDER BY created_at_utc DESC, id",
          [visibleNotificationIds]
        );
    return notificationQueueResponseSchema.parse({
      items: visibleRows.map(rowToNotification),
      logs: logs.rows.map(rowToLog)
    });
  }

  async dispatchNotificationStub({ notificationId, session, request }: Parameters<CommunicationsRepository["dispatchNotificationStub"]>[0]) {
    requireAdmin(session);
    requireMutationAllowed(session);
    return this.unitOfWork.run(async ({ client }) => {
      const row = (await client.query<Parameters<typeof rowToNotification>[0]>(
        "SELECT * FROM notification_queue WHERE id = $1 FOR UPDATE",
        [notificationId]
      )).rows[0];
      if (!row) throw new ApiError("dependency_missing", 404, "Notification was not found.");
      if (row.status === "SUPPRESSED") throw new ApiError("invalid_state", 409, "Suppressed notifications cannot be dispatched.");

      await client.query(
        "UPDATE notification_queue SET status = 'DISPATCH_STUBBED', updated_at_utc = now() WHERE id = $1 AND status <> 'SUPPRESSED'",
        [notificationId]
      );
      const logId = randomUUID();
      await client.query(
        `
          INSERT INTO notification_logs (id, notification_id, status, provider, detail, created_at_utc)
          VALUES ($1, $2, 'DISPATCH_STUBBED', 'adapter_not_configured', $3, now())
        `,
        [logId, notificationId, "Provider dispatch is disabled until deployment configuration is supplied."]
      );
      const updated = (await client.query<Parameters<typeof rowToNotification>[0]>("SELECT * FROM notification_queue WHERE id = $1", [notificationId])).rows[0]!;
      const log = (await client.query<Parameters<typeof rowToLog>[0]>("SELECT * FROM notification_logs WHERE id = $1", [logId])).rows[0]!;
      const notification = rowToNotification(updated);
      const audit = buildAuditEvent({
        action: "DISPATCH_NOTIFICATION_STUB",
        entityType: "notification_queue",
        entityId: notification.notificationId,
        actor: session.actor,
        request: requestMetadata(request),
        afterState: {
          status: notification.status,
          logId: log.id,
          provider: log.provider
        }
      });
      await appendAuditEvent(this.auditLedger, audit);
      return notificationDispatchStubResponseSchema.parse({ notification, log: rowToLog(log) });
    });
  }

  async listApplicantMessages({ session }: Parameters<CommunicationsRepository["listApplicantMessages"]>[0]) {
    const rows = await this.client.query<Parameters<typeof rowToThread>[0] & {
      organisation_id: string | null;
      country_code: string | null;
      episode_type: string | null;
      mystery_suppressed: boolean | null;
    }>(
      `
        SELECT mt.*, p.organisation_id, ac.country_code, ae.episode_type, ae.mystery_suppressed
        FROM message_threads mt
        LEFT JOIN assessment_episodes ae ON ae.id = mt.assessment_episode_id
        LEFT JOIN parks p ON p.id = COALESCE(mt.park_id, ae.park_id)
        LEFT JOIN award_cycles ac ON ac.id = ae.award_cycle_id
        WHERE mt.visible_to_applicant = true
          AND mt.status = 'OPEN'
        ORDER BY mt.updated_at_utc DESC, mt.id
      `
    );
    const threads = rows.rows.filter((row) => {
      if (row.episode_type === "MYSTERY_SHOP" || row.mystery_suppressed === true) return false;
      if (row.park_id && row.organisation_id) {
        return hasRoleAssignmentForResource(session, {
          parkId: row.park_id,
          organisationId: row.organisation_id,
          countryCode: row.country_code ?? "lower-env"
        }, ["PARK_MANAGER", "ORG_ADMIN", "SUPER_ADMIN"]);
      }
      return row.participant_actor_ids.includes(session.actor.actorId);
    }).map(rowToThread);
    const threadIds = threads.map((thread) => thread.threadId);
    const messages = threadIds.length === 0
      ? []
      : (await this.client.query<Parameters<typeof rowToMessage>[0]>(
          "SELECT * FROM message_entries WHERE thread_id = ANY($1::uuid[]) ORDER BY created_at_utc, id",
          [threadIds]
        )).rows.map(rowToMessage);
    const response = applicantMessageThreadsResponseSchema.parse(projectApplicantMessagesForSession({ threads, messages }, session));
    assertNoApplicantMysteryLeak(response, session);
    return response;
  }

  async createThread({ body, admin, session, request }: Parameters<CommunicationsRepository["createThread"]>[0]) {
    requireMutationAllowed(session);
    return this.unitOfWork.run(async ({ client }) => {
      const context = await loadEpisodeContext(client, { episodeId: body.episodeId, parkId: body.parkId }, true);
      if (admin) {
        requireAdmin(session);
        if (context) requireOperationalResourceAccess(session, context);
      } else if (context) {
        if (!hasRoleAssignmentForResource(session, context, ["PARK_MANAGER", "ORG_ADMIN", "SUPER_ADMIN"])) {
          throw new ApiError("forbidden", 403, "Actor is not allowed to access this communication resource.");
        }
      }

      const suppressApplicant = shouldSuppressApplicantVisibility(context);
      const now = new Date().toISOString();
      const threadId = randomUUID();
      const messageId = randomUUID();
      const threadSubject = suppressApplicant ? "Application query" : body.subject;
      const messageBody = suppressApplicant ? "Message suppressed by Mystery redaction policy." : body.body;
      await client.query(
        `
          INSERT INTO message_threads (
            id, assessment_episode_id, park_id, subject, status, participant_actor_ids,
            visible_to_applicant, created_at_utc, updated_at_utc, version
          )
          VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7, $8::timestamptz, $8::timestamptz, 0)
        `,
        [
          threadId,
          body.episodeId ?? null,
          body.parkId ?? context?.parkId ?? null,
          threadSubject,
          suppressApplicant ? "SUPPRESSED" : "OPEN",
          [session.actor.actorId],
          !suppressApplicant,
          now
        ]
      );
      await client.query(
        "INSERT INTO message_entries (id, thread_id, sender_actor_id, body, created_at_utc) VALUES ($1, $2, $3, $4, $5::timestamptz)",
        [messageId, threadId, session.actor.actorId, messageBody, now]
      );
      if (suppressApplicant) {
        await client.query(
          `
            INSERT INTO notification_suppressions (id, reason, actor_id, related_entity_type, related_entity_id, created_at_utc)
            VALUES ($1, 'mystery_redaction', $2, 'message_thread', $3, $4::timestamptz)
          `,
          [randomUUID(), session.actor.actorId, threadId, now]
        );
      }
      const thread = rowToThread((await client.query<Parameters<typeof rowToThread>[0]>("SELECT * FROM message_threads WHERE id = $1", [threadId])).rows[0]!);
      const message = rowToMessage((await client.query<Parameters<typeof rowToMessage>[0]>("SELECT * FROM message_entries WHERE id = $1", [messageId])).rows[0]!);
      const audit = buildAuditEvent({
        action: admin ? "CREATE_ADMIN_MESSAGE_THREAD" : "CREATE_APPLICANT_MESSAGE_THREAD",
        entityType: "message_thread",
        entityId: thread.threadId,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        afterState: { status: thread.status, visibleToApplicant: thread.visibleToApplicant }
      });
      await appendAuditEvent(this.auditLedger, audit);
      if (!admin) {
        const projected = projectApplicantMessagesForSession({ threads: [thread], messages: [message] }, session);
        return applicantMessageCommandResponseSchema.parse({
          thread: projected.threads[0],
          message: projected.messages[0],
          auditEventId: audit.id
        });
      }
      return messageCommandResponseSchema.parse({ thread, message, auditEventId: audit.id });
    });
  }

  async listAdminMessages({ session }: Parameters<CommunicationsRepository["listAdminMessages"]>[0]) {
    requireAdmin(session);
    const rows = (await this.client.query<Parameters<typeof rowToThread>[0] & {
      organisation_id: string | null;
      country_code: string | null;
      episode_park_id: string | null;
    }>(
      `
        SELECT mt.*, p.organisation_id, ac.country_code, ae.park_id AS episode_park_id
        FROM message_threads mt
        LEFT JOIN assessment_episodes ae ON ae.id = mt.assessment_episode_id
        LEFT JOIN parks p ON p.id = COALESCE(mt.park_id, ae.park_id)
        LEFT JOIN award_cycles ac ON ac.id = ae.award_cycle_id
        ORDER BY mt.updated_at_utc DESC, mt.id
      `
    )).rows;
    const threads = [];
    for (const row of rows) {
      const raw = row as Parameters<typeof rowToThread>[0] & {
        organisation_id?: string | null;
        country_code?: string | null;
        episode_park_id?: string | null;
      };
      if (hasSuperAdminGlobalAccess(session)) {
        threads.push(rowToThread(raw));
        continue;
      }
      const parkId = raw.park_id ?? raw.episode_park_id;
      if (parkId && raw.organisation_id) {
        const ownership = {
          parkId,
          organisationId: raw.organisation_id,
          countryCode: raw.country_code ?? "lower-env"
        };
        if (canAdminReadCommunication(session, ownership)) threads.push(rowToThread(raw));
      } else if (raw.participant_actor_ids.includes(session.actor.actorId)) {
        threads.push(rowToThread(raw));
      }
    }
    const threadIds = threads.map((thread) => thread.threadId);
    const messages = (await this.client.query<Parameters<typeof rowToMessage>[0]>(
      threadIds.length === 0
        ? "SELECT * FROM message_entries WHERE false"
        : "SELECT * FROM message_entries WHERE thread_id = ANY($1::uuid[]) ORDER BY created_at_utc, id",
      threadIds.length === 0 ? [] : [threadIds]
    )).rows.map(rowToMessage);
    return messageThreadsResponseSchema.parse({ threads, messages });
  }

  async runRenewalReminders({ body, session, request }: Parameters<CommunicationsRepository["runRenewalReminders"]>[0]) {
    requireAdmin(session);
    requireMutationAllowed(session);
    if (!hasSuperAdminGlobalAccess(session) && !session.roleAssignments.some((assignment) => assignment.status === "ACTIVE" && assignment.role === "KBT_ADMIN")) {
      throw new ApiError("forbidden", 403, "Renewal reminder jobs require operational admin scope.");
    }
    return this.unitOfWork.run(async ({ client }) => {
      const now = new Date().toISOString();
      const runDate = now.slice(0, 10);
      const jobDedupeKey = body.idempotencyKey
        ? `renewal_reminders:job:idempotency:${body.idempotencyKey}`
        : `renewal_reminders:job:template=renewal_reminder:cycle=${body.cycleYear}:run_date=${runDate}`;
      const notificationDedupeKey = body.idempotencyKey
        ? `renewal_reminders:notification:idempotency:${body.idempotencyKey}`
        : null;
      const notificationId = randomUUID();
      const jobRunId = randomUUID();
      const insertedJob = await client.query<{ id: string }>(
        `
          INSERT INTO job_runs (id, job_type, status, started_at_utc, completed_at_utc, processed_count, detail, dedupe_key)
          VALUES ($1, 'renewal_reminders', 'COMPLETED', $2::timestamptz, now(), 1, $3, $4)
          ON CONFLICT (job_type, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
          RETURNING id
        `,
        [jobRunId, now, `Lower-env renewal reminder queue run for ${body.cycleYear}.`, jobDedupeKey]
      );
      if (!insertedJob.rows[0]) {
        const existingJob = await loadJobRunByDedupeKey(client, "renewal_reminders", jobDedupeKey);
        if (!existingJob) throw new Error("Renewal reminder replay job was not readable.");
        const notificationRows = notificationDedupeKey
          ? await client.query<Parameters<typeof rowToNotification>[0]>(
              "SELECT * FROM notification_queue WHERE dedupe_key = $1 ORDER BY created_at_utc, id",
              [notificationDedupeKey]
            )
          : { rows: [] as Parameters<typeof rowToNotification>[0][] };
        return renewalReminderRunResponseSchema.parse({
          jobRun: rowToJobRun(existingJob),
          queuedNotifications: notificationRows.rows.map(rowToNotification)
        });
      }
      await client.query(
        `
          INSERT INTO notification_queue (
            id, template_key, channel, recipient_actor_id, recipient_address_marker,
            status, related_entity_type, dedupe_key, created_at_utc, updated_at_utc
          )
          VALUES ($1, 'renewal_reminder', 'email', $2, 'provider_address_deferred', 'QUEUED', 'award_cycle', $3, $4::timestamptz, $4::timestamptz)
          ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
        `,
        [notificationId, session.actor.actorId, notificationDedupeKey, now]
      );
      const notification = rowToNotification((await client.query<Parameters<typeof rowToNotification>[0]>(
        notificationDedupeKey
          ? "SELECT * FROM notification_queue WHERE dedupe_key = $1 ORDER BY created_at_utc, id LIMIT 1"
          : "SELECT * FROM notification_queue WHERE id = $1",
        [notificationDedupeKey ?? notificationId]
      )).rows[0]!);
      const jobRun = (await client.query<JobRunRow>("SELECT * FROM job_runs WHERE id = $1", [jobRunId])).rows[0]!;
      const audit = buildAuditEvent({
        action: "RUN_RENEWAL_REMINDERS",
        entityType: "job_run",
        entityId: jobRun.id,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        afterState: {
          jobType: jobRun.job_type,
          status: jobRun.status,
          processedCount: jobRun.processed_count,
          queuedNotificationIds: [notification.notificationId],
          cycleYear: body.cycleYear
        }
      });
      await appendAuditEvent(this.auditLedger, audit);
      return renewalReminderRunResponseSchema.parse({
        jobRun: rowToJobRun(jobRun),
        queuedNotifications: [notification]
      });
    });
  }

  async listJobs({ session }: Parameters<CommunicationsRepository["listJobs"]>[0]) {
    requireAdmin(session);
    if (!hasSuperAdminGlobalAccess(session)) {
      return jobRunsResponseSchema.parse({ items: [] });
    }
    const rows = await this.client.query<{
      id: string;
      job_type: string;
      status: string;
      started_at_utc: Date | string;
      completed_at_utc: Date | string | null;
      processed_count: number;
      detail: string | null;
    }>("SELECT * FROM job_runs ORDER BY started_at_utc DESC, id");
    return jobRunsResponseSchema.parse({
      items: rows.rows.map((row) => ({
        jobRunId: row.id,
        jobType: row.job_type,
        status: row.status,
        startedAt: iso(row.started_at_utc),
        ...(row.completed_at_utc ? { completedAt: iso(row.completed_at_utc) } : {}),
        processedCount: row.processed_count,
        ...(row.detail ? { detail: row.detail } : {})
      }))
    });
  }

  async createExport({ body, session, request }: Parameters<CommunicationsRepository["createExport"]>[0]) {
    requireAdmin(session);
    requireMutationAllowed(session);
    if (!canCreateExportType(session, body.exportType)) {
      throw new ApiError("forbidden", 403, "Export type is not allowed for this role assignment.");
    }
    return this.unitOfWork.run(async ({ client }) => {
      const now = new Date().toISOString();
      const exportId = randomUUID();
      const dedupeKey = body.idempotencyKey
        ? `export:${session.actor.actorId}:${body.exportType}:${body.format}:${body.idempotencyKey}`
        : null;
      if (dedupeKey) {
        const existing = await loadExportByDedupeKey(client, dedupeKey);
        if (existing) {
          const exportJob = rowToExport(existing);
          return exportCommandResponseSchema.parse({
            exportJob,
            auditEventId: await matchingAuditId(client, "CREATE_EXPORT_JOB", exportJob.exportId, body.idempotencyKey) ?? randomUUID()
          });
        }
      }
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO export_jobs (
            id, export_type, format, status, redaction_profile, storage_provider,
            storage_key, requested_by_actor_id, dedupe_key, created_at_utc, completed_at_utc
          )
          VALUES ($1, $2, $3, $4, $5, 'lower_env_stub', $6, $7, $8, $9::timestamptz, $9::timestamptz)
          ON CONFLICT (requested_by_actor_id, export_type, format, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
          RETURNING id
        `,
        [
          exportId,
          body.exportType,
          body.format,
          session.actor.redactionProfile.includes("mystery") ? "SUPPRESSED" : "COMPLETED",
          session.actor.redactionProfile,
          `lower-env/exports/${randomUUID()}.${body.format}`,
          session.actor.actorId,
          dedupeKey,
          now
        ]
      );
      const createdRow = inserted.rows[0]
        ? (await client.query<Parameters<typeof rowToExport>[0]>("SELECT * FROM export_jobs WHERE id = $1", [exportId])).rows[0]
        : dedupeKey
          ? await loadExportByDedupeKey(client, dedupeKey)
          : undefined;
      if (!createdRow) throw new Error("Export job was not readable after creation or replay.");
      const created = rowToExport(createdRow);
      if (!inserted.rows[0]) {
        return exportCommandResponseSchema.parse({
          exportJob: created,
          auditEventId: await matchingAuditId(client, "CREATE_EXPORT_JOB", created.exportId, body.idempotencyKey) ?? randomUUID()
        });
      }
      const audit = buildAuditEvent({
        action: "CREATE_EXPORT_JOB",
        entityType: "export_job",
        entityId: exportId,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        afterState: created
      });
      await appendAuditEvent(this.auditLedger, audit);
      if (created.exportType === "payments") {
        await recordFinancePaymentExport(client, {
          exportJob: created,
          actorId: session.actor.actorId,
          auditEventId: audit.id
        });
      }
      return exportCommandResponseSchema.parse({ exportJob: created, auditEventId: audit.id });
    });
  }

  async listExports({ session }: Parameters<CommunicationsRepository["listExports"]>[0]) {
    requireAdmin(session);
    const rows = await this.client.query<Parameters<typeof rowToExport>[0]>("SELECT * FROM export_jobs ORDER BY created_at_utc DESC, id");
    const visibleRows = rows.rows.filter((row) => {
      if (hasSuperAdminGlobalAccess(session)) return true;
      if (row.requested_by_actor_id !== session.actor.actorId) return false;
      if (row.export_type === "payments") {
        return session.roleAssignments.some((assignment) =>
          assignment.status === "ACTIVE" && ["KBT_ADMIN", "FINANCE_ADMIN"].includes(assignment.role)
        );
      }
      return session.roleAssignments.some((assignment) => assignment.status === "ACTIVE" && assignment.role === "KBT_ADMIN");
    });
    return exportJobsResponseSchema.parse({
      items: visibleRows.map(rowToExport)
    });
  }
}
