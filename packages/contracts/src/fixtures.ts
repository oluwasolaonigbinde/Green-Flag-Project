import type { z } from "zod";
import { safeDisplayStatuses } from "./enums.js";
import {
  applicantDashboardItemSchema,
  applicantDashboardResponseSchema,
  adminAssessorDetailResponseSchema,
  adminAssessorListResponseSchema,
  adminResultDetailResponseSchema,
  applicantResultResponseSchema,
  applicationDraftResponseSchema,
  applicationDocumentsResponseSchema,
  autosaveApplicationSectionResponseSchema,
  assessmentEpisodeSchema,
  auditEventSchema,
  awardCycleSchema,
  awardTrackSchema,
  completeDocumentUploadResponseSchema,
  contractMetadataResponseSchema,
  cycleWindowSchema,
  documentChunkAcknowledgementSchema,
  documentUploadSessionSchema,
  documentVersionsResponseSchema,
  organisationSchema,
  internalUserSummarySchema,
  parkLocationSchema,
  parkSchema,
  parkCycleSnapshotSchema,
  previousFeedbackResponseDraftSchema,
  signedDocumentAccessResponseSchema,
  roleAssignmentSchema,
  adminAllocationReadinessPreviewResponseSchema,
  adminApplicationDetailResponseSchema,
  adminApplicationQueueResponseSchema,
  adminDashboardSummaryResponseSchema,
  adminDocumentQueueResponseSchema,
  adminPaymentQueueResponseSchema,
  adminRegistrationQueueResponseSchema,
  adminRegistrationReviewQueueResponseSchema,
  allocationCandidatesResponseSchema,
  allocationCommandResponseSchema,
  allocationReadyEpisodesResponseSchema,
  assessorAssignmentDecisionResponseSchema,
  assessorAssignmentsResponseSchema,
  assessmentCommandResponseSchema,
  assessmentTemplateSchema,
  assessorVisitsResponseSchema,
  judgeAssessmentResponseSchema,
  adminAssessmentDetailResponseSchema,
  assessorProfileCommandResponseSchema,
  assessorSelfProfileResponseSchema,
  adminPaymentActionResponseSchema,
  applicationSubmissionResponseSchema,
  parkActivationResponseSchema,
  paymentDeadlineCheckResponseSchema,
  paymentSummaryResponseSchema,
  registrationLocationSuggestionSchema,
  registrationSubmissionRequestSchema,
  registrationSubmissionResponseSchema,
  registrationSummarySchema,
  mysteryMessageProjectionSchema,
  mysteryNotificationProjectionSchema,
  mysteryRedactionDecisionSchema,
  mysterySearchExportProjectionSchema,
  notificationQueueResponseSchema,
  notificationDispatchStubResponseSchema,
  messageThreadsResponseSchema,
  messageCommandResponseSchema,
  jobRunsResponseSchema,
  renewalReminderRunResponseSchema,
  exportCommandResponseSchema,
  exportJobsResponseSchema,
  resultCommandResponseSchema,
  sessionProfileSchema
} from "./schemas.js";

type ApplicantDashboardItem = z.infer<typeof applicantDashboardItemSchema>;

export const standardGreenFlagCategory = {
  code: "STANDARD_GREEN_FLAG",
  label: "Standard Green Flag Award",
  operationalStatus: "OPERATIONAL"
} as const;

export const blockedAwardCategories = [
  {
    code: "COMMUNITY",
    label: "Community",
    operationalStatus: "BLOCKED_PENDING_CRITERIA"
  },
  {
    code: "HERITAGE",
    label: "Heritage",
    operationalStatus: "BLOCKED_PENDING_CRITERIA"
  },
  {
    code: "GROUP",
    label: "Group",
    operationalStatus: "BLOCKED_PENDING_CRITERIA"
  }
] as const;

export const fullAssessmentDashboardFixture = applicantDashboardItemSchema.parse({
  applicationId: "11111111-1111-4111-8111-111111111111",
  episodeId: "22222222-2222-4222-8222-222222222222",
  parkId: "33333333-3333-4333-8333-333333333333",
  parkName: "Lower Environment Park",
  cycleYear: 2026,
  category: "STANDARD_GREEN_FLAG",
  displayStatus: "IN_PROGRESS",
  applicationStatus: "IN_PROGRESS",
  episodeStatus: "APPLICATION_DRAFT",
  completionPercent: 40,
  invoice: {
    status: "not_applicable"
  },
  result: {
    status: "not_available"
  },
  allowedActions: ["continue_application"]
}) satisfies ApplicantDashboardItem;

export const mysteryApplicantDashboardFixture = applicantDashboardItemSchema.parse({
  episodeId: "44444444-4444-4444-8444-444444444444",
  parkId: "33333333-3333-4333-8333-333333333333",
  parkName: "Lower Environment Park",
  cycleYear: 2026,
  category: "STANDARD_GREEN_FLAG",
  displayStatus: "APPLICATION_UNDER_REVIEW",
  completionPercent: 100,
  invoice: {
    status: "not_applicable"
  },
  result: {
    status: "not_available"
  },
  allowedActions: []
}) satisfies ApplicantDashboardItem;

export const applicantDashboardFixture = applicantDashboardResponseSchema.parse({
  items: [fullAssessmentDashboardFixture, mysteryApplicantDashboardFixture]
});

export const applicationDraftFixture = applicationDraftResponseSchema.parse({
  applicationId: fullAssessmentDashboardFixture.applicationId,
  episodeId: fullAssessmentDashboardFixture.episodeId,
  parkId: fullAssessmentDashboardFixture.parkId,
  status: "IN_PROGRESS",
  displayStatus: "IN_PROGRESS",
  completionPercent: 40,
  version: 2,
  updatedAt: "2026-05-05T00:00:00Z",
  allowedActions: [
    "continue_application",
    "autosave_section",
    "review_draft",
    "upload_management_plan_deferred",
    "submit_deferred"
  ],
  sections: [
    {
      sectionKey: "location",
      status: "complete",
      completionPercent: 100,
      version: 1,
      fields: {
        w3wAddress: "///lower.environment.park",
        postcode: "LE1 2AB"
      },
      updatedAt: "2026-05-05T00:00:00Z"
    },
    {
      sectionKey: "site_information",
      status: "in_progress",
      completionPercent: 50,
      version: 2,
      fields: {
        siteDescription: "Synthetic lower environment draft",
        hasAccessibleEntrances: true
      },
      updatedAt: "2026-05-05T00:00:00Z"
    },
    {
      sectionKey: "contact_details",
      status: "not_started",
      completionPercent: 0,
      version: 0,
      fields: {}
    },
    {
      sectionKey: "publicity",
      status: "not_started",
      completionPercent: 0,
      version: 0,
      fields: {}
    },
    {
      sectionKey: "optional_information",
      status: "not_started",
      completionPercent: 0,
      version: 0,
      fields: {}
    },
    {
      sectionKey: "previous_feedback",
      status: "not_started",
      completionPercent: 0,
      version: 0,
      fields: {}
    },
    {
      sectionKey: "review",
      status: "not_started",
      completionPercent: 0,
      version: 0,
      fields: {}
    }
  ]
});

