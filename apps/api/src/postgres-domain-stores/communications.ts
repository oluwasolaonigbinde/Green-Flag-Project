
import type { SqlClient } from "@green-flag/db";
import {
  exportJobSchema,
  jobRunSchema,
  messageEntrySchema,
  messageThreadSchema,
  notificationLogEntrySchema,
  notificationQueueItemSchema
} from "@green-flag/contracts";
import { createCommunicationsStore, type CommunicationsStore } from "../communications.js";
import { iso } from "./shared.js";

export async function hydrateCommunicationsStore(client: SqlClient) {
  const store = createCommunicationsStore();
  const notifications = await client.query<{
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
  }>("SELECT * FROM notification_queue");
  for (const row of notifications.rows) {
    store.notifications.set(row.id, notificationQueueItemSchema.parse({
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
    }));
  }
  const logs = await client.query<{
    id: string;
    notification_id: string;
    status: string;
    provider: string;
    detail: string;
    created_at_utc: Date | string;
  }>("SELECT * FROM notification_logs");
  for (const row of logs.rows) {
    store.notificationLogs.set(row.id, notificationLogEntrySchema.parse({
      logId: row.id,
      notificationId: row.notification_id,
      status: row.status,
      provider: row.provider,
      detail: row.detail,
      createdAt: iso(row.created_at_utc)
    }));
  }
  const threads = await client.query<{
    id: string;
    assessment_episode_id: string | null;
    park_id: string | null;
    subject: string;
    status: string;
    participant_actor_ids: string[];
    visible_to_applicant: boolean;
    created_at_utc: Date | string;
    updated_at_utc: Date | string;
  }>("SELECT * FROM message_threads");
  for (const row of threads.rows) {
    store.messageThreads.set(row.id, messageThreadSchema.parse({
      threadId: row.id,
      ...(row.assessment_episode_id ? { episodeId: row.assessment_episode_id } : {}),
      ...(row.park_id ? { parkId: row.park_id } : {}),
      subject: row.subject,
      status: row.status,
      participantActorIds: row.participant_actor_ids,
      visibleToApplicant: row.visible_to_applicant,
      createdAt: iso(row.created_at_utc),
      updatedAt: iso(row.updated_at_utc)
    }));
  }
  const messages = await client.query<{
    id: string;
    thread_id: string;
    sender_actor_id: string;
    body: string;
    created_at_utc: Date | string;
  }>("SELECT * FROM message_entries");
  for (const row of messages.rows) {
    store.messages.set(row.id, messageEntrySchema.parse({
      messageId: row.id,
      threadId: row.thread_id,
      senderActorId: row.sender_actor_id,
      body: row.body,
      createdAt: iso(row.created_at_utc)
    }));
  }
  const jobs = await client.query<{
    id: string;
    job_type: string;
    status: string;
    processed_count: number;
    detail: string | null;
    started_at_utc: Date | string;
    completed_at_utc: Date | string | null;
  }>("SELECT * FROM job_runs");
  for (const row of jobs.rows) {
    store.jobRuns.set(row.id, jobRunSchema.parse({
      jobRunId: row.id,
      jobType: row.job_type,
      status: row.status,
      startedAt: iso(row.started_at_utc),
      ...(row.completed_at_utc ? { completedAt: iso(row.completed_at_utc) } : {}),
      processedCount: row.processed_count,
      ...(row.detail ? { detail: row.detail } : {})
    }));
  }
  const exports = await client.query<{
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
  }>("SELECT * FROM export_jobs");
  for (const row of exports.rows) {
    store.exports.set(row.id, exportJobSchema.parse({
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
    }));
  }
  return store;
}

export async function flushCommunicationsStore(client: SqlClient, store: CommunicationsStore) {
  for (const [id, notification] of store.notifications) {
    await client.query(
      `
        INSERT INTO notification_queue (
          id, template_key, channel, recipient_actor_id, recipient_address_marker,
          status, suppression_reason, related_entity_type, related_entity_id,
          created_at_utc, updated_at_utc
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          suppression_reason = EXCLUDED.suppression_reason,
          updated_at_utc = EXCLUDED.updated_at_utc
      `,
      [
        id,
        notification.templateKey,
        notification.channel,
        notification.recipientActorId ?? null,
        notification.recipientAddressMarker,
        notification.status,
        notification.suppressionReason ?? null,
        notification.relatedEntityType ?? null,
        notification.relatedEntityId ?? null,
        notification.createdAt,
        notification.updatedAt
      ]
    );
  }
  for (const [id, log] of store.notificationLogs) {
    await client.query(
      `
        INSERT INTO notification_logs (id, notification_id, status, provider, detail, created_at_utc)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        ON CONFLICT (id) DO NOTHING
      `,
      [id, log.notificationId, log.status, log.provider, log.detail, log.createdAt]
    );
  }
  for (const [id, thread] of store.messageThreads) {
    await client.query(
      `
        INSERT INTO message_threads (
          id, assessment_episode_id, park_id, subject, status, participant_actor_ids,
          visible_to_applicant, created_at_utc, updated_at_utc
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)
        ON CONFLICT (id) DO UPDATE SET
          subject = EXCLUDED.subject,
          status = EXCLUDED.status,
          participant_actor_ids = EXCLUDED.participant_actor_ids,
          visible_to_applicant = EXCLUDED.visible_to_applicant,
          updated_at_utc = EXCLUDED.updated_at_utc
      `,
      [
        id,
        thread.episodeId ?? null,
        thread.parkId ?? null,
        thread.subject,
        thread.status,
        thread.participantActorIds,
        thread.visibleToApplicant,
        thread.createdAt,
        thread.updatedAt
      ]
    );
  }
  for (const [id, message] of store.messages) {
    await client.query(
      `
        INSERT INTO message_entries (id, thread_id, sender_actor_id, body, created_at_utc)
        VALUES ($1, $2, $3, $4, $5::timestamptz)
        ON CONFLICT (id) DO NOTHING
      `,
      [id, message.threadId, message.senderActorId, message.body, message.createdAt]
    );
  }
  for (const [id, jobRun] of store.jobRuns) {
    await client.query(
      `
        INSERT INTO job_runs (id, job_type, status, processed_count, detail, started_at_utc, completed_at_utc)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          processed_count = EXCLUDED.processed_count,
          detail = EXCLUDED.detail,
          completed_at_utc = EXCLUDED.completed_at_utc
      `,
      [id, jobRun.jobType, jobRun.status, jobRun.processedCount, jobRun.detail ?? null, jobRun.startedAt, jobRun.completedAt ?? null]
    );
  }
  for (const [id, exportJob] of store.exports) {
    await client.query(
      `
        INSERT INTO export_jobs (
          id, export_type, format, status, redaction_profile, storage_provider,
          storage_key, requested_by_actor_id, created_at_utc, completed_at_utc
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          storage_key = EXCLUDED.storage_key,
          completed_at_utc = EXCLUDED.completed_at_utc
      `,
      [
        id,
        exportJob.exportType,
        exportJob.format,
        exportJob.status,
        exportJob.redactionProfile,
        exportJob.storageProvider,
        exportJob.storageKey ?? null,
        exportJob.requestedByActorId,
        exportJob.createdAt,
        exportJob.completedAt ?? null
      ]
    );
  }
}
