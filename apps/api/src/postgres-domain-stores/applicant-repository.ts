import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { SqlClient, UnitOfWork } from "@green-flag/db";
import {
  applicationDocumentsFixture,
  applicationDocumentsResponseSchema,
  applicationDraftFixture,
  applicationDraftResponseSchema,
  applicationSubmissionResponseSchema,
  autosaveApplicationSectionResponseSchema,
  completeDocumentUploadResponseSchema,
  documentAssetSchema,
  documentChunkAcknowledgementSchema,
  documentUploadSessionSchema,
  documentVersionsResponseSchema,
  invoiceSummaryResponseSchema,
  paymentDeadlineCheckResponseSchema,
  paymentSummaryResponseSchema,
  previousFeedbackResponseDraftSchema,
  signedDocumentAccessResponseSchema,
  type ApplicationStatus
} from "@green-flag/contracts";
import { requirePaymentResourceAccess } from "../authorization.js";
import { ApiError, appendAuditEvent, type AuditLedger, type SessionProfile } from "../auth.js";
import { buildAdminOverrideEvent } from "../overrides.js";
import { type ResourceOwnership } from "../authorization.js";
import { buildAuditEvent, requestMetadata } from "../applicant/audit.js";
import { sectionCompletion } from "../applicant/application.service.js";
import { chunkProgress } from "../applicant/documents.service.js";
import { DocumentMigrationValidationService } from "../document-migration-validation.js";
import { PostgresDocumentMigrationRepository } from "./document-migration-repository.js";
import { flushAdminOverrideEvents } from "./overrides.js";
import { safeDisplayStatus } from "./shared.js";

type ApplicationRow = {
  id: string;
  assessment_episode_id: string;
  park_id: string;
  status: string;
  completion_percent: number;
  version: number;
  updated_at_utc: Date | string;
  episode_status?: string;
};

type SectionRow = {
  section_key: string;
  status: string;
  completion_percent: number;
  version: number;
  updated_at_utc: Date | string;
};

type FieldRow = {
  section_key: string;
  field_key: string;
  field_value: unknown;
};

type DocumentRow = {
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
};

type UploadSessionRow = {
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
};

type InvoiceRow = {
  id: string;
  application_id: string;
  assessment_episode_id: string;
  status: string;
  amount_marker: string;
  due_at: Date | string;
  available_in_portal: boolean;
  total_amount: string | null;
  currency: string | null;
};