export const autosaveApplicationSectionFixture = autosaveApplicationSectionResponseSchema.parse({
  applicationId: applicationDraftFixture.applicationId,
  section: {
    sectionKey: "site_information",
    status: "complete",
    completionPercent: 100,
    version: 3,
    fields: {
      siteDescription: "Synthetic lower environment draft",
      hasAccessibleEntrances: true,
      visitorFacilities: ["toilets", "play area"]
    },
    updatedAt: "2026-05-05T00:01:00Z"
  },
  applicationStatus: "IN_PROGRESS",
  completionPercent: 55,
  version: 3
});

export const previousFeedbackResponseDraftFixture = previousFeedbackResponseDraftSchema.parse({
  applicationId: applicationDraftFixture.applicationId,
  responseText: "Synthetic response to previous judge feedback.",
  version: 3,
  updatedAt: "2026-05-05T00:02:00Z"
});

export const currentManagementPlanDocumentFixture = completeDocumentUploadResponseSchema.shape.document.parse({
  documentId: "15151515-1515-4151-8151-151515151515",
  applicationId: applicationDraftFixture.applicationId,
  episodeId: applicationDraftFixture.episodeId,
  parkId: applicationDraftFixture.parkId,
  documentType: "management_plan",
  filename: "lower-environment-management-plan.pdf",
  contentType: "application/pdf",
  byteSize: 2_400_000,
  sha256: "a".repeat(64),
  storageProvider: "lower_env_stub",
  storageKey: "lower-env/applications/11111111-1111-4111-8111-111111111111/management-plan-v2.pdf",
  status: "AVAILABLE",
  visibility: "APPLICANT_AND_ADMIN",
  version: 2,
  isCurrent: true,
  replacesDocumentId: "14141414-1414-4141-8141-141414141414",
  uploadedByActorId: "13131313-1313-4131-8131-131313131313",
  scanStatus: "clean_stub",
  createdAt: "2026-05-05T00:03:00Z",
  updatedAt: "2026-05-05T00:03:00Z"
});

export const archivedManagementPlanDocumentFixture = completeDocumentUploadResponseSchema.shape.document.parse({
  documentId: "14141414-1414-4141-8141-141414141414",
  applicationId: applicationDraftFixture.applicationId,
  episodeId: applicationDraftFixture.episodeId,
  parkId: applicationDraftFixture.parkId,
  documentType: "management_plan",
  filename: "lower-environment-management-plan-previous.pdf",
  contentType: "application/pdf",
  byteSize: 2_100_000,
  sha256: "b".repeat(64),
  storageProvider: "lower_env_stub",
  storageKey: "lower-env/applications/11111111-1111-4111-8111-111111111111/management-plan-v1.pdf",
  status: "ARCHIVED",
  visibility: "APPLICANT_AND_ADMIN",
  version: 1,
  isCurrent: false,
  replacedByDocumentId: currentManagementPlanDocumentFixture.documentId,
  uploadedByActorId: "13131313-1313-4131-8131-131313131313",
  scanStatus: "clean_stub",
  createdAt: "2026-04-05T00:03:00Z",
  updatedAt: "2026-05-05T00:03:00Z"
});

export const applicationDocumentsFixture = applicationDocumentsResponseSchema.parse({
  applicationId: applicationDraftFixture.applicationId,
  episodeId: applicationDraftFixture.episodeId,
  parkId: applicationDraftFixture.parkId,
  documentCompletionStatus: "complete",
  slots: [
    {
      documentType: "management_plan",
      required: true,
      label: "Management plan",
      completionStatus: "uploaded",
      currentDocument: currentManagementPlanDocumentFixture,
      archivedVersionCount: 1,
      allowedActions: ["create_upload_session", "replace_document", "download_document"]
    },
    {
      documentType: "supporting_document",
      required: false,
      label: "Supporting document",
      completionStatus: "missing",
      archivedVersionCount: 0,
      allowedActions: ["create_upload_session"]
    }
  ]
});

export const documentUploadSessionFixture = documentUploadSessionSchema.parse({
  sessionId: "16161616-1616-4161-8161-161616161616",
  applicationId: applicationDraftFixture.applicationId,
  documentType: "management_plan",
  filename: "lower-environment-management-plan-new.pdf",
  contentType: "application/pdf",
  byteSize: 2_500_000,
  sha256: "c".repeat(64),
  totalChunks: 3,
  acceptedChunks: [],
  status: "CREATED",
  progressPercent: 0,
  uploadUrlTemplate: "https://lower-env-storage.invalid/upload/16161616-1616-4161-8161-161616161616/{chunkIndex}",
  expiresAt: "2026-05-05T01:03:00Z",
  version: 0
});

export const documentChunkAcknowledgementFixture = documentChunkAcknowledgementSchema.parse({
  sessionId: documentUploadSessionFixture.sessionId,
  acceptedChunkIndex: 0,
  status: "IN_PROGRESS",
  progressPercent: 33,
  version: 1
});

export const completeDocumentUploadFixture = completeDocumentUploadResponseSchema.parse({
  applicationId: applicationDraftFixture.applicationId,
  document: currentManagementPlanDocumentFixture,
  archivedDocumentId: archivedManagementPlanDocumentFixture.documentId
});

export const signedDocumentAccessFixture = signedDocumentAccessResponseSchema.parse({
  documentId: currentManagementPlanDocumentFixture.documentId,
  method: "GET",
  url: "https://lower-env-storage.invalid/download/15151515-1515-4151-8151-151515151515",
  expiresAt: "2026-05-05T00:18:00Z",
  filename: currentManagementPlanDocumentFixture.filename,
  contentType: currentManagementPlanDocumentFixture.contentType,
  visibility: currentManagementPlanDocumentFixture.visibility
});

export const documentVersionsFixture = documentVersionsResponseSchema.parse({
  applicationId: applicationDraftFixture.applicationId,
  documentType: "management_plan",
  versions: [currentManagementPlanDocumentFixture, archivedManagementPlanDocumentFixture]
});

export const pendingInvoiceFixture = applicationSubmissionResponseSchema.shape.invoice.parse({
  invoiceId: "17171717-1717-4171-8171-171717171717",
  applicationId: applicationDraftFixture.applicationId,
  episodeId: applicationDraftFixture.episodeId,
  status: "PENDING",
  amount: "external_value_unavailable",
  dueAt: "2026-06-30T23:59:59Z",
  availableInPortal: true,
  notificationIntents: ["application_submitted_email", "invoice_available_email"]
});

export const paymentSummaryFixture = paymentSummaryResponseSchema.parse({
  applicationId: applicationDraftFixture.applicationId,
  invoice: pendingInvoiceFixture,
  purchaseOrder: {
    purchaseOrderNumber: "PO-LOWER-ENV-001",
    noPurchaseOrderDeclared: false
  },
  manuallyMarkedPaid: false,
  overrideApplied: false,
  blockedForAllocation: false,
  updatedAt: "2026-05-05T00:04:00Z"
});

export const applicationSubmissionFixture = applicationSubmissionResponseSchema.parse({
  applicationId: applicationDraftFixture.applicationId,
  episodeId: applicationDraftFixture.episodeId,
  applicationStatus: "SUBMITTED",
  episodeStatus: "PAYMENT_PENDING",
  submittedAt: "2026-05-05T00:04:00Z",
  documentState: "management_plan_uploaded",
  invoice: pendingInvoiceFixture,
  payment: paymentSummaryFixture
});

