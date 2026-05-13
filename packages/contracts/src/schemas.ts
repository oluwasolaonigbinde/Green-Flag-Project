import { z } from "zod";
import {
  awardTrackOperationalStatuses,
  applicationStatuses,
  allocationStatuses,
  assessmentEvidenceTypes,
  assessmentStatuses,
  assignmentStatuses,
  coiFlagTypes,
  documentVisibilities,
  episodeStatuses,
  episodeTypes,
  errorCodes,
  exportStatuses,
  jobRunStatuses,
  messageThreadStatuses,
  notificationChannels,
  notificationStatuses,
  redactionDecisionActions,
  redactionProfiles,
  redactionSurfaceNames,
  registrationStatuses,
  parkStatuses,
  publicMapEventStatuses,
  roleScopeTypes,
  roleTypes,
  resultDecisionOutcomes,
  resultStatuses,
  safeDisplayStatuses,
  visitStatuses
} from "./enums.js";

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const roleTypeSchema = z.enum(roleTypes);
export const roleScopeTypeSchema = z.enum(roleScopeTypes);
export const episodeTypeSchema = z.enum(episodeTypes);
export const parkStatusSchema = z.enum(parkStatuses);
export const awardTrackOperationalStatusSchema = z.enum(awardTrackOperationalStatuses);
export const redactionProfileSchema = z.enum(redactionProfiles);
export const redactionSurfaceNameSchema = z.enum(redactionSurfaceNames);
export const redactionDecisionActionSchema = z.enum(redactionDecisionActions);
export const visitStatusSchema = z.enum(visitStatuses);
export const assessmentEvidenceTypeSchema = z.enum(assessmentEvidenceTypes);
export const resultStatusSchema = z.enum(resultStatuses);
export const resultDecisionOutcomeSchema = z.enum(resultDecisionOutcomes);
export const publicMapEventStatusSchema = z.enum(publicMapEventStatuses);
export const notificationChannelSchema = z.enum(notificationChannels);
export const notificationStatusSchema = z.enum(notificationStatuses);
export const messageThreadStatusSchema = z.enum(messageThreadStatuses);
export const jobRunStatusSchema = z.enum(jobRunStatuses);
export const exportStatusSchema = z.enum(exportStatuses);
export const documentVisibilitySchema = z.enum(documentVisibilities);
export const registrationStatusSchema = z.enum(registrationStatuses);
export const applicationStatusSchema = z.enum(applicationStatuses);
export const episodeStatusSchema = z.enum(episodeStatuses);
export const safeDisplayStatusSchema = z.enum(safeDisplayStatuses);
export const errorCodeSchema = z.enum(errorCodes);

export const scopeRefSchema = z.object({
  type: roleScopeTypeSchema,
  id: uuidSchema.optional()
});

export const actorContextSchema = z.object({
  actorId: uuidSchema,
  cognitoSubject: z.string().min(1),
  role: roleTypeSchema,
  scopes: z.array(scopeRefSchema),
  redactionProfile: redactionProfileSchema
});

export const organisationSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional()
});

export const awardTrackSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  operationalStatus: awardTrackOperationalStatusSchema
});

export const parkSchema = z.object({
  id: uuidSchema,
  organisationId: uuidSchema,
  awardTrackCode: z.string().min(1),
  name: z.string().min(1),
  status: parkStatusSchema,
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional()
});

export const parkLocationSchema = z.object({
  id: uuidSchema,
  parkId: uuidSchema,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  w3wAddress: z.string().min(3),
  postcode: z.string().min(1).optional(),
  localAuthority: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  constituency: z.string().min(1).optional(),
  confirmedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional()
});

export const awardCycleSchema = z.object({
  id: uuidSchema,
  countryCode: z.string().min(2).max(3),
  cycleYear: z.number().int().min(2000),
  applicationWindowOpensAt: isoDateTimeSchema,
  applicationWindowClosesAt: isoDateTimeSchema,
  resultAnnouncementAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional()
});

export const cycleWindowSchema = z.object({
  id: uuidSchema,
  awardCycleId: uuidSchema,
  episodeType: episodeTypeSchema,
  opensAt: isoDateTimeSchema,
  closesAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional()
});

export const assessmentEpisodeSchema = z.object({
  id: uuidSchema,
  parkId: uuidSchema,
  awardCycleId: uuidSchema,
  cycleWindowId: uuidSchema,
  awardTrackCode: z.string().min(1),
  episodeType: episodeTypeSchema,
  status: episodeStatusSchema,
  mysterySuppressed: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema.optional()
});

export const parkCycleSnapshotSchema = z.object({
  organisation: organisationSchema,
  park: parkSchema,
  location: parkLocationSchema.optional(),
  awardTrack: awardTrackSchema,
  awardCycle: awardCycleSchema,
  cycleWindows: z.array(cycleWindowSchema),
  assessmentEpisodes: z.array(assessmentEpisodeSchema)
});

export const internalUserStatusSchema = z.enum(["ACTIVE", "DISABLED", "PENDING_LINK"]);
export const roleAssignmentStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const internalUserSummarySchema = z.object({
  id: uuidSchema,
  cognitoSubject: z.string().min(1),
  email: z.string().email().optional(),
  displayName: z.string().min(1),
  status: internalUserStatusSchema,
  mfaSatisfied: z.boolean().optional()
});

export const roleAssignmentSchema = z.object({
  id: uuidSchema,
  internalUserId: uuidSchema,
  role: roleTypeSchema,
  scope: scopeRefSchema,
  status: roleAssignmentStatusSchema,
  redactionProfile: redactionProfileSchema
});

export const sessionProfileSchema = z.object({
  actor: actorContextSchema,
  internalUser: internalUserSummarySchema,
  roleAssignments: z.array(roleAssignmentSchema),
  mfaSatisfied: z.boolean(),
  authenticationSource: z.literal("cognito")
});

export const auditEventSchema = z.object({
  id: uuidSchema,
  actor: actorContextSchema,
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: uuidSchema.optional(),
  beforeState: z.unknown().optional(),
  afterState: z.unknown().optional(),
  request: z.object({
    requestId: z.string().min(1),
    idempotencyKey: z.string().min(1).optional(),
    ipAddress: z.string().min(1).optional(),
    userAgent: z.string().min(1).optional()
  }),
  reason: z.string().min(1).optional(),
  createdAt: isoDateTimeSchema
});

