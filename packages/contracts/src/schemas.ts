import { z } from "zod";
import {
  awardTrackOperationalStatuses,
  applicationStatuses,
  documentVisibilities,
  episodeStatuses,
  episodeTypes,
  errorCodes,
  redactionProfiles,
  registrationStatuses,
  parkStatuses,
  roleScopeTypes,
  roleTypes,
  safeDisplayStatuses
} from "./enums.js";

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const roleTypeSchema = z.enum(roleTypes);
export const roleScopeTypeSchema = z.enum(roleScopeTypes);
export const episodeTypeSchema = z.enum(episodeTypes);
export const parkStatusSchema = z.enum(parkStatuses);
export const awardTrackOperationalStatusSchema = z.enum(awardTrackOperationalStatuses);
export const redactionProfileSchema = z.enum(redactionProfiles);
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

export const applicationDocumentSlotSchema = z.object({
  documentType: documentTypeSchema,
  required: z.boolean(),
  label: z.string().min(1),
  completionStatus: z.enum(["missing", "uploaded", "pending_scan", "rejected"]),
  currentDocument: documentAssetSchema.optional(),
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
  document: documentAssetSchema,
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
  versions: z.array(documentAssetSchema)
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

export const contractMetadataResponseSchema = z.object({
  slice: z.literal("S00-operating-layer-and-contract-build-baseline"),
  episodeFirst: z.literal(true),
  safeDisplayStatuses: z.array(safeDisplayStatusSchema),
  forbiddenProductionValues: z.array(z.string().min(1))
});