export const submittedWithMissingPlanFixture = applicationSubmissionResponseSchema.parse({
  ...applicationSubmissionFixture,
  applicationStatus: "SUBMITTED_WITH_MISSING_PLAN",
  documentState: "management_plan_missing"
});

export const manualPaymentPaidFixture = adminPaymentActionResponseSchema.parse({
  invoiceId: pendingInvoiceFixture.invoiceId,
  status: "PAID",
  manuallyMarkedPaid: true,
  overrideApplied: false,
  blockedForAllocation: false,
  reason: "Lower-env manual payment confirmation.",
  updatedAt: "2026-05-05T00:05:00Z"
});

export const paymentOverrideFixture = adminPaymentActionResponseSchema.parse({
  invoiceId: pendingInvoiceFixture.invoiceId,
  status: "WAIVED",
  manuallyMarkedPaid: false,
  overrideApplied: true,
  blockedForAllocation: false,
  reason: "Lower-env payment override.",
  updatedAt: "2026-05-05T00:06:00Z"
});

export const paymentDeadlineCheckFixture = paymentDeadlineCheckResponseSchema.parse({
  checkedAt: "2026-07-01T00:00:00Z",
  blockedInvoiceIds: [pendingInvoiceFixture.invoiceId]
});

export const adminApplicationQueueFixture = adminApplicationQueueResponseSchema.parse({
  items: [
    {
      applicationId: applicationSubmissionFixture.applicationId,
      episodeId: applicationSubmissionFixture.episodeId,
      parkId: applicationDraftFixture.parkId,
      parkName: "Lower Environment Park",
      organisationName: "Lower Environment Council",
      cycleYear: 2026,
      applicationStatus: applicationSubmissionFixture.applicationStatus,
      episodeStatus: applicationSubmissionFixture.episodeStatus,
      displayStatus: "PAYMENT_PENDING",
      paymentStatus: pendingInvoiceFixture.status,
      documentStatus: "complete",
      allocationReadiness: "blocked",
      attentionFlags: ["payment_pending"]
    },
    {
      applicationId: submittedWithMissingPlanFixture.applicationId,
      episodeId: submittedWithMissingPlanFixture.episodeId,
      parkId: applicationDraftFixture.parkId,
      parkName: "Lower Environment Park",
      organisationName: "Lower Environment Council",
      cycleYear: 2026,
      applicationStatus: submittedWithMissingPlanFixture.applicationStatus,
      episodeStatus: submittedWithMissingPlanFixture.episodeStatus,
      displayStatus: "SUBMITTED",
      paymentStatus: pendingInvoiceFixture.status,
      documentStatus: "missing_required",
      allocationReadiness: "blocked",
      attentionFlags: ["payment_pending", "management_plan_missing"]
    }
  ],
  page: {
    page: 1,
    pageSize: 25,
    totalItems: 2,
    availableFilters: ["status", "cycleYear", "paymentStatus", "documentStatus", "attention"]
  }
});

export const adminPaymentQueueFixture = adminPaymentQueueResponseSchema.parse({
  items: [
    {
      invoiceId: pendingInvoiceFixture.invoiceId,
      applicationId: applicationSubmissionFixture.applicationId,
      episodeId: applicationSubmissionFixture.episodeId,
      parkName: "Lower Environment Park",
      organisationName: "Lower Environment Council",
      status: pendingInvoiceFixture.status,
      amount: pendingInvoiceFixture.amount,
      dueAt: pendingInvoiceFixture.dueAt,
      purchaseOrder: paymentSummaryFixture.purchaseOrder,
      manuallyMarkedPaid: paymentSummaryFixture.manuallyMarkedPaid,
      overrideApplied: paymentSummaryFixture.overrideApplied,
      blockedForAllocation: paymentSummaryFixture.blockedForAllocation
    }
  ],
  page: {
    page: 1,
    pageSize: 25,
    totalItems: 1,
    availableFilters: ["status", "cycleYear", "paymentStatus", "attention"]
  }
});

export const adminDocumentQueueFixture = adminDocumentQueueResponseSchema.parse({
  items: [
    {
      documentId: currentManagementPlanDocumentFixture.documentId,
      applicationId: currentManagementPlanDocumentFixture.applicationId,
      episodeId: currentManagementPlanDocumentFixture.episodeId,
      parkName: "Lower Environment Park",
      documentType: currentManagementPlanDocumentFixture.documentType,
      status: currentManagementPlanDocumentFixture.status,
      visibility: currentManagementPlanDocumentFixture.visibility,
      version: currentManagementPlanDocumentFixture.version,
      archivedVersionCount: 1,
      attentionFlag: "none"
    },
    {
      documentId: archivedManagementPlanDocumentFixture.documentId,
      applicationId: archivedManagementPlanDocumentFixture.applicationId,
      episodeId: archivedManagementPlanDocumentFixture.episodeId,
      parkName: "Lower Environment Park",
      documentType: archivedManagementPlanDocumentFixture.documentType,
      status: archivedManagementPlanDocumentFixture.status,
      visibility: archivedManagementPlanDocumentFixture.visibility,
      version: archivedManagementPlanDocumentFixture.version,
      archivedVersionCount: 0,
      attentionFlag: "none"
    }
  ],
  page: {
    page: 1,
    pageSize: 25,
    totalItems: 2,
    availableFilters: ["status", "cycleYear", "documentStatus", "attention"]
  }
});

export const adminAllocationReadinessPreviewFixture = adminAllocationReadinessPreviewResponseSchema.parse({
  applicationId: applicationSubmissionFixture.applicationId,
  episodeId: applicationSubmissionFixture.episodeId,
  readiness: "blocked",
  reasonCodes: ["payment_pending"],
  candidateGenerationAvailable: false
});

export const adminApplicationDetailFixture = adminApplicationDetailResponseSchema.parse({
  application: adminApplicationQueueFixture.items[0],
  invoice: pendingInvoiceFixture,
  payment: paymentSummaryFixture,
  documents: [adminDocumentQueueFixture.items[0]],
  allocationReadiness: adminAllocationReadinessPreviewFixture,
  result: {
    status: "not_available",
    displayLabel: "Deferred until results slice"
  }
});

export const adminDashboardSummaryFixture = adminDashboardSummaryResponseSchema.parse({
  generatedAt: "2026-05-05T00:07:00Z",
  counts: {
    registrationsPendingReview: 1,
    applicationsSubmitted: 2,
    paymentsNeedAttention: 1,
    documentsNeedAttention: 0,
    allocationReadyPreview: 0,
    resultsUnavailable: 2
  },
  attention: [
    {
      queue: "registrations",
      label: "Registration reviews",
      count: 1
    },
    {
      queue: "payments",
      label: "Payments needing attention",
      count: 1
    },
    {
      queue: "allocation_readiness",
      label: "Ready for allocation preview",
      count: 0
    }
  ]
});

