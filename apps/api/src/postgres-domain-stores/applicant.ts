
import { randomUUID } from "node:crypto";
import type { SqlClient } from "@green-flag/db";
import {
  applicationDraftFixture,
  applicationDraftResponseSchema,
  documentAssetSchema,
  documentUploadSessionSchema,
  invoiceSummaryResponseSchema,
  paymentSummaryResponseSchema
} from "@green-flag/contracts";
import { createApplicantStore, type ApplicantStore } from "../applicant.js";
import { chunkProgress, iso, safeDisplayStatus } from "./shared.js";
import { flushAdminOverrideEvents } from "./overrides.js";

export async function hydrateApplicantStore(client: SqlClient) {
  const store = createApplicantStore();
  store.applications.clear();
  store.previousFeedbackResponses.clear();
  store.documents.clear();
  store.uploadSessions.clear();
  store.invoices.clear();
  store.payments.clear();
  store.episodeStatuses.clear();
  store.overrideEvents = [];

  const ownershipRows = await client.query<{
    park_id: string;
    organisation_id: string;
    country_code: string | null;
  }>(`
    SELECT p.id AS park_id, p.organisation_id, cycle.country_code
    FROM parks p
    LEFT JOIN LATERAL (
      SELECT ac.country_code
      FROM assessment_episodes ae
      JOIN award_cycles ac ON ac.id = ae.award_cycle_id
      WHERE ae.park_id = p.id
      ORDER BY ac.cycle_year DESC
      LIMIT 1
    ) cycle ON true
  `);
  for (const row of ownershipRows.rows) {
    store.parkOwnerships.set(row.park_id, {
      parkId: row.park_id,
      organisationId: row.organisation_id,
      countryCode: row.country_code ?? "lower-env"
    });
  }

  const applicationRows = await client.query<{
    id: string;
    assessment_episode_id: string;
    park_id: string;
    status: string;
    completion_percent: number;
    version: number;
    updated_at_utc: Date | string;
    episode_status: string;
  }>(`
    SELECT a.id, a.assessment_episode_id, a.park_id, a.status, a.completion_percent,
      a.version, a.updated_at_utc, ae.status AS episode_status
    FROM applications a
    JOIN assessment_episodes ae ON ae.id = a.assessment_episode_id
  `);
  for (const row of applicationRows.rows) {
    const sections = await client.query<{
      section_key: string;
      status: string;
      completion_percent: number;
      version: number;
      updated_at_utc: Date | string;
    }>(
      "SELECT section_key, status, completion_percent, version, updated_at_utc FROM application_sections WHERE application_id = $1 ORDER BY section_key",
      [row.id]
    );
    const fields = await client.query<{
      section_key: string;
      field_key: string;
      field_value: unknown;
      version: number;
      updated_at_utc: Date | string;
    }>("SELECT section_key, field_key, field_value, version, updated_at_utc FROM application_field_values WHERE application_id = $1", [row.id]);
    const fieldMap = new Map<string, Record<string, unknown>>();
    for (const field of fields.rows) {
      const sectionFields = fieldMap.get(field.section_key) ?? {};
      sectionFields[field.field_key] = field.field_value;
      fieldMap.set(field.section_key, sectionFields);
    }
    const sectionRecords = sections.rows.map((section) => ({
      sectionKey: section.section_key,
      status: section.status,
      completionPercent: section.completion_percent,
      version: section.version,
      fields: fieldMap.get(section.section_key) ?? {},
      updatedAt: iso(section.updated_at_utc)
    }));
    const application = applicationDraftResponseSchema.parse({
      applicationId: row.id,
      episodeId: row.assessment_episode_id,
      parkId: row.park_id,
      status: row.status,
      displayStatus: safeDisplayStatus(row.status),
      completionPercent: row.completion_percent,
      version: row.version,
      sections: sectionRecords,
      allowedActions: applicationDraftFixture.allowedActions,
      updatedAt: iso(row.updated_at_utc)
    });
    store.applications.set(row.id, application);
    store.episodeStatuses.set(row.assessment_episode_id, row.episode_status as ApplicantStore["episodeStatuses"] extends Map<string, infer S> ? S : never);
  }

  const feedbackRows = await client.query<{
    application_id: string;
    response_text: string;
    version: number;
    updated_at_utc: Date | string;
  }>("SELECT application_id, response_text, version, updated_at_utc FROM application_feedback_responses");
  for (const row of feedbackRows.rows) {
    store.previousFeedbackResponses.set(row.application_id, {
      applicationId: row.application_id,
      responseText: row.response_text,
      version: row.version,
      updatedAt: iso(row.updated_at_utc)
    });
  }

  const documentRows = await client.query<{
    id: string;
    application_id: string;
    assessment_episode_id: string;
    park_id: string;
    document_type: string;
    filename: string;
    content_type: string;
    byte_size: number;
    sha256: string;
    storage_provider: string;
    storage_key: string;
    status: string;
    visibility: string;
    version: number;
    is_current: boolean;
    replaces_document_id: string | null;
    replaced_by_document_id: string | null;
    uploaded_by_actor_id: string;
    scan_status: string;
    created_at: Date | string;
    updated_at: Date | string;
  }>("SELECT * FROM document_assets");
  for (const row of documentRows.rows) {
    store.documents.set(row.id, documentAssetSchema.parse({
      documentId: row.id,
      applicationId: row.application_id,
      episodeId: row.assessment_episode_id,
      parkId: row.park_id,
      documentType: row.document_type,
      filename: row.filename,
      contentType: row.content_type,
      byteSize: row.byte_size,
      sha256: row.sha256,
      storageProvider: row.storage_provider,
      storageKey: row.storage_key,
      status: row.status,
      visibility: row.visibility,
      version: row.version,
      isCurrent: row.is_current,
      ...(row.replaces_document_id ? { replacesDocumentId: row.replaces_document_id } : {}),
      ...(row.replaced_by_document_id ? { replacedByDocumentId: row.replaced_by_document_id } : {}),
      uploadedByActorId: row.uploaded_by_actor_id,
      scanStatus: row.scan_status,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at)
    }));
  }

  const uploadRows = await client.query<{
    id: string;
    application_id: string;
    document_type: string;
    filename: string;
    content_type: string;
    byte_size: number;
    sha256: string;
    total_chunks: number;
    status: string;
    expires_at: Date | string;
    version: number;
  }>("SELECT * FROM document_upload_sessions");
  for (const row of uploadRows.rows) {
    const chunks = await client.query<{ chunk_index: number }>(
      "SELECT chunk_index FROM document_upload_chunks WHERE upload_session_id = $1 ORDER BY chunk_index",
      [row.id]
    );
    const acceptedChunks = chunks.rows.map((chunk) => chunk.chunk_index);
    store.uploadSessions.set(row.id, documentUploadSessionSchema.parse({
      sessionId: row.id,
      applicationId: row.application_id,
      documentType: row.document_type,
      filename: row.filename,
      contentType: row.content_type,
      byteSize: row.byte_size,
      sha256: row.sha256,
      totalChunks: row.total_chunks,
      acceptedChunks,
      status: row.status,
      progressPercent: chunkProgress(acceptedChunks, row.total_chunks),
      uploadUrlTemplate: `https://lower-env-storage.invalid/upload/${row.application_id}/${row.document_type}/{chunkIndex}`,
      expiresAt: iso(row.expires_at),
      version: row.version
    }));
  }

  const invoiceRows = await client.query<{
    id: string;
    application_id: string;
    assessment_episode_id: string;
    status: string;
    amount_marker: string;
    due_at: Date | string;
    available_in_portal: boolean;
  }>("SELECT id, application_id, assessment_episode_id, status, amount_marker, due_at, available_in_portal FROM invoices");
  const invoicesById = new Map<string, ReturnType<typeof invoiceSummaryResponseSchema.parse>>();
  for (const row of invoiceRows.rows) {
    const intents = await client.query<{ intent_type: string }>(
      "SELECT intent_type FROM payment_notification_intents WHERE invoice_id = $1 ORDER BY created_at",
      [row.id]
    );
    const invoice = invoiceSummaryResponseSchema.parse({
      invoiceId: row.id,
      applicationId: row.application_id,
      episodeId: row.assessment_episode_id,
      status: row.status,
      amount: row.amount_marker,
      dueAt: iso(row.due_at),
      availableInPortal: row.available_in_portal,
      notificationIntents: intents.rows.map((intent) => intent.intent_type)
    });
    invoicesById.set(row.id, invoice);
    store.invoices.set(row.id, invoice);
  }
  const paymentRows = await client.query<{
    invoice_id: string;
    purchase_order_number: string | null;
    no_purchase_order_declared: boolean;
    manually_marked_paid: boolean;
    override_applied: boolean;
    blocked_for_allocation: boolean;
    updated_at: Date | string;
  }>("SELECT invoice_id, purchase_order_number, no_purchase_order_declared, manually_marked_paid, override_applied, blocked_for_allocation, updated_at FROM payment_states");
  for (const row of paymentRows.rows) {
    const invoice = invoicesById.get(row.invoice_id);
    if (!invoice) continue;
    const payment = paymentSummaryResponseSchema.parse({
      applicationId: invoice.applicationId,
      invoice,
      purchaseOrder: {
        ...(row.purchase_order_number ? { purchaseOrderNumber: row.purchase_order_number } : {}),
        noPurchaseOrderDeclared: row.no_purchase_order_declared
      },
      manuallyMarkedPaid: row.manually_marked_paid,
      overrideApplied: row.override_applied,
      blockedForAllocation: row.blocked_for_allocation,
      updatedAt: iso(row.updated_at)
    });
    store.payments.set(row.invoice_id, payment);
    if (invoice.status === "OVERDUE_BLOCKED" || row.blocked_for_allocation) {
      store.episodeStatuses.set(invoice.episodeId, "PAYMENT_OVERDUE_BLOCKED");
    } else if (invoice.status === "PENDING") {
      store.episodeStatuses.set(invoice.episodeId, "PAYMENT_PENDING");
    } else {
      store.episodeStatuses.set(invoice.episodeId, "READY_FOR_ALLOCATION");
    }
  }

  return store;
}

