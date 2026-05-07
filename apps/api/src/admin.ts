import type { FastifyInstance } from "fastify";
import {
  adminApplicationDetailResponseSchema,
  adminApplicationQueueResponseSchema,
  adminDashboardSummaryResponseSchema,
  adminDocumentQueueResponseSchema,
  adminPaymentQueueResponseSchema,
  adminRegistrationQueueResponseSchema
} from "@green-flag/contracts";
import type { ApplicantStore } from "./applicant.js";
import {
  canAccessResource,
  requireOperationalResourceAccess,
  requirePaymentResourceAccess
} from "./authorization.js";
import { ApiError, type SessionResolver } from "./auth.js";
import type { RegistrationStore } from "./registration.js";
import { pageMeta, paginate, parseQuery, registrationQueueFilters, textMatches } from "./admin/query.js";
import {
  documentQueueItems,
  filterApplicationQueue,
  lowerEnvironmentOwnership,
  paymentQueueItems,
  readinessForApplication,
  visibleApplicationQueueItems
} from "./admin/read-models.js";

export function registerAdminRoutes(
  app: FastifyInstance,
  {
    resolveSession,
    applicantStore,
    registrationStore
  }: {
    resolveSession: SessionResolver;
    applicantStore: ApplicantStore;
    registrationStore: RegistrationStore;
  }
) {
  app.get("/api/v1/admin/dashboard-summary", async (request) => {
    const session = await resolveSession(request);
    const queueOwnership = lowerEnvironmentOwnership(applicantStore);
    requireOperationalResourceAccess(session, queueOwnership);

    const apps = visibleApplicationQueueItems(applicantStore, session);
    const payments = paymentQueueItems(applicantStore).filter((item) => item.ownership && canAccessResource(session, item.ownership));
    const documents = documentQueueItems(applicantStore).filter((item) => item.ownership && canAccessResource(session, item.ownership));
    const registrationsPendingReview = [...registrationStore.records.values()]
      .filter((record) => record.status === "VERIFIED_PENDING_REVIEW").length;
    const paymentsNeedAttention = payments.filter(
      (payment) => payment.status === "PENDING" || payment.status === "OVERDUE_BLOCKED"
    ).length;
    const documentsNeedAttention = apps.filter((item) => item.documentStatus !== "complete").length +
      documents.filter((document) => document.attentionFlag !== "none").length;
    const allocationReadyPreview = apps.filter((item) => item.allocationReadiness === "eligible_preview").length;

    return adminDashboardSummaryResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      counts: {
        registrationsPendingReview,
        applicationsSubmitted: apps.filter((item) =>
          ["SUBMITTED", "SUBMITTED_WITH_MISSING_PLAN"].includes(item.applicationStatus)
        ).length,
        paymentsNeedAttention,
        documentsNeedAttention,
        allocationReadyPreview,
        resultsUnavailable: apps.length
      },
      attention: [
        {
          queue: "registrations",
          label: "Registration reviews",
          count: registrationsPendingReview
        },
        {
          queue: "payments",
          label: "Payments needing attention",
          count: paymentsNeedAttention
        },
        {
          queue: "documents",
          label: "Document attention",
          count: documentsNeedAttention
        },
        {
          queue: "allocation_readiness",
          label: "Ready for allocation preview",
          count: allocationReadyPreview
        }
      ]
    });
  });

  app.get("/api/v1/admin/queues/registrations", async (request) => {
    const session = await resolveSession(request);
    requireOperationalResourceAccess(session, lowerEnvironmentOwnership(applicantStore));
    const query = parseQuery(request);
    const allItems = [...registrationStore.records.values()]
      .filter((record) => textMatches(query, record.parkName, record.organisationName, record.contactEmail))
      .filter((record) => !query.status || record.status === query.status)
      .map((record) => ({
        registrationId: record.registrationId,
        status: record.status,
        parkName: record.parkName,
        organisationName: record.organisationName,
        contactEmail: record.contactEmail,
        eligibility: record.eligibility,
        duplicateWarning: record.duplicateWarning,
        submittedAt: record.submittedAt
      }));

    return adminRegistrationQueueResponseSchema.parse({
      items: paginate(allItems, query),
      page: pageMeta(allItems.length, query, registrationQueueFilters)
    });
  });

  app.get("/api/v1/admin/queues/applications", async (request) => {
    const session = await resolveSession(request);
    requireOperationalResourceAccess(session, lowerEnvironmentOwnership(applicantStore));
    const query = parseQuery(request);
    const allItems = filterApplicationQueue(visibleApplicationQueueItems(applicantStore, session), query);
    return adminApplicationQueueResponseSchema.parse({
      items: paginate(allItems, query),
      page: pageMeta(allItems.length, query)
    });
  });

  app.get("/api/v1/admin/queues/payments", async (request) => {
    const session = await resolveSession(request);
    requirePaymentResourceAccess(session, lowerEnvironmentOwnership(applicantStore));
    const query = parseQuery(request);
    const allItems = paymentQueueItems(applicantStore)
      .filter((item) => item.ownership && canAccessResource(session, item.ownership))
      .filter((item) => textMatches(query, item.parkName, item.organisationName, item.invoiceId))
      .filter((item) => !query.paymentStatus || item.status === query.paymentStatus)
      .filter((item) => !query.status || item.status === query.status);
    return adminPaymentQueueResponseSchema.parse({
      items: paginate(allItems, query),
      page: pageMeta(allItems.length, query, ["status", "cycleYear", "paymentStatus", "attention"])
    });
  });

  app.get("/api/v1/admin/queues/documents", async (request) => {
    const session = await resolveSession(request);
    requireOperationalResourceAccess(session, lowerEnvironmentOwnership(applicantStore));
    const query = parseQuery(request);
    const allItems = documentQueueItems(applicantStore)
      .filter((item) => item.ownership && canAccessResource(session, item.ownership))
      .filter((item) => textMatches(query, item.parkName, item.documentType))
      .filter((item) => !query.status || item.status === query.status)
      .filter((item) => !query.attention || item.attentionFlag === query.attention);
    return adminDocumentQueueResponseSchema.parse({
      items: paginate(allItems, query),
      page: pageMeta(allItems.length, query, ["status", "documentStatus", "attention"])
    });
  });

  app.get("/api/v1/admin/applications/:applicationId", async (request) => {
    const session = await resolveSession(request);
    if (session.actor.role === "FINANCE_ADMIN") {
      requirePaymentResourceAccess(session, lowerEnvironmentOwnership(applicantStore));
    } else {
      requireOperationalResourceAccess(session, lowerEnvironmentOwnership(applicantStore));
    }
    const params = request.params as { applicationId: string };
    const application = visibleApplicationQueueItems(applicantStore, session)
      .find((candidate) => candidate.applicationId === params.applicationId);
    if (!application) {
      throw new ApiError("dependency_missing", 404, "Application was not found.");
    }
    const invoice = [...applicantStore.invoices.values()]
      .find((candidate) => candidate.applicationId === params.applicationId);
    const payment = invoice ? applicantStore.payments.get(invoice.invoiceId) : undefined;
    if (!invoice || !payment) {
      throw new ApiError("dependency_missing", 404, "Payment state was not found.");
    }

    return adminApplicationDetailResponseSchema.parse({
      application,
      invoice,
      payment,
      documents: documentQueueItems(applicantStore)
        .filter((document) => document.applicationId === params.applicationId),
      allocationReadiness: readinessForApplication(applicantStore, params.applicationId),
      result: {
        status: "not_available",
        displayLabel: "Deferred until results slice"
      }
    });
  });

  app.get("/api/v1/admin/applications/:applicationId/allocation-readiness", async (request) => {
    const session = await resolveSession(request);
    requireOperationalResourceAccess(session, lowerEnvironmentOwnership(applicantStore));
    const params = request.params as { applicationId: string };
    return readinessForApplication(applicantStore, params.applicationId);
  });
}
