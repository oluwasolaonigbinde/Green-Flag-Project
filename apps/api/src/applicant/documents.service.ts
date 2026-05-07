
import {
  applicationDocumentsFixture,
  applicationDocumentsResponseSchema
} from "@green-flag/contracts";
import type { ApplicantStore, ApplicationRecord, DocumentRecord } from "./store.js";

export function documentCompletion(documents: DocumentRecord[], application: ApplicationRecord) {
  const currentManagementPlan = documents.find(
    (document) =>
      document.applicationId === application.applicationId &&
      document.documentType === "management_plan" &&
      document.isCurrent &&
      document.status === "AVAILABLE"
  );
  return currentManagementPlan ? "complete" : "missing_required";
}

export function applicationDocuments(store: ApplicantStore, application: ApplicationRecord) {
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

export function applicationDocumentState(store: ApplicantStore, applicationId: string): "management_plan_uploaded" | "management_plan_missing" {
  const documents = [...store.documents.values()].filter((document) => document.applicationId === applicationId);
  return documents.some(
    (document) => document.documentType === "management_plan" && document.isCurrent && document.status === "AVAILABLE"
  )
    ? "management_plan_uploaded"
    : "management_plan_missing";
}

export function chunkProgress(acceptedChunks: number[], totalChunks: number) {
  return Math.round((acceptedChunks.length / totalChunks) * 100);
}