export const contractMetadataFixture = contractMetadataResponseSchema.parse({
  slice: "S00-operating-layer-and-contract-build-baseline",
  episodeFirst: true,
  safeDisplayStatuses: [...safeDisplayStatuses],
  forbiddenProductionValues: [
    "production_fees",
    "vat_treatment",
    "legal_invoice_wording",
    "official_scoring_criteria",
    "applicant_score_bands",
    "provider_credentials",
    "kbt_approvals"
  ]
});

export const awardTrackFixtures = [
  awardTrackSchema.parse(standardGreenFlagCategory),
  ...blockedAwardCategories.map((awardTrack) => awardTrackSchema.parse(awardTrack))
];

export const lowerEnvironmentOrganisationFixture = organisationSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Lower Environment Council"
});

export const lowerEnvironmentParkFixture = parkSchema.parse({
  id: "22222222-2222-4222-8222-222222222222",
  organisationId: lowerEnvironmentOrganisationFixture.id,
  awardTrackCode: "STANDARD_GREEN_FLAG",
  name: "Lower Environment Park",
  status: "ACTIVE"
});

export const lowerEnvironmentParkLocationFixture = parkLocationSchema.parse({
  id: "33333333-3333-4333-8333-333333333333",
  parkId: lowerEnvironmentParkFixture.id,
  latitude: 53.4001,
  longitude: -2.2001,
  w3wAddress: "///lower.environment.park",
  postcode: "LE1 2AB",
  localAuthority: "Lower Environment Borough",
  region: "North West",
  country: "England",
  constituency: "Lower Environment North",
  confirmedAt: "2026-05-05T00:00:00Z"
});

export const lowerEnvironmentAwardCycle2025Fixture = awardCycleSchema.parse({
  id: "44444444-4444-4444-8444-444444444444",
  countryCode: "GB",
  cycleYear: 2025,
  applicationWindowOpensAt: "2025-04-01T00:00:00Z",
  applicationWindowClosesAt: "2025-06-30T23:59:59Z",
  resultAnnouncementAt: "2025-07-10T12:00:00Z"
});

export const lowerEnvironmentAwardCycle2026Fixture = awardCycleSchema.parse({
  id: "55555555-5555-4555-8555-555555555555",
  countryCode: "GB",
  cycleYear: 2026,
  applicationWindowOpensAt: "2026-04-01T00:00:00Z",
  applicationWindowClosesAt: "2026-06-30T23:59:59Z",
  resultAnnouncementAt: "2026-07-10T12:00:00Z"
});

export const lowerEnvironmentCycleWindowMysteryFixture = cycleWindowSchema.parse({
  id: "66666666-6666-4666-8666-666666666666",
  awardCycleId: lowerEnvironmentAwardCycle2025Fixture.id,
  episodeType: "MYSTERY_SHOP",
  opensAt: "2025-04-01T00:00:00Z",
  closesAt: "2025-06-30T23:59:59Z"
});

export const lowerEnvironmentCycleWindowFullFixture = cycleWindowSchema.parse({
  id: "77777777-7777-4777-8777-777777777777",
  awardCycleId: lowerEnvironmentAwardCycle2026Fixture.id,
  episodeType: "FULL_ASSESSMENT",
  opensAt: "2026-04-01T00:00:00Z",
  closesAt: "2026-06-30T23:59:59Z"
});

export const lowerEnvironmentMysteryEpisodeFixture = assessmentEpisodeSchema.parse({
  id: "88888888-8888-4888-8888-888888888888",
  parkId: lowerEnvironmentParkFixture.id,
  awardCycleId: lowerEnvironmentAwardCycle2025Fixture.id,
  cycleWindowId: lowerEnvironmentCycleWindowMysteryFixture.id,
  awardTrackCode: lowerEnvironmentParkFixture.awardTrackCode,
  episodeType: "MYSTERY_SHOP",
  status: "READY_FOR_ALLOCATION",
  mysterySuppressed: true,
  createdAt: "2025-04-01T00:00:00Z",
  updatedAt: "2025-04-01T00:00:00Z"
});

export const lowerEnvironmentFullEpisodeFixture = assessmentEpisodeSchema.parse({
  id: "99999999-9999-4999-8999-999999999999",
  parkId: lowerEnvironmentParkFixture.id,
  awardCycleId: lowerEnvironmentAwardCycle2026Fixture.id,
  cycleWindowId: lowerEnvironmentCycleWindowFullFixture.id,
  awardTrackCode: lowerEnvironmentParkFixture.awardTrackCode,
  episodeType: "FULL_ASSESSMENT",
  status: "APPLICATION_DRAFT",
  mysterySuppressed: false,
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z"
});

export const lowerEnvironmentParkCycleSnapshotFixture = parkCycleSnapshotSchema.parse({
  organisation: lowerEnvironmentOrganisationFixture,
  park: lowerEnvironmentParkFixture,
  location: lowerEnvironmentParkLocationFixture,
  awardTrack: awardTrackFixtures[0],
  awardCycle: lowerEnvironmentAwardCycle2026Fixture,
  cycleWindows: [
    lowerEnvironmentCycleWindowMysteryFixture,
    lowerEnvironmentCycleWindowFullFixture
  ],
  assessmentEpisodes: [
    lowerEnvironmentMysteryEpisodeFixture,
    lowerEnvironmentFullEpisodeFixture
  ]
});

export const internalUserSummaryFixture = internalUserSummarySchema.parse({
  id: "55555555-5555-4555-8555-555555555555",
  cognitoSubject: "cognito-subject-global-admin",
  email: "global.admin@example.invalid",
  displayName: "Global Admin",
  status: "ACTIVE",
  mfaSatisfied: true
});

export const globalAdminRoleAssignmentFixture = roleAssignmentSchema.parse({
  id: "66666666-6666-4666-8666-666666666666",
  internalUserId: internalUserSummaryFixture.id,
  role: "SUPER_ADMIN",
  scope: {
    type: "GLOBAL"
  },
  status: "ACTIVE",
  redactionProfile: "super_admin_full_access"
});

export const scopedAdminRoleAssignmentFixture = roleAssignmentSchema.parse({
  id: "77777777-7777-4777-8777-777777777777",
  internalUserId: "88888888-8888-4888-8888-888888888888",
  role: "KBT_ADMIN",
  scope: {
    type: "COUNTRY",
    id: "99999999-9999-4999-8999-999999999999"
  },
  status: "ACTIVE",
  redactionProfile: "kbt_admin_full_access"
});

export const judgeRoleAssignmentFixture = roleAssignmentSchema.parse({
  id: "18181818-1818-4181-8181-181818181818",
  internalUserId: "19191919-1919-4191-8191-191919191919",
  role: "JUDGE",
  scope: {
    type: "COUNTRY",
    id: "99999999-9999-4999-8999-999999999999"
  },
  status: "ACTIVE",
  redactionProfile: "judge_assigned_full"
});

export const parkManagerRoleAssignmentFixture = roleAssignmentSchema.parse({
  id: "12121212-1212-4121-8121-121212121212",
  internalUserId: "13131313-1313-4131-8131-131313131313",
  role: "PARK_MANAGER",
  scope: {
    type: "PARK",
    id: fullAssessmentDashboardFixture.parkId
  },
  status: "ACTIVE",
  redactionProfile: "applicant_full"
});

