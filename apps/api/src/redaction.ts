import type { z } from "zod";
import {
  applicantDashboardResponseSchema,
  applicationDocumentsResponseSchema,
  signedDocumentAccessResponseSchema
} from "@green-flag/contracts";
import type { SessionProfile } from "./auth.js";

type ApplicantDashboard = z.infer<typeof applicantDashboardResponseSchema>;
type ApplicationDocuments = z.infer<typeof applicationDocumentsResponseSchema>;
type SignedDocumentAccess = z.infer<typeof signedDocumentAccessResponseSchema>;

function isApplicantOrOrganisationFacing(session: SessionProfile) {
  return ["PARK_MANAGER", "ORG_ADMIN"].includes(session.actor.role);
}

export function redactApplicantDashboardForSession(
  dashboard: ApplicantDashboard,
  session: SessionProfile
) {
  if (!isApplicantOrOrganisationFacing(session)) {
    return applicantDashboardResponseSchema.parse(dashboard);
  }

  return applicantDashboardResponseSchema.parse({
    items: dashboard.items.map((item) => {
      if (item.displayStatus !== "APPLICATION_UNDER_REVIEW") {
        return item;
      }
      const redacted = {
        ...item,
        displayStatus: "APPLICATION_UNDER_REVIEW",
        allowedActions: []
      };
      delete redacted.applicationId;
      delete redacted.applicationStatus;
      delete redacted.episodeStatus;
      return redacted;
    })
  });
}

export function redactApplicantDocumentsForSession(
  documents: ApplicationDocuments,
  session: SessionProfile
) {
  if (!isApplicantOrOrganisationFacing(session)) {
    return applicationDocumentsResponseSchema.parse(documents);
  }

  return applicationDocumentsResponseSchema.parse({
    ...documents,
    slots: documents.slots.map((slot) => {
      if (slot.currentDocument?.visibility === "MYSTERY_RESTRICTED") {
        return {
          ...slot,
          currentDocument: undefined,
          completionStatus: "missing",
          archivedVersionCount: 0
        };
      }
      return slot;
    })
  });
}

export function redactSignedDocumentAccessForSession(
  access: SignedDocumentAccess,
  session: SessionProfile
) {
  if (!isApplicantOrOrganisationFacing(session) || access.visibility !== "MYSTERY_RESTRICTED") {
    return signedDocumentAccessResponseSchema.parse(access);
  }

  return signedDocumentAccessResponseSchema.parse({
    ...access,
    filename: "redacted",
    contentType: "application/octet-stream"
  });
}
