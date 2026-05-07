
import type { z } from "zod";
import {
  applicationDraftFixture,
  applicationSubmissionResponseSchema,
  currentManagementPlanDocumentFixture,
  documentUploadSessionSchema,
  lowerEnvironmentAwardCycle2026Fixture,
  lowerEnvironmentOrganisationFixture,
  lowerEnvironmentParkFixture,
  paymentSummaryResponseSchema,
  pendingInvoiceFixture,
  previousFeedbackResponseDraftSchema,
  scopedAdminRoleAssignmentFixture
} from "@green-flag/contracts";
import type { ResourceOwnership } from "../authorization.js";
import type { AuditEvent } from "../auth.js";
import type { AdminOverrideEvent } from "../overrides.js";

export type ApplicationRecord = typeof applicationDraftFixture;
export type DocumentRecord = typeof currentManagementPlanDocumentFixture;
export type UploadSessionRecord = z.infer<typeof documentUploadSessionSchema>;
export type InvoiceRecord = typeof pendingInvoiceFixture;
export type PaymentRecord = z.infer<typeof paymentSummaryResponseSchema>;
export type PreviousFeedbackResponseRecord = z.infer<typeof previousFeedbackResponseDraftSchema>;

export interface ApplicantStore {
  applications: Map<string, ApplicationRecord>;
  previousFeedbackResponses: Map<string, PreviousFeedbackResponseRecord>;
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
    previousFeedbackResponses: new Map(),
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
        previousFeedbackResponses: structuredClone([...store.previousFeedbackResponses.entries()]),
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
        store.previousFeedbackResponses = new Map(snapshot.previousFeedbackResponses);
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