export const globalAdminSessionFixture = sessionProfileSchema.parse({
  actor: {
    actorId: internalUserSummaryFixture.id,
    cognitoSubject: internalUserSummaryFixture.cognitoSubject,
    role: "SUPER_ADMIN",
    scopes: [
      {
        type: "GLOBAL"
      }
    ],
    redactionProfile: "super_admin_full_access"
  },
  internalUser: internalUserSummaryFixture,
  roleAssignments: [globalAdminRoleAssignmentFixture],
  mfaSatisfied: true,
  authenticationSource: "cognito"
});

export const scopedAdminSessionFixture = sessionProfileSchema.parse({
  actor: {
    actorId: scopedAdminRoleAssignmentFixture.internalUserId,
    cognitoSubject: "cognito-subject-country-admin",
    role: "KBT_ADMIN",
    scopes: [
      {
        type: "COUNTRY",
        id: "99999999-9999-4999-8999-999999999999"
      }
    ],
    redactionProfile: "kbt_admin_full_access"
  },
  internalUser: {
    id: scopedAdminRoleAssignmentFixture.internalUserId,
    cognitoSubject: "cognito-subject-country-admin",
    email: "country.admin@example.invalid",
    displayName: "Country Admin",
    status: "ACTIVE",
    mfaSatisfied: true
  },
  roleAssignments: [scopedAdminRoleAssignmentFixture],
  mfaSatisfied: true,
  authenticationSource: "cognito"
});

export const parkManagerSessionFixture = sessionProfileSchema.parse({
  actor: {
    actorId: parkManagerRoleAssignmentFixture.internalUserId,
    cognitoSubject: "cognito-subject-park-manager",
    role: "PARK_MANAGER",
    scopes: [parkManagerRoleAssignmentFixture.scope],
    redactionProfile: "applicant_full"
  },
  internalUser: {
    id: parkManagerRoleAssignmentFixture.internalUserId,
    cognitoSubject: "cognito-subject-park-manager",
    email: "park.manager@example.invalid",
    displayName: "Park Manager",
    status: "ACTIVE",
    mfaSatisfied: false
  },
  roleAssignments: [parkManagerRoleAssignmentFixture],
  mfaSatisfied: false,
  authenticationSource: "cognito"
});

export const judgeSessionFixture = sessionProfileSchema.parse({
  actor: {
    actorId: judgeRoleAssignmentFixture.internalUserId,
    cognitoSubject: "cognito-subject-judge",
    role: "JUDGE",
    scopes: [judgeRoleAssignmentFixture.scope],
    redactionProfile: "judge_assigned_full"
  },
  internalUser: {
    id: judgeRoleAssignmentFixture.internalUserId,
    cognitoSubject: "cognito-subject-judge",
    email: "judge@example.invalid",
    displayName: "Lower Env Judge",
    status: "ACTIVE",
    mfaSatisfied: false
  },
  roleAssignments: [judgeRoleAssignmentFixture],
  mfaSatisfied: false,
  authenticationSource: "cognito"
});

export const assessorSelfProfileFixture = assessorSelfProfileResponseSchema.parse({
  profile: {
    assessorId: "20202020-2020-4202-8202-202020202020",
    internalUserId: judgeRoleAssignmentFixture.internalUserId,
    displayName: "Lower Env Judge",
    email: "judge@example.invalid",
    profileStatus: "ACTIVE",
    accreditationStatus: "CURRENT_LOWER_ENV",
    accreditationProvider: "external_value_unavailable",
    primaryRegion: "North West",
    preferences: {
      preferredRegions: ["North West"],
      preferredAwardTrackCodes: ["STANDARD_GREEN_FLAG"],
      unavailableNotes: "Synthetic lower-env preference note.",
      acceptsMysteryShop: false
    },
    availability: [
      {
        availabilityId: "21212121-2121-4212-8212-212121212121",
        assessorId: "20202020-2020-4202-8202-202020202020",
        startsAt: "2026-05-10T09:00:00Z",
        endsAt: "2026-05-10T17:00:00Z",
        availabilityType: "available",
        notes: "Lower-env availability window."
      }
    ],
    capacity: [
      {
        capacityId: "22222222-2222-4222-8222-222222222223",
        assessorId: "20202020-2020-4202-8202-202020202020",
        cycleYear: 2026,
        maxAssignments: 8,
        currentAssignedCount: 0,
        capacityStatus: "available"
      }
    ],
    version: 1,
    updatedAt: "2026-05-05T00:08:00Z"
  },
  assignmentLoadDeferred: true,
  visitScheduleDeferred: true
});

export const adminAssessorListFixture = adminAssessorListResponseSchema.parse({
  items: [
    {
      assessorId: assessorSelfProfileFixture.profile.assessorId,
      internalUserId: assessorSelfProfileFixture.profile.internalUserId,
      displayName: assessorSelfProfileFixture.profile.displayName,
      email: assessorSelfProfileFixture.profile.email,
      profileStatus: assessorSelfProfileFixture.profile.profileStatus,
      accreditationStatus: assessorSelfProfileFixture.profile.accreditationStatus,
      primaryRegion: assessorSelfProfileFixture.profile.primaryRegion,
      capacityStatus: "available",
      maxAssignments: 8,
      currentAssignedCount: 0,
      updatedAt: assessorSelfProfileFixture.profile.updatedAt
    }
  ],
  page: {
    page: 1,
    pageSize: 25,
    totalItems: 1,
    availableFilters: ["profileStatus", "accreditationStatus", "region", "cycleYear", "capacityStatus"]
  }
});

export const adminAssessorDetailFixture = adminAssessorDetailResponseSchema.parse({
  profile: assessorSelfProfileFixture.profile,
  allocationCandidateGenerationAvailable: false,
  providerSyncStatus: "external_value_unavailable"
});

export const assessorPreferencesUpdateFixture = assessorProfileCommandResponseSchema.parse({
  profile: {
    ...assessorSelfProfileFixture.profile,
    preferences: {
      preferredRegions: ["North West", "Yorkshire"],
      preferredAwardTrackCodes: ["STANDARD_GREEN_FLAG"],
      unavailableNotes: "Updated synthetic preference note.",
      acceptsMysteryShop: false
    },
    version: 2,
    updatedAt: "2026-05-05T00:09:00Z"
  },
  auditEventId: "23232323-2323-4232-8232-232323232323"
});

export const assessorAvailabilityUpdateFixture = assessorProfileCommandResponseSchema.parse({
  profile: {
    ...assessorPreferencesUpdateFixture.profile,
    availability: [
      {
        availabilityId: "24242424-2424-4242-8242-242424242424",
        assessorId: assessorSelfProfileFixture.profile.assessorId,
        startsAt: "2026-05-17T09:00:00Z",
        endsAt: "2026-05-17T17:00:00Z",
        availabilityType: "available"
      }
    ],
    version: 3,
    updatedAt: "2026-05-05T00:10:00Z"
  },
  auditEventId: "25252525-2525-4252-8252-252525252525"
});

