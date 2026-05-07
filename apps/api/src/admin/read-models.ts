import {
  adminAllocationReadinessPreviewResponseSchema,
  lowerEnvironmentAwardCycle2026Fixture,
  lowerEnvironmentOrganisationFixture,
  lowerEnvironmentParkFixture,
  type ApplicationStatus,
  type EpisodeStatus,
  type SafeDisplayStatus
} from "@green-flag/contracts";
import type { ApplicantStore } from "../applicant.js";
import { canAccessResource, type ResourceOwnership } from "../authorization.js";
import { ApiError, type SessionProfile } from "../auth.js";
import { type QueueQuery, textMatches } from "./query.js";

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

export function applicationQueueItems(store: ApplicantStore) {
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

export function visibleApplicationQueueItems(store: ApplicantStore, session: SessionProfile) {
  return applicationQueueItems(store).filter((item) =>
    item.ownership ? canAccessResource(session, item.ownership) : false
  );
}

export function filterApplicationQueue(items: ReturnType<typeof applicationQueueItems>, query: QueueQuery) {
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

export function paymentQueueItems(store: ApplicantStore) {
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

export function documentQueueItems(store: ApplicantStore) {
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

export function readinessForApplication(store: ApplicantStore, applicationId: string) {
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

export function lowerEnvironmentOwnership(store: ApplicantStore): ResourceOwnership {
  return store.parkOwnerships.get(lowerEnvironmentParkFixture.id) ?? {
    parkId: lowerEnvironmentParkFixture.id,
    organisationId: lowerEnvironmentOrganisationFixture.id,
    countryCode: lowerEnvironmentAwardCycle2026Fixture.countryCode
  };
}