export async function flushApplicantStore(client: SqlClient, store: ApplicantStore) {
  for (const [episodeId, status] of store.episodeStatuses) {
    await client.query(
      "UPDATE assessment_episodes SET status = $2, updated_at_utc = now() WHERE id = $1",
      [episodeId, status]
    );
  }

  for (const [id, application] of store.applications) {
    await client.query(
      `
        INSERT INTO applications (id, assessment_episode_id, park_id, owner_internal_user_id, status, completion_percent, version)
        VALUES ($1, $2, $3, NULL, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          completion_percent = EXCLUDED.completion_percent,
          version = EXCLUDED.version,
          updated_at_utc = now()
      `,
      [id, application.episodeId, application.parkId, application.status, application.completionPercent, application.version]
    );

    for (const section of application.sections) {
      await client.query(
        `
          INSERT INTO application_sections (id, application_id, section_key, status, completion_percent, version, updated_at_utc)
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
          ON CONFLICT (application_id, section_key) DO UPDATE SET
            status = EXCLUDED.status,
            completion_percent = EXCLUDED.completion_percent,
            version = EXCLUDED.version,
            updated_at_utc = EXCLUDED.updated_at_utc
        `,
        [
          randomUUID(),
          application.applicationId,
          section.sectionKey,
          section.status,
          section.completionPercent,
          section.version,
          section.updatedAt ?? application.updatedAt
        ]
      );
      await client.query("DELETE FROM application_field_values WHERE application_id = $1 AND section_key = $2", [
        application.applicationId,
        section.sectionKey
      ]);
      for (const [fieldKey, fieldValue] of Object.entries(section.fields)) {
        await client.query(
          `
            INSERT INTO application_field_values (id, application_id, section_key, field_key, field_value, version, updated_at_utc)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz)
          `,
          [
            randomUUID(),
            application.applicationId,
            section.sectionKey,
            fieldKey,
            JSON.stringify(fieldValue),
            section.version,
            section.updatedAt ?? application.updatedAt
          ]
        );
      }
    }
  }

  for (const [applicationId, response] of store.previousFeedbackResponses) {
    await client.query(
      `
        INSERT INTO application_feedback_responses (id, application_id, response_text, version, updated_at_utc)
        VALUES ($1, $2, $3, $4, $5::timestamptz)
        ON CONFLICT (application_id) DO UPDATE SET
          response_text = EXCLUDED.response_text,
          version = EXCLUDED.version,
          updated_at_utc = EXCLUDED.updated_at_utc
      `,
      [randomUUID(), applicationId, response.responseText, response.version, response.updatedAt]
    );
  }

  for (const [id, document] of store.documents) {
    await client.query(
      `
        INSERT INTO document_assets (
          id, application_id, assessment_episode_id, park_id, document_type, filename, content_type,
          byte_size, sha256, storage_provider, storage_key, status, visibility, version, is_current,
          replaces_document_id, replaced_by_document_id, uploaded_by_actor_id, scan_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          is_current = EXCLUDED.is_current,
          replaced_by_document_id = EXCLUDED.replaced_by_document_id,
          updated_at = now()
      `,
      [
        id,
        document.applicationId,
        document.episodeId,
        document.parkId,
        document.documentType,
        document.filename,
        document.contentType,
        document.byteSize,
        document.sha256,
        document.storageProvider,
        document.storageKey,
        document.status,
        document.visibility,
        document.version,
        document.isCurrent,
        document.replacesDocumentId && store.documents.has(document.replacesDocumentId) ? document.replacesDocumentId : null,
        document.replacedByDocumentId && store.documents.has(document.replacedByDocumentId) ? document.replacedByDocumentId : null,
        document.uploadedByActorId,
        document.scanStatus
      ]
    );
  }

  for (const [id, session] of store.uploadSessions) {
    await client.query(
      `
        INSERT INTO document_upload_sessions (
          id, application_id, document_type, filename, content_type, byte_size, sha256,
          total_chunks, status, expires_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          version = EXCLUDED.version,
          updated_at = now()
      `,
      [id, session.applicationId, session.documentType, session.filename, session.contentType, session.byteSize, session.sha256, session.totalChunks, session.status, session.expiresAt, session.version]
    );

    await client.query("DELETE FROM document_upload_chunks WHERE upload_session_id = $1", [id]);
    for (const chunkIndex of session.acceptedChunks) {
      await client.query(
        `
          INSERT INTO document_upload_chunks (upload_session_id, chunk_index, chunk_size, chunk_checksum)
          VALUES ($1, $2, $3, $4)
        `,
        [id, chunkIndex, 1, `normalized-runtime-compatible-${chunkIndex}`]
      );
    }
  }

  for (const [id, invoice] of store.invoices) {
    await client.query(
      `
        INSERT INTO invoices (id, application_id, assessment_episode_id, status, amount_marker, due_at, available_in_portal)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = now()
      `,
      [id, invoice.applicationId, invoice.episodeId, invoice.status, invoice.amount, invoice.dueAt, invoice.availableInPortal]
    );
    await client.query("DELETE FROM payment_notification_intents WHERE invoice_id = $1", [id]);
    for (const intent of invoice.notificationIntents) {
      await client.query(
        `
          INSERT INTO payment_notification_intents (id, invoice_id, intent_type)
          VALUES ($1, $2, $3)
          ON CONFLICT (invoice_id, intent_type) DO NOTHING
        `,
        [randomUUID(), id, intent]
      );
    }
  }

  for (const [id, payment] of store.payments) {
    await client.query(
      `
        INSERT INTO payment_states (
          invoice_id, purchase_order_number, no_purchase_order_declared,
          manually_marked_paid, override_applied, blocked_for_allocation
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (invoice_id) DO UPDATE SET
          purchase_order_number = EXCLUDED.purchase_order_number,
          no_purchase_order_declared = EXCLUDED.no_purchase_order_declared,
          manually_marked_paid = EXCLUDED.manually_marked_paid,
          override_applied = EXCLUDED.override_applied,
          blocked_for_allocation = EXCLUDED.blocked_for_allocation,
          updated_at = now()
      `,
      [
        id,
        payment.purchaseOrder?.purchaseOrderNumber ?? null,
        payment.purchaseOrder?.noPurchaseOrderDeclared ?? false,
        payment.manuallyMarkedPaid,
        payment.overrideApplied,
        payment.blockedForAllocation
      ]
    );
  }

  await flushAdminOverrideEvents(client, store.overrideEvents);
}