type PaymentRow = {
  invoice_id: string;
  purchase_order_number: string | null;
  no_purchase_order_declared: boolean;
  manually_marked_paid: boolean;
  override_applied: boolean;
  blocked_for_allocation: boolean;
  updated_at: Date | string;
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function paymentPurchaseOrder(row: PaymentRow) {
  return {
    ...(row.purchase_order_number ? { purchaseOrderNumber: row.purchase_order_number } : {}),
    noPurchaseOrderDeclared: row.no_purchase_order_declared
  };
}

type FinanceApplicationContext = {
  application_id: string;
  assessment_episode_id: string;
  park_id: string;
  park_name: string;
  organisation_id: string;
  organisation_name: string;
  country_code: string | null;
  award_track_code: string;
  operational_year: number;
};

type ApplicationAreaSnapshotRow = {
  id: string;
  area_hectares: string;
  source_kind: string;
};

type FeeScheduleLineRow = {
  id: string;
  description: string;
  unit_amount: string;
  currency: string;
  currency_precision: number;
  tax_name: string | null;
  tax_rate: string;
  tax_inclusive: boolean;
  schedule_id: string;
  schedule_key: string;
  schedule_version: number;
  configuration_source: string;
};

function moneyCents(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function moneyString(cents: number) {
  return (cents / 100).toFixed(2);
}

function lowerEnvInvoiceNumber(invoiceId: string) {
  return `LOWER-ENV-INVOICE-${invoiceId.replace(/-/g, "")}`;
}

function calculateApplicationStatus(sections: Array<{ completionPercent: number }>) {
  const completionPercent = Math.round(
    sections.reduce((sum, section) => sum + section.completionPercent, 0) / sections.length
  );
  const status: ApplicationStatus =
    completionPercent >= 100 ? "READY_TO_SUBMIT" : completionPercent > 0 ? "IN_PROGRESS" : "DRAFT";
  return { completionPercent, status };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

function documentFromRow(row: DocumentRow) {
  return documentAssetSchema.parse({
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
  });
}

function applicantDocumentFromRow(row: DocumentRow) {
  return completeDocumentUploadResponseSchema.shape.document.parse({
    documentId: row.id,
    documentType: row.document_type,
    filename: row.filename,
    contentType: row.content_type,
    byteSize: row.byte_size,
    status: row.status,
    visibility: row.visibility,
    version: row.version,
    isCurrent: row.is_current,
    ...(row.replaces_document_id ? { replacesDocumentId: row.replaces_document_id } : {}),
    ...(row.replaced_by_document_id ? { replacedByDocumentId: row.replaced_by_document_id } : {}),
    scanStatus: row.scan_status,
    signedAccessAvailable: row.visibility !== "ADMIN_ONLY" && row.visibility !== "MYSTERY_RESTRICTED",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  });
}

async function loadApplication(client: SqlClient, applicationId: string, lock = false) {
  const applicationRows = await client.query<ApplicationRow>(
    `
      SELECT a.id, a.assessment_episode_id, a.park_id, a.status, a.completion_percent,
        a.version, a.updated_at_utc, ae.status AS episode_status
      FROM applications a
      JOIN assessment_episodes ae ON ae.id = a.assessment_episode_id
      WHERE a.id = $1
      ${lock ? "FOR UPDATE OF a" : ""}
    `,
    [applicationId]
  );
  const row = applicationRows.rows[0];
  if (!row) return null;
  return hydrateApplication(client, row);
}

async function hydrateApplication(client: SqlClient, row: ApplicationRow) {
  const sections = await client.query<SectionRow>(
    "SELECT section_key, status, completion_percent, version, updated_at_utc FROM application_sections WHERE application_id = $1 ORDER BY section_key",
    [row.id]
  );
  const fields = await client.query<FieldRow>(
    "SELECT section_key, field_key, field_value FROM application_field_values WHERE application_id = $1",
    [row.id]
  );
  const fieldMap = new Map<string, Record<string, unknown>>();
  for (const field of fields.rows) {
    const sectionFields = fieldMap.get(field.section_key) ?? {};
    sectionFields[field.field_key] = field.field_value;
    fieldMap.set(field.section_key, sectionFields);
  }
  const sectionRows = sections.rows.length
    ? sections.rows
    : applicationDraftFixture.sections.map((section) => ({
        section_key: section.sectionKey,
        status: "not_started",
        completion_percent: 0,
        version: 0,
        updated_at_utc: row.updated_at_utc
      }));
  return applicationDraftResponseSchema.parse({
    applicationId: row.id,
    episodeId: row.assessment_episode_id,
    parkId: row.park_id,
    status: row.status,
    displayStatus: safeDisplayStatus(row.status),
    completionPercent: row.completion_percent,
    version: row.version,
    sections: sectionRows.map((section) => ({
      sectionKey: section.section_key,
      status: section.status,
      completionPercent: section.completion_percent,
      version: section.version,
      fields: fieldMap.get(section.section_key) ?? {},
      updatedAt: iso(section.updated_at_utc)
    })),
    allowedActions: applicationDraftFixture.allowedActions,
    updatedAt: iso(row.updated_at_utc)
  });
}

async function loadApplicationByEpisode(client: SqlClient, episodeId: string) {
  const result = await client.query<ApplicationRow>(
    `
      SELECT a.id, a.assessment_episode_id, a.park_id, a.status, a.completion_percent,
        a.version, a.updated_at_utc, ae.status AS episode_status
      FROM applications a
      JOIN assessment_episodes ae ON ae.id = a.assessment_episode_id
      WHERE a.assessment_episode_id = $1
      LIMIT 1
    `,
    [episodeId]
  );
  return result.rows[0] ? hydrateApplication(client, result.rows[0]) : null;
}

async function loadDocuments(client: SqlClient, applicationId: string) {
  const rows = await client.query<DocumentRow>(
    "SELECT * FROM document_assets WHERE application_id = $1 ORDER BY document_type, version DESC, created_at DESC",
    [applicationId]
  );
  return rows.rows.map(applicantDocumentFromRow);
}

async function loadUploadSession(client: SqlClient, sessionId: string, lock = false) {
  const result = await client.query<UploadSessionRow>(
    `
      SELECT * FROM document_upload_sessions
      WHERE id = $1
      ${lock ? "FOR UPDATE" : ""}
    `,
    [sessionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const chunks = await client.query<{ chunk_index: number }>(
    "SELECT chunk_index FROM document_upload_chunks WHERE upload_session_id = $1 ORDER BY chunk_index",
    [row.id]
  );
  const acceptedChunks = chunks.rows.map((chunk) => chunk.chunk_index);
  return documentUploadSessionSchema.parse({
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
  });
}

async function loadUploadSessionByIdempotencyKey(client: SqlClient, applicationId: string, idempotencyKey: string, lock = false) {
  const result = await client.query<UploadSessionRow>(
    `
      SELECT * FROM document_upload_sessions
      WHERE application_id = $1 AND idempotency_key = $2
      ${lock ? "FOR UPDATE" : ""}
      LIMIT 1
    `,
    [applicationId, idempotencyKey]
  );
  const row = result.rows[0];
  return row ? loadUploadSession(client, row.id) : null;
}

function assertUploadReplayMatches(
  session: unknown,
  body: Parameters<ApplicantRepository["createUploadSession"]>[0]["body"]
) {
  const replay = documentUploadSessionSchema.parse(session);
  const mismatched =
    replay.documentType !== body.documentType ||
    replay.filename !== body.filename ||
    replay.contentType !== body.contentType ||
    replay.byteSize !== body.byteSize ||
    replay.sha256 !== body.sha256 ||
    replay.totalChunks !== body.totalChunks;
  if (mismatched) {
    throw new ApiError("idempotency_conflict", 409, "Upload session idempotency key was reused with different upload metadata.");
  }
  return replay;
}

async function loadInvoice(client: SqlClient, invoiceId: string, lock = false) {
  const result = await client.query<InvoiceRow>(
    `
      SELECT id, application_id, assessment_episode_id, status, amount_marker, due_at, available_in_portal, total_amount::text, currency
      FROM invoices
      WHERE id = $1
      ${lock ? "FOR UPDATE" : ""}
    `,
    [invoiceId]
  );
  return result.rows[0] ?? null;
}

async function loadInvoiceByApplication(client: SqlClient, applicationId: string) {
  const result = await client.query<InvoiceRow>(
    "SELECT id, application_id, assessment_episode_id, status, amount_marker, due_at, available_in_portal, total_amount::text, currency FROM invoices WHERE application_id = $1 LIMIT 1",
    [applicationId]
  );
  return result.rows[0] ?? null;
}

async function invoiceSummary(client: SqlClient, row: InvoiceRow) {
  const intents = await client.query<{ intent_type: string }>(
    "SELECT intent_type FROM payment_notification_intents WHERE invoice_id = $1 ORDER BY created_at",
    [row.id]
  );
  return invoiceSummaryResponseSchema.parse({
    invoiceId: row.id,
    applicationId: row.application_id,
    episodeId: row.assessment_episode_id,
    status: row.status,
    amount: row.amount_marker,
    dueAt: iso(row.due_at),
    availableInPortal: row.available_in_portal,
    notificationIntents: intents.rows.map((intent) => intent.intent_type)
  });
}

async function loadPaymentSummary(client: SqlClient, invoiceRow: InvoiceRow) {
  const paymentRows = await client.query<PaymentRow>(
    "SELECT invoice_id, purchase_order_number, no_purchase_order_declared, manually_marked_paid, override_applied, blocked_for_allocation, updated_at FROM payment_states WHERE invoice_id = $1",
    [invoiceRow.id]
  );
  const paymentRow = paymentRows.rows[0];
  if (!paymentRow) {
    throw new ApiError("dependency_missing", 404, "Payment state was not found.");
  }
  const invoice = await invoiceSummary(client, invoiceRow);
  return paymentSummaryResponseSchema.parse({
    applicationId: invoice.applicationId,
    invoice,
    purchaseOrder: paymentPurchaseOrder(paymentRow),
    manuallyMarkedPaid: paymentRow.manually_marked_paid,
    overrideApplied: paymentRow.override_applied,
    blockedForAllocation: paymentRow.blocked_for_allocation,
    updatedAt: iso(paymentRow.updated_at)
  });
}

async function loadFinanceApplicationContext(client: SqlClient, applicationId: string) {
  const row = (await client.query<FinanceApplicationContext>(
    `
      SELECT
        a.id AS application_id,
        a.assessment_episode_id,
        a.park_id,
        p.name AS park_name,
        p.organisation_id,
        o.name AS organisation_name,
        ac.country_code,
        ae.award_track_code,
        ae.operational_year
      FROM applications a
      JOIN assessment_episodes ae ON ae.id = a.assessment_episode_id
      JOIN award_cycles ac ON ac.id = ae.award_cycle_id
      JOIN parks p ON p.id = a.park_id
      JOIN organisations o ON o.id = p.organisation_id
      WHERE a.id = $1
      LIMIT 1
    `,
    [applicationId]
  )).rows[0];
  if (!row) throw new ApiError("dependency_missing", 404, "Application finance context was not found.");
  return row;
}

async function ensureApplicationAreaSnapshot(client: SqlClient, applicationId: string) {
  const existing = (await client.query<ApplicationAreaSnapshotRow>(
    "SELECT id, area_hectares::text, source_kind FROM application_area_snapshots WHERE application_id = $1 LIMIT 1",
    [applicationId]
  )).rows[0];
  if (existing) return existing;

  const current = (await client.query<{
    application_id: string;
    assessment_episode_id: string;
    park_id: string;
    park_area_measurement_id: string;
    area_hectares: string;
    source_kind: string;
    captured_at_utc: Date | string;
  }>(
    `
      SELECT
        a.id AS application_id,
        a.assessment_episode_id,
        a.park_id,
        pam.id AS park_area_measurement_id,
        pam.area_hectares::text,
        pam.source_kind,
        pam.captured_at_utc
      FROM applications a
      JOIN LATERAL (
        SELECT *
        FROM park_area_measurements
        WHERE park_id = a.park_id
          AND is_current = true
        ORDER BY captured_at_utc DESC, id
        LIMIT 1
      ) pam ON true
      WHERE a.id = $1
      FOR UPDATE OF a
    `,
    [applicationId]
  )).rows[0];

  if (!current) {
    throw new ApiError(
      "dependency_missing",
      409,
      "Application area snapshot cannot be created because the park has no current area measurement."
    );
  }

  const snapshotId = randomUUID();
  await client.query(
    `
      INSERT INTO application_area_snapshots (
        id,
        application_id,
        assessment_episode_id,
        park_id,
        park_area_measurement_id,
        area_hectares,
        source_kind,
        snapshot_reason,
        captured_at_utc
      )
      VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, 'application_submission', $8::timestamptz)
      ON CONFLICT (application_id) DO NOTHING
    `,
    [
      snapshotId,
      current.application_id,
      current.assessment_episode_id,
      current.park_id,
      current.park_area_measurement_id,
      current.area_hectares,
      current.source_kind,
      iso(current.captured_at_utc)
    ]
  );

  return (await client.query<ApplicationAreaSnapshotRow>(
    "SELECT id, area_hectares::text, source_kind FROM application_area_snapshots WHERE application_id = $1 LIMIT 1",
    [applicationId]
  )).rows[0]!;
}

async function selectFeeScheduleLine(client: SqlClient, context: FinanceApplicationContext, areaSnapshot: ApplicationAreaSnapshotRow, invoiceDate: string) {
  const row = (await client.query<FeeScheduleLineRow>(
    `
      SELECT
        fsl.id,
        fsl.description,
        fsl.unit_amount::text,
        fsl.currency,
        fsl.currency_precision,
        fsl.tax_name,
        fsl.tax_rate::text,
        fsl.tax_inclusive,
        fs.id AS schedule_id,
        fs.schedule_key,
        fs.version AS schedule_version,
        fs.configuration_source
      FROM fee_schedule_lines fsl
      JOIN fee_schedules fs ON fs.id = fsl.fee_schedule_id
      WHERE fs.status = 'active'
        AND fsl.status = 'active'
        AND fs.effective_from <= $1::date
        AND (fs.effective_to IS NULL OR fs.effective_to > $1::date)
        AND (fs.country_code IS NULL OR fs.country_code = $2)
        AND (fsl.country_code IS NULL OR fsl.country_code = $2)
        AND (fs.award_track_code IS NULL OR fs.award_track_code = $3)
        AND (fsl.award_track_code IS NULL OR fsl.award_track_code = $3)
        AND (fsl.min_area_hectares IS NULL OR fsl.min_area_hectares <= $4::numeric)
        AND (fsl.max_area_hectares IS NULL OR fsl.max_area_hectares > $4::numeric)
      ORDER BY
        CASE fs.configuration_source
          WHEN 'kbt_finance_approved' THEN 0
          WHEN 'legacy_import' THEN 1
          ELSE 2
        END,
        CASE WHEN fs.country_code = $2 THEN 0 ELSE 1 END,
        CASE WHEN fsl.country_code = $2 THEN 0 ELSE 1 END,
        CASE WHEN fsl.min_area_hectares IS NOT NULL THEN 0 ELSE 1 END,
        fs.effective_from DESC,
        fs.version DESC,
        fsl.line_code
      LIMIT 1
    `,
    [invoiceDate.slice(0, 10), context.country_code, context.award_track_code, areaSnapshot.area_hectares]
  )).rows[0];

  if (!row) {
    throw new ApiError("dependency_missing", 409, "No active fee schedule line was available for invoice generation.");
  }
  if (row.tax_inclusive) {
    throw new ApiError("validation_failed", 409, "Tax-inclusive fee treatment requires approved finance configuration before invoice generation.");
  }
  return row;
}

function invoiceLineAmounts(line: FeeScheduleLineRow) {
  const quantity = 1;
  const unitCents = moneyCents(line.unit_amount);
  const lineSubtotalCents = Math.round(quantity * unitCents);
  const taxCents = Math.round(lineSubtotalCents * (Number(line.tax_rate) / 100));
  const lineTotalCents = lineSubtotalCents + taxCents;
  return {
    quantity: "1.0000",
    unitAmount: moneyString(unitCents),
    subtotalAmount: moneyString(lineSubtotalCents),
    taxAmount: moneyString(taxCents),
    totalAmount: moneyString(lineTotalCents)
  };
}

async function appendPaymentEvent(client: SqlClient, input: {
  invoice: InvoiceRow;
  eventType: string;
  eventStatus?: string;
  source: string;
  paymentMethod?: string;
  actorId?: string;
  auditEventId?: string;
  adminOverrideEventId?: string;
  notes?: string;
  occurredAt?: string;
}) {
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
        occurred_at_utc,
        audit_event_id,
        admin_override_event_id,
        notes
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::numeric,
        $6,
        $7,
        $8,
        $9,
        $10::timestamptz,
        $11,
        $12,
        $13
      )
    `,
    [
      randomUUID(),
      input.invoice.id,
      input.eventType,
      input.eventStatus ?? "accepted",
      input.invoice.total_amount ?? null,
      input.invoice.currency ?? null,
      input.paymentMethod ?? null,
      input.source,
      input.actorId ?? null,
      input.occurredAt ?? new Date().toISOString(),
      input.auditEventId ?? null,
      input.adminOverrideEventId ?? null,
      input.notes ?? null
    ]
  );
}

async function documentState(client: SqlClient, applicationId: string) {
  const result = await client.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM document_assets
      WHERE application_id = $1
        AND document_type = 'management_plan'
        AND is_current
        AND status = 'AVAILABLE'
    `,
    [applicationId]
  );
  return Number(result.rows[0]?.count ?? 0) > 0 ? "management_plan_uploaded" : "management_plan_missing";
}

export interface ApplicantRepository {
  getOwnershipForPark(parkId: string): Promise<ResourceOwnership>;
  getApplication(applicationId: string): Promise<unknown>;
  createApplication(input: { parkId: string; episodeId: string; actor: SessionProfile["actor"]; request: FastifyRequest; idempotencyKey?: string | undefined }): Promise<unknown>;
  autosaveSection(input: { applicationId: string; sectionKey: string; clientVersion: number; fields: Record<string, unknown>; actor: SessionProfile["actor"]; request: FastifyRequest; idempotencyKey?: string | undefined }): Promise<unknown>;
  recordPreviousFeedback(input: { applicationId: string; clientVersion: number; responseText: string; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  listDocuments(applicationId: string): Promise<unknown>;
  createUploadSession(input: { applicationId: string; body: { documentType: string; filename: string; contentType: string; byteSize: number; sha256: string; totalChunks: number; idempotencyKey?: string | undefined }; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  acknowledgeChunk(input: { applicationId: string; sessionId: string; chunkIndex: number; clientVersion: number; chunkSize: number; chunkChecksum: string; actor: SessionProfile["actor"]; request: FastifyRequest; idempotencyKey?: string | undefined }): Promise<unknown>;
  completeUpload(input: { applicationId: string; sessionId: string; clientVersion: number; sha256: string; byteSize: number; storageKey: string; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  getDocument(input: { applicationId: string; documentId: string }): Promise<unknown>;
  requestSignedDocumentAccess(input: { applicationId: string; documentId: string; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  listDocumentVersions(input: { applicationId: string; documentId: string }): Promise<unknown>;
  submitApplication(input: { applicationId: string; clientVersion: number; purchaseOrder: unknown; actor: SessionProfile["actor"]; request: FastifyRequest; idempotencyKey?: string | undefined }): Promise<unknown>;
  getSubmission(applicationId: string): Promise<unknown>;
  getPaymentSummary(applicationId: string): Promise<unknown>;
  updatePurchaseOrder(input: { applicationId: string; purchaseOrder: unknown; actor: SessionProfile["actor"]; request: FastifyRequest }): Promise<unknown>;
  markPaid(input: { invoiceId: string; reason: string; actor: SessionProfile["actor"]; request: FastifyRequest; idempotencyKey?: string | undefined }): Promise<unknown>;
  overridePaymentBlock(input: { invoiceId: string; reason: string; actor: SessionProfile["actor"]; request: FastifyRequest; idempotencyKey?: string | undefined }): Promise<unknown>;
  applyPaymentDeadlineBlocks(input: { asOf: string; actor: SessionProfile["actor"]; request: FastifyRequest; idempotencyKey?: string | undefined }): Promise<unknown>;
}

export class PostgresApplicantRepository implements ApplicantRepository {
  private readonly documentMigrationValidationService: DocumentMigrationValidationService;

  constructor(
    private readonly client: SqlClient,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditLedger: AuditLedger
  ) {
    this.documentMigrationValidationService = new DocumentMigrationValidationService(
      new PostgresDocumentMigrationRepository(client, unitOfWork),
      { auditLedger }
    );
  }

  async getOwnershipForPark(parkId: string): Promise<ResourceOwnership> {
    const result = await this.client.query<{
      park_id: string;
      organisation_id: string;
      country_code: string | null;
    }>(
      `
        SELECT p.id AS park_id, p.organisation_id, ac.country_code
        FROM parks p
        LEFT JOIN assessment_episodes ae ON ae.park_id = p.id
        LEFT JOIN award_cycles ac ON ac.id = ae.award_cycle_id
        WHERE p.id = $1
        ORDER BY ac.cycle_year DESC NULLS LAST
        LIMIT 1
      `,
      [parkId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApiError("dependency_missing", 404, "Park ownership metadata was not found.");
    }
    return {
      parkId: row.park_id,
      organisationId: row.organisation_id,
      countryCode: row.country_code ?? "lower-env"
    };
  }

  async getApplication(applicationId: string) {
    const application = await loadApplication(this.client, applicationId);
    if (!application) {
      throw new ApiError("dependency_missing", 404, "Application draft was not found.");
    }
    return application;
  }

  async createApplication({ parkId, episodeId, actor, request, idempotencyKey }: Parameters<ApplicantRepository["createApplication"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      await client.query("SELECT id FROM assessment_episodes WHERE id = $1 AND park_id = $2 FOR UPDATE", [
        episodeId,
        parkId
      ]);
      const existing = await loadApplicationByEpisode(client, episodeId);
      if (existing) {
        return existing;
      }
      const applicationId = randomUUID();
      const now = new Date().toISOString();
      await client.query(
        `
          INSERT INTO applications (id, assessment_episode_id, park_id, owner_internal_user_id, status, completion_percent, version, updated_at_utc)
          VALUES ($1, $2, $3, $4, 'DRAFT', 0, 0, $5::timestamptz)
        `,
        [applicationId, episodeId, parkId, actor.actorId, now]
      );
      for (const section of applicationDraftFixture.sections) {
        await client.query(
          `
            INSERT INTO application_sections (id, application_id, section_key, status, completion_percent, version, updated_at_utc)
            VALUES ($1, $2, $3, 'not_started', 0, 0, $4::timestamptz)
          `,
          [randomUUID(), applicationId, section.sectionKey, now]
        );
      }
      await client.query("UPDATE assessment_episodes SET status = 'APPLICATION_DRAFT', updated_at_utc = now() WHERE id = $1", [
        episodeId
      ]);
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "CREATE_OR_CONTINUE_APPLICATION",
          entityId: applicationId,
          actor,
          request: requestMetadata(request, idempotencyKey),
          afterState: { applicationId, episodeId, status: "DRAFT" }
        })
      );
      const application = await loadApplication(client, applicationId);
      if (!application) throw new Error("Application was not readable after creation.");
      return application;
    });
  }

  async autosaveSection({ applicationId, sectionKey, clientVersion, fields, actor, request, idempotencyKey }: Parameters<ApplicantRepository["autosaveSection"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const application = await loadApplication(client, applicationId, true);
      if (!application) throw new ApiError("dependency_missing", 404, "Application draft was not found.");
      if (clientVersion !== application.version) {
        throw new ApiError("idempotency_conflict", 409, "Application draft version has changed.");
      }
      const section = application.sections.find((candidate) => candidate.sectionKey === sectionKey);
      if (!section) throw new ApiError("validation_failed", 400, "Unknown application section.");
      const completionPercent = sectionCompletion(fields);
      const sectionStatus = completionPercent === 100 ? "complete" : "in_progress";
      const sectionVersion = section.version + 1;
      const updatedAt = new Date().toISOString();
      const nextSections = application.sections.map((candidate) =>
        candidate.sectionKey === sectionKey
          ? { ...candidate, completionPercent, status: sectionStatus, version: sectionVersion }
          : candidate
      );
      const recalculated = calculateApplicationStatus(nextSections);
      const applicationVersion = application.version + 1;
      await client.query(
        `
          UPDATE application_sections
          SET status = $3, completion_percent = $4, version = $5, updated_at_utc = $6::timestamptz
          WHERE application_id = $1 AND section_key = $2
        `,
        [applicationId, sectionKey, sectionStatus, completionPercent, sectionVersion, updatedAt]
      );
      await client.query("DELETE FROM application_field_values WHERE application_id = $1 AND section_key = $2", [
        applicationId,
        sectionKey
      ]);
      for (const [fieldKey, fieldValue] of Object.entries(fields)) {
        await client.query(
          `
            INSERT INTO application_field_values (id, application_id, section_key, field_key, field_value, version, updated_at_utc)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz)
          `,
          [randomUUID(), applicationId, sectionKey, fieldKey, JSON.stringify(fieldValue), sectionVersion, updatedAt]
        );
      }
      await client.query(
        `
          UPDATE applications
          SET status = $2, completion_percent = $3, version = $4, updated_at_utc = $5::timestamptz
          WHERE id = $1 AND version = $6
        `,
        [applicationId, recalculated.status, recalculated.completionPercent, applicationVersion, updatedAt, clientVersion]
      );
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "AUTOSAVE_APPLICATION_SECTION",
          entityId: applicationId,
          actor,
          request: requestMetadata(request, idempotencyKey),
          beforeState: { version: application.version, section },
          afterState: {
            version: applicationVersion,
            sectionKey,
            completionPercent: recalculated.completionPercent
          }
        })
      );
      const updatedSection = {
        ...section,
        fields,
        status: sectionStatus,
        completionPercent,
        version: sectionVersion,
        updatedAt
      };
      return autosaveApplicationSectionResponseSchema.parse({
        applicationId,
        section: updatedSection,
        applicationStatus: recalculated.status,
        completionPercent: recalculated.completionPercent,
        version: applicationVersion
      });
    });
  }

  async recordPreviousFeedback({ applicationId, clientVersion, responseText, actor, request }: Parameters<ApplicantRepository["recordPreviousFeedback"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const application = await loadApplication(client, applicationId, true);
      if (!application) throw new ApiError("dependency_missing", 404, "Application draft was not found.");
      if (clientVersion !== application.version) {
        throw new ApiError("idempotency_conflict", 409, "Application draft version has changed.");
      }
      const version = application.version + 1;
      const updatedAt = new Date().toISOString();
      await client.query("UPDATE applications SET version = $2, updated_at_utc = $3::timestamptz WHERE id = $1 AND version = $4", [
        applicationId,
        version,
        updatedAt,
        clientVersion
      ]);
      await client.query(
        `
          INSERT INTO application_feedback_responses (id, application_id, response_text, version, updated_at_utc)
          VALUES ($1, $2, $3, $4, $5::timestamptz)
          ON CONFLICT (application_id) DO UPDATE SET
            response_text = EXCLUDED.response_text,
            version = EXCLUDED.version,
            updated_at_utc = EXCLUDED.updated_at_utc
        `,
        [randomUUID(), applicationId, responseText, version, updatedAt]
      );
      const response = previousFeedbackResponseDraftSchema.parse({
        applicationId,
        responseText,
        version,
        updatedAt
      });
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "RECORD_PREVIOUS_FEEDBACK_RESPONSE_DRAFT",
          entityId: applicationId,
          actor,
          request: requestMetadata(request),
          afterState: response
        })
      );
      return response;
    });
  }

  async listDocuments(applicationId: string) {
    const application = await loadApplication(this.client, applicationId);
    if (!application) throw new ApiError("dependency_missing", 404, "Application draft was not found.");
    const documents = await loadDocuments(this.client, applicationId);
    const currentManagementPlan = documents.find((document) => document.documentType === "management_plan" && document.isCurrent);
    const archivedManagementPlans = documents.filter((document) => document.documentType === "management_plan" && !document.isCurrent);
    return applicationDocumentsResponseSchema.parse({
      ...applicationDocumentsFixture,
      applicationId,
      episodeId: application.episodeId,
      parkId: application.parkId,
      documentCompletionStatus:
        currentManagementPlan?.status === "AVAILABLE" ? "complete" : currentManagementPlan?.status === "UPLOADED_PENDING_SCAN" ? "pending_scan" : "missing_required",
      slots: applicationDocumentsFixture.slots.map((slot) => {
        if (slot.documentType !== "management_plan") {
          return { ...slot, currentDocument: undefined, completionStatus: "missing", archivedVersionCount: 0 };
        }
        return {
          ...slot,
          currentDocument: currentManagementPlan,
          completionStatus: currentManagementPlan?.status === "AVAILABLE" ? "uploaded" : "missing",
          archivedVersionCount: archivedManagementPlans.length
        };
      })
    });
  }

  async createUploadSession({ applicationId, body, actor, request }: Parameters<ApplicantRepository["createUploadSession"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const application = await loadApplication(client, applicationId, true);
      if (!application) throw new ApiError("dependency_missing", 404, "Application draft was not found.");
      if (body.idempotencyKey) {
        const replay = await loadUploadSessionByIdempotencyKey(client, applicationId, body.idempotencyKey, true);
        if (replay) return assertUploadReplayMatches(replay, body);
      }
      const existing = await client.query<UploadSessionRow>(
        `
          SELECT * FROM document_upload_sessions
          WHERE application_id = $1 AND document_type = $2 AND sha256 = $3 AND status <> 'COMPLETED'
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [applicationId, body.documentType, body.sha256]
      );
      if (existing.rows[0]) {
        const session = await loadUploadSession(client, existing.rows[0].id);
        if (session) return session;
      }
      const sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      try {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO document_upload_sessions (
              id, application_id, document_type, filename, content_type, byte_size, sha256,
              total_chunks, status, idempotency_key, expires_at, version
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CREATED', $9, $10::timestamptz, 0)
            ON CONFLICT (application_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
            RETURNING id
          `,
          [
            sessionId,
            applicationId,
            body.documentType,
            body.filename,
            body.contentType,
            body.byteSize,
            body.sha256,
            body.totalChunks,
            body.idempotencyKey ?? null,
            expiresAt
          ]
        );
        if (!inserted.rows[0] && body.idempotencyKey) {
          const replay = await loadUploadSessionByIdempotencyKey(client, applicationId, body.idempotencyKey, true);
          if (replay) return assertUploadReplayMatches(replay, body);
        }
      } catch (error) {
        if (body.idempotencyKey && isUniqueViolation(error)) {
          const replay = await loadUploadSessionByIdempotencyKey(client, applicationId, body.idempotencyKey, true);
          if (replay) return assertUploadReplayMatches(replay, body);
        }
        throw error;
      }
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "CREATE_DOCUMENT_UPLOAD_SESSION",
          entityType: "document_upload_session",
          entityId: sessionId,
          actor,
          request: requestMetadata(request, body.idempotencyKey),
          afterState: {
            applicationId,
            documentType: body.documentType,
            byteSize: body.byteSize,
            sha256: body.sha256
          }
        })
      );
      const session = await loadUploadSession(client, sessionId);
      if (!session) throw new Error("Upload session was not readable after creation.");
      return session;
    });
  }

  async acknowledgeChunk({ applicationId, sessionId, chunkIndex, clientVersion, chunkSize, chunkChecksum, actor, request, idempotencyKey }: Parameters<ApplicantRepository["acknowledgeChunk"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      await loadApplication(client, applicationId, true);
      const uploadSession = await loadUploadSession(client, sessionId, true);
      if (!uploadSession || uploadSession.applicationId !== applicationId) {
        throw new ApiError("dependency_missing", 404, "Document upload session was not found.");
      }
      if (clientVersion !== uploadSession.version) {
        throw new ApiError("idempotency_conflict", 409, "Document upload session version has changed.");
      }
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= uploadSession.totalChunks) {
        throw new ApiError("validation_failed", 400, "Invalid document chunk index.");
      }
      const beforeState = { version: uploadSession.version, acceptedChunks: [...uploadSession.acceptedChunks] };
      await client.query(
        `
          INSERT INTO document_upload_chunks (upload_session_id, chunk_index, chunk_size, chunk_checksum)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (upload_session_id, chunk_index) DO NOTHING
        `,
        [sessionId, chunkIndex, chunkSize, chunkChecksum]
      );
      const chunkCount = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM document_upload_chunks WHERE upload_session_id = $1",
        [sessionId]
      );
      const acceptedCount = Number(chunkCount.rows[0]?.count ?? 0);
      const status = acceptedCount === uploadSession.totalChunks ? "READY_TO_COMPLETE" : "IN_PROGRESS";
      const nextVersion = uploadSession.acceptedChunks.includes(chunkIndex) ? uploadSession.version : uploadSession.version + 1;
      await client.query(
        "UPDATE document_upload_sessions SET status = $2, version = $3, updated_at = now() WHERE id = $1 AND version = $4",
        [sessionId, status, nextVersion, clientVersion]
      );
      const progressPercent = Math.round((acceptedCount / uploadSession.totalChunks) * 100);
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "ACKNOWLEDGE_DOCUMENT_UPLOAD_CHUNK",
          entityType: "document_upload_session",
          entityId: sessionId,
          actor,
          request: requestMetadata(request, idempotencyKey),
          beforeState,
          afterState: { version: nextVersion, acceptedChunkIndex: chunkIndex, progressPercent }
        })
      );
      return documentChunkAcknowledgementSchema.parse({
        sessionId,
        acceptedChunkIndex: chunkIndex,
        status,
        progressPercent,
        version: nextVersion
      });
    });
  }

  async completeUpload({ applicationId, sessionId, clientVersion, sha256, byteSize, storageKey, actor, request }: Parameters<ApplicantRepository["completeUpload"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const application = await loadApplication(client, applicationId, true);
      if (!application) throw new ApiError("dependency_missing", 404, "Application draft was not found.");
      const uploadSession = await loadUploadSession(client, sessionId, true);
      if (!uploadSession || uploadSession.applicationId !== applicationId) {
        throw new ApiError("dependency_missing", 404, "Document upload session was not found.");
      }
      if (clientVersion !== uploadSession.version) {
        throw new ApiError("idempotency_conflict", 409, "Document upload session version has changed.");
      }
      if (sha256 !== uploadSession.sha256 || byteSize !== uploadSession.byteSize) {
        throw new ApiError("validation_failed", 400, "Completed document metadata does not match upload session.");
      }
      if (uploadSession.acceptedChunks.length !== uploadSession.totalChunks) {
        throw new ApiError("conflict", 409, "Document upload session is not ready to complete.");
      }
      const duplicate = await client.query<DocumentRow>(
        "SELECT * FROM document_assets WHERE application_id = $1 AND sha256 = $2 ORDER BY created_at ASC LIMIT 1 FOR UPDATE",
        [applicationId, sha256]
      );
      if (duplicate.rows[0]) {
        await client.query("UPDATE document_upload_sessions SET status = 'COMPLETED', version = version + 1, updated_at = now() WHERE id = $1", [
          sessionId
        ]);
        const document = documentFromRow(duplicate.rows[0]);
        await appendAuditEvent(
          this.auditLedger,
          buildAuditEvent({
            action: "COMPLETE_DOCUMENT_UPLOAD",
            entityType: "document",
            entityId: document.documentId,
            actor,
            request: requestMetadata(request),
            afterState: { applicationId, duplicateOfDocumentId: document.documentId, uploadSessionId: sessionId }
          })
        );
        return completeDocumentUploadResponseSchema.parse({
          applicationId,
          document: applicantDocumentFromRow(duplicate.rows[0]),
          duplicateOfDocumentId: document.documentId
        });
      }
      const previousCurrent = await client.query<DocumentRow>(
        `
          SELECT * FROM document_assets
          WHERE application_id = $1 AND document_type = $2 AND is_current
          LIMIT 1
          FOR UPDATE
        `,
        [applicationId, uploadSession.documentType]
      );
      const previous = previousCurrent.rows[0];
      const documentId = randomUUID();
      const version = previous ? previous.version + 1 : 1;
      await client.query(
        `
          INSERT INTO document_assets (
            id, application_id, assessment_episode_id, park_id, document_type, filename, content_type,
            byte_size, sha256, storage_provider, storage_key, status, visibility, version, is_current,
            replaces_document_id, uploaded_by_actor_id, scan_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'lower_env_stub', $10, 'AVAILABLE', 'APPLICANT_AND_ADMIN', $11, $12, $13, $14, 'clean_stub')
        `,
        [
          documentId,
          applicationId,
          application.episodeId,
          application.parkId,
          uploadSession.documentType,
          uploadSession.filename,
          uploadSession.contentType,
          uploadSession.byteSize,
          uploadSession.sha256,
          storageKey,
          version,
          previous ? false : true,
          previous?.id ?? null,
          actor.actorId
        ]
      );
      if (previous) {
        await client.query(
          "UPDATE document_assets SET is_current = false, status = 'ARCHIVED', replaced_by_document_id = $2, updated_at = now() WHERE id = $1",
          [previous.id, documentId]
        );
        await client.query("UPDATE document_assets SET is_current = true WHERE id = $1", [documentId]);
      }
      if (uploadSession.documentType === "management_plan") {
        await this.documentMigrationValidationService.registerDocumentAssetOwnership(
          {
            documentAssetId: documentId,
            documentSubtype: "management_plan",
            ownerType: "application",
            ownerId: applicationId,
            ownerContextRole: "application_package",
            sourceOrigin: "user_upload",
            importStatus: "user_uploaded",
            applyDocumentAssetMetadata: true,
            createdByProcess: "management_plan_upload_metadata_enrichment"
          },
          {
            actor,
            requestId: request.id,
            reason: "management_plan_upload_metadata_enrichment"
          }
        );
      }
      await client.query("UPDATE document_upload_sessions SET status = 'COMPLETED', version = version + 1, updated_at = now() WHERE id = $1", [
        sessionId
      ]);
      const createdRow = await client.query<DocumentRow>("SELECT * FROM document_assets WHERE id = $1", [documentId]);
      const document = documentFromRow(createdRow.rows[0]!);
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "COMPLETE_DOCUMENT_UPLOAD",
          entityType: "document",
          entityId: documentId,
          actor,
          request: requestMetadata(request),
          beforeState: previous ? { previousCurrentDocumentId: previous.id, version: previous.version } : undefined,
          afterState: {
            applicationId,
            documentId,
            documentType: document.documentType,
            sha256: document.sha256,
            archivedDocumentId: previous?.id
          }
        })
      );
      return completeDocumentUploadResponseSchema.parse({
        applicationId,
        document: applicantDocumentFromRow(createdRow.rows[0]!),
        archivedDocumentId: previous?.id
      });
    });
  }

  async getDocument({ applicationId, documentId }: Parameters<ApplicantRepository["getDocument"]>[0]) {
    const rows = await this.client.query<DocumentRow>("SELECT * FROM document_assets WHERE id = $1 AND application_id = $2", [
      documentId,
      applicationId
    ]);
    if (!rows.rows[0]) throw new ApiError("dependency_missing", 404, "Document was not found.");
    return documentFromRow(rows.rows[0]);
  }

  async requestSignedDocumentAccess({ applicationId, documentId, actor, request }: Parameters<ApplicantRepository["requestSignedDocumentAccess"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const rows = await client.query<DocumentRow>("SELECT * FROM document_assets WHERE id = $1 AND application_id = $2", [
        documentId,
        applicationId
      ]);
      const row = rows.rows[0];
      if (!row) throw new ApiError("dependency_missing", 404, "Document was not found.");
      if (row.visibility === "MYSTERY_RESTRICTED" || row.visibility === "ADMIN_ONLY") {
        throw new ApiError("forbidden", 403, "Document is not visible to the applicant.");
      }
      const response = signedDocumentAccessResponseSchema.parse({
        documentId: row.id,
        method: "GET",
        url: `https://lower-env-storage.invalid/download/${row.id}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        filename: row.filename,
        contentType: row.content_type,
        visibility: row.visibility
      });
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "DOCUMENT_ACCESS_REQUESTED",
          entityType: "document",
          entityId: row.id,
          actor,
          request: requestMetadata(request),
          afterState: {
            applicationId: row.application_id,
            documentId: row.id,
            episodeId: row.assessment_episode_id,
            parkId: row.park_id,
            documentType: row.document_type,
            visibility: row.visibility,
            accessDecision: "signed_access_issued"
          }
        })
      );
      return response;
    });
  }

  async listDocumentVersions({ applicationId, documentId }: Parameters<ApplicantRepository["listDocumentVersions"]>[0]) {
    const document = await this.getDocument({ applicationId, documentId }) as ReturnType<typeof documentAssetSchema.parse>;
    const versions = await this.client.query<DocumentRow>(
      "SELECT * FROM document_assets WHERE application_id = $1 AND document_type = $2 ORDER BY version DESC",
      [applicationId, document.documentType]
    );
    return documentVersionsResponseSchema.parse({
      applicationId,
      documentType: document.documentType,
      versions: versions.rows.map(applicantDocumentFromRow)
    });
  }

  async submitApplication({ applicationId, clientVersion, purchaseOrder, actor, request, idempotencyKey }: Parameters<ApplicantRepository["submitApplication"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const application = await loadApplication(client, applicationId, true);
      if (!application) throw new ApiError("dependency_missing", 404, "Application draft was not found.");
      const existingInvoice = await loadInvoiceByApplication(client, applicationId);
      if (["SUBMITTED", "SUBMITTED_WITH_MISSING_PLAN"].includes(application.status)) {
        if (idempotencyKey && existingInvoice) {
          return this.buildSubmissionResponse(client, applicationId);
        }
        throw new ApiError("conflict", 409, "Application has already been submitted.");
      }
      if (clientVersion !== application.version) {
        throw new ApiError("idempotency_conflict", 409, "Application draft version has changed.");
      }
      const currentDocumentState = await documentState(client, applicationId);
      const status = currentDocumentState === "management_plan_uploaded" ? "SUBMITTED" : "SUBMITTED_WITH_MISSING_PLAN";
      const version = application.version + 1;
      const updatedAt = new Date().toISOString();
      const invoiceId = existingInvoice?.id ?? randomUUID();
      const financeContext = await loadFinanceApplicationContext(client, applicationId);
      const areaSnapshot = await ensureApplicationAreaSnapshot(client, applicationId);
      const feeLine = await selectFeeScheduleLine(client, financeContext, areaSnapshot, updatedAt);
      const lineAmounts = invoiceLineAmounts(feeLine);
      const dueAt = new Date(Date.parse(updatedAt) + 30 * 24 * 60 * 60 * 1000).toISOString();
      const poNumber = (purchaseOrder as { purchaseOrderNumber?: string }).purchaseOrderNumber ?? null;
      const noPurchaseOrderDeclared = (purchaseOrder as { noPurchaseOrderDeclared?: boolean }).noPurchaseOrderDeclared ?? false;
      await client.query(
        "UPDATE applications SET status = $2, version = $3, updated_at_utc = $4::timestamptz WHERE id = $1 AND version = $5",
        [applicationId, status, version, updatedAt, clientVersion]
      );
      await client.query("UPDATE assessment_episodes SET status = 'PAYMENT_PENDING', updated_at_utc = now() WHERE id = $1", [
        application.episodeId
      ]);
      await client.query(
        `
          INSERT INTO application_submissions (id, application_id, assessment_episode_id, submitted_by_actor_id, application_version, document_state, status, submitted_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
          ON CONFLICT (application_id) DO NOTHING
        `,
        [randomUUID(), applicationId, application.episodeId, actor.actorId, version, currentDocumentState, status, updatedAt]
      );
      await client.query(
        `
          INSERT INTO invoices (
            id,
            application_id,
            assessment_episode_id,
            status,
            amount_marker,
            due_at,
            available_in_portal,
            invoice_number,
            invoice_number_scope,
            invoice_number_policy_snapshot,
            park_id,
            organisation_id,
            park_name_snapshot,
            organisation_name_snapshot,
            billing_name,
            purchase_order_number_snapshot,
            no_purchase_order_declared_snapshot,
            currency,
            currency_precision,
            subtotal_amount,
            tax_amount,
            total_amount,
            tax_name,
            tax_rate,
            payment_terms_snapshot,
            due_date_source,
            generated_at_utc,
            source_reference_metadata
          )
          VALUES (
            $1,
            $2,
            $3,
            'PENDING',
            'external_value_unavailable',
            $4::timestamptz,
            true,
            $5,
            'lower_env_placeholder',
            $6::jsonb,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16::numeric,
            $17::numeric,
            $18::numeric,
            $19,
            $20::numeric,
            $21::jsonb,
            'lower_env_placeholder',
            $22::timestamptz,
            $23::jsonb
          )
          ON CONFLICT (application_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
        `,
        [
          invoiceId,
          applicationId,
          application.episodeId,
          dueAt,
          lowerEnvInvoiceNumber(invoiceId),
          JSON.stringify({ source: "lower_env_placeholder", idempotencyKey: idempotencyKey ?? null }),
          financeContext.park_id,
          financeContext.organisation_id,
          financeContext.park_name,
          financeContext.organisation_name,
          financeContext.organisation_name,
          poNumber,
          noPurchaseOrderDeclared,
          feeLine.currency,
          feeLine.currency_precision,
          lineAmounts.subtotalAmount,
          lineAmounts.taxAmount,
          lineAmounts.totalAmount,
          feeLine.tax_name,
          feeLine.tax_rate,
          JSON.stringify({
            source: "lower_env_placeholder",
            deadlineSource: "manual_offline_placeholder",
            days: 30,
            dueAt
          }),
          updatedAt,
          JSON.stringify({
            source: "application_submission",
            feeScheduleId: feeLine.schedule_id,
            feeScheduleKey: feeLine.schedule_key,
            feeScheduleVersion: feeLine.schedule_version,
            feeScheduleConfigurationSource: feeLine.configuration_source,
            applicationAreaSnapshotId: areaSnapshot.id
          })
        ]
      );
      await client.query(
        `
          INSERT INTO invoice_lines (
            id,
            invoice_id,
            line_number,
            fee_schedule_line_id,
            description,
            quantity,
            unit_amount,
            currency,
            currency_precision,
            tax_name,
            tax_rate,
            tax_amount,
            line_subtotal,
            line_total,
            application_area_snapshot_id,
            source_reference_metadata
          )
          VALUES (
            $1,
            $2,
            1,
            $3,
            $4,
            $5::numeric,
            $6::numeric,
            $7,
            $8,
            $9,
            $10::numeric,
            $11::numeric,
            $12::numeric,
            $13::numeric,
            $14,
            $15::jsonb
          )
          ON CONFLICT (invoice_id, line_number) DO NOTHING
        `,
        [
          randomUUID(),
          invoiceId,
          feeLine.id,
          feeLine.description,
          lineAmounts.quantity,
          lineAmounts.unitAmount,
          feeLine.currency,
          feeLine.currency_precision,
          feeLine.tax_name,
          feeLine.tax_rate,
          lineAmounts.taxAmount,
          lineAmounts.subtotalAmount,
          lineAmounts.totalAmount,
          areaSnapshot.id,
          JSON.stringify({
            source: "fee_schedule_line",
            feeScheduleLineId: feeLine.id,
            applicationAreaSnapshotId: areaSnapshot.id,
            rounding: { currencyPrecision: feeLine.currency_precision }
          })
        ]
      );
      await client.query(
        `
          INSERT INTO payment_states (invoice_id, purchase_order_number, no_purchase_order_declared, manually_marked_paid, override_applied, blocked_for_allocation)
          VALUES ($1, $2, $3, false, false, false)
          ON CONFLICT (invoice_id) DO UPDATE SET
            purchase_order_number = EXCLUDED.purchase_order_number,
            no_purchase_order_declared = EXCLUDED.no_purchase_order_declared,
            updated_at = now()
        `,
        [invoiceId, poNumber, noPurchaseOrderDeclared]
      );
      for (const intent of ["application_submitted_email", "invoice_available_email"] as const) {
        await client.query(
          `
            INSERT INTO payment_notification_intents (id, invoice_id, intent_type)
            VALUES ($1, $2, $3)
            ON CONFLICT (invoice_id, intent_type) DO NOTHING
          `,
          [randomUUID(), invoiceId, intent]
        );
      }
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "SUBMIT_APPLICATION",
          entityType: "application",
          entityId: applicationId,
          actor,
          request: requestMetadata(request, idempotencyKey),
          afterState: { applicationStatus: status, episodeStatus: "PAYMENT_PENDING", invoiceId, documentState: currentDocumentState }
        })
      );
      const invoice = await loadInvoice(client, invoiceId);
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "CREATE_INVOICE_FOR_SUBMISSION",
          entityType: "invoice",
          entityId: invoiceId,
          actor,
          request: requestMetadata(request, idempotencyKey),
          afterState: invoice ? await invoiceSummary(client, invoice) : { invoiceId }
        })
      );
      return this.buildSubmissionResponse(client, applicationId);
    });
  }

  private async buildSubmissionResponse(client: SqlClient, applicationId: string) {
    const application = await loadApplication(client, applicationId);
    if (!application) throw new ApiError("dependency_missing", 404, "Application draft was not found.");
    const invoice = await loadInvoiceByApplication(client, applicationId);
    if (!invoice) throw new ApiError("dependency_missing", 404, "Invoice was not found.");
    const payment = await loadPaymentSummary(client, invoice);
    return applicationSubmissionResponseSchema.parse({
      applicationId,
      episodeId: application.episodeId,
      applicationStatus: application.status,
      episodeStatus: invoice.status === "OVERDUE_BLOCKED" ? "PAYMENT_OVERDUE_BLOCKED" : invoice.status === "PENDING" ? "PAYMENT_PENDING" : "READY_FOR_ALLOCATION",
      submittedAt: application.updatedAt,
      documentState: await documentState(client, applicationId),
      invoice: payment.invoice,
      payment
    });
  }

  async getSubmission(applicationId: string) {
    return this.buildSubmissionResponse(this.client, applicationId);
  }

  async getPaymentSummary(applicationId: string) {
    const invoice = await loadInvoiceByApplication(this.client, applicationId);
    if (!invoice) throw new ApiError("dependency_missing", 404, "Invoice was not found.");
    return loadPaymentSummary(this.client, invoice);
  }

  async updatePurchaseOrder({ applicationId, purchaseOrder, actor, request }: Parameters<ApplicantRepository["updatePurchaseOrder"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const application = await loadApplication(client, applicationId, true);
      if (!application) throw new ApiError("dependency_missing", 404, "Application draft was not found.");
      const invoice = await loadInvoiceByApplication(client, applicationId);
      if (!invoice) throw new ApiError("dependency_missing", 404, "Invoice was not found.");
      await client.query("SELECT invoice_id FROM payment_states WHERE invoice_id = $1 FOR UPDATE", [invoice.id]);
      await client.query(
        `
          UPDATE payment_states
          SET purchase_order_number = $2,
            no_purchase_order_declared = $3,
            updated_at = now()
          WHERE invoice_id = $1
        `,
        [
          invoice.id,
          (purchaseOrder as { purchaseOrderNumber?: string }).purchaseOrderNumber ?? null,
          (purchaseOrder as { noPurchaseOrderDeclared?: boolean }).noPurchaseOrderDeclared ?? false
        ]
      );
      const updated = await loadPaymentSummary(client, invoice);
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "RECORD_PURCHASE_ORDER_PREFERENCE",
          entityType: "invoice",
          entityId: invoice.id,
          actor,
          request: requestMetadata(request),
          afterState: updated.purchaseOrder
        })
      );
      return updated;
    });
  }

  async markPaid({ invoiceId, reason, actor, request, idempotencyKey }: Parameters<ApplicantRepository["markPaid"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const invoice = await loadInvoice(client, invoiceId, true);
      if (!invoice) throw new ApiError("dependency_missing", 404, "Invoice was not found.");
      const application = await loadApplication(client, invoice.application_id, true);
      if (!application) throw new ApiError("dependency_missing", 404, "Application draft was not found.");
      requirePaymentResourceAccess({ actor } as SessionProfile, await this.getOwnershipForPark(application.parkId));
      await client.query("SELECT invoice_id FROM payment_states WHERE invoice_id = $1 FOR UPDATE", [invoiceId]);
      await client.query("UPDATE invoices SET status = 'PAID', paid_at_utc = now(), updated_at = now() WHERE id = $1", [invoiceId]);
      await client.query("UPDATE assessment_episodes SET status = 'READY_FOR_ALLOCATION', updated_at_utc = now() WHERE id = $1", [
        invoice.assessment_episode_id
      ]);
      await client.query(
        `
          UPDATE payment_states
          SET manually_marked_paid = true,
            manual_paid_by_actor_id = $2,
            manual_paid_reason = $3,
            manual_paid_at = now(),
            blocked_for_allocation = false,
            updated_at = now()
          WHERE invoice_id = $1
        `,
        [invoiceId, actor.actorId, reason]
      );
      const audit = buildAuditEvent({
        action: "MARK_PAYMENT_PAID_MANUALLY",
        entityType: "invoice",
        entityId: invoiceId,
        actor,
        request: requestMetadata(request, idempotencyKey),
        afterState: { status: "PAID", episodeStatus: "READY_FOR_ALLOCATION", reason }
      });
      await appendAuditEvent(this.auditLedger, audit);
      await appendPaymentEvent(client, {
        invoice,
        eventType: "manual_mark_paid",
        source: "admin_action",
        paymentMethod: "manual",
        actorId: actor.actorId,
        auditEventId: audit.id,
        notes: reason
      });
      const updatedInvoice = await loadInvoice(client, invoiceId);
      const updated = await loadPaymentSummary(client, updatedInvoice!);
      return {
        invoiceId,
        status: "PAID",
        manuallyMarkedPaid: true,
        overrideApplied: updated.overrideApplied,
        blockedForAllocation: false,
        reason,
        updatedAt: updated.updatedAt
      };
    });
  }

  async overridePaymentBlock({ invoiceId, reason, actor, request, idempotencyKey }: Parameters<ApplicantRepository["overridePaymentBlock"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const invoice = await loadInvoice(client, invoiceId, true);
      if (!invoice) throw new ApiError("dependency_missing", 404, "Invoice was not found.");
      const paymentBefore = await loadPaymentSummary(client, invoice);
      await client.query("SELECT invoice_id FROM payment_states WHERE invoice_id = $1 FOR UPDATE", [invoiceId]);
      await client.query("UPDATE invoices SET status = 'WAIVED', status_reason = $2, updated_at = now() WHERE id = $1", [invoiceId, reason]);
      await client.query("UPDATE assessment_episodes SET status = 'READY_FOR_ALLOCATION', updated_at_utc = now() WHERE id = $1", [
        invoice.assessment_episode_id
      ]);
      await client.query(
        `
          UPDATE payment_states
          SET override_applied = true,
            override_by_actor_id = $2,
            override_reason = $3,
            override_at = now(),
            blocked_for_allocation = false,
            updated_at = now()
          WHERE invoice_id = $1
        `,
        [invoiceId, actor.actorId, reason]
      );
      const audit = buildAuditEvent({
        action: "OVERRIDE_PAYMENT_BLOCK",
        entityType: "invoice",
        entityId: invoiceId,
        actor,
        request: requestMetadata(request, idempotencyKey),
        afterState: { status: "WAIVED", episodeStatus: "READY_FOR_ALLOCATION", reason }
      });
      await appendAuditEvent(this.auditLedger, audit);
      const adminOverrideEvent = buildAdminOverrideEvent({
        overrideType: "PAYMENT_BLOCK_OVERRIDE",
        targetType: "invoice",
        targetId: invoiceId,
        authority: "SUPER_ADMIN",
        reason,
        actor,
        priorState: { status: invoice.status, blockedForAllocation: paymentBefore.blockedForAllocation },
        afterState: { status: "WAIVED", blockedForAllocation: false },
        linkedAuditEventId: audit.id,
        requestId: request.id,
        ...(idempotencyKey ? { correlationId: idempotencyKey } : {})
      });
      await flushAdminOverrideEvents(client, [adminOverrideEvent]);
      await appendPaymentEvent(client, {
        invoice,
        eventType: "payment_override",
        source: "admin_action",
        paymentMethod: "none",
        actorId: actor.actorId,
        auditEventId: audit.id,
        adminOverrideEventId: adminOverrideEvent.id,
        notes: reason
      });
      const updatedInvoice = await loadInvoice(client, invoiceId);
      const updated = await loadPaymentSummary(client, updatedInvoice!);
      return {
        invoiceId,
        status: "WAIVED",
        manuallyMarkedPaid: updated.manuallyMarkedPaid,
        overrideApplied: true,
        blockedForAllocation: false,
        reason,
        updatedAt: updated.updatedAt
      };
    });
  }

  async applyPaymentDeadlineBlocks({ asOf, actor, request, idempotencyKey }: Parameters<ApplicantRepository["applyPaymentDeadlineBlocks"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const due = await client.query<InvoiceRow>(
        `
          SELECT id, application_id, assessment_episode_id, status, amount_marker, due_at, available_in_portal, total_amount::text, currency
          FROM invoices
          WHERE status = 'PENDING' AND due_at < $1::timestamptz
          ORDER BY due_at ASC
          FOR UPDATE SKIP LOCKED
        `,
        [asOf]
      );
      const blockedInvoiceIds: string[] = [];
      for (const invoice of due.rows) {
        await client.query("UPDATE invoices SET status = 'OVERDUE_BLOCKED', updated_at = now() WHERE id = $1", [
          invoice.id
        ]);
        await client.query("UPDATE assessment_episodes SET status = 'PAYMENT_OVERDUE_BLOCKED', updated_at_utc = now() WHERE id = $1", [
          invoice.assessment_episode_id
        ]);
        await client.query("UPDATE payment_states SET blocked_for_allocation = true, updated_at = $2::timestamptz WHERE invoice_id = $1", [
          invoice.id,
          asOf
        ]);
        const audit = buildAuditEvent({
          action: "APPLY_PAYMENT_OVERDUE_BLOCK",
          entityType: "invoice",
          entityId: invoice.id,
          actor,
          request: requestMetadata(request, idempotencyKey),
          afterState: { status: "OVERDUE_BLOCKED", episodeStatus: "PAYMENT_OVERDUE_BLOCKED", blockedForAllocation: true }
        });
        await appendAuditEvent(this.auditLedger, audit);
        await appendPaymentEvent(client, {
          invoice,
          eventType: "deadline_block_applied",
          source: "system_job",
          paymentMethod: "none",
          actorId: actor.actorId,
          auditEventId: audit.id,
          occurredAt: asOf
        });
        blockedInvoiceIds.push(invoice.id);
      }
      return paymentDeadlineCheckResponseSchema.parse({ checkedAt: asOf, blockedInvoiceIds });
    });
  }
}
