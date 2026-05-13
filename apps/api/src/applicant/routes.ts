
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  applicantDashboardFixture,
  applicantDashboardResponseSchema,
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
  createApplicationRequestSchema,
  createDocumentUploadSessionRequestSchema,
  documentAssetSchema,
  documentChunkAcknowledgementSchema,
  documentUploadSessionSchema,
  documentVersionsResponseSchema,
  paymentDeadlineCheckRequestSchema,
  paymentDeadlineCheckResponseSchema,
  paymentSummaryResponseSchema,
  pendingInvoiceFixture,
  previousFeedbackResponseDraftSchema,
  previousFeedbackResponseRequestSchema,
  signedDocumentAccessResponseSchema,
  submitApplicationRequestSchema
} from "@green-flag/contracts";
import { requireApplicantResourceAccess, requirePaymentResourceAccess } from "../authorization.js";
import {
  ApiError,
  appendAuditEvent,
  type AuditEvent,
  type AuditLedger,
  type SessionResolver
} from "../auth.js";
import { buildAdminOverrideEvent } from "../overrides.js";
import {
  redactApplicantDashboardForSession,
  redactApplicantDocumentsForSession,
  redactSignedDocumentAccessForSession
} from "../redaction.js";
import { buildAuditEvent, defaultAuditLedger, requestMetadata } from "./audit.js";
import { recalculate, requireApplication, sectionCompletion } from "./application.service.js";
import { applicationDocumentState, applicationDocuments, chunkProgress } from "./documents.service.js";
import { applicationInvoice, requireInvoice } from "./payments.service.js";
import { ownershipForPark, requireApplicantScope } from "./policies.js";
import type { ApplicantStore, InvoiceRecord, PaymentRecord } from "./store.js";
import type { ApplicantRepository } from "../postgres-domain-stores/applicant-repository.js";

