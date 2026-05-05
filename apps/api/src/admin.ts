import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  adminAllocationReadinessPreviewResponseSchema,
  adminApplicationDetailResponseSchema,
  adminApplicationQueueResponseSchema,
  adminDashboardSummaryResponseSchema,
  adminDocumentQueueResponseSchema,
  adminPaymentQueueResponseSchema,
  adminQueueQuerySchema,
  adminRegistrationQueueResponseSchema,
  lowerEnvironmentAwardCycle2026Fixture,
  lowerEnvironmentOrganisationFixture,
  lowerEnvironmentParkFixture,
  type ApplicationStatus,
  type EpisodeStatus,
  type SafeDisplayStatus
} from "@green-flag/contracts";
import type { ApplicantStore } from "./applicant.js";
import {
  canAccessResource,
  requireOperationalResourceAccess,
  requirePaymentResourceAccess,
  type ResourceOwnership
} from "./authorization.js";
import { ApiError, type SessionProfile, type SessionResolver } from "./auth.js";
import type { RegistrationStore } from "./registration.js";

type QueueQuery = ReturnType<typeof adminQueueQuerySchema.parse>;

const adminQueueFilters = ["status", "cycleYear", "paymentStatus", "documentStatus", "attention"];
const registrationQueueFilters = ["status", "search"];

function parseQuery(request: FastifyRequest) {
  return adminQueueQuerySchema.parse(request.query ?? {});
}

function paginate<T>(items: T[], query: QueueQuery) {
  const start = (query.page - 1) * query.pageSize;
  return items.slice(start, start + query.pageSize);
}

function pageMeta(totalItems: number, query: QueueQuery, availableFilters = adminQueueFilters) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    availableFilters
  };
}

function textMatches(query: QueueQuery, ...values: string[]) {
  if (!query.search) {
    return true;
  }
  const needle = query.search.toLowerCase();
  return values.some((value) => value.toLowerCase().includes(needle));
}

function applicationPaymentStatus(store: ApplicantStore, applicationId: string) {
  const invoice = [...store.invoices.values()].find((candidate) => candidate.applicationId === applicationId);
  return invoice?.status ?? "NOT_REQUIRED";
}

function applicationDocuments(store: ApplicantStore, applicationId: string) {
  return [...store.documents.values()].filter((document) => document.applicationId === applicationId);
}

function documentStatusForApplication(store: ApplicantStore, applicationId: string) {
  const documents = applicationDocuments(store, applicationId);
  const currentManagementPlan = documents.find(
    (document) => document.documentType === "management_plan" && document.isCurrent
  );
  if (!currentManagementPlan) {
    return "missing_required" as const;
  }
  if (currentManagementPlan.status === "UPLOADED_PENDING_SCAN") {
    return "pending_scan" as const;
  }
  return currentManagementPlan.status === "AVAILABLE" ? "complete" as const : "missing_required" as const;
}

function displayStatusForApplication(status: ApplicationStatus, paymentStatus: ReturnType<typeof applicationPaymentStatus>): SafeDisplayStatus {
  if (paymentStatus === "PENDING" || paymentStatus === "OVERDUE_BLOCKED") {
    return "PAYMENT_PENDING";
  }
  if (status === "SUBMITTED" || status === "SUBMITTED_WITH_MISSING_PLAN") {
    return "SUBMITTED";
  }
  if (status === "DRAFT") {
    return "DRAFT";
  }
  return "IN_PROGRESS";
}

function applicationQueueItems(store: ApplicantStore) {
  return [...store.applications.values()].map((application) => {
    const paymentStatus = applicationPaymentStatus(store, application.applicationId);
    const documentStatus = documentStatusForApplication(store, application.applicationId);
    const ownership = store.parkOwnerships.get(application.parkId);
    const attentionFlags: Array<
      "payment_pending" | "payment_overdue" | "management_plan_missing" | "application_not_submitted"
    > = [];

    if (!["SUBMITTED", "SUBMITTED_WITH_MISSING_PLAN"].includes(application.status)) {
      attentionFlags.push("application_not_submitted");
    }
    if (paymentStatus === "PENDING") {
      attentionFlags.push("payment_pending");
    }
    if (paymentStatus === "OVERDUE_BLOCKED") {
      attentionFlags.push("payment_overdue");
    }
    if (documentStatus === "missing_required") {
      attentionFlags.push("management_plan_missing");
    }

    const allocationReady =
      ["SUBMITTED", "SUBMITTED_WITH_MISSING_PLAN"].includes(application.status) &&
      documentStatus === "complete" &&
      (paymentStatus === "PAID" || paymentStatus === "WAIVED");

    return {
      applicationId: application.applicationId,
      episodeId: application.episodeId,
      parkId: application.parkId,
      parkName: lowerEnvironmentParkFixture.name,
      organisationName: lowerEnvironmentOrganisationFixture.name,
      cycleYear: lowerEnvironmentAwardCycle2026Fixture.cycleYear,
      applicationStatus: application.status,
      episodeStatus: store.episodeStatuses.get(application.episodeId) ?? "APPLICATION_DRAFT" as EpisodeStatus,
      displayStatus: displayStatusForApplication(application.status, paymentStatus),
      paymentStatus,
      documentStatus,
      allocationReadiness: allocationReady ? "eligible_preview" as const : "blocked" as const,
      attentionFlags,
      ownership
    };
  });
}