export const commandEnvelopeSchema = z.object({
  actor: actorContextSchema,
  idempotencyKey: z.string().min(16).max(160).optional(),
  reason: z.string().min(3).max(500).optional(),
  request: z.object({
    requestId: z.string().min(1),
    ipAddress: z.string().min(1).optional(),
    userAgent: z.string().min(1).optional()
  })
});

export const mysteryRedactionDecisionSchema = z.object({
  surface: redactionSurfaceNameSchema,
  action: redactionDecisionActionSchema,
  safeDisplayStatus: safeDisplayStatusSchema.optional(),
  redactedFields: z.array(z.string().min(1)),
  reasonCodes: z.array(z.enum([
    "mystery_episode",
    "applicant_or_org_surface",
    "document_metadata_hidden",
    "notification_suppressed",
    "message_metadata_hidden",
    "count_suppressed",
    "status_label_rewritten"
  ]))
});

export const mysteryNotificationProjectionSchema = z.object({
  notificationId: uuidSchema,
  surface: z.literal("applicant_notification"),
  visible: z.boolean(),
  label: z.string().min(1).optional(),
  suppressed: z.boolean(),
  redaction: mysteryRedactionDecisionSchema
});

export const mysteryMessageProjectionSchema = z.object({
  threadId: uuidSchema,
  surface: z.literal("applicant_message"),
  visible: z.boolean(),
  subject: z.string().min(1).optional(),
  hiddenMessageCount: z.number().int().min(0).optional(),
  redaction: mysteryRedactionDecisionSchema
});

export const mysterySearchExportProjectionSchema = z.object({
  surface: z.enum(["applicant_search", "applicant_export"]),
  visibleCount: z.number().int().min(0),
  countSuppressed: z.boolean(),
  redaction: mysteryRedactionDecisionSchema
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.unknown().optional()
  })
});

export const registrationEligibilityInputSchema = z.object({
  publiclyAccessible: z.boolean(),
  freeToEnter: z.boolean(),
  minimumSizeConfirmed: z.boolean()
});

export const registrationEligibilityResultSchema = z.object({
  eligible: z.boolean(),
  failedCriteria: z.array(z.enum(["publicly_accessible", "free_to_enter", "minimum_size"]))
});

export const duplicateWarningSchema = z.object({
  hasPotentialDuplicate: z.boolean(),
  matchedFields: z.array(z.enum(["park_name", "postcode", "address"])),
  acknowledged: z.boolean()
});

export const registrationLocationLookupRequestSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  postcode: z.string().min(1).optional(),
  w3wAddress: z.string().min(3).optional()
});

export const registrationLocationSuggestionSchema = z.object({
  source: z.enum(["what3words_mock", "os_open_greenspace_mock", "ons_geography_mock"]),
  label: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  w3wAddress: z.string().min(3),
  parkNameSuggestion: z.string().min(1).optional(),
  sizeBand: z.enum(["manual_required", "suggested_from_os_open_greenspace"]).optional(),
  localAuthority: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  constituency: z.string().min(1).optional(),
  requiresApplicantConfirmation: z.literal(true)
});

export const registrationSubmissionRequestSchema = z.object({
  parkName: z.string().min(1),
  organisationName: z.string().min(1),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  addressLine1: z.string().min(1),
  town: z.string().min(1),
  postcode: z.string().min(1).optional(),
  country: z.string().min(1),
  eligibility: registrationEligibilityInputSchema,
  duplicateAcknowledged: z.boolean().default(false),
  location: registrationLocationLookupRequestSchema
});

export const registrationSubmissionResponseSchema = z.object({
  registrationId: uuidSchema,
  status: registrationStatusSchema,
  eligibility: registrationEligibilityResultSchema,
  duplicateWarning: duplicateWarningSchema,
  verificationRequired: z.boolean(),
  notificationIntents: z.array(z.enum(["registration_verification_email", "admin_duplicate_alert"]))
});

export const registrationSummarySchema = registrationSubmissionResponseSchema.extend({
  parkName: z.string().min(1),
  organisationName: z.string().min(1),
  contactEmail: z.string().email(),
  submittedAt: isoDateTimeSchema
});

export const emailVerificationRequestSchema = z.object({
  token: z.string().min(8)
});

export const verificationLandingResponseSchema = z.object({
  registrationId: uuidSchema,
  status: registrationStatusSchema,
  emailVerified: z.boolean(),
  nextStep: z.enum(["admin_review", "already_verified", "cannot_verify"])
});

export const adminRegistrationReviewItemSchema = z.object({
  registrationId: uuidSchema,
  status: registrationStatusSchema,
  parkName: z.string().min(1),
  organisationName: z.string().min(1),
  contactEmail: z.string().email(),
  eligibility: registrationEligibilityResultSchema,
  duplicateWarning: duplicateWarningSchema,
  submittedAt: isoDateTimeSchema
});

export const adminRegistrationReviewQueueResponseSchema = z.object({
  items: z.array(adminRegistrationReviewItemSchema)
});

export const adminRegistrationDecisionRequestSchema = z.object({
  reason: z.string().min(3).max(500).optional()
});

export const parkActivationResponseSchema = z.object({
  registrationId: uuidSchema,
  registrationStatus: registrationStatusSchema,
  parkId: uuidSchema.optional(),
  parkStatus: parkStatusSchema,
  notificationIntents: z.array(z.enum(["registration_approved_email", "registration_rejected_email"]))
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("green-flag-api"),
  version: z.string().min(1)
});

export const invoiceSummarySchema = z.object({
  status: z.enum(["not_applicable", "pending", "paid", "blocked"]),
  amount: z.literal("external_value_unavailable").optional()
});

export const resultSummarySchema = z.object({
  status: z.enum(["not_available", "held", "published"]),
  displayLabel: z.string().min(1).optional()
});

