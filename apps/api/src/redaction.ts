import type { z } from "zod";
import {
  applicantDashboardResponseSchema,
  applicantMessageThreadsResponseSchema,
  applicationDocumentsResponseSchema,
  mysteryMessageProjectionSchema,
  mysteryNotificationProjectionSchema,
  mysteryRedactionDecisionSchema,
  mysterySearchExportProjectionSchema,
  signedDocumentAccessResponseSchema,
  type RedactionSurfaceName
} from "@green-flag/contracts";
import type { SessionProfile } from "./auth.js";

type ApplicantDashboard = z.infer<typeof applicantDashboardResponseSchema>;
type ApplicationDocuments = z.infer<typeof applicationDocumentsResponseSchema>;
type ApplicantMessages = z.infer<typeof applicantMessageThreadsResponseSchema>;
type SignedDocumentAccess = z.infer<typeof signedDocumentAccessResponseSchema>;
type MysteryRedactionDecision = z.infer<typeof mysteryRedactionDecisionSchema>;
type MysteryNotificationProjection = z.infer<typeof mysteryNotificationProjectionSchema>;
type MysteryMessageProjection = z.infer<typeof mysteryMessageProjectionSchema>;
type MysterySearchExportProjection = z.infer<typeof mysterySearchExportProjectionSchema>;

type RedactionReason = MysteryRedactionDecision["reasonCodes"][number];

const applicantFacingRoles = new Set(["PARK_MANAGER", "ORG_ADMIN"]);
const fullVisibilityRoles = new Set(["SUPER_ADMIN", "KBT_ADMIN"]);

const forbiddenApplicantMysteryTokens = [
  "MYSTERY_SHOP",
  "assessmentTimestamp",
  "suppressedNotification",
  "rawScore",
  "storageKey"
];

export function isApplicantOrOrganisationFacing(session: SessionProfile) {
  return applicantFacingRoles.has(session.actor.role);
}

export function hasFullMysteryVisibility(session: SessionProfile) {
  return fullVisibilityRoles.has(session.actor.role);
}

export function buildMysteryRedactionDecision({
  surface,
  action,
  redactedFields,
  reasonCodes,
  safeDisplayStatus
}: {
  surface: RedactionSurfaceName;
  action: MysteryRedactionDecision["action"];
  redactedFields: string[];
  reasonCodes: RedactionReason[];
  safeDisplayStatus?: "APPLICATION_UNDER_REVIEW";
}) {
  return mysteryRedactionDecisionSchema.parse({
    surface,
    action,
    redactedFields,
    reasonCodes,
    ...(safeDisplayStatus ? { safeDisplayStatus } : {})
  });
}

function isMysteryDashboardItem(item: ApplicantDashboard["items"][number]) {
  return item.displayStatus === "APPLICATION_UNDER_REVIEW";
}

function redactedDashboardDecision() {
  return buildMysteryRedactionDecision({
    surface: "applicant_dashboard",
    action: "redact",
    safeDisplayStatus: "APPLICATION_UNDER_REVIEW",
    redactedFields: [
      "applicationId",
      "applicationStatus",
      "episodeStatus",
      "episodeType",
      "assignmentState",
      "judgeIdentity",
      "judgeCount",
      "visitDates"
    ],
    reasonCodes: ["mystery_episode", "applicant_or_org_surface", "status_label_rewritten"]
  });
}

