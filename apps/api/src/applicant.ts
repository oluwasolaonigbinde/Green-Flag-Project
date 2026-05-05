import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { z } from "zod";
import {
  applicantDashboardFixture,
  applicantDashboardResponseSchema,
  applicationDocumentsFixture,
  applicationDocumentsResponseSchema,
  applicationDraftFixture,
  applicationDraftResponseSchema,
  applicationSubmissionResponseSchema,
  autosaveApplicationSectionRequestSchema,
  autosaveApplicationSectionResponseSchema,
  acknowledgeDocumentChunkRequestSchema,
  adminPaymentActionRequestSchema,
  adminPaymentActionResponseSchema,
  completeDocumentUploadRequestSchema,
  completeDocumentUploadResponseSchema,
  createDocumentUploadSessionRequestSchema,
  createApplicationRequestSchema,
  currentManagementPlanDocumentFixture,
  documentChunkAcknowledgementSchema,
  documentUploadSessionSchema,
  documentVersionsResponseSchema,
  paymentDeadlineCheckRequestSchema,
  paymentDeadlineCheckResponseSchema,
  paymentSummaryResponseSchema,
  pendingInvoiceFixture,
  signedDocumentAccessResponseSchema,
  previousFeedbackResponseDraftSchema,
  previousFeedbackResponseRequestSchema,
  submitApplicationRequestSchema,
  type ApplicationStatus
} from "@green-flag/contracts";
import {
  lowerEnvironmentAwardCycle2026Fixture,
  lowerEnvironmentOrganisationFixture,
  lowerEnvironmentParkFixture,
  scopedAdminRoleAssignmentFixture
} from "@green-flag/contracts";
import {
  requireApplicantResourceAccess,
  requirePaymentResourceAccess,
  type ResourceOwnership
} from "./authorization.js";
import {
  ApiError,
  appendAuditEvent,
  type AuditEvent,
  type AuditLedger,
  type SessionProfile,
  type SessionResolver
} from "./auth.js";
import { buildAdminOverrideEvent, type AdminOverrideEvent } from "./overrides.js";
import {
  redactApplicantDashboardForSession,
  redactApplicantDocumentsForSession,
  redactSignedDocumentAccessForSession
} from "./redaction.js";

type ApplicationRecord = typeof applicationDraftFixture;
type DocumentRecord = typeof currentManagementPlanDocumentFixture;
type UploadSessionRecord = z.infer<typeof documentUploadSessionSchema>;
type InvoiceRecord = typeof pendingInvoiceFixture;
type PaymentRecord = z.infer<typeof paymentSummaryResponseSchema>;