export const assessorCapacityUpdateFixture = assessorProfileCommandResponseSchema.parse({
  profile: {
    ...assessorAvailabilityUpdateFixture.profile,
    capacity: [
      {
        capacityId: "26262626-2626-4262-8262-262626262626",
        assessorId: assessorSelfProfileFixture.profile.assessorId,
        cycleYear: 2026,
        maxAssignments: 10,
        currentAssignedCount: 0,
        capacityStatus: "available"
      }
    ],
    version: 4,
    updatedAt: "2026-05-05T00:11:00Z"
  },
  auditEventId: "27272727-2727-4272-8272-272727272727"
});

export const auditEventFixture = auditEventSchema.parse({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  actor: globalAdminSessionFixture.actor,
  action: "ASSIGN_ROLE",
  entityType: "role_assignment",
  entityId: globalAdminRoleAssignmentFixture.id,
  beforeState: null,
  afterState: {
    role: globalAdminRoleAssignmentFixture.role,
    scope: globalAdminRoleAssignmentFixture.scope
  },
  request: {
    requestId: "request-0001",
    idempotencyKey: "idem-0001",
    ipAddress: "127.0.0.1",
    userAgent: "vitest"
  },
  reason: "foundation seed",
  createdAt: "2026-05-05T00:00:00Z"
});

export const registrationSubmissionRequestFixture = registrationSubmissionRequestSchema.parse({
  parkName: "Lower Environment Park",
  organisationName: "Lower Environment Council",
  contactName: "Alex Park Manager",
  contactEmail: "park.manager@example.invalid",
  addressLine1: "1 Lower Environment Way",
  town: "Lower Town",
  postcode: "LE1 2AB",
  country: "England",
  eligibility: {
    publiclyAccessible: true,
    freeToEnter: true,
    minimumSizeConfirmed: true
  },
  duplicateAcknowledged: true,
  location: {
    latitude: 53.4001,
    longitude: -2.2001,
    postcode: "LE1 2AB",
    w3wAddress: "///lower.environment.park"
  }
});

export const registrationLocationSuggestionFixture = registrationLocationSuggestionSchema.parse({
  source: "ons_geography_mock",
  label: "Lower Environment Park entrance",
  latitude: 53.4001,
  longitude: -2.2001,
  w3wAddress: "///lower.environment.park",
  parkNameSuggestion: "Lower Environment Park",
  sizeBand: "suggested_from_os_open_greenspace",
  localAuthority: "Lower Environment Borough",
  region: "North West",
  country: "England",
  constituency: "Lower Environment North",
  requiresApplicantConfirmation: true
});

export const registrationSubmissionResponseFixture = registrationSubmissionResponseSchema.parse({
  registrationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  status: "PENDING_VERIFICATION",
  eligibility: {
    eligible: true,
    failedCriteria: []
  },
  duplicateWarning: {
    hasPotentialDuplicate: true,
    matchedFields: ["park_name", "postcode"],
    acknowledged: true
  },
  verificationRequired: true,
  notificationIntents: ["registration_verification_email", "admin_duplicate_alert"]
});

export const registrationSummaryFixture = registrationSummarySchema.parse({
  ...registrationSubmissionResponseFixture,
  parkName: registrationSubmissionRequestFixture.parkName,
  organisationName: registrationSubmissionRequestFixture.organisationName,
  contactEmail: registrationSubmissionRequestFixture.contactEmail,
  submittedAt: "2026-05-05T00:00:00Z"
});

export const adminRegistrationReviewQueueFixture = adminRegistrationReviewQueueResponseSchema.parse({
  items: [
    {
      registrationId: registrationSummaryFixture.registrationId,
      status: "VERIFIED_PENDING_REVIEW",
      parkName: registrationSummaryFixture.parkName,
      organisationName: registrationSummaryFixture.organisationName,
      contactEmail: registrationSummaryFixture.contactEmail,
      eligibility: registrationSummaryFixture.eligibility,
      duplicateWarning: registrationSummaryFixture.duplicateWarning,
      submittedAt: registrationSummaryFixture.submittedAt
    }
  ]
});

export const adminRegistrationQueueFixture = adminRegistrationQueueResponseSchema.parse({
  items: adminRegistrationReviewQueueFixture.items,
  page: {
    page: 1,
    pageSize: 25,
    totalItems: adminRegistrationReviewQueueFixture.items.length,
    availableFilters: ["status", "search"]
  }
});

export const parkActivationResponseFixture = parkActivationResponseSchema.parse({
  registrationId: registrationSummaryFixture.registrationId,
  registrationStatus: "APPROVED",
  parkId: lowerEnvironmentParkFixture.id,
  parkStatus: "ACTIVE",
  notificationIntents: ["registration_approved_email"]
});

export const mysteryRedactionDecisionFixture = mysteryRedactionDecisionSchema.parse({
  surface: "applicant_dashboard",
  action: "redact",
  safeDisplayStatus: "APPLICATION_UNDER_REVIEW",
  redactedFields: [
    "episodeType",
    "episodeStatus",
    "assignmentState",
    "judgeIdentity",
    "visitDates"
  ],
  reasonCodes: ["mystery_episode", "applicant_or_org_surface", "status_label_rewritten"]
});

export const mysteryNotificationProjectionFixture = mysteryNotificationProjectionSchema.parse({
  notificationId: "45454545-4545-4454-8454-454545454545",
  surface: "applicant_notification",
  visible: false,
  suppressed: true,
  redaction: {
    surface: "applicant_notification",
    action: "suppress",
    redactedFields: ["notificationType", "recipient", "suppressedReason", "assignmentState"],
    reasonCodes: ["mystery_episode", "applicant_or_org_surface", "notification_suppressed"]
  }
});

export const mysteryMessageProjectionFixture = mysteryMessageProjectionSchema.parse({
  threadId: "46464646-4646-4464-8464-464646464646",
  surface: "applicant_message",
  visible: false,
  hiddenMessageCount: 0,
  redaction: {
    surface: "applicant_message",
    action: "suppress",
    redactedFields: ["threadSubject", "senderIdentity", "assignmentState", "visitDates"],
    reasonCodes: ["mystery_episode", "applicant_or_org_surface", "message_metadata_hidden"]
  }
});

export const mysterySearchExportProjectionFixture = mysterySearchExportProjectionSchema.parse({
  surface: "applicant_search",
  visibleCount: 0,
  countSuppressed: true,
  redaction: {
    surface: "applicant_search",
    action: "suppress",
    redactedFields: ["totalItems", "hiddenEpisodeCount", "resultCount"],
    reasonCodes: ["mystery_episode", "applicant_or_org_surface", "count_suppressed"]
  }
});

export const allocationPolicyFixture = {
  policyId: "30303030-3030-4303-8303-303030303030",
  countryCode: "GB",
  cycleYear: 2026,
  defaultDistanceKm: 80,
  distanceWeight: 0.6,
  clusterWeight: 0.4,
  rotationPenalty: 20,
  trainingThirdJudgeAllowed: true,
  source: "configurable_lower_env" as const
};