export const applicantDashboardItemSchema = z.object({
  applicationId: uuidSchema.optional(),
  episodeId: uuidSchema,
  parkId: uuidSchema,
  parkName: z.string().min(1),
  cycleYear: z.number().int().min(2000),
  category: z.literal("STANDARD_GREEN_FLAG"),
  displayStatus: safeDisplayStatusSchema,
  applicationStatus: applicationStatusSchema.optional(),
  episodeStatus: episodeStatusSchema.optional(),
  completionPercent: z.number().int().min(0).max(100),
  invoice: invoiceSummarySchema,
  result: resultSummarySchema,
  allowedActions: z.array(z.string().min(1))
});

export const applicantDashboardResponseSchema = z.object({
  items: z.array(applicantDashboardItemSchema)
});

export const applicationSectionKeySchema = z.enum([
  "location",
  "site_information",
  "contact_details",
  "publicity",
  "optional_information",
  "previous_feedback",
  "review"
]);

export const applicationFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null()
]);

export const applicationSectionDraftSchema = z.object({
  sectionKey: applicationSectionKeySchema,
  status: z.enum(["not_started", "in_progress", "complete"]),
  completionPercent: z.number().int().min(0).max(100),
  version: z.number().int().min(0),
  fields: z.record(applicationFieldValueSchema),
  updatedAt: isoDateTimeSchema.optional()
});

export const createApplicationRequestSchema = z.object({
  parkId: uuidSchema,
  episodeId: uuidSchema,
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const applicationDraftResponseSchema = z.object({
  applicationId: uuidSchema,
  episodeId: uuidSchema,
  parkId: uuidSchema,
  status: applicationStatusSchema,
  displayStatus: safeDisplayStatusSchema,
  completionPercent: z.number().int().min(0).max(100),
  version: z.number().int().min(0),
  sections: z.array(applicationSectionDraftSchema),
  allowedActions: z.array(z.enum([
    "continue_application",
    "autosave_section",
    "review_draft",
    "upload_management_plan_deferred",
    "submit_deferred"
  ])),
  updatedAt: isoDateTimeSchema
});

export const autosaveApplicationSectionRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  fields: z.record(applicationFieldValueSchema),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const autosaveApplicationSectionResponseSchema = z.object({
  applicationId: uuidSchema,
  section: applicationSectionDraftSchema,
  applicationStatus: applicationStatusSchema,
  completionPercent: z.number().int().min(0).max(100),
  version: z.number().int().min(0)
});

export const previousFeedbackResponseRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  responseText: z.string().max(5000)
});

export const previousFeedbackResponseDraftSchema = z.object({
  applicationId: uuidSchema,
  responseText: z.string().max(5000),
  version: z.number().int().min(0),
  updatedAt: isoDateTimeSchema
});

export const documentTypeSchema = z.enum([
  "management_plan",
  "supporting_document"
]);

export const documentAssetStatusSchema = z.enum([
  "UPLOADED_PENDING_SCAN",
  "AVAILABLE",
  "REJECTED",
  "ARCHIVED"
]);

export const uploadSessionStatusSchema = z.enum([
  "CREATED",
  "IN_PROGRESS",
  "READY_TO_COMPLETE",
  "COMPLETED",
  "EXPIRED",
  "FAILED"
]);