export interface ApplicantStore {
  applications: Map<string, ApplicationRecord>;
  documents: Map<string, DocumentRecord>;
  uploadSessions: Map<string, UploadSessionRecord>;
  invoices: Map<string, InvoiceRecord>;
  payments: Map<string, PaymentRecord>;
  episodeStatuses: Map<string, z.infer<typeof applicationSubmissionResponseSchema>["episodeStatus"]>;
  parkOwnerships: Map<string, ResourceOwnership>;
  audits: AuditEvent[];
  overrideEvents: AdminOverrideEvent[];
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export function createApplicantStore(): ApplicantStore {
  const store: ApplicantStore = {
    applications: new Map([[applicationDraftFixture.applicationId, structuredClone(applicationDraftFixture)]]),
    documents: new Map([[currentManagementPlanDocumentFixture.documentId, structuredClone(currentManagementPlanDocumentFixture)]]),
    uploadSessions: new Map(),
    invoices: new Map(),
    payments: new Map(),
    episodeStatuses: new Map([[applicationDraftFixture.episodeId, "APPLICATION_DRAFT"]]),
    parkOwnerships: new Map([
      [
        applicationDraftFixture.parkId,
        {
          parkId: applicationDraftFixture.parkId,
          organisationId: lowerEnvironmentOrganisationFixture.id,
          countryCode: lowerEnvironmentAwardCycle2026Fixture.countryCode,
          ...(scopedAdminRoleAssignmentFixture.scope.id
            ? { countryScopeId: scopedAdminRoleAssignmentFixture.scope.id }
            : {})
        }
      ],
      [
        lowerEnvironmentParkFixture.id,
        {
          parkId: lowerEnvironmentParkFixture.id,
          organisationId: lowerEnvironmentOrganisationFixture.id,
          countryCode: lowerEnvironmentAwardCycle2026Fixture.countryCode,
          ...(scopedAdminRoleAssignmentFixture.scope.id
            ? { countryScopeId: scopedAdminRoleAssignmentFixture.scope.id }
            : {})
        }
      ]
    ]),
    audits: [],
    overrideEvents: [],
    async withTransaction(work) {
      const snapshot = {
        applications: structuredClone([...store.applications.entries()]),
        documents: structuredClone([...store.documents.entries()]),
        uploadSessions: structuredClone([...store.uploadSessions.entries()]),
        invoices: structuredClone([...store.invoices.entries()]),
        payments: structuredClone([...store.payments.entries()]),
        episodeStatuses: structuredClone([...store.episodeStatuses.entries()]),
        audits: structuredClone(store.audits),
        overrideEvents: structuredClone(store.overrideEvents)
      };
      try {
        return await work();
      } catch (error) {
        store.applications = new Map(snapshot.applications);
        store.documents = new Map(snapshot.documents);
        store.uploadSessions = new Map(snapshot.uploadSessions);
        store.invoices = new Map(snapshot.invoices);
        store.payments = new Map(snapshot.payments);
        store.episodeStatuses = new Map(snapshot.episodeStatuses);
        store.audits = snapshot.audits;
        store.overrideEvents = snapshot.overrideEvents;
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
  entityType = "application",
  entityId,
  actor,
  request,
  beforeState,
  afterState
}: {
  action: string;
  entityType?: string;
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
    entityType,
    entityId,
    beforeState,
    afterState,
    request,
    createdAt: new Date().toISOString()
  };
}

function ownershipForPark(store: ApplicantStore, parkId: string) {
  const ownership = store.parkOwnerships.get(parkId);
  if (!ownership) {
    throw new ApiError("dependency_missing", 404, "Park ownership metadata was not found.");
  }
  return ownership;
}

function requireApplicantScope(store: ApplicantStore, session: SessionProfile, parkId: string) {
  requireApplicantResourceAccess(session, ownershipForPark(store, parkId));
}

function sectionCompletion(fields: Record<string, unknown>) {
  return Object.values(fields).filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }).length > 0
    ? 100
    : 0;
}

function recalculate(application: ApplicationRecord) {
  const total = application.sections.reduce((sum, section) => sum + section.completionPercent, 0);
  const completionPercent = Math.round(total / application.sections.length);
  const status: ApplicationStatus =
    completionPercent >= 100 ? "READY_TO_SUBMIT" : completionPercent > 0 ? "IN_PROGRESS" : "DRAFT";
  application.completionPercent = completionPercent;
  application.status = status;
  application.displayStatus =
    status === "READY_TO_SUBMIT" ? "IN_PROGRESS" : status === "DRAFT" ? "DRAFT" : "IN_PROGRESS";
  application.version += 1;
  application.updatedAt = new Date().toISOString();
}

function documentCompletion(documents: DocumentRecord[], application: ApplicationRecord) {
  const currentManagementPlan = documents.find(
    (document) =>
      document.applicationId === application.applicationId &&
      document.documentType === "management_plan" &&
      document.isCurrent &&
      document.status === "AVAILABLE"
  );
  return currentManagementPlan ? "complete" : "missing_required";
}

function applicationDocuments(store: ApplicantStore, application: ApplicationRecord) {
  const documents = [...store.documents.values()].filter(
    (document) => document.applicationId === application.applicationId
  );
  const currentManagementPlan = documents.find(
    (document) => document.documentType === "management_plan" && document.isCurrent
  );
  const archivedManagementPlans = documents.filter(
    (document) => document.documentType === "management_plan" && !document.isCurrent
  );

  return applicationDocumentsResponseSchema.parse({
    ...applicationDocumentsFixture,
    applicationId: application.applicationId,
    episodeId: application.episodeId,
    parkId: application.parkId,
    documentCompletionStatus: documentCompletion(documents, application),
    slots: applicationDocumentsFixture.slots.map((slot) => {
      if (slot.documentType !== "management_plan") {
        return {
          ...slot,
          currentDocument: undefined,
          completionStatus: "missing",
          archivedVersionCount: 0
        };
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

function requireApplication(store: ApplicantStore, applicationId: string) {
  const application = store.applications.get(applicationId);
  if (!application) {
    throw new ApiError("dependency_missing", 404, "Application draft was not found.");
  }
  return application;
}

function applicationInvoice(store: ApplicantStore, applicationId: string) {
  return [...store.invoices.values()].find((invoice) => invoice.applicationId === applicationId);
}

function requireInvoice(store: ApplicantStore, invoiceId: string) {
  const invoice = store.invoices.get(invoiceId);
  if (!invoice) {
    throw new ApiError("dependency_missing", 404, "Invoice was not found.");
  }
  return invoice;
}

function applicationDocumentState(store: ApplicantStore, applicationId: string): "management_plan_uploaded" | "management_plan_missing" {
  const documents = [...store.documents.values()].filter((document) => document.applicationId === applicationId);
  return documents.some(
    (document) => document.documentType === "management_plan" && document.isCurrent && document.status === "AVAILABLE"
  )
    ? "management_plan_uploaded"
    : "management_plan_missing";
}

function chunkProgress(acceptedChunks: number[], totalChunks: number) {
  return Math.round((acceptedChunks.length / totalChunks) * 100);
}

export function registerApplicantRoutes(
  app: FastifyInstance,
  {
    resolveSession,
    store,
    auditLedger = defaultAuditLedger
  }: {
    resolveSession: SessionResolver;
    store: ApplicantStore;
    auditLedger?: AuditLedger;
  }
) {
  async function audit(event: AuditEvent) {
    store.audits.push(await appendAuditEvent(auditLedger, event));
    return event.id;
  }

  app.get("/api/v1/applicant/dashboard", async (request) => {
    const session = await resolveSession(request);
    const visibleItems = applicantDashboardFixture.items.filter((item) =>
      item.parkId ? session.actor.scopes.some((scope) =>
        scope.type === "GLOBAL" ||
        scope.id === item.parkId ||
        (scope.type === "ORGANISATION" && scope.id === ownershipForPark(store, item.parkId).organisationId)
      ) : true
    );
    return redactApplicantDashboardForSession(
      applicantDashboardResponseSchema.parse({ items: visibleItems }),
      session
    );
  });

  app.post("/api/v1/applicant/applications", async (request, reply) => {
    const session = await resolveSession(request);
    const input = createApplicationRequestSchema.parse(request.body);
    requireApplicantScope(store, session, input.parkId);

    const existing = [...store.applications.values()].find(
      (application) => application.episodeId === input.episodeId
    );
    if (existing) {
      return applicationDraftResponseSchema.parse(existing);
    }

    const created = applicationDraftResponseSchema.parse({
      ...applicationDraftFixture,
      applicationId: randomUUID(),
      parkId: input.parkId,
      episodeId: input.episodeId,
      status: "DRAFT",
      displayStatus: "DRAFT",
      completionPercent: 0,
      version: 0,
      updatedAt: new Date().toISOString(),
      sections: applicationDraftFixture.sections.map((section) => ({
        ...section,
        status: "not_started",
        completionPercent: 0,
        version: 0,
        fields: {}
      }))
    });
    await store.withTransaction(async () => {
      store.applications.set(created.applicationId, created);
      store.episodeStatuses.set(created.episodeId, "APPLICATION_DRAFT");
      await audit(
        buildAuditEvent({
          action: "CREATE_OR_CONTINUE_APPLICATION",
          entityId: created.applicationId,
          actor: session.actor,
          request: requestMetadata(request, input.idempotencyKey),
          afterState: {
            applicationId: created.applicationId,
            episodeId: created.episodeId,
            status: created.status
          }
        })
      );
    });

    reply.status(201);
    return created;
  });

  app.get("/api/v1/applicant/applications/:applicationId", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    return applicationDraftResponseSchema.parse(application);
  });

  app.patch("/api/v1/applicant/applications/:applicationId/sections/:sectionKey", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; sectionKey: string };
    const input = autosaveApplicationSectionRequestSchema.parse(request.body);
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    if (input.clientVersion !== application.version) {
      throw new ApiError("idempotency_conflict", 409, "Application draft version has changed.");
    }

    const section = application.sections.find((candidate) => candidate.sectionKey === params.sectionKey);
    if (!section) {
      throw new ApiError("validation_failed", 400, "Unknown application section.");
    }
    const beforeState = { version: application.version, section };
    section.fields = input.fields;
    section.completionPercent = sectionCompletion(input.fields);
    section.status = section.completionPercent === 100 ? "complete" : "in_progress";
    section.version += 1;
    section.updatedAt = new Date().toISOString();
    recalculate(application);

    await audit(
      buildAuditEvent({
        action: "AUTOSAVE_APPLICATION_SECTION",
        entityId: application.applicationId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        beforeState,
        afterState: {
          version: application.version,
          sectionKey: section.sectionKey,
          completionPercent: application.completionPercent
        }
      })
    );

    return autosaveApplicationSectionResponseSchema.parse({
      applicationId: application.applicationId,
      section,
      applicationStatus: application.status,
      completionPercent: application.completionPercent,
      version: application.version
    });
  });

  app.post("/api/v1/applicant/applications/:applicationId/previous-feedback-response", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const input = previousFeedbackResponseRequestSchema.parse(request.body);
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    if (input.clientVersion !== application.version) {
      throw new ApiError("idempotency_conflict", 409, "Application draft version has changed.");
    }
    application.version += 1;
    application.updatedAt = new Date().toISOString();

    const response = previousFeedbackResponseDraftSchema.parse({
      applicationId: application.applicationId,
      responseText: input.responseText,
      version: application.version,
      updatedAt: application.updatedAt
    });

    await audit(
      buildAuditEvent({
        action: "RECORD_PREVIOUS_FEEDBACK_RESPONSE_DRAFT",
        entityId: application.applicationId,
        actor: session.actor,
        request: requestMetadata(request),
        afterState: response
      })
    );

    return response;
  });

  app.get("/api/v1/applicant/applications/:applicationId/documents", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    return redactApplicantDocumentsForSession(applicationDocuments(store, application), session);
  });

  app.post("/api/v1/applicant/applications/:applicationId/documents/upload-sessions", async (request, reply) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const application = requireApplication(store, params.applicationId);
    const input = createDocumentUploadSessionRequestSchema.parse(request.body);
    requireApplicantScope(store, session, application.parkId);

    const existing = [...store.uploadSessions.values()].find(
      (candidate) =>
        candidate.applicationId === application.applicationId &&
        candidate.sha256 === input.sha256 &&
        candidate.documentType === input.documentType &&
        candidate.status !== "COMPLETED"
    );
    if (existing) {
      return documentUploadSessionSchema.parse(existing);
    }

    const created = documentUploadSessionSchema.parse({
      sessionId: randomUUID(),
      applicationId: application.applicationId,
      documentType: input.documentType,
      filename: input.filename,
      contentType: input.contentType,
      byteSize: input.byteSize,
      sha256: input.sha256,
      totalChunks: input.totalChunks,
      acceptedChunks: [],
      status: "CREATED",
      progressPercent: 0,
      uploadUrlTemplate: `https://lower-env-storage.invalid/upload/${application.applicationId}/${input.documentType}/{chunkIndex}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      version: 0
    });
    store.uploadSessions.set(created.sessionId, created);

    await audit(
      buildAuditEvent({
        action: "CREATE_DOCUMENT_UPLOAD_SESSION",
        entityType: "document_upload_session",
        entityId: created.sessionId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        afterState: {
          applicationId: application.applicationId,
          documentType: created.documentType,
          byteSize: created.byteSize,
          sha256: created.sha256
        }
      })
    );

    reply.status(201);
    return created;
  });

  app.patch("/api/v1/applicant/applications/:applicationId/documents/upload-sessions/:sessionId/chunks/:chunkIndex", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; sessionId: string; chunkIndex: string };
    const application = requireApplication(store, params.applicationId);
    const input = acknowledgeDocumentChunkRequestSchema.parse(request.body);
    requireApplicantScope(store, session, application.parkId);

    const uploadSession = store.uploadSessions.get(params.sessionId);
    if (!uploadSession || uploadSession.applicationId !== application.applicationId) {
      throw new ApiError("dependency_missing", 404, "Document upload session was not found.");
    }
    if (input.clientVersion !== uploadSession.version) {
      throw new ApiError("idempotency_conflict", 409, "Document upload session version has changed.");
    }

    const chunkIndex = Number(params.chunkIndex);
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= uploadSession.totalChunks) {
      throw new ApiError("validation_failed", 400, "Invalid document chunk index.");
    }

    const beforeState = { version: uploadSession.version, acceptedChunks: [...uploadSession.acceptedChunks] };
    if (!uploadSession.acceptedChunks.includes(chunkIndex)) {
      uploadSession.acceptedChunks.push(chunkIndex);
      uploadSession.acceptedChunks.sort((left, right) => left - right);
      uploadSession.version += 1;
      uploadSession.progressPercent = chunkProgress(uploadSession.acceptedChunks, uploadSession.totalChunks);
      uploadSession.status =
        uploadSession.acceptedChunks.length === uploadSession.totalChunks ? "READY_TO_COMPLETE" : "IN_PROGRESS";
    }

    await audit(
      buildAuditEvent({
        action: "ACKNOWLEDGE_DOCUMENT_UPLOAD_CHUNK",
        entityType: "document_upload_session",
        entityId: uploadSession.sessionId,
        actor: session.actor,
        request: requestMetadata(request, input.idempotencyKey),
        beforeState,
        afterState: {
          version: uploadSession.version,
          acceptedChunkIndex: chunkIndex,
          progressPercent: uploadSession.progressPercent
        }
      })
    );

    return documentChunkAcknowledgementSchema.parse({
      sessionId: uploadSession.sessionId,
      acceptedChunkIndex: chunkIndex,
      status: uploadSession.status,
      progressPercent: uploadSession.progressPercent,
      version: uploadSession.version
    });
  });

  app.post("/api/v1/applicant/applications/:applicationId/documents/upload-sessions/:sessionId/complete", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; sessionId: string };
    const application = requireApplication(store, params.applicationId);
    const input = completeDocumentUploadRequestSchema.parse(request.body);
    requireApplicantScope(store, session, application.parkId);

    const uploadSession = store.uploadSessions.get(params.sessionId);
    if (!uploadSession || uploadSession.applicationId !== application.applicationId) {
      throw new ApiError("dependency_missing", 404, "Document upload session was not found.");
    }
    if (input.clientVersion !== uploadSession.version) {
      throw new ApiError("idempotency_conflict", 409, "Document upload session version has changed.");
    }
    if (input.sha256 !== uploadSession.sha256 || input.byteSize !== uploadSession.byteSize) {
      throw new ApiError("validation_failed", 400, "Completed document metadata does not match upload session.");
    }
    if (uploadSession.acceptedChunks.length !== uploadSession.totalChunks) {
      throw new ApiError("conflict", 409, "Document upload session is not ready to complete.");
    }

    const duplicate = [...store.documents.values()].find(
      (document) => document.applicationId === application.applicationId && document.sha256 === input.sha256
    );
    if (duplicate) {
      uploadSession.status = "COMPLETED";
      uploadSession.version += 1;
      return completeDocumentUploadResponseSchema.parse({
        applicationId: application.applicationId,
        document: duplicate,
        duplicateOfDocumentId: duplicate.documentId
      });
    }

    const previousCurrent = [...store.documents.values()].find(
      (document) =>
        document.applicationId === application.applicationId &&
        document.documentType === uploadSession.documentType &&
        document.isCurrent
    );
    const documentId = randomUUID();
    if (previousCurrent) {
      previousCurrent.isCurrent = false;
      previousCurrent.status = "ARCHIVED";
      previousCurrent.replacedByDocumentId = documentId;
      previousCurrent.updatedAt = new Date().toISOString();
    }

    const created = completeDocumentUploadResponseSchema.shape.document.parse({
      documentId,
      applicationId: application.applicationId,
      episodeId: application.episodeId,
      parkId: application.parkId,
      documentType: uploadSession.documentType,
      filename: uploadSession.filename,
      contentType: uploadSession.contentType,
      byteSize: uploadSession.byteSize,
      sha256: uploadSession.sha256,
      storageProvider: "lower_env_stub",
      storageKey: input.storageKey,
      status: "AVAILABLE",
      visibility: "APPLICANT_AND_ADMIN",
      version: previousCurrent ? previousCurrent.version + 1 : 1,
      isCurrent: true,
      replacesDocumentId: previousCurrent?.documentId,
      uploadedByActorId: session.actor.actorId,
      scanStatus: "clean_stub",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    store.documents.set(created.documentId, created);
    uploadSession.status = "COMPLETED";
    uploadSession.version += 1;

    await audit(
      buildAuditEvent({
        action: "COMPLETE_DOCUMENT_UPLOAD",
        entityType: "document",
        entityId: created.documentId,
        actor: session.actor,
        request: requestMetadata(request),
        beforeState: previousCurrent
          ? { previousCurrentDocumentId: previousCurrent.documentId, version: previousCurrent.version }
          : undefined,
        afterState: {
          applicationId: application.applicationId,
          documentId: created.documentId,
          documentType: created.documentType,
          sha256: created.sha256,
          archivedDocumentId: previousCurrent?.documentId
        }
      })
    );

    return completeDocumentUploadResponseSchema.parse({
      applicationId: application.applicationId,
      document: created,
      archivedDocumentId: previousCurrent?.documentId
    });
  });

  app.get("/api/v1/applicant/applications/:applicationId/documents/:documentId/access", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; documentId: string };
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);

    const document = store.documents.get(params.documentId);
    if (!document || document.applicationId !== application.applicationId) {
      throw new ApiError("dependency_missing", 404, "Document was not found.");
    }
    if (document.visibility === "MYSTERY_RESTRICTED" || document.visibility === "ADMIN_ONLY") {
      throw new ApiError("forbidden", 403, "Document is not visible to the applicant.");
    }

    return redactSignedDocumentAccessForSession(signedDocumentAccessResponseSchema.parse({
      documentId: document.documentId,
      method: "GET",
      url: `https://lower-env-storage.invalid/download/${document.documentId}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      filename: document.filename,
      contentType: document.contentType,
      visibility: document.visibility
    }), session);
  });

