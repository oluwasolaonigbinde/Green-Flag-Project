import { describe, expect, it } from "vitest";
import {
  applicationDraftFixture,
  currentManagementPlanDocumentFixture,
  globalAdminSessionFixture,
  lowerEnvironmentOrganisationFixture,
  lowerEnvironmentFullEpisodeFixture,
  parkManagerSessionFixture
} from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { createApplicantStore } from "./applicant.js";

describe("applicant dashboard and application draft slice api", () => {
  it("returns a Mystery-safe applicant dashboard projection", async () => {
    const app = buildApp({
      applicantStore: createApplicantStore(),
      resolveSession: async () => parkManagerSessionFixture
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/applicant/dashboard"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(2);
    expect(JSON.stringify(response.json())).not.toContain("MYSTERY_SHOP");
    expect(response.json().items[1]).toMatchObject({
      displayStatus: "APPLICATION_UNDER_REVIEW",
      allowedActions: []
    });
  });

  it("creates an application draft idempotently for a scoped park", async () => {
    const store = createApplicantStore();
    const app = buildApp({
      applicantStore: store,
      resolveSession: async () => parkManagerSessionFixture
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/applications",
      payload: {
        parkId: parkManagerSessionFixture.actor.scopes[0]?.id,
        episodeId: lowerEnvironmentFullEpisodeFixture.id,
        idempotencyKey: "create-application-0001"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "DRAFT",
      completionPercent: 0
    });
    expect(store.audits.map((event) => event.action)).toContain("CREATE_OR_CONTINUE_APPLICATION");
  });

  it("autosaves a section and recalculates progress", async () => {
    const store = createApplicantStore();
    const app = buildApp({
      applicantStore: store,
      resolveSession: async () => parkManagerSessionFixture
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/sections/site_information`,
      payload: {
        clientVersion: applicationDraftFixture.version,
        idempotencyKey: "autosave-section-0001",
        fields: {
          siteDescription: "Updated synthetic draft",
          hasAccessibleEntrances: true
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      applicationStatus: "IN_PROGRESS",
      section: {
        status: "complete",
        completionPercent: 100
      }
    });
    expect(store.audits.map((event) => event.action)).toContain("AUTOSAVE_APPLICATION_SECTION");
  });

  it("rejects stale autosave versions", async () => {
    const app = buildApp({
      applicantStore: createApplicantStore(),
      resolveSession: async () => parkManagerSessionFixture
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/sections/site_information`,
      payload: {
        clientVersion: 0,
        fields: {
          siteDescription: "Stale draft"
        }
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "idempotency_conflict"
      }
    });
  });

  it("records a previous feedback response draft", async () => {
    const store = createApplicantStore();
    const app = buildApp({
      applicantStore: store,
      resolveSession: async () => parkManagerSessionFixture
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/previous-feedback-response`,
      payload: {
        clientVersion: applicationDraftFixture.version,
        responseText: "We have addressed the previous recommendations."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      responseText: "We have addressed the previous recommendations."
    });
    expect(store.audits.map((event) => event.action)).toContain(
      "RECORD_PREVIOUS_FEEDBACK_RESPONSE_DRAFT"
    );
  });

  it("lists applicant-visible documents without Mystery metadata", async () => {
    const app = buildApp({
      applicantStore: createApplicantStore(),
      resolveSession: async () => parkManagerSessionFixture
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/documents`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      documentCompletionStatus: "complete"
    });
    expect(response.json().slots[0].currentDocument.filename).toContain("management-plan");
    expect(JSON.stringify(response.json())).not.toContain("MYSTERY_SHOP");
  });

  it("creates a chunked upload session, accepts chunks, and completes a replacement", async () => {
    const store = createApplicantStore();
    const app = buildApp({
      applicantStore: store,
      resolveSession: async () => parkManagerSessionFixture
    });

    const created = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/documents/upload-sessions`,
      payload: {
        documentType: "management_plan",
        filename: "replacement-management-plan.pdf",
        contentType: "application/pdf",
        byteSize: 3000000,
        sha256: "d".repeat(64),
        totalChunks: 2,
        idempotencyKey: "document-upload-0001"
      }
    });

    expect(created.statusCode).toBe(201);
    const sessionId = created.json().sessionId;

    const firstChunk = await app.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/documents/upload-sessions/${sessionId}/chunks/0`,
      payload: {
        clientVersion: 0,
        chunkSize: 1500000,
        chunkChecksum: "chunk-0",
        idempotencyKey: "document-chunk-0001"
      }
    });
    expect(firstChunk.statusCode).toBe(200);
    expect(firstChunk.json()).toMatchObject({
      progressPercent: 50,
      status: "IN_PROGRESS"
    });

    const secondChunk = await app.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/documents/upload-sessions/${sessionId}/chunks/1`,
      payload: {
        clientVersion: 1,
        chunkSize: 1500000,
        chunkChecksum: "chunk-1",
        idempotencyKey: "document-chunk-0002"
      }
    });
    expect(secondChunk.statusCode).toBe(200);
    expect(secondChunk.json()).toMatchObject({
      progressPercent: 100,
      status: "READY_TO_COMPLETE"
    });

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/documents/upload-sessions/${sessionId}/complete`,
      payload: {
        clientVersion: 2,
        sha256: "d".repeat(64),
        byteSize: 3000000,
        storageKey: "lower-env/applications/replacement-management-plan.pdf"
      }
    });

    expect(completed.statusCode).toBe(200);
    expect(completed.json().document).toMatchObject({
      documentType: "management_plan",
      isCurrent: true,
      status: "AVAILABLE"
    });
    expect(completed.json().archivedDocumentId).toBe(currentManagementPlanDocumentFixture.documentId);
    expect(store.audits.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "CREATE_DOCUMENT_UPLOAD_SESSION",
        "ACKNOWLEDGE_DOCUMENT_UPLOAD_CHUNK",
        "COMPLETE_DOCUMENT_UPLOAD"
      ])
    );
  });

  it("returns signed document access after applicant scope checks", async () => {
    const app = buildApp({
      applicantStore: createApplicantStore(),
      resolveSession: async () => parkManagerSessionFixture
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/documents/${currentManagementPlanDocumentFixture.documentId}/access`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      method: "GET",
      visibility: "APPLICANT_AND_ADMIN"
    });
    expect(response.json().url).toContain("lower-env-storage.invalid");
  });

  it("submits an application, creates an invoice shell, and exposes payment summary", async () => {
    const store = createApplicantStore();
    const app = buildApp({
      applicantStore: store,
      resolveSession: async () => parkManagerSessionFixture
    });

    const submitted = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/submit`,
      payload: {
        clientVersion: applicationDraftFixture.version,
        idempotencyKey: "submit-application-0001",
        purchaseOrder: {
          purchaseOrderNumber: "PO-LOWER-ENV-001",
          noPurchaseOrderDeclared: false
        }
      }
    });

    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({
      applicationStatus: "SUBMITTED",
      episodeStatus: "PAYMENT_PENDING",
      documentState: "management_plan_uploaded",
      invoice: {
        status: "PENDING",
        amount: "external_value_unavailable"
      }
    });
    expect(store.audits.map((event) => event.action)).toEqual(
      expect.arrayContaining(["SUBMIT_APPLICATION", "CREATE_INVOICE_FOR_SUBMISSION"])
    );

    const payment = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/payment-summary`
    });
    expect(payment.statusCode).toBe(200);
    expect(payment.json().purchaseOrder.purchaseOrderNumber).toBe("PO-LOWER-ENV-001");
    expect(JSON.stringify(payment.json())).not.toContain("VAT");

    const submission = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/submission`
    });
    expect(submission.statusCode).toBe(200);
    expect(submission.json()).toMatchObject({
      applicationStatus: "SUBMITTED",
      payment: {
        purchaseOrder: {
          purchaseOrderNumber: "PO-LOWER-ENV-001"
        }
      }
    });
  });

  it("allows super admin manual payment actions and deadline blocks", async () => {
    const store = createApplicantStore();
    const app = buildApp({
      applicantStore: store,
      resolveSession: async (request) =>
        request.url.includes("/api/v1/admin/") ? globalAdminSessionFixture : parkManagerSessionFixture
    });

    const submitted = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/submit`,
      payload: {
        clientVersion: applicationDraftFixture.version,
        idempotencyKey: "submit-application-0002",
        purchaseOrder: {
          noPurchaseOrderDeclared: true
        }
      }
    });
    const invoiceId = submitted.json().invoice.invoiceId;

    const deadline = await app.inject({
      method: "POST",
      url: "/api/v1/admin/payments/deadline-check",
      payload: {
        asOf: "2026-07-01T00:00:00Z",
        idempotencyKey: "payment-deadline-0001"
      }
    });
    expect(deadline.statusCode).toBe(200);
    expect(deadline.json().blockedInvoiceIds).toContain(invoiceId);

    const override = await app.inject({
      method: "POST",
      url: `/api/v1/admin/payments/${invoiceId}/override-block`,
      payload: {
        reason: "Lower-env payment override.",
        idempotencyKey: "payment-override-0001"
      }
    });
    expect(override.statusCode).toBe(200);
    expect(override.json()).toMatchObject({
      status: "WAIVED",
      overrideApplied: true,
      blockedForAllocation: false
    });

    const paid = await app.inject({
      method: "POST",
      url: `/api/v1/admin/payments/${invoiceId}/mark-paid`,
      payload: {
        reason: "Lower-env manual mark paid.",
        idempotencyKey: "payment-paid-0001"
      }
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({
      status: "PAID",
      manuallyMarkedPaid: true
    });
    expect(store.audits.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "APPLY_PAYMENT_OVERDUE_BLOCK",
        "OVERRIDE_PAYMENT_BLOCK",
        "MARK_PAYMENT_PAID_MANUALLY"
      ])
    );
    expect(store.overrideEvents).toHaveLength(1);
    expect(store.overrideEvents[0]).toMatchObject({
      overrideType: "PAYMENT_BLOCK_OVERRIDE",
      targetType: "invoice",
      targetId: invoiceId,
      reason: "Lower-env payment override.",
      linkedAuditEventId: expect.any(String)
    });
  });

  it("enforces park and organisation scope boundaries", async () => {
    const store = createApplicantStore();
    const wrongParkSession = structuredClone(parkManagerSessionFixture);
    wrongParkSession.actor.scopes = [{ type: "PARK", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }];

    const deniedPark = buildApp({
      applicantStore: store,
      resolveSession: async () => wrongParkSession
    });
    const parkResponse = await deniedPark.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}`
    });
    expect(parkResponse.statusCode).toBe(403);

    const orgSession = structuredClone(parkManagerSessionFixture);
    orgSession.actor.role = "ORG_ADMIN";
    orgSession.actor.scopes = [{ type: "ORGANISATION", id: lowerEnvironmentOrganisationFixture.id }];
    const allowedOrg = buildApp({
      applicantStore: store,
      resolveSession: async () => orgSession
    });
    const orgResponse = await allowedOrg.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}`
    });
    expect(orgResponse.statusCode).toBe(200);

    const wrongOrgSession = structuredClone(orgSession);
    wrongOrgSession.actor.scopes = [{ type: "ORGANISATION", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }];
    const deniedOrg = buildApp({
      applicantStore: store,
      resolveSession: async () => wrongOrgSession
    });
    const wrongOrgResponse = await deniedOrg.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}`
    });
    expect(wrongOrgResponse.statusCode).toBe(403);
  });

  it("rolls back submit mutations when the transactional audit append fails", async () => {
    const store = createApplicantStore();
    const app = buildApp({
      applicantStore: store,
      resolveSession: async () => parkManagerSessionFixture,
      auditLedger: {
        async append() {
          throw new Error("audit failure");
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/submit`,
      payload: {
        clientVersion: applicationDraftFixture.version,
        idempotencyKey: "submit-rollback-0001",
        purchaseOrder: {
          noPurchaseOrderDeclared: true
        }
      }
    });

    expect(response.statusCode).toBe(500);
    expect(store.applications.get(applicationDraftFixture.applicationId)?.status).toBe("IN_PROGRESS");
    expect(store.invoices.size).toBe(0);
    expect(store.payments.size).toBe(0);
    expect(store.audits).toHaveLength(0);
  });

  it("replays submit idempotently without duplicating invoice or audit records", async () => {
    const store = createApplicantStore();
    const app = buildApp({
      applicantStore: store,
      resolveSession: async () => parkManagerSessionFixture
    });

    const payload = {
      clientVersion: applicationDraftFixture.version,
      idempotencyKey: "submit-replay-0001",
      purchaseOrder: {
        noPurchaseOrderDeclared: true
      }
    };
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/submit`,
      payload
    });
    const second = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/submit`,
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().invoice.invoiceId).toBe(first.json().invoice.invoiceId);
    expect(store.invoices.size).toBe(1);
    expect(store.audits.filter((event) => event.action === "SUBMIT_APPLICATION")).toHaveLength(1);
  });

  it("applies central Mystery redaction to applicant document surfaces", async () => {
    const store = createApplicantStore();
    const document = store.documents.get(currentManagementPlanDocumentFixture.documentId);
    if (!document) {
      throw new Error("Expected lower-env document fixture");
    }
    document.visibility = "MYSTERY_RESTRICTED";
    document.filename = "secret-mystery-visit-plan.pdf";

    const app = buildApp({
      applicantStore: store,
      resolveSession: async () => parkManagerSessionFixture
    });
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/documents`
    });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain("secret-mystery-visit-plan.pdf");
    expect(JSON.stringify(list.json())).not.toContain("MYSTERY_RESTRICTED");

    const access = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/documents/${currentManagementPlanDocumentFixture.documentId}/access`
    });
    expect(access.statusCode).toBe(403);
  });
});