export const documentAssetSchema = z.object({
  documentId: uuidSchema,
  applicationId: uuidSchema,
  episodeId: uuidSchema,
  parkId: uuidSchema,
  documentType: documentTypeSchema,
  filename: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().min(1).max(52_428_800),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  storageProvider: z.literal("lower_env_stub"),
  storageKey: z.string().min(1),
  status: documentAssetStatusSchema,
  visibility: documentVisibilitySchema,
  version: z.number().int().min(1),
  isCurrent: z.boolean(),
  replacesDocumentId: uuidSchema.optional(),
  replacedByDocumentId: uuidSchema.optional(),
  uploadedByActorId: uuidSchema,
  scanStatus: z.enum(["not_scanned_stub", "pending_stub", "clean_stub", "rejected_stub"]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const applicantDocumentAssetSchema = z.object({
  documentId: uuidSchema,
  documentType: documentTypeSchema,
  filename: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().min(1).max(52_428_800),
  status: documentAssetStatusSchema,
  visibility: documentVisibilitySchema,
  version: z.number().int().min(1),
  isCurrent: z.boolean(),
  replacesDocumentId: uuidSchema.optional(),
  replacedByDocumentId: uuidSchema.optional(),
  scanStatus: z.enum(["not_scanned_stub", "pending_stub", "clean_stub", "rejected_stub"]),
  signedAccessAvailable: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const applicationDocumentSlotSchema = z.object({
  documentType: documentTypeSchema,
  required: z.boolean(),
  label: z.string().min(1),
  completionStatus: z.enum(["missing", "uploaded", "pending_scan", "rejected"]),
  currentDocument: applicantDocumentAssetSchema.optional(),
  archivedVersionCount: z.number().int().min(0),
  allowedActions: z.array(z.enum(["create_upload_session", "replace_document", "download_document"]))
});

export const applicationDocumentsResponseSchema = z.object({
  applicationId: uuidSchema,
  episodeId: uuidSchema,
  parkId: uuidSchema,
  documentCompletionStatus: z.enum(["missing_required", "complete", "pending_scan"]),
  slots: z.array(applicationDocumentSlotSchema)
});

export const createDocumentUploadSessionRequestSchema = z.object({
  documentType: documentTypeSchema,
  filename: z.string().min(1),
  contentType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  byteSize: z.number().int().min(1).max(52_428_800),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  totalChunks: z.number().int().min(1).max(512),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const documentUploadSessionSchema = z.object({
  sessionId: uuidSchema,
  applicationId: uuidSchema,
  documentType: documentTypeSchema,
  filename: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().min(1).max(52_428_800),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  totalChunks: z.number().int().min(1),
  acceptedChunks: z.array(z.number().int().min(0)),
  status: uploadSessionStatusSchema,
  progressPercent: z.number().int().min(0).max(100),
  uploadUrlTemplate: z.string().url(),
  expiresAt: isoDateTimeSchema,
  version: z.number().int().min(0)
});

export const acknowledgeDocumentChunkRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  chunkSize: z.number().int().min(1),
  chunkChecksum: z.string().min(1),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const documentChunkAcknowledgementSchema = z.object({
  sessionId: uuidSchema,
  acceptedChunkIndex: z.number().int().min(0),
  status: uploadSessionStatusSchema,
  progressPercent: z.number().int().min(0).max(100),
  version: z.number().int().min(0)
});

export const completeDocumentUploadRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().min(1).max(52_428_800),
  storageKey: z.string().min(1)
});

export const completeDocumentUploadResponseSchema = z.object({
  applicationId: uuidSchema,
  document: applicantDocumentAssetSchema,
  duplicateOfDocumentId: uuidSchema.optional(),
  archivedDocumentId: uuidSchema.optional()
});

export const signedDocumentAccessResponseSchema = z.object({
  documentId: uuidSchema,
  method: z.literal("GET"),
  url: z.string().url(),
  expiresAt: isoDateTimeSchema,
  filename: z.string().min(1),
  contentType: z.string().min(1),
  visibility: documentVisibilitySchema
});

export const documentVersionsResponseSchema = z.object({
  applicationId: uuidSchema,
  documentType: documentTypeSchema,
  versions: z.array(applicantDocumentAssetSchema)
});

export const purchaseOrderPreferenceSchema = z.object({
  purchaseOrderNumber: z.string().min(1).max(120).optional(),
  noPurchaseOrderDeclared: z.boolean().default(false)
}).refine(
  (value) => Boolean(value.purchaseOrderNumber) !== value.noPurchaseOrderDeclared,
  "Provide either a purchase order number or a no-PO declaration."
);

export const submitApplicationRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  purchaseOrder: purchaseOrderPreferenceSchema,
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const invoiceStatusSchema = z.enum(["PENDING", "PAID", "OVERDUE_BLOCKED", "WAIVED"]);
export const adminApplicationPaymentStatusSchema = z.enum(["NOT_REQUIRED", "PENDING", "PAID", "OVERDUE_BLOCKED", "WAIVED"]);

export const invoiceSummaryResponseSchema = z.object({
  invoiceId: uuidSchema,
  applicationId: uuidSchema,
  episodeId: uuidSchema,
  status: invoiceStatusSchema,
  amount: z.literal("external_value_unavailable"),
  dueAt: isoDateTimeSchema,
  availableInPortal: z.boolean(),
  notificationIntents: z.array(z.enum(["application_submitted_email", "invoice_available_email", "payment_overdue_email"]))
});

export const paymentSummaryResponseSchema = z.object({
  applicationId: uuidSchema,
  invoice: invoiceSummaryResponseSchema,
  purchaseOrder: purchaseOrderPreferenceSchema,
  manuallyMarkedPaid: z.boolean(),
  overrideApplied: z.boolean(),
  blockedForAllocation: z.boolean(),
  updatedAt: isoDateTimeSchema
});

export const applicationSubmissionResponseSchema = z.object({
  applicationId: uuidSchema,
  episodeId: uuidSchema,
  applicationStatus: applicationStatusSchema,
  episodeStatus: episodeStatusSchema,
  submittedAt: isoDateTimeSchema,
  documentState: z.enum(["management_plan_uploaded", "management_plan_missing"]),
  invoice: invoiceSummaryResponseSchema,
  payment: paymentSummaryResponseSchema
});

export const adminPaymentActionRequestSchema = z.object({
  reason: z.string().min(3).max(500),
  externalReference: z.string().min(1).max(160).optional(),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const adminPaymentActionResponseSchema = z.object({
  invoiceId: uuidSchema,
  status: invoiceStatusSchema,
  manuallyMarkedPaid: z.boolean(),
  overrideApplied: z.boolean(),
  blockedForAllocation: z.boolean(),
  reason: z.string().min(3).max(500),
  updatedAt: isoDateTimeSchema
});

export const paymentDeadlineCheckRequestSchema = z.object({
  asOf: isoDateTimeSchema,
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const paymentDeadlineCheckResponseSchema = z.object({
  checkedAt: isoDateTimeSchema,
  blockedInvoiceIds: z.array(uuidSchema)
});

export const adminQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().max(80).optional(),
  search: z.string().max(160).optional(),
  status: z.string().max(80).optional(),
  cycleYear: z.coerce.number().int().min(2000).optional(),
  parkId: uuidSchema.optional(),
  organisationId: uuidSchema.optional(),
  paymentStatus: adminApplicationPaymentStatusSchema.optional(),
  documentStatus: z.enum(["complete", "missing_required", "pending_scan"]).optional(),
  attention: z.enum(["payment_pending", "payment_overdue", "management_plan_missing", "application_not_submitted"]).optional()
});

export const adminQueuePageMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  totalItems: z.number().int().min(0),
  availableFilters: z.array(z.string().min(1))
});

export const adminDashboardSummaryResponseSchema = z.object({
  generatedAt: isoDateTimeSchema,
  counts: z.object({
    registrationsPendingReview: z.number().int().min(0),
    applicationsSubmitted: z.number().int().min(0),
    paymentsNeedAttention: z.number().int().min(0),
    documentsNeedAttention: z.number().int().min(0),
    allocationReadyPreview: z.number().int().min(0),
    resultsUnavailable: z.number().int().min(0)
  }),
  attention: z.array(z.object({
    queue: z.enum(["registrations", "applications", "payments", "documents", "allocation_readiness"]),
    label: z.string().min(1),
    count: z.number().int().min(0)
  }))
});

export const adminRegistrationQueueResponseSchema = z.object({
  items: z.array(adminRegistrationReviewItemSchema),
  page: adminQueuePageMetaSchema
});

export const adminApplicationQueueItemSchema = z.object({
  applicationId: uuidSchema,
  episodeId: uuidSchema,
  parkId: uuidSchema,
  parkName: z.string().min(1),
  organisationName: z.string().min(1),
  cycleYear: z.number().int().min(2000),
  applicationStatus: applicationStatusSchema,
  episodeStatus: episodeStatusSchema,
  displayStatus: safeDisplayStatusSchema,
  paymentStatus: adminApplicationPaymentStatusSchema,
  documentStatus: z.enum(["complete", "missing_required", "pending_scan"]),
  allocationReadiness: z.enum(["eligible_preview", "blocked", "deferred"]),
  attentionFlags: z.array(z.enum(["payment_pending", "payment_overdue", "management_plan_missing", "application_not_submitted"]))
});

export const adminApplicationQueueResponseSchema = z.object({
  items: z.array(adminApplicationQueueItemSchema),
  page: adminQueuePageMetaSchema
});

export const adminPaymentQueueItemSchema = z.object({
  invoiceId: uuidSchema,
  applicationId: uuidSchema,
  episodeId: uuidSchema,
  parkName: z.string().min(1),
  organisationName: z.string().min(1),
  status: invoiceStatusSchema,
  amount: z.literal("external_value_unavailable"),
  dueAt: isoDateTimeSchema,
  purchaseOrder: purchaseOrderPreferenceSchema,
  manuallyMarkedPaid: z.boolean(),
  overrideApplied: z.boolean(),
  blockedForAllocation: z.boolean()
});

export const adminPaymentQueueResponseSchema = z.object({
  items: z.array(adminPaymentQueueItemSchema),
  page: adminQueuePageMetaSchema
});

export const adminDocumentQueueItemSchema = z.object({
  documentId: uuidSchema,
  applicationId: uuidSchema,
  episodeId: uuidSchema,
  parkName: z.string().min(1),
  documentType: documentTypeSchema,
  status: documentAssetStatusSchema,
  visibility: documentVisibilitySchema,
  version: z.number().int().min(1),
  archivedVersionCount: z.number().int().min(0),
  attentionFlag: z.enum(["none", "missing_required", "scan_pending", "scan_rejected"])
});

export const adminDocumentQueueResponseSchema = z.object({
  items: z.array(adminDocumentQueueItemSchema),
  page: adminQueuePageMetaSchema
});

export const adminAllocationReadinessPreviewResponseSchema = z.object({
  applicationId: uuidSchema,
  episodeId: uuidSchema,
  readiness: z.enum(["eligible_preview", "blocked", "deferred"]),
  reasonCodes: z.array(z.enum(["payment_pending", "payment_overdue", "management_plan_missing", "application_not_submitted", "later_slice_allocation"])),
  candidateGenerationAvailable: z.literal(false)
});

export const adminApplicationDetailResponseSchema = z.object({
  application: adminApplicationQueueItemSchema,
  invoice: invoiceSummaryResponseSchema,
  payment: paymentSummaryResponseSchema,
  documents: z.array(adminDocumentQueueItemSchema),
  allocationReadiness: adminAllocationReadinessPreviewResponseSchema,
  result: resultSummarySchema
});

export const assessorProfileStatusSchema = z.enum(["ACTIVE", "INACTIVE", "PENDING_PROFILE_COMPLETION"]);
export const assessorAccreditationStatusSchema = z.enum([
  "CURRENT_LOWER_ENV",
  "EXPIRED",
  "PENDING_VERIFICATION",
  "EXTERNAL_VALUE_UNAVAILABLE"
]);
export const assessorCapacityStatusSchema = z.enum(["available", "at_capacity", "unavailable"]);

export const assessorPreferenceSchema = z.object({
  preferredRegions: z.array(z.string().min(1)),
  preferredAwardTrackCodes: z.array(z.string().min(1)),
  unavailableNotes: z.string().max(1000).optional(),
  acceptsMysteryShop: z.boolean()
});

export const assessorAvailabilityWindowBaseSchema = z.object({
  availabilityId: uuidSchema,
  assessorId: uuidSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  availabilityType: z.enum(["available", "unavailable"]),
  notes: z.string().max(500).optional()
});

export const assessorAvailabilityWindowSchema = assessorAvailabilityWindowBaseSchema.refine(
  (value) => new Date(value.endsAt) > new Date(value.startsAt),
  "Availability end must be after start."
);

export const assessorCapacityDeclarationSchema = z.object({
  capacityId: uuidSchema,
  assessorId: uuidSchema,
  cycleYear: z.number().int().min(2000),
  maxAssignments: z.number().int().min(0).max(100),
  currentAssignedCount: z.number().int().min(0),
  capacityStatus: assessorCapacityStatusSchema
});

export const assessorProfileSchema = z.object({
  assessorId: uuidSchema,
  internalUserId: uuidSchema,
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  profileStatus: assessorProfileStatusSchema,
  accreditationStatus: assessorAccreditationStatusSchema,
  accreditationProvider: z.literal("external_value_unavailable"),
  primaryRegion: z.string().min(1).optional(),
  preferences: assessorPreferenceSchema,
  availability: z.array(assessorAvailabilityWindowSchema),
  capacity: z.array(assessorCapacityDeclarationSchema),
  version: z.number().int().min(0),
  updatedAt: isoDateTimeSchema
});

export const assessorSelfProfileResponseSchema = z.object({
  profile: assessorProfileSchema,
  assignmentLoadDeferred: z.literal(true),
  visitScheduleDeferred: z.literal(true)
});

export const adminAssessorQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(160).optional(),
  profileStatus: assessorProfileStatusSchema.optional(),
  accreditationStatus: assessorAccreditationStatusSchema.optional(),
  region: z.string().max(120).optional(),
  cycleYear: z.coerce.number().int().min(2000).optional(),
  capacityStatus: assessorCapacityStatusSchema.optional()
});

export const adminAssessorListItemSchema = z.object({
  assessorId: uuidSchema,
  internalUserId: uuidSchema,
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  profileStatus: assessorProfileStatusSchema,
  accreditationStatus: assessorAccreditationStatusSchema,
  primaryRegion: z.string().min(1).optional(),
  capacityStatus: assessorCapacityStatusSchema,
  maxAssignments: z.number().int().min(0),
  currentAssignedCount: z.number().int().min(0),
  updatedAt: isoDateTimeSchema
});

export const adminAssessorListResponseSchema = z.object({
  items: z.array(adminAssessorListItemSchema),
  page: adminQueuePageMetaSchema
});

export const adminAssessorDetailResponseSchema = z.object({
  profile: assessorProfileSchema,
  allocationCandidateGenerationAvailable: z.literal(false),
  providerSyncStatus: z.literal("external_value_unavailable")
});

export const upsertAssessorProfileRequestSchema = z.object({
  internalUserId: uuidSchema,
  displayName: z.string().min(1).max(160),
  email: z.string().email().optional(),
  profileStatus: assessorProfileStatusSchema.default("PENDING_PROFILE_COMPLETION"),
  accreditationStatus: assessorAccreditationStatusSchema.default("EXTERNAL_VALUE_UNAVAILABLE"),
  primaryRegion: z.string().min(1).max(120).optional(),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const updateAssessorPreferencesRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  preferences: assessorPreferenceSchema,
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const updateAssessorAvailabilityRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  availability: z.array(assessorAvailabilityWindowBaseSchema.omit({ assessorId: true }).refine(
    (value) => new Date(value.endsAt) > new Date(value.startsAt),
    "Availability end must be after start."
  )).max(100),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const updateAssessorCapacityRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  capacity: z.array(assessorCapacityDeclarationSchema.omit({ assessorId: true })).max(20),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const assessorProfileCommandResponseSchema = z.object({
  profile: assessorProfileSchema,
  auditEventId: uuidSchema
});

export const allocationStatusSchema = z.enum(allocationStatuses);
export const assignmentStatusSchema = z.enum(assignmentStatuses);
export const coiFlagTypeSchema = z.enum(coiFlagTypes);

export const allocationPolicySchema = z.object({
  policyId: uuidSchema,
  countryCode: z.string().min(2).max(3),
  cycleYear: z.number().int().min(2000),
  defaultDistanceKm: z.number().int().min(1).max(1000),
  distanceWeight: z.number().min(0).max(1),
  clusterWeight: z.number().min(0).max(1),
  rotationPenalty: z.number().int().min(0).max(100),
  trainingThirdJudgeAllowed: z.boolean(),
  source: z.literal("configurable_lower_env")
});

export const allocationReadyEpisodeSchema = z.object({
  episodeId: uuidSchema,
  applicationId: uuidSchema,
  parkId: uuidSchema,
  parkName: z.string().min(1),
  cycleYear: z.number().int().min(2000),
  episodeType: episodeTypeSchema,
  episodeStatus: episodeStatusSchema,
  paymentStatus: adminApplicationPaymentStatusSchema,
  documentStatus: z.enum(["complete", "missing_required", "pending_scan"]),
  suggestedJudgeCount: z.number().int().min(1).max(3),
  judgeCountReasons: z.array(z.enum(["new_site", "over_25_hectares", "heritage", "failed_previous", "passed_under_25_hectares", "training_third_judge_available"])),
  allocationStatus: z.enum(["not_started", "held", "released"])
});

export const allocationReadyEpisodesResponseSchema = z.object({
  items: z.array(allocationReadyEpisodeSchema),
  policy: allocationPolicySchema
});

export const allocationCandidateSchema = z.object({
  assessorId: uuidSchema,
  displayName: z.string().min(1),
  primaryRegion: z.string().min(1).optional(),
  accreditationStatus: assessorAccreditationStatusSchema,
  capacityStatus: assessorCapacityStatusSchema,
  currentAssignedCount: z.number().int().min(0),
  maxAssignments: z.number().int().min(0),
  distanceKm: z.number().min(0),
  score: z.number().int().min(0).max(100),
  hardExcluded: z.literal(false),
  flags: z.array(z.object({
    type: coiFlagTypeSchema,
    severity: z.enum(["soft", "deprioritise"]),
    reason: z.string().min(1),
    requiresAcknowledgement: z.boolean()
  })),
  contactPreviewAvailable: z.literal(false)
});

export const allocationCandidatesResponseSchema = z.object({
  episodeId: uuidSchema,
  suggestedJudgeCount: z.number().int().min(1).max(3),
  candidates: z.array(allocationCandidateSchema),
  excludedCandidateCount: z.number().int().min(0),
  policy: allocationPolicySchema
});

export const holdAllocationRequestSchema = z.object({
  assessorIds: z.array(uuidSchema).min(1).max(3),
  finalJudgeCount: z.number().int().min(1).max(3),
  reason: z.string().min(3).max(500).optional(),
  acknowledgedFlagTypes: z.array(coiFlagTypeSchema).default([]),
  trainingThirdJudge: z.boolean().default(false),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const releaseAllocationRequestSchema = z.object({
  releaseMode: z.enum(["now", "scheduled"]),
  scheduledReleaseAt: isoDateTimeSchema.optional(),
  idempotencyKey: z.string().min(16).max(160).optional()
}).refine(
  (value) => value.releaseMode === "now" || Boolean(value.scheduledReleaseAt),
  "Scheduled release requires scheduledReleaseAt."
);

export const reassignAllocationRequestSchema = z.object({
  replaceAssignmentId: uuidSchema,
  replacementAssessorId: uuidSchema,
  reason: z.string().min(3).max(500),
  acknowledgedFlagTypes: z.array(coiFlagTypeSchema).default([]),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const assessorAssignmentDecisionRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  reason: z.string().min(3).max(500).optional(),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const allocationAssignmentSchema = z.object({
  assignmentId: uuidSchema,
  allocationId: uuidSchema,
  episodeId: uuidSchema,
  assessorId: uuidSchema,
  status: assignmentStatusSchema,
  contactRevealAvailable: z.boolean(),
  version: z.number().int().min(0),
  updatedAt: isoDateTimeSchema
});

export const allocationCommandResponseSchema = z.object({
  allocationId: uuidSchema,
  episodeId: uuidSchema,
  status: allocationStatusSchema,
  finalJudgeCount: z.number().int().min(1).max(3),
  suggestedJudgeCount: z.number().int().min(1).max(3),
  contactRevealAvailable: z.boolean(),
  notificationIntents: z.array(z.enum(["assignment_release_email_batch"])),
  assignments: z.array(allocationAssignmentSchema),
  auditEventId: uuidSchema,
  overrideEventIds: z.array(uuidSchema)
});

export const assessorAssignmentItemSchema = z.object({
  assignmentId: uuidSchema,
  allocationId: uuidSchema,
  episodeId: uuidSchema,
  parkName: z.string().min(1),
  cycleYear: z.number().int().min(2000),
  status: assignmentStatusSchema,
  contactRevealAvailable: z.boolean(),
  contact: z.object({
    parkContactName: z.string().min(1),
    parkContactEmail: z.string().email()
  }).optional(),
  version: z.number().int().min(0)
});

export const assessorAssignmentsResponseSchema = z.object({
  items: z.array(assessorAssignmentItemSchema)
});

export const assessorAssignmentDecisionResponseSchema = z.object({
  assignment: allocationAssignmentSchema,
  auditEventId: uuidSchema
});

export const assessmentTemplateCriterionSchema = z.object({
  criterionId: uuidSchema,
  code: z.string().min(1),
  label: z.string().min(1),
  maxScore: z.number().int().min(1),
  placeholderOnly: z.literal(true)
});

export const assessmentTemplateSchema = z.object({
  templateId: uuidSchema,
  awardTrackCode: z.string().min(1),
  cycleYear: z.number().int().min(2000),
  source: z.literal("configurable_lower_env"),
  passThresholdPercent: z.number().int().min(0).max(100),
  criteria: z.array(assessmentTemplateCriterionSchema).min(1)
});

export const assessmentVisitSchema = z.object({
  visitId: uuidSchema,
  assignmentId: uuidSchema,
  episodeId: uuidSchema,
  assessorId: uuidSchema,
  status: visitStatusSchema,
  scheduledStartAt: isoDateTimeSchema.optional(),
  scheduledEndAt: isoDateTimeSchema.optional(),
  locationDisclosure: z.enum(["visible_to_assessor_only", "mystery_restricted"]),
  version: z.number().int().min(0)
});

export const assessorVisitsResponseSchema = z.object({
  items: z.array(assessmentVisitSchema)
});

export const scheduleVisitRequestSchema = z.object({
  scheduledStartAt: isoDateTimeSchema,
  scheduledEndAt: isoDateTimeSchema,
  clientVersion: z.number().int().min(0),
  idempotencyKey: z.string().min(16).max(160).optional()
}).refine((value) => new Date(value.scheduledEndAt) > new Date(value.scheduledStartAt), "Visit end must be after start.");

export const assessmentScoreEntrySchema = z.object({
  criterionId: uuidSchema,
  score: z.number().int().min(0),
  notes: z.string().max(1000).optional()
});

export const assessmentEvidenceSchema = z.object({
  evidenceId: uuidSchema,
  assessmentId: uuidSchema,
  evidenceType: assessmentEvidenceTypeSchema,
  filename: z.string().min(1),
  visibility: z.enum(["admin_and_assessor", "mystery_restricted"]),
  storageProvider: z.literal("lower_env_stub"),
  storageKey: z.string().min(1),
  createdAt: isoDateTimeSchema
});

export const judgeAssessmentSchema = z.object({
  assessmentId: uuidSchema,
  assignmentId: uuidSchema,
  episodeId: uuidSchema,
  assessorId: uuidSchema,
  status: z.enum(assessmentStatuses),
  template: assessmentTemplateSchema,
  scores: z.array(assessmentScoreEntrySchema),
  rawScoreTotal: z.number().int().min(0),
  maxScoreTotal: z.number().int().min(1),
  thresholdMet: z.boolean(),
  evidence: z.array(assessmentEvidenceSchema),
  offlineSyncVersion: z.number().int().min(0),
  version: z.number().int().min(0),
  updatedAt: isoDateTimeSchema
});

export const judgeAssessmentResponseSchema = z.object({
  assessment: judgeAssessmentSchema
});

export const updateAssessmentScoresRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  offlineSyncVersion: z.number().int().min(0),
  scores: z.array(assessmentScoreEntrySchema).min(1),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const addAssessmentEvidenceRequestSchema = z.object({
  evidenceType: assessmentEvidenceTypeSchema,
  filename: z.string().min(1),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const submitAssessmentRequestSchema = z.object({
  clientVersion: z.number().int().min(0),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const assessmentCommandResponseSchema = z.object({
  assessment: judgeAssessmentSchema,
  auditEventId: uuidSchema
});

export const adminAssessmentDetailResponseSchema = z.object({
  episodeId: uuidSchema,
  assessments: z.array(judgeAssessmentSchema),
  applicantSafeProjectionAvailable: z.literal(false)
});

export const decisionResultSchema = z.object({
  decisionId: uuidSchema,
  episodeId: uuidSchema,
  parkId: uuidSchema,
  applicationId: uuidSchema.optional(),
  status: resultStatusSchema,
  outcome: resultDecisionOutcomeSchema,
  thresholdAcknowledged: z.boolean(),
  thresholdMet: z.boolean(),
  assessmentCount: z.number().int().min(0),
  rawScoreTotal: z.number().int().min(0),
  maxScoreTotal: z.number().int().min(1),
  internalNotes: z.string().max(2000).optional(),
  publishedAt: isoDateTimeSchema.optional(),
  certificateId: uuidSchema.optional(),
  publicMapEventId: uuidSchema.optional(),
  version: z.number().int().min(0),
  updatedAt: isoDateTimeSchema
});

export const resultArtifactSchema = z.object({
  artifactId: uuidSchema,
  decisionId: uuidSchema,
  episodeId: uuidSchema,
  artifactType: z.enum(["certificate_shell", "result_summary"]),
  storageProvider: z.literal("lower_env_stub"),
  storageKey: z.string().min(1),
  publicVisible: z.boolean(),
  createdAt: isoDateTimeSchema
});

export const awardCacheEntrySchema = z.object({
  parkId: uuidSchema,
  episodeId: uuidSchema,
  decisionId: uuidSchema,
  resultStatus: resultStatusSchema,
  displayLabel: z.string().min(1),
  publishedAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema
});

export const publicMapUpdateEventSchema = z.object({
  eventId: uuidSchema,
  decisionId: uuidSchema,
  parkId: uuidSchema,
  episodeId: uuidSchema,
  eventType: z.enum(["award_published", "award_withdrawn"]),
  status: publicMapEventStatusSchema,
  payload: z.object({
    parkId: uuidSchema,
    displayLabel: z.string().min(1),
    published: z.boolean()
  }),
  createdAt: isoDateTimeSchema
});

export const holdDecisionRequestSchema = z.object({
  thresholdAcknowledged: z.literal(true),
  internalNotes: z.string().max(2000).optional(),
  reason: z.string().min(3).max(500).optional(),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const publishDecisionRequestSchema = z.object({
  releaseMode: z.enum(["single", "full_batch"]).default("single"),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const withdrawDecisionRequestSchema = z.object({
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const adminResultDetailResponseSchema = z.object({
  episodeId: uuidSchema,
  decision: decisionResultSchema.optional(),
  assessments: z.array(judgeAssessmentSchema),
  artifacts: z.array(resultArtifactSchema),
  awardCache: awardCacheEntrySchema.optional(),
  publicMapEvents: z.array(publicMapUpdateEventSchema)
});

export const resultCommandResponseSchema = z.object({
  decision: decisionResultSchema,
  artifacts: z.array(resultArtifactSchema),
  awardCache: awardCacheEntrySchema.optional(),
  publicMapEvent: publicMapUpdateEventSchema.optional(),
  auditEventId: uuidSchema
});

export const applicantResultResponseSchema = z.object({
  episodeId: uuidSchema,
  parkId: uuidSchema,
  status: z.enum(["not_available", "published", "withdrawn"]),
  displayLabel: z.string().min(1).optional(),
  certificate: z.object({
    certificateId: uuidSchema,
    downloadAvailable: z.literal(true)
  }).optional()
});

export const notificationTemplateVersionSchema = z.object({
  templateId: uuidSchema,
  templateKey: z.string().min(1),
  version: z.number().int().min(1),
  channel: notificationChannelSchema,
  subject: z.string().min(1).optional(),
  bodyMarker: z.literal("external_template_copy_unavailable"),
  active: z.boolean(),
  createdAt: isoDateTimeSchema
});

export const notificationQueueItemSchema = z.object({
  notificationId: uuidSchema,
  templateKey: z.string().min(1),
  channel: notificationChannelSchema,
  recipientActorId: uuidSchema.optional(),
  recipientAddressMarker: z.literal("provider_address_deferred"),
  status: notificationStatusSchema,
  suppressionReason: z.enum(["mystery_redaction", "channel_not_configured", "recipient_opted_out"]).optional(),
  relatedEntityType: z.string().min(1).optional(),
  relatedEntityId: uuidSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const notificationLogEntrySchema = z.object({
  logId: uuidSchema,
  notificationId: uuidSchema,
  status: notificationStatusSchema,
  provider: z.literal("adapter_not_configured"),
  detail: z.string().min(1),
  createdAt: isoDateTimeSchema
});

export const notificationQueueResponseSchema = z.object({
  items: z.array(notificationQueueItemSchema),
  logs: z.array(notificationLogEntrySchema)
});

export const notificationDispatchStubResponseSchema = z.object({
  notification: notificationQueueItemSchema,
  log: notificationLogEntrySchema
});

export const messageThreadSchema = z.object({
  threadId: uuidSchema,
  episodeId: uuidSchema.optional(),
  parkId: uuidSchema.optional(),
  subject: z.string().min(1),
  status: messageThreadStatusSchema,
  participantActorIds: z.array(uuidSchema),
  visibleToApplicant: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const messageEntrySchema = z.object({
  messageId: uuidSchema,
  threadId: uuidSchema,
  senderActorId: uuidSchema,
  body: z.string().min(1).max(5000),
  createdAt: isoDateTimeSchema
});

export const applicantMessageThreadSchema = z.object({
  threadId: uuidSchema,
  episodeId: uuidSchema.optional(),
  parkId: uuidSchema.optional(),
  subject: z.string().min(1),
  status: messageThreadStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const applicantMessageEntrySchema = z.object({
  messageId: uuidSchema,
  threadId: uuidSchema,
  body: z.string().min(1).max(5000),
  createdAt: isoDateTimeSchema,
  sentByCurrentActor: z.boolean()
});

export const createMessageThreadRequestSchema = z.object({
  episodeId: uuidSchema.optional(),
  parkId: uuidSchema.optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const messageThreadsResponseSchema = z.object({
  threads: z.array(messageThreadSchema),
  messages: z.array(messageEntrySchema)
});

export const applicantMessageThreadsResponseSchema = z.object({
  threads: z.array(applicantMessageThreadSchema),
  messages: z.array(applicantMessageEntrySchema)
});

export const messageCommandResponseSchema = z.object({
  thread: messageThreadSchema,
  message: messageEntrySchema,
  auditEventId: uuidSchema
});

export const applicantMessageCommandResponseSchema = z.object({
  thread: applicantMessageThreadSchema,
  message: applicantMessageEntrySchema,
  auditEventId: uuidSchema
});

export const jobRunSchema = z.object({
  jobRunId: uuidSchema,
  jobType: z.enum(["renewal_reminders", "public_map_outbox", "export_processing"]),
  status: jobRunStatusSchema,
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.optional(),
  processedCount: z.number().int().min(0),
  detail: z.string().min(1).optional()
});

export const jobRunsResponseSchema = z.object({
  items: z.array(jobRunSchema)
});

export const renewalReminderRunRequestSchema = z.object({
  cycleYear: z.number().int().min(2000),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const renewalReminderRunResponseSchema = z.object({
  jobRun: jobRunSchema,
  queuedNotifications: z.array(notificationQueueItemSchema)
});

export const exportRequestSchema = z.object({
  exportType: z.enum(["applications", "payments", "results", "public_map_events"]),
  format: z.enum(["csv", "json"]),
  idempotencyKey: z.string().min(16).max(160).optional()
});

export const exportJobSchema = z.object({
  exportId: uuidSchema,
  exportType: z.enum(["applications", "payments", "results", "public_map_events"]),
  format: z.enum(["csv", "json"]),
  status: exportStatusSchema,
  redactionProfile: redactionProfileSchema,
  storageProvider: z.literal("lower_env_stub"),
  storageKey: z.string().min(1).optional(),
  requestedByActorId: uuidSchema,
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.optional()
});

export const exportCommandResponseSchema = z.object({
  exportJob: exportJobSchema,
  auditEventId: uuidSchema
});

export const exportJobsResponseSchema = z.object({
  items: z.array(exportJobSchema)
});

export const contractMetadataResponseSchema = z.object({
  slice: z.literal("S00-operating-layer-and-contract-build-baseline"),
  episodeFirst: z.literal(true),
  safeDisplayStatuses: z.array(safeDisplayStatusSchema),
  forbiddenProductionValues: z.array(z.string().min(1))
});
