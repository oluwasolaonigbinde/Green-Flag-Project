import { describe, expect, it } from "vitest";
import {
  applicationDraftFixture,
  globalAdminSessionFixture,
  parkManagerSessionFixture,
  registrationSubmissionRequestFixture,
  scopedAdminSessionFixture
} from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { createApplicantStore } from "./applicant.js";
import { createRegistrationStore } from "./registration.js";

async function seedSubmittedApplication(app: ReturnType<typeof buildApp>) {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/applicant/applications/${applicationDraftFixture.applicationId}/submit`,
    payload: {
      clientVersion: applicationDraftFixture.version,
      idempotencyKey: "admin-queue-submit-0001",
      purchaseOrder: {
        purchaseOrderNumber: "PO-ADMIN-QUEUE-001",
        noPurchaseOrderDeclared: false
      }
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

async function seedVerifiedRegistration(app: ReturnType<typeof buildApp>) {
  const submitted = await app.inject({
    method: "POST",
    url: "/api/v1/registrations",
    headers: {
      "idempotency-key": "admin-queue-registration-0001"
    },
    payload: registrationSubmissionRequestFixture
  });
  expect(submitted.statusCode).toBe(201);
  const registrationId = submitted.json().registrationId;
  const verified = await app.inject({
    method: "POST",
    url: `/api/v1/registrations/${registrationId}/verify-email`,
    payload: {
      token: "lower-env-verification-token"
    }
  });
  expect(verified.statusCode).toBe(200);
  return registrationId;
}

describe("admin read models and operational queues", () => {
  it("returns dashboard, queue, detail, and allocation-readiness read models", async () => {
    const applicantStore = createApplicantStore();
    const registrationStore = createRegistrationStore();
    const app = buildApp({
      applicantStore,
      registrationStore,
      resolveSession: async (request) =>
        request.url.includes("/api/v1/admin/") ? globalAdminSessionFixture : parkManagerSessionFixture
    });

    await seedVerifiedRegistration(app);
    const submitted = await seedSubmittedApplication(app);

    const dashboard = await app.inject({
      method: "GET",
      url: "/api/v1/admin/dashboard-summary"
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).toMatchObject({
      counts: {
        registrationsPendingReview: 1,
        applicationsSubmitted: 1,
        paymentsNeedAttention: 1
      }
    });

    const registrations = await app.inject({
      method: "GET",
      url: "/api/v1/admin/queues/registrations?page=1&pageSize=10&status=VERIFIED_PENDING_REVIEW"
    });
    expect(registrations.statusCode).toBe(200);
    expect(registrations.json().items).toHaveLength(1);
    expect(registrations.json().page.availableFilters).toContain("search");

    const applications = await app.inject({
      method: "GET",
      url: "/api/v1/admin/queues/applications?paymentStatus=PENDING"
    });
    expect(applications.statusCode).toBe(200);
    expect(applications.json().items[0]).toMatchObject({
      applicationStatus: "SUBMITTED",
      paymentStatus: "PENDING",
      allocationReadiness: "blocked",
      attentionFlags: ["payment_pending"]
    });

    const payments = await app.inject({
      method: "GET",
      url: "/api/v1/admin/queues/payments?paymentStatus=PENDING"
    });
    expect(payments.statusCode).toBe(200);
    expect(payments.json().items[0]).toMatchObject({
      amount: "external_value_unavailable",
      status: "PENDING"
    });

    const documents = await app.inject({
      method: "GET",
      url: "/api/v1/admin/queues/documents"
    });
    expect(documents.statusCode).toBe(200);
    expect(documents.json().items[0]).toMatchObject({
      visibility: "APPLICANT_AND_ADMIN",
      attentionFlag: "none"
    });

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/admin/applications/${submitted.applicationId}`
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      application: {
        applicationId: submitted.applicationId
      },
      invoice: {
        amount: "external_value_unavailable"
      },
      result: {
        status: "not_available"
      }
    });
    expect(JSON.stringify(detail.json())).not.toContain("MYSTERY_SHOP");

    const readiness = await app.inject({
      method: "GET",
      url: `/api/v1/admin/applications/${submitted.applicationId}/allocation-readiness`
    });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      readiness: "blocked",
      reasonCodes: ["payment_pending"],
      candidateGenerationAvailable: false
    });

    const invoiceId = submitted.invoice.invoiceId;
    const paid = await app.inject({
      method: "POST",
      url: `/api/v1/admin/payments/${invoiceId}/mark-paid`,
      payload: {
        reason: "Move to allocation readiness.",
        idempotencyKey: "admin-queue-paid-0001"
      }
    });
    expect(paid.statusCode).toBe(200);
    const applicationsAfterPayment = await app.inject({
      method: "GET",
      url: "/api/v1/admin/queues/applications"
    });
    expect(applicationsAfterPayment.json().items[0]).toMatchObject({
      episodeStatus: "READY_FOR_ALLOCATION",
      paymentStatus: "PAID"
    });
  });

  it("rejects applicant actors from admin read models", async () => {
    const app = buildApp({
      applicantStore: createApplicantStore(),
      registrationStore: createRegistrationStore(),
      resolveSession: async () => parkManagerSessionFixture
    });

    const dashboard = await app.inject({
      method: "GET",
      url: "/api/v1/admin/dashboard-summary"
    });
    expect(dashboard.statusCode).toBe(403);

    const payments = await app.inject({
      method: "GET",
      url: "/api/v1/admin/queues/payments"
    });
    expect(payments.statusCode).toBe(403);
  });

  it("enforces country/global admin scope boundaries on queues", async () => {
    const applicantStore = createApplicantStore();
    const registrationStore = createRegistrationStore();
    const allowed = buildApp({
      applicantStore,
      registrationStore,
      resolveSession: async (request) =>
        request.url.includes("/api/v1/admin/") ? scopedAdminSessionFixture : parkManagerSessionFixture
    });
    const submitted = await seedSubmittedApplication(allowed);
    const allowedQueue = await allowed.inject({
      method: "GET",
      url: "/api/v1/admin/queues/applications"
    });
    expect(allowedQueue.statusCode).toBe(200);
    expect(allowedQueue.json().items[0].applicationId).toBe(submitted.applicationId);

    const wrongCountry = structuredClone(scopedAdminSessionFixture);
    wrongCountry.actor.scopes = [{ type: "COUNTRY", id: "wrong-country-scope" }];
    wrongCountry.roleAssignments[0]!.scope = wrongCountry.actor.scopes[0]!;
    const denied = buildApp({
      applicantStore,
      registrationStore,
      resolveSession: async () => wrongCountry
    });
    const deniedQueue = await denied.inject({
      method: "GET",
      url: "/api/v1/admin/queues/applications"
    });
    expect(deniedQueue.statusCode).toBe(403);
  });
});