function visibleApplicationQueueItems(store: ApplicantStore, session: SessionProfile) {
  return applicationQueueItems(store).filter((item) =>
    item.ownership ? canAccessResource(session, item.ownership) : false
  );
}

function filterApplicationQueue(items: ReturnType<typeof applicationQueueItems>, query: QueueQuery) {
  return items.filter((item) => {
    if (!textMatches(query, item.parkName, item.organisationName)) return false;
    if (query.status && item.applicationStatus !== query.status && item.displayStatus !== query.status) return false;
    if (query.cycleYear && item.cycleYear !== query.cycleYear) return false;
    if (query.parkId && item.parkId !== query.parkId) return false;
    if (query.paymentStatus && item.paymentStatus !== query.paymentStatus) return false;
    if (query.documentStatus && item.documentStatus !== query.documentStatus) return false;
    if (query.attention && !item.attentionFlags.includes(query.attention)) return false;
    return true;
  });
}

function paymentQueueItems(store: ApplicantStore) {
  return [...store.payments.values()].map((payment) => {
    const application = store.applications.get(payment.applicationId);
    return {
      invoiceId: payment.invoice.invoiceId,
      applicationId: payment.applicationId,
      episodeId: payment.invoice.episodeId,
      parkName: lowerEnvironmentParkFixture.name,
      organisationName: lowerEnvironmentOrganisationFixture.name,
      status: payment.invoice.status,
      amount: payment.invoice.amount,
      dueAt: payment.invoice.dueAt,
      purchaseOrder: payment.purchaseOrder,
      manuallyMarkedPaid: payment.manuallyMarkedPaid,
      overrideApplied: payment.overrideApplied,
      blockedForAllocation: payment.blockedForAllocation,
      ownership: application ? store.parkOwnerships.get(application.parkId) : undefined
    };
  });
}

function documentQueueItems(store: ApplicantStore) {
  return [...store.documents.values()].map((document) => {
    const siblingVersions = [...store.documents.values()].filter(
      (candidate) =>
        candidate.applicationId === document.applicationId &&
        candidate.documentType === document.documentType &&
        candidate.documentId !== document.documentId
    );
    const attentionFlag =
      document.status === "UPLOADED_PENDING_SCAN"
        ? "scan_pending"
        : document.status === "REJECTED"
          ? "scan_rejected"
          : "none";

    const application = store.applications.get(document.applicationId);
    return {
      documentId: document.documentId,
      applicationId: document.applicationId,
      episodeId: document.episodeId,
      parkName: lowerEnvironmentParkFixture.name,
      documentType: document.documentType,
      status: document.status,
      visibility: document.visibility,
      version: document.version,
      archivedVersionCount: siblingVersions.filter((candidate) => !candidate.isCurrent).length,
      attentionFlag,
      ownership: application ? store.parkOwnerships.get(application.parkId) : undefined
    };
  });
}

function readinessForApplication(store: ApplicantStore, applicationId: string) {
  const application = store.applications.get(applicationId);
  if (!application) {
    throw new ApiError("dependency_missing", 404, "Application was not found.");
  }

  const item = applicationQueueItems(store).find((candidate) => candidate.applicationId === applicationId);
  if (!item) {
    throw new ApiError("dependency_missing", 404, "Application read model was not found.");
  }

  const reasonCodes = item.allocationReadiness === "eligible_preview"
    ? ["later_slice_allocation" as const]
    : item.attentionFlags.map((flag) => flag === "payment_overdue" ? "payment_overdue" as const : flag);

  return adminAllocationReadinessPreviewResponseSchema.parse({
    applicationId: item.applicationId,
    episodeId: item.episodeId,
    readiness: item.allocationReadiness,
    reasonCodes,
    candidateGenerationAvailable: false
  });
}

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

function lowerEnvironmentOwnership(store: ApplicantStore): ResourceOwnership {
  return store.parkOwnerships.get(lowerEnvironmentParkFixture.id) ?? {
    parkId: lowerEnvironmentParkFixture.id,
    organisationId: lowerEnvironmentOrganisationFixture.id,
    countryCode: lowerEnvironmentAwardCycle2026Fixture.countryCode
  };
}