  app.get("/api/v1/applicant/applications/:applicationId/documents/:documentId/versions", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; documentId: string };
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);

    const document = store.documents.get(params.documentId);
    if (!document || document.applicationId !== application.applicationId) {
      throw new ApiError("dependency_missing", 404, "Document was not found.");
    }

    return documentVersionsResponseSchema.parse({
      applicationId: application.applicationId,
      documentType: document.documentType,
      versions: [...store.documents.values()]
        .filter(
          (candidate) =>
            candidate.applicationId === application.applicationId &&
            candidate.documentType === document.documentType
        )
        .sort((left, right) => right.version - left.version)
    });
  });

  app.post("/api/v1/applicant/applications/:applicationId/submit", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const application = requireApplication(store, params.applicationId);
    const input = submitApplicationRequestSchema.parse(request.body);
    requireApplicantScope(store, session, application.parkId);
    if (["SUBMITTED", "SUBMITTED_WITH_MISSING_PLAN"].includes(application.status)) {
      const invoice = applicationInvoice(store, application.applicationId);
      const payment = invoice ? store.payments.get(invoice.invoiceId) : undefined;
      if (input.idempotencyKey && invoice && payment) {
        return applicationSubmissionResponseSchema.parse({
          applicationId: application.applicationId,
          episodeId: application.episodeId,
          applicationStatus: application.status,
          episodeStatus: store.episodeStatuses.get(application.episodeId) ?? "PAYMENT_PENDING",
          submittedAt: application.updatedAt,
          documentState: applicationDocumentState(store, application.applicationId),
          invoice,
          payment
        });
      }
      throw new ApiError("conflict", 409, "Application has already been submitted.");
    }
    if (input.clientVersion !== application.version) {
      throw new ApiError("idempotency_conflict", 409, "Application draft version has changed.");
    }

    const documentState = applicationDocumentState(store, application.applicationId);
    const hasPlan = documentState === "management_plan_uploaded";
    let createdInvoice: InvoiceRecord;
    let payment: PaymentRecord;
    await store.withTransaction(async () => {
      application.status = hasPlan ? "SUBMITTED" : "SUBMITTED_WITH_MISSING_PLAN";
      application.displayStatus = "SUBMITTED";
      application.version += 1;
      application.updatedAt = new Date().toISOString();
      store.episodeStatuses.set(application.episodeId, "PAYMENT_PENDING");

      const invoice = applicationInvoice(store, application.applicationId) ?? pendingInvoiceFixture;
      createdInvoice = {
        ...invoice,
        invoiceId: invoice.invoiceId === pendingInvoiceFixture.invoiceId ? randomUUID() : invoice.invoiceId,
        applicationId: application.applicationId,
        episodeId: application.episodeId,
        status: "PENDING" as const,
        notificationIntents: ["application_submitted_email", "invoice_available_email"] satisfies InvoiceRecord["notificationIntents"]
      };
      store.invoices.set(createdInvoice.invoiceId, createdInvoice);

      payment = paymentSummaryResponseSchema.parse({
        applicationId: application.applicationId,
        invoice: createdInvoice,
        purchaseOrder: input.purchaseOrder,
        manuallyMarkedPaid: false,
        overrideApplied: false,
        blockedForAllocation: false,
        updatedAt: application.updatedAt
      });
      store.payments.set(createdInvoice.invoiceId, payment);

      await audit(
        buildAuditEvent({
          action: "SUBMIT_APPLICATION",
          entityType: "application",
          entityId: application.applicationId,
          actor: session.actor,
          request: requestMetadata(request, input.idempotencyKey),
          afterState: {
            applicationStatus: application.status,
            episodeStatus: "PAYMENT_PENDING",
            invoiceId: createdInvoice.invoiceId,
            documentState: hasPlan ? "management_plan_uploaded" : "management_plan_missing"
          }
        })
      );
      await audit(
        buildAuditEvent({
          action: "CREATE_INVOICE_FOR_SUBMISSION",
          entityType: "invoice",
          entityId: createdInvoice.invoiceId,
          actor: session.actor,
          request: requestMetadata(request, input.idempotencyKey),
          afterState: createdInvoice
        })
      );
    });

    return applicationSubmissionResponseSchema.parse({
      applicationId: application.applicationId,
      episodeId: application.episodeId,
      applicationStatus: application.status,
      episodeStatus: store.episodeStatuses.get(application.episodeId) ?? "PAYMENT_PENDING",
      submittedAt: application.updatedAt,
      documentState,
      invoice: createdInvoice!,
      payment: payment!
    });
  });

  app.get("/api/v1/applicant/applications/:applicationId/submission", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    const invoice = applicationInvoice(store, application.applicationId);
    if (!invoice) {
      throw new ApiError("dependency_missing", 404, "Invoice was not found.");
    }
    const payment = store.payments.get(invoice.invoiceId);
    if (!payment) {
      throw new ApiError("dependency_missing", 404, "Payment state was not found.");
    }
    return applicationSubmissionResponseSchema.parse({
      applicationId: application.applicationId,
      episodeId: application.episodeId,
      applicationStatus: application.status,
      episodeStatus: store.episodeStatuses.get(application.episodeId) ?? "PAYMENT_PENDING",
      submittedAt: application.updatedAt,
      documentState: applicationDocumentState(store, application.applicationId),
      invoice,
      payment
    });
  });

  app.get("/api/v1/applicant/applications/:applicationId/payment-summary", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    const invoice = applicationInvoice(store, application.applicationId);
    if (!invoice) {
      throw new ApiError("dependency_missing", 404, "Invoice was not found.");
    }
    const payment = store.payments.get(invoice.invoiceId);
    if (!payment) {
      throw new ApiError("dependency_missing", 404, "Payment state was not found.");
    }
    return paymentSummaryResponseSchema.parse(payment);
  });

  app.patch("/api/v1/applicant/applications/:applicationId/purchase-order", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const application = requireApplication(store, params.applicationId);
    const input = submitApplicationRequestSchema.shape.purchaseOrder.parse(request.body);
    requireApplicantScope(store, session, application.parkId);
    const invoice = applicationInvoice(store, application.applicationId);
    if (!invoice) {
      throw new ApiError("dependency_missing", 404, "Invoice was not found.");
    }
    const payment = store.payments.get(invoice.invoiceId);
    if (!payment) {
      throw new ApiError("dependency_missing", 404, "Payment state was not found.");
    }
    const updated = paymentSummaryResponseSchema.parse({
      ...payment,
      purchaseOrder: input,
      updatedAt: new Date().toISOString()
    });
    store.payments.set(invoice.invoiceId, updated);
    await audit(
      buildAuditEvent({
        action: "RECORD_PURCHASE_ORDER_PREFERENCE",
        entityType: "invoice",
        entityId: invoice.invoiceId,
        actor: session.actor,
        request: requestMetadata(request),
        afterState: updated.purchaseOrder
      })
    );
    return updated;
  });

  app.post("/api/v1/admin/payments/:invoiceId/mark-paid", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { invoiceId: string };
    const input = adminPaymentActionRequestSchema.parse(request.body);
    const invoice = requireInvoice(store, params.invoiceId);
    const application = requireApplication(store, invoice.applicationId);
    requirePaymentResourceAccess(session, ownershipForPark(store, application.parkId));
    const payment = store.payments.get(invoice.invoiceId);
    if (!payment) {
      throw new ApiError("dependency_missing", 404, "Payment state was not found.");
    }
    let updated: PaymentRecord;
    await store.withTransaction(async () => {
      invoice.status = "PAID";
      store.episodeStatuses.set(invoice.episodeId, "READY_FOR_ALLOCATION");
      updated = paymentSummaryResponseSchema.parse({
        ...payment,
        invoice,
        manuallyMarkedPaid: true,
        blockedForAllocation: false,
        updatedAt: new Date().toISOString()
      });
      store.payments.set(invoice.invoiceId, updated);
      await audit(
        buildAuditEvent({
          action: "MARK_PAYMENT_PAID_MANUALLY",
          entityType: "invoice",
          entityId: invoice.invoiceId,
          actor: session.actor,
          request: requestMetadata(request, input.idempotencyKey),
          afterState: { status: invoice.status, episodeStatus: "READY_FOR_ALLOCATION", reason: input.reason }
        })
      );
    });
    return adminPaymentActionResponseSchema.parse({
      invoiceId: invoice.invoiceId,
      status: invoice.status,
      manuallyMarkedPaid: true,
      overrideApplied: updated!.overrideApplied,
      blockedForAllocation: false,
      reason: input.reason,
      updatedAt: updated!.updatedAt
    });
  });

  app.post("/api/v1/admin/payments/:invoiceId/override-block", async (request) => {
    const session = await resolveSession(request);
    if (session.actor.role !== "SUPER_ADMIN") {
      throw new ApiError("forbidden", 403, "Payment block override requires super admin access.");
    }
    const params = request.params as { invoiceId: string };
    const input = adminPaymentActionRequestSchema.parse(request.body);
    const invoice = requireInvoice(store, params.invoiceId);
    const application = requireApplication(store, invoice.applicationId);
    requirePaymentResourceAccess(session, ownershipForPark(store, application.parkId));
    const payment = store.payments.get(invoice.invoiceId);
    if (!payment) {
      throw new ApiError("dependency_missing", 404, "Payment state was not found.");
    }
    let updated: PaymentRecord;
    await store.withTransaction(async () => {
      const priorState = { status: invoice.status, blockedForAllocation: payment.blockedForAllocation };
      invoice.status = "WAIVED";
      store.episodeStatuses.set(invoice.episodeId, "READY_FOR_ALLOCATION");
      updated = paymentSummaryResponseSchema.parse({
        ...payment,
        invoice,
        overrideApplied: true,
        blockedForAllocation: false,
        updatedAt: new Date().toISOString()
      });
      store.payments.set(invoice.invoiceId, updated);
      const auditId = await audit(
        buildAuditEvent({
          action: "OVERRIDE_PAYMENT_BLOCK",
          entityType: "invoice",
          entityId: invoice.invoiceId,
          actor: session.actor,
          request: requestMetadata(request, input.idempotencyKey),
          afterState: { status: invoice.status, episodeStatus: "READY_FOR_ALLOCATION", reason: input.reason }
        })
      );
      store.overrideEvents.push(buildAdminOverrideEvent({
        overrideType: "PAYMENT_BLOCK_OVERRIDE",
        targetType: "invoice",
        targetId: invoice.invoiceId,
        authority: "SUPER_ADMIN",
        reason: input.reason,
        actor: session.actor,
        priorState,
        afterState: { status: invoice.status, blockedForAllocation: false },
        linkedAuditEventId: auditId,
        requestId: request.id,
        ...(input.idempotencyKey ? { correlationId: input.idempotencyKey } : {})
      }));
    });
    return adminPaymentActionResponseSchema.parse({
      invoiceId: invoice.invoiceId,
      status: invoice.status,
      manuallyMarkedPaid: updated!.manuallyMarkedPaid,
      overrideApplied: true,
      blockedForAllocation: false,
      reason: input.reason,
      updatedAt: updated!.updatedAt
    });
  });

  app.post("/api/v1/admin/payments/deadline-check", async (request) => {
    const session = await resolveSession(request);
    if (!["FINANCE_ADMIN", "SUPER_ADMIN"].includes(session.actor.role)) {
      throw new ApiError("forbidden", 403, "Payment deadline checks require finance or super admin access.");
    }
    const input = paymentDeadlineCheckRequestSchema.parse(request.body);
    const blockedInvoiceIds: string[] = [];
    for (const [invoiceId, invoice] of store.invoices) {
      const payment = store.payments.get(invoiceId);
      if (!payment || invoice.status !== "PENDING" || new Date(invoice.dueAt) >= new Date(input.asOf)) {
        continue;
      }
      await store.withTransaction(async () => {
        invoice.status = "OVERDUE_BLOCKED";
        store.episodeStatuses.set(invoice.episodeId, "PAYMENT_OVERDUE_BLOCKED");
        const updated = paymentSummaryResponseSchema.parse({
          ...payment,
          invoice,
          blockedForAllocation: true,
          updatedAt: input.asOf
        });
        store.payments.set(invoiceId, updated);
        blockedInvoiceIds.push(invoiceId);
        await audit(
          buildAuditEvent({
            action: "APPLY_PAYMENT_OVERDUE_BLOCK",
            entityType: "invoice",
            entityId: invoiceId,
            actor: session.actor,
            request: requestMetadata(request, input.idempotencyKey),
            afterState: { status: invoice.status, episodeStatus: "PAYMENT_OVERDUE_BLOCKED", blockedForAllocation: true }
          })
        );
      });
    }
    return paymentDeadlineCheckResponseSchema.parse({
      checkedAt: input.asOf,
      blockedInvoiceIds
    });
  });
}