export function redactApplicantDashboardForSession(
  dashboard: ApplicantDashboard,
  session: SessionProfile
) {
  if (!isApplicantOrOrganisationFacing(session)) {
    return applicantDashboardResponseSchema.parse(dashboard);
  }

  const decision = redactedDashboardDecision();
  return applicantDashboardResponseSchema.parse({
    items: dashboard.items.map((item) => {
      if (!isMysteryDashboardItem(item)) {
        return item;
      }
      const redacted = {
        ...item,
        displayStatus: decision.safeDisplayStatus,
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

export function projectApplicantMessagesForSession(
  messages: {
    threads: Array<{
      threadId: string;
      episodeId?: string | undefined;
      parkId?: string | undefined;
      subject: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
    messages: Array<{
      messageId: string;
      threadId: string;
      senderActorId: string;
      body: string;
      createdAt: string;
    }>;
  },
  session: SessionProfile
): ApplicantMessages {
  return applicantMessageThreadsResponseSchema.parse({
    threads: messages.threads.map((thread) => ({
      threadId: thread.threadId,
      ...(thread.episodeId ? { episodeId: thread.episodeId } : {}),
      ...(thread.parkId ? { parkId: thread.parkId } : {}),
      subject: thread.subject,
      status: thread.status,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt
    })),
    messages: messages.messages.map((message) => ({
      messageId: message.messageId,
      threadId: message.threadId,
      body: message.body,
      createdAt: message.createdAt,
      sentByCurrentActor: message.senderActorId === session.actor.actorId
    }))
  });
}

export function projectMysteryNotificationForSession({
  notificationId,
  isMystery,
  label,
  session
}: {
  notificationId: string;
  isMystery: boolean;
  label?: string;
  session: SessionProfile;
}): MysteryNotificationProjection {
  if (!isMystery || hasFullMysteryVisibility(session)) {
    return mysteryNotificationProjectionSchema.parse({
      notificationId,
      surface: "applicant_notification",
      visible: true,
      ...(label ? { label } : {}),
      suppressed: false,
      redaction: buildMysteryRedactionDecision({
        surface: "applicant_notification",
        action: "allow",
        redactedFields: [],
        reasonCodes: []
      })
    });
  }

  return mysteryNotificationProjectionSchema.parse({
    notificationId,
    surface: "applicant_notification",
    visible: false,
    suppressed: true,
    redaction: buildMysteryRedactionDecision({
      surface: "applicant_notification",
      action: "suppress",
      redactedFields: ["notificationType", "recipient", "suppressedReason", "assignmentState"],
      reasonCodes: ["mystery_episode", "applicant_or_org_surface", "notification_suppressed"]
    })
  });
}

export function projectMysteryMessageForSession({
  threadId,
  isMystery,
  subject,
  session
}: {
  threadId: string;
  isMystery: boolean;
  subject?: string;
  session: SessionProfile;
}): MysteryMessageProjection {
  if (!isMystery || hasFullMysteryVisibility(session)) {
    return mysteryMessageProjectionSchema.parse({
      threadId,
      surface: "applicant_message",
      visible: true,
      ...(subject ? { subject } : {}),
      hiddenMessageCount: 0,
      redaction: buildMysteryRedactionDecision({
        surface: "applicant_message",
        action: "allow",
        redactedFields: [],
        reasonCodes: []
      })
    });
  }

  return mysteryMessageProjectionSchema.parse({
    threadId,
    surface: "applicant_message",
    visible: false,
    hiddenMessageCount: 0,
    redaction: buildMysteryRedactionDecision({
      surface: "applicant_message",
      action: "suppress",
      redactedFields: ["threadSubject", "senderIdentity", "assignmentState", "visitDates"],
      reasonCodes: ["mystery_episode", "applicant_or_org_surface", "message_metadata_hidden"]
    })
  });
}

export function projectMysterySearchExportForSession({
  surface,
  isMystery,
  count,
  session
}: {
  surface: "applicant_search" | "applicant_export";
  isMystery: boolean;
  count: number;
  session: SessionProfile;
}): MysterySearchExportProjection {
  if (!isMystery || hasFullMysteryVisibility(session)) {
    return mysterySearchExportProjectionSchema.parse({
      surface,
      visibleCount: count,
      countSuppressed: false,
      redaction: buildMysteryRedactionDecision({
        surface,
        action: "allow",
        redactedFields: [],
        reasonCodes: []
      })
    });
  }

  return mysterySearchExportProjectionSchema.parse({
    surface,
    visibleCount: 0,
    countSuppressed: true,
    redaction: buildMysteryRedactionDecision({
      surface,
      action: "suppress",
      redactedFields: ["totalItems", "hiddenEpisodeCount", "resultCount"],
      reasonCodes: ["mystery_episode", "applicant_or_org_surface", "count_suppressed"]
    })
  });
}

export function safeMysteryStatusLabelForSession({
  isMystery,
  statusLabel,
  session
}: {
  isMystery: boolean;
  statusLabel: string;
  session: SessionProfile;
}) {
  if (!isMystery || hasFullMysteryVisibility(session)) {
    return statusLabel;
  }
  return "APPLICATION_UNDER_REVIEW";
}

export function assertNoApplicantMysteryLeak(payload: unknown, session: SessionProfile) {
  if (!isApplicantOrOrganisationFacing(session)) {
    return;
  }
  const serialized = JSON.stringify(payload);
  const leaked = forbiddenApplicantMysteryTokens.filter((token) => serialized.includes(token));
  if (leaked.length > 0) {
    throw new Error(`Applicant/org Mystery projection leaked forbidden token(s): ${leaked.join(", ")}`);
  }
}