export const allocationReadyEpisodesFixture = allocationReadyEpisodesResponseSchema.parse({
  policy: allocationPolicyFixture,
  items: [
    {
      episodeId: lowerEnvironmentFullEpisodeFixture.id,
      applicationId: applicationSubmissionFixture.applicationId,
      parkId: lowerEnvironmentParkFixture.id,
      parkName: lowerEnvironmentParkFixture.name,
      cycleYear: 2026,
      episodeType: "FULL_ASSESSMENT",
      episodeStatus: "READY_FOR_ALLOCATION",
      paymentStatus: "PAID",
      documentStatus: "complete",
      suggestedJudgeCount: 2,
      judgeCountReasons: ["new_site"],
      allocationStatus: "not_started"
    }
  ]
});

export const allocationCandidatesFixture = allocationCandidatesResponseSchema.parse({
  episodeId: lowerEnvironmentFullEpisodeFixture.id,
  suggestedJudgeCount: 2,
  excludedCandidateCount: 1,
  policy: allocationPolicyFixture,
  candidates: [
    {
      assessorId: assessorSelfProfileFixture.profile.assessorId,
      displayName: assessorSelfProfileFixture.profile.displayName,
      primaryRegion: assessorSelfProfileFixture.profile.primaryRegion,
      accreditationStatus: "CURRENT_LOWER_ENV",
      capacityStatus: "available",
      currentAssignedCount: 0,
      maxAssignments: 10,
      distanceKm: 24,
      score: 84,
      hardExcluded: false,
      flags: [
        {
          type: "rotation",
          severity: "deprioritise",
          reason: "Previous Full Assessment same-park judge.",
          requiresAcknowledgement: true
        }
      ],
      contactPreviewAvailable: false
    }
  ]
});

export const heldAllocationFixture = allocationCommandResponseSchema.parse({
  allocationId: "31313131-3131-4313-8313-313131313131",
  episodeId: lowerEnvironmentFullEpisodeFixture.id,
  status: "HELD",
  finalJudgeCount: 2,
  suggestedJudgeCount: 2,
  contactRevealAvailable: false,
  notificationIntents: [],
  auditEventId: "32323232-3232-4323-8323-323232323232",
  overrideEventIds: [],
  assignments: [
    {
      assignmentId: "33333333-3333-4333-8333-333333333333",
      allocationId: "31313131-3131-4313-8313-313131313131",
      episodeId: lowerEnvironmentFullEpisodeFixture.id,
      assessorId: assessorSelfProfileFixture.profile.assessorId,
      status: "HELD",
      contactRevealAvailable: false,
      version: 0,
      updatedAt: "2026-05-06T00:00:00Z"
    }
  ]
});

export const releasedAllocationFixture = allocationCommandResponseSchema.parse({
  ...heldAllocationFixture,
  status: "RELEASED",
  notificationIntents: ["assignment_release_email_batch"],
  assignments: heldAllocationFixture.assignments.map((assignment) => ({
    ...assignment,
    status: "RELEASED"
  }))
});

export const assessorAssignmentsFixture = assessorAssignmentsResponseSchema.parse({
  items: [
    {
      assignmentId: heldAllocationFixture.assignments[0]!.assignmentId,
      allocationId: heldAllocationFixture.allocationId,
      episodeId: lowerEnvironmentFullEpisodeFixture.id,
      parkName: lowerEnvironmentParkFixture.name,
      cycleYear: 2026,
      status: "RELEASED",
      contactRevealAvailable: false,
      version: 0
    }
  ]
});

export const acceptedAssignmentFixture = assessorAssignmentDecisionResponseSchema.parse({
  auditEventId: "34343434-3434-4343-8343-343434343434",
  assignment: {
    ...heldAllocationFixture.assignments[0]!,
    status: "ACCEPTED",
    version: 1,
    contactRevealAvailable: true,
    updatedAt: "2026-05-06T00:05:00Z"
  }
});

export const assessmentTemplateFixture = assessmentTemplateSchema.parse({
  templateId: "47474747-4747-4474-8474-474747474747",
  awardTrackCode: "STANDARD_GREEN_FLAG",
  cycleYear: 2026,
  source: "configurable_lower_env",
  passThresholdPercent: 70,
  criteria: [
    {
      criterionId: "48484848-4848-4484-8484-484848484848",
      code: "LOWER_ENV_CRITERION_1",
      label: "Lower-env placeholder criterion 1",
      maxScore: 10,
      placeholderOnly: true
    },
    {
      criterionId: "49494949-4949-4494-8494-494949494949",
      code: "LOWER_ENV_CRITERION_2",
      label: "Lower-env placeholder criterion 2",
      maxScore: 10,
      placeholderOnly: true
    }
  ]
});

export const assessorVisitsFixture = assessorVisitsResponseSchema.parse({
  items: [
    {
      visitId: "50505050-5050-4505-8505-505050505050",
      assignmentId: heldAllocationFixture.assignments[0]!.assignmentId,
      episodeId: lowerEnvironmentFullEpisodeFixture.id,
      assessorId: assessorSelfProfileFixture.profile.assessorId,
      status: "SCHEDULED",
      scheduledStartAt: "2026-05-20T09:00:00Z",
      scheduledEndAt: "2026-05-20T11:00:00Z",
      locationDisclosure: "visible_to_assessor_only",
      version: 1
    }
  ]
});

export const judgeAssessmentFixture = judgeAssessmentResponseSchema.parse({
  assessment: {
    assessmentId: "51515151-5151-4515-8515-515151515151",
    assignmentId: heldAllocationFixture.assignments[0]!.assignmentId,
    episodeId: lowerEnvironmentFullEpisodeFixture.id,
    assessorId: assessorSelfProfileFixture.profile.assessorId,
    status: "IN_PROGRESS",
    template: assessmentTemplateFixture,
    scores: [
      {
        criterionId: assessmentTemplateFixture.criteria[0]!.criterionId,
        score: 8,
        notes: "Synthetic lower-env score note."
      }
    ],
    rawScoreTotal: 8,
    maxScoreTotal: 20,
    thresholdMet: false,
    evidence: [],
    offlineSyncVersion: 1,
    version: 1,
    updatedAt: "2026-05-20T11:30:00Z"
  }
});

export const assessmentSubmittedFixture = assessmentCommandResponseSchema.parse({
  assessment: {
    ...judgeAssessmentFixture.assessment,
    status: "SUBMITTED",
    scores: assessmentTemplateFixture.criteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      score: 8
    })),
    rawScoreTotal: 16,
    thresholdMet: true,
    version: 2,
    updatedAt: "2026-05-20T12:00:00Z"
  },
  auditEventId: "52525252-5252-4525-8525-525252525252"
});

export const adminAssessmentDetailFixture = adminAssessmentDetailResponseSchema.parse({
  episodeId: lowerEnvironmentFullEpisodeFixture.id,
  assessments: [assessmentSubmittedFixture.assessment],
  applicantSafeProjectionAvailable: false
});

export const adminResultDetailFixture = adminResultDetailResponseSchema.parse({
  episodeId: lowerEnvironmentFullEpisodeFixture.id,
  decision: {
    decisionId: "56565656-5656-4565-8565-565656565656",
    episodeId: lowerEnvironmentFullEpisodeFixture.id,
    parkId: lowerEnvironmentParkFixture.id,
    applicationId: applicationSubmissionFixture.applicationId,
    status: "CONFIRMED_HELD",
    outcome: "THRESHOLD_MET",
    thresholdAcknowledged: true,
    thresholdMet: true,
    assessmentCount: 1,
    rawScoreTotal: 16,
    maxScoreTotal: 20,
    internalNotes: "Synthetic lower-env result note.",
    version: 0,
    updatedAt: "2026-05-21T09:00:00Z"
  },
  assessments: [assessmentSubmittedFixture.assessment],
  artifacts: [],
  publicMapEvents: []
});