export function registerApplicantRoutes(
  app: FastifyInstance,
  {
    resolveSession,
    store,
    repository,
    auditLedger = defaultAuditLedger
  }: {
    resolveSession: SessionResolver;
    store?: ApplicantStore;
    repository?: ApplicantRepository;
    auditLedger?: AuditLedger;
  }
) {
  async function audit(event: AuditEvent) {
    if (!store) {
      throw new ApiError("dependency_missing", 503, "Applicant map store is not configured for this route.");
    }
    store.audits.push(await appendAuditEvent(auditLedger, event));
    return event.id;
  }

  app.get("/api/v1/applicant/dashboard", async (request) => {
    const session = await resolveSession(request);
    if (!store) {
      throw new ApiError("dependency_missing", 503, "Applicant dashboard store is not configured.");
    }
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
    if (repository) {
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(input.parkId));
      const response = await repository.createApplication({
        parkId: input.parkId,
        episodeId: input.episodeId,
        actor: session.actor,
        request,
        idempotencyKey: input.idempotencyKey
      });
      reply.status(201);
      return response;
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
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
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return applicationDraftResponseSchema.parse(application);
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    return applicationDraftResponseSchema.parse(application);
  });

  app.patch("/api/v1/applicant/applications/:applicationId/sections/:sectionKey", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; sectionKey: string };
    const input = autosaveApplicationSectionRequestSchema.parse(request.body);
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return repository.autosaveSection({
        applicationId: params.applicationId,
        sectionKey: params.sectionKey,
        clientVersion: input.clientVersion,
        fields: input.fields,
        actor: session.actor,
        request,
        idempotencyKey: input.idempotencyKey
      });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    if (input.clientVersion !== application.version) {
      throw new ApiError("idempotency_conflict", 409, "Application draft version has changed.");
    }

    const section = application.sections.find((candidate) => candidate.sectionKey === params.sectionKey);
    if (!section) {
      throw new ApiError("validation_failed", 400, "Unknown application section.");
    }
    return store.withTransaction(async () => {
      const beforeState = { version: application.version, section: structuredClone(section) };
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
  });

  app.post("/api/v1/applicant/applications/:applicationId/previous-feedback-response", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const input = previousFeedbackResponseRequestSchema.parse(request.body);
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return repository.recordPreviousFeedback({
        applicationId: params.applicationId,
        clientVersion: input.clientVersion,
        responseText: input.responseText,
        actor: session.actor,
        request
      });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    if (input.clientVersion !== application.version) {
      throw new ApiError("idempotency_conflict", 409, "Application draft version has changed.");
    }
    return store.withTransaction(async () => {
      application.version += 1;
      application.updatedAt = new Date().toISOString();

      const response = previousFeedbackResponseDraftSchema.parse({
        applicationId: application.applicationId,
        responseText: input.responseText,
        version: application.version,
        updatedAt: application.updatedAt
      });
      store.previousFeedbackResponses.set(application.applicationId, response);

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
  });

  app.get("/api/v1/applicant/applications/:applicationId/documents", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return redactApplicantDocumentsForSession(await repository.listDocuments(params.applicationId) as never, session);
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);
    return redactApplicantDocumentsForSession(applicationDocuments(store, application), session);
  });

  app.post("/api/v1/applicant/applications/:applicationId/documents/upload-sessions", async (request, reply) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const input = createDocumentUploadSessionRequestSchema.parse(request.body);
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      const response = await repository.createUploadSession({
        applicationId: params.applicationId,
        body: input,
        actor: session.actor,
        request
      });
      reply.status(201);
      return response;
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const application = requireApplication(store, params.applicationId);
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
    await store.withTransaction(async () => {
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
    });

    reply.status(201);
    return created;
  });

  app.patch("/api/v1/applicant/applications/:applicationId/documents/upload-sessions/:sessionId/chunks/:chunkIndex", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; sessionId: string; chunkIndex: string };
    const input = acknowledgeDocumentChunkRequestSchema.parse(request.body);
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return repository.acknowledgeChunk({
        applicationId: params.applicationId,
        sessionId: params.sessionId,
        chunkIndex: Number(params.chunkIndex),
        clientVersion: input.clientVersion,
        chunkSize: input.chunkSize,
        chunkChecksum: input.chunkChecksum,
        actor: session.actor,
        request,
        idempotencyKey: input.idempotencyKey
      });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const application = requireApplication(store, params.applicationId);
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

    return store.withTransaction(async () => {
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
  });

  app.post("/api/v1/applicant/applications/:applicationId/documents/upload-sessions/:sessionId/complete", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; sessionId: string };
    const input = completeDocumentUploadRequestSchema.parse(request.body);
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return repository.completeUpload({
        applicationId: params.applicationId,
        sessionId: params.sessionId,
        clientVersion: input.clientVersion,
        sha256: input.sha256,
        byteSize: input.byteSize,
        storageKey: input.storageKey,
        actor: session.actor,
        request
      });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const application = requireApplication(store, params.applicationId);
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
      return store.withTransaction(async () => {
        uploadSession.status = "COMPLETED";
        uploadSession.version += 1;
        await audit(
          buildAuditEvent({
            action: "COMPLETE_DOCUMENT_UPLOAD",
            entityType: "document",
            entityId: duplicate.documentId,
            actor: session.actor,
            request: requestMetadata(request),
            afterState: {
              applicationId: application.applicationId,
              duplicateOfDocumentId: duplicate.documentId,
              uploadSessionId: uploadSession.sessionId
            }
          })
        );
        return completeDocumentUploadResponseSchema.parse({
          applicationId: application.applicationId,
          document: {
            ...duplicate,
            signedAccessAvailable: duplicate.visibility !== "ADMIN_ONLY" && duplicate.visibility !== "MYSTERY_RESTRICTED"
          },
          duplicateOfDocumentId: duplicate.documentId
        });
      });
    }

    const previousCurrent = [...store.documents.values()].find(
      (document) =>
        document.applicationId === application.applicationId &&
        document.documentType === uploadSession.documentType &&
        document.isCurrent
    );
    const documentId = randomUUID();
    const created = documentAssetSchema.parse({
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
    return store.withTransaction(async () => {
      const beforeState = previousCurrent
        ? { previousCurrentDocumentId: previousCurrent.documentId, version: previousCurrent.version }
        : undefined;
      if (previousCurrent) {
        previousCurrent.isCurrent = false;
        previousCurrent.status = "ARCHIVED";
        previousCurrent.replacedByDocumentId = documentId;
        previousCurrent.updatedAt = new Date().toISOString();
      }
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
          beforeState,
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
        document: {
          ...created,
          signedAccessAvailable: true
        },
        archivedDocumentId: previousCurrent?.documentId
      });
    });
  });

  app.get("/api/v1/applicant/applications/:applicationId/documents/:documentId/access", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; documentId: string };
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return redactSignedDocumentAccessForSession(await repository.requestSignedDocumentAccess({
        applicationId: params.applicationId,
        documentId: params.documentId,
        actor: session.actor,
        request
      }) as never, session);
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const application = requireApplication(store, params.applicationId);
    requireApplicantScope(store, session, application.parkId);

    const document = store.documents.get(params.documentId);
    if (!document || document.applicationId !== application.applicationId) {
      throw new ApiError("dependency_missing", 404, "Document was not found.");
    }
    if (document.visibility === "MYSTERY_RESTRICTED" || document.visibility === "ADMIN_ONLY") {
      throw new ApiError("forbidden", 403, "Document is not visible to the applicant.");
    }

    const response = signedDocumentAccessResponseSchema.parse({
      documentId: document.documentId,
      method: "GET",
      url: `https://lower-env-storage.invalid/download/${document.documentId}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      filename: document.filename,
      contentType: document.contentType,
      visibility: document.visibility
    });
    await audit(buildAuditEvent({
      action: "DOCUMENT_ACCESS_REQUESTED",
      entityType: "document",
      entityId: document.documentId,
      actor: session.actor,
      request: requestMetadata(request),
      afterState: {
        applicationId: application.applicationId,
        documentId: document.documentId,
        episodeId: application.episodeId,
        parkId: application.parkId,
        documentType: document.documentType,
        visibility: document.visibility,
        accessDecision: "signed_access_issued"
      }
    }));
    return redactSignedDocumentAccessForSession(response, session);
  });

  app.get("/api/v1/applicant/applications/:applicationId/documents/:documentId/versions", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string; documentId: string };
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return repository.listDocumentVersions(params);
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
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
        .map((candidate) => ({
          ...candidate,
          signedAccessAvailable: candidate.visibility !== "ADMIN_ONLY" && candidate.visibility !== "MYSTERY_RESTRICTED"
        }))
    });
  });

  app.post("/api/v1/applicant/applications/:applicationId/submit", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { applicationId: string };
    const input = submitApplicationRequestSchema.parse(request.body);
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return repository.submitApplication({
        applicationId: params.applicationId,
        clientVersion: input.clientVersion,
        purchaseOrder: input.purchaseOrder,
        actor: session.actor,
        request,
        idempotencyKey: input.idempotencyKey
      });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const application = requireApplication(store, params.applicationId);
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
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return repository.getSubmission(params.applicationId);
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
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
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return repository.getPaymentSummary(params.applicationId);
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
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
    const input = submitApplicationRequestSchema.shape.purchaseOrder.parse(request.body);
    if (repository) {
      const application = await repository.getApplication(params.applicationId) as { parkId: string };
      requireApplicantResourceAccess(session, await repository.getOwnershipForPark(application.parkId));
      return repository.updatePurchaseOrder({
        applicationId: params.applicationId,
        purchaseOrder: input,
        actor: session.actor,
        request
      });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
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
    return store.withTransaction(async () => {
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
  });

  app.post("/api/v1/admin/payments/:invoiceId/mark-paid", async (request) => {
    const session = await resolveSession(request);
    const params = request.params as { invoiceId: string };
    const input = adminPaymentActionRequestSchema.parse(request.body);
    if (repository) {
      return adminPaymentActionResponseSchema.parse(await repository.markPaid({
        invoiceId: params.invoiceId,
        reason: input.reason,
        actor: session.actor,
        request,
        idempotencyKey: input.idempotencyKey
      }));
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
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
    if (repository) {
      return adminPaymentActionResponseSchema.parse(await repository.overridePaymentBlock({
        invoiceId: params.invoiceId,
        reason: input.reason,
        actor: session.actor,
        request,
        idempotencyKey: input.idempotencyKey
      }));
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
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
    if (repository) {
      return repository.applyPaymentDeadlineBlocks({
        asOf: input.asOf,
        actor: session.actor,
        request,
        idempotencyKey: input.idempotencyKey
      });
    }
    if (!store) throw new ApiError("dependency_missing", 503, "Applicant persistence is not configured.");
    const blockedInvoiceIds: string[] = [];
    for (const [invoiceId, invoice] of store.invoices) {
      const payment = store.payments.get(invoiceId);
      if (!payment || invoice.status !== "PENDING" || new Date(invoice.dueAt) >= new Date(input.asOf)) {
        continue;
      }
      const blockedInvoiceId = await store.withTransaction(async () => {
        invoice.status = "OVERDUE_BLOCKED";
        store.episodeStatuses.set(invoice.episodeId, "PAYMENT_OVERDUE_BLOCKED");
        const updated = paymentSummaryResponseSchema.parse({
          ...payment,
          invoice,
          blockedForAllocation: true,
          updatedAt: input.asOf
        });
        store.payments.set(invoiceId, updated);
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
        return invoiceId;
      });
      blockedInvoiceIds.push(blockedInvoiceId);
    }
    return paymentDeadlineCheckResponseSchema.parse({
      checkedAt: input.asOf,
      blockedInvoiceIds
    });
  });
}