export const resultPublishedFixture = resultCommandResponseSchema.parse({
  decision: {
    ...adminResultDetailFixture.decision!,
    status: "PUBLISHED",
    publishedAt: "2026-05-21T10:00:00Z",
    certificateId: "57575757-5757-4575-8575-575757575757",
    publicMapEventId: "58585858-5858-4585-8585-585858585858",
    version: 1,
    updatedAt: "2026-05-21T10:00:00Z"
  },
  artifacts: [
    {
      artifactId: "57575757-5757-4575-8575-575757575757",
      decisionId: "56565656-5656-4565-8565-565656565656",
      episodeId: lowerEnvironmentFullEpisodeFixture.id,
      artifactType: "certificate_shell",
      storageProvider: "lower_env_stub",
      storageKey: "lower-env/results/56565656-5656-4565-8565-565656565656/certificate-shell.pdf",
      publicVisible: true,
      createdAt: "2026-05-21T10:00:00Z"
    }
  ],
  awardCache: {
    parkId: lowerEnvironmentParkFixture.id,
    episodeId: lowerEnvironmentFullEpisodeFixture.id,
    decisionId: "56565656-5656-4565-8565-565656565656",
    resultStatus: "PUBLISHED",
    displayLabel: "Award published",
    publishedAt: "2026-05-21T10:00:00Z",
    updatedAt: "2026-05-21T10:00:00Z"
  },
  publicMapEvent: {
    eventId: "58585858-5858-4585-8585-585858585858",
    decisionId: "56565656-5656-4565-8565-565656565656",
    parkId: lowerEnvironmentParkFixture.id,
    episodeId: lowerEnvironmentFullEpisodeFixture.id,
    eventType: "award_published",
    status: "PENDING",
    payload: {
      parkId: lowerEnvironmentParkFixture.id,
      displayLabel: "Award published",
      published: true
    },
    createdAt: "2026-05-21T10:00:00Z"
  },
  auditEventId: "59595959-5959-4595-8595-595959595959"
});

export const applicantResultPublishedFixture = applicantResultResponseSchema.parse({
  episodeId: lowerEnvironmentFullEpisodeFixture.id,
  parkId: lowerEnvironmentParkFixture.id,
  status: "published",
  displayLabel: "Award published",
  certificate: {
    certificateId: resultPublishedFixture.decision.certificateId!,
    downloadAvailable: true,
    storageProvider: "lower_env_stub"
  }
});

export const notificationQueueFixture = notificationQueueResponseSchema.parse({
  items: [
    {
      notificationId: "60606060-6060-4606-8606-606060606060",
      templateKey: "application_submitted",
      channel: "email",
      recipientActorId: parkManagerSessionFixture.actor.actorId,
      recipientAddressMarker: "provider_address_deferred",
      status: "QUEUED",
      relatedEntityType: "application",
      relatedEntityId: applicationSubmissionFixture.applicationId,
      createdAt: "2026-05-22T09:00:00Z",
      updatedAt: "2026-05-22T09:00:00Z"
    },
    {
      notificationId: "61616161-6161-4616-8616-616161616161",
      templateKey: "mystery_assignment_suppressed",
      channel: "email",
      recipientActorId: parkManagerSessionFixture.actor.actorId,
      recipientAddressMarker: "provider_address_deferred",
      status: "SUPPRESSED",
      suppressionReason: "mystery_redaction",
      relatedEntityType: "assessment_episode",
      relatedEntityId: mysteryApplicantDashboardFixture.episodeId,
      createdAt: "2026-05-22T09:01:00Z",
      updatedAt: "2026-05-22T09:01:00Z"
    }
  ],
  logs: []
});

export const notificationDispatchStubFixture = notificationDispatchStubResponseSchema.parse({
  notification: {
    ...notificationQueueFixture.items[0]!,
    status: "DISPATCH_STUBBED",
    updatedAt: "2026-05-22T09:02:00Z"
  },
  log: {
    logId: "62626262-6262-4626-8626-626262626262",
    notificationId: notificationQueueFixture.items[0]!.notificationId,
    status: "DISPATCH_STUBBED",
    provider: "adapter_not_configured",
    detail: "Provider dispatch is disabled until deployment configuration is supplied.",
    createdAt: "2026-05-22T09:02:00Z"
  }
});

export const messageThreadsFixture = messageThreadsResponseSchema.parse({
  threads: [
    {
      threadId: "63636363-6363-4636-8636-636363636363",
      episodeId: applicationDraftFixture.episodeId,
      parkId: applicationDraftFixture.parkId,
      subject: "Application query",
      status: "OPEN",
      participantActorIds: [parkManagerSessionFixture.actor.actorId, globalAdminSessionFixture.actor.actorId],
      visibleToApplicant: true,
      createdAt: "2026-05-22T09:03:00Z",
      updatedAt: "2026-05-22T09:03:00Z"
    }
  ],
  messages: [
    {
      messageId: "64646464-6464-4646-8646-646464646464",
      threadId: "63636363-6363-4636-8636-636363636363",
      senderActorId: parkManagerSessionFixture.actor.actorId,
      body: "Synthetic lower-env message.",
      createdAt: "2026-05-22T09:03:00Z"
    }
  ]
});

export const messageCommandFixture = messageCommandResponseSchema.parse({
  thread: messageThreadsFixture.threads[0]!,
  message: messageThreadsFixture.messages[0]!,
  auditEventId: "65656565-6565-4656-8656-656565656565"
});

export const renewalReminderRunFixture = renewalReminderRunResponseSchema.parse({
  jobRun: {
    jobRunId: "66666666-6666-4666-8666-666666666666",
    jobType: "renewal_reminders",
    status: "COMPLETED",
    startedAt: "2026-05-22T09:04:00Z",
    completedAt: "2026-05-22T09:04:01Z",
    processedCount: 1,
    detail: "Lower-env renewal reminder queue run."
  },
  queuedNotifications: [notificationQueueFixture.items[0]!]
});

export const jobRunsFixture = jobRunsResponseSchema.parse({
  items: [renewalReminderRunFixture.jobRun]
});

export const exportCommandFixture = exportCommandResponseSchema.parse({
  exportJob: {
    exportId: "67676767-6767-4676-8676-676767676767",
    exportType: "results",
    format: "csv",
    status: "COMPLETED",
    redactionProfile: "super_admin_full_access",
    storageProvider: "lower_env_stub",
    storageKey: "lower-env/exports/67676767-6767-4676-8676-676767676767.csv",
    requestedByActorId: globalAdminSessionFixture.actor.actorId,
    createdAt: "2026-05-22T09:05:00Z",
    completedAt: "2026-05-22T09:05:01Z"
  },
  auditEventId: "68686868-6868-4686-8686-686868686868"
});

export const exportJobsFixture = exportJobsResponseSchema.parse({
  items: [exportCommandFixture.exportJob]
});
