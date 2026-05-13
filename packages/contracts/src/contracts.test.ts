import { describe, expect, it } from "vitest";
import {
  auditEventFixture,
  contractMetadataFixture,
  contractMetadataResponseSchema,
  lowerEnvironmentFullEpisodeFixture,
  lowerEnvironmentParkCycleSnapshotFixture,
  lowerEnvironmentParkLocationFixture,
  lowerEnvironmentParkFixture,
  lowerEnvironmentOrganisationFixture,
  lowerEnvironmentAwardCycle2025Fixture,
  lowerEnvironmentAwardCycle2026Fixture,
  errorCodes,
  globalAdminSessionFixture,
  applicantDashboardFixture,
  applicationDraftFixture,
  applicationDocumentsFixture,
  applicationSubmissionFixture,
  autosaveApplicationSectionFixture,
  completeDocumentUploadFixture,
  documentChunkAcknowledgementFixture,
  documentUploadSessionFixture,
  documentVersionsFixture,
  manualPaymentPaidFixture,
  mysteryMessageProjectionFixture,
  mysteryNotificationProjectionFixture,
  mysteryRedactionDecisionFixture,
  mysterySearchExportProjectionFixture,
  adminAllocationReadinessPreviewFixture,
  adminApplicationDetailFixture,
  adminApplicationQueueFixture,
  adminAssessorDetailFixture,
  adminAssessorListFixture,
  adminDashboardSummaryFixture,
  adminDocumentQueueFixture,
  adminPaymentQueueFixture,
  adminResultDetailFixture,
  adminRegistrationQueueFixture,
  applicantResultPublishedFixture,
  exportCommandFixture,
  exportJobsFixture,
  jobRunsFixture,
  messageCommandFixture,
  messageThreadsFixture,
  notificationDispatchStubFixture,
  notificationQueueFixture,
  paymentDeadlineCheckFixture,
  paymentOverrideFixture,
  paymentSummaryFixture,
  renewalReminderRunFixture,
  assessorAvailabilityUpdateFixture,
  assessorCapacityUpdateFixture,
  assessorPreferencesUpdateFixture,
  assessorSelfProfileFixture,
  fullAssessmentDashboardFixture,
  judgeSessionFixture,
  mysteryApplicantDashboardFixture,
  parkManagerSessionFixture,
  previousFeedbackResponseDraftFixture,
  signedDocumentAccessFixture,
  adminRegistrationReviewQueueFixture,
  acceptedAssignmentFixture,
  allocationCandidatesFixture,
  allocationReadyEpisodesFixture,
  assessorAssignmentsFixture,
  assessmentSubmittedFixture,
  assessmentTemplateFixture,
  assessorVisitsFixture,
  adminAssessmentDetailFixture,
  judgeAssessmentFixture,
  heldAllocationFixture,
  releasedAllocationFixture,
  resultPublishedFixture,
  parkActivationResponseFixture,
  registrationLocationSuggestionFixture,
  registrationSubmissionRequestFixture,
  registrationSubmissionResponseFixture,
  awardTrackFixtures,
  safeDisplayStatuses
} from "./index.js";

describe("foundation contracts", () => {
  it("keeps the application and episode state models separate", () => {
    expect(fullAssessmentDashboardFixture.applicationStatus).toBe("IN_PROGRESS");
    expect(fullAssessmentDashboardFixture.episodeStatus).toBe("APPLICATION_DRAFT");
    expect(fullAssessmentDashboardFixture.displayStatus).toBe("IN_PROGRESS");
  });

  it("keeps Mystery applicant projections display-safe", () => {
    expect(mysteryApplicantDashboardFixture.displayStatus).toBe("APPLICATION_UNDER_REVIEW");
    expect(mysteryApplicantDashboardFixture.applicationId).toBeUndefined();
    expect(mysteryApplicantDashboardFixture.applicationStatus).toBeUndefined();
    expect(mysteryApplicantDashboardFixture.episodeStatus).toBeUndefined();
    expect(JSON.stringify(mysteryApplicantDashboardFixture)).not.toContain("MYSTERY_SHOP");
  });

  it("models applicant dashboard and application draft/autosave contracts", () => {
    expect(applicantDashboardFixture.items).toHaveLength(2);
    expect(applicationDraftFixture.sections.map((section) => section.sectionKey)).toContain("site_information");
    expect(autosaveApplicationSectionFixture.section.status).toBe("complete");
    expect(previousFeedbackResponseDraftFixture.responseText).toContain("Synthetic");
    expect(parkManagerSessionFixture.actor.role).toBe("PARK_MANAGER");
    expect(JSON.stringify(applicantDashboardFixture.items[1])).not.toContain("MYSTERY_SHOP");
    expect(JSON.stringify(applicationDraftFixture)).not.toContain("invoice");
  });

  it("models applicant document upload and signed access contracts", () => {
    expect(applicationDocumentsFixture.documentCompletionStatus).toBe("complete");
    expect(applicationDocumentsFixture.slots[0]?.currentDocument?.documentType).toBe("management_plan");
    expect(documentUploadSessionFixture.status).toBe("CREATED");
    expect(documentChunkAcknowledgementFixture.progressPercent).toBeGreaterThan(0);
    expect(completeDocumentUploadFixture.document.visibility).toBe("APPLICANT_AND_ADMIN");
    expect(signedDocumentAccessFixture.url).toContain("lower-env-storage.invalid");
    expect(documentVersionsFixture.versions).toHaveLength(2);
    expect(JSON.stringify(applicationDocumentsFixture)).not.toContain("MYSTERY_SHOP");
    expect(JSON.stringify(applicationDocumentsFixture)).not.toContain("provider_credentials");
    expect(JSON.stringify(applicationDocumentsFixture)).not.toContain("storageKey");
    expect(JSON.stringify(completeDocumentUploadFixture)).not.toContain("storageProvider");
    expect(JSON.stringify(documentVersionsFixture)).not.toContain("uploadedByActorId");
  });

  it("models submission, invoice, and manual payment contracts without production values", () => {
    expect(applicationSubmissionFixture.applicationStatus).toBe("SUBMITTED");
    expect(applicationSubmissionFixture.invoice.amount).toBe("external_value_unavailable");
    expect(paymentSummaryFixture.purchaseOrder.purchaseOrderNumber).toContain("PO-");
    expect(manualPaymentPaidFixture.status).toBe("PAID");
    expect(paymentOverrideFixture.overrideApplied).toBe(true);
    expect(paymentDeadlineCheckFixture.blockedInvoiceIds).toContain(applicationSubmissionFixture.invoice.invoiceId);
    expect(JSON.stringify(applicationSubmissionFixture)).not.toContain("VAT");
    expect(JSON.stringify(applicationSubmissionFixture)).not.toContain("Stripe");
    expect(JSON.stringify(applicationSubmissionFixture)).not.toContain("MYSTERY_SHOP");
  });

  it("models admin read models and queues without later-slice behavior", () => {
    expect(adminDashboardSummaryFixture.counts.paymentsNeedAttention).toBeGreaterThan(0);
    expect(adminRegistrationQueueFixture.page.availableFilters).toContain("status");
    expect(adminApplicationQueueFixture.items[0]?.attentionFlags).toContain("payment_pending");
    expect(adminPaymentQueueFixture.items[0]?.amount).toBe("external_value_unavailable");
    expect(adminDocumentQueueFixture.items[0]?.visibility).toBe("APPLICANT_AND_ADMIN");
    expect(adminApplicationDetailFixture.result.status).toBe("not_available");
    expect(adminAllocationReadinessPreviewFixture.candidateGenerationAvailable).toBe(false);
    const serialized = JSON.stringify({
      adminDashboardSummaryFixture,
      adminApplicationQueueFixture,
      adminPaymentQueueFixture,
      adminDocumentQueueFixture,
      adminApplicationDetailFixture
    });
    expect(serialized).not.toContain("MYSTERY_SHOP");
    expect(serialized).not.toContain("judge");
    expect(serialized).not.toContain("VAT");
  });

  it("models assessor profile, preferences, availability, and capacity without allocation", () => {
    expect(judgeSessionFixture.actor.role).toBe("JUDGE");
    expect(assessorSelfProfileFixture.profile.accreditationProvider).toBe("external_value_unavailable");
    expect(assessorSelfProfileFixture.assignmentLoadDeferred).toBe(true);
    expect(assessorSelfProfileFixture.visitScheduleDeferred).toBe(true);
    expect(adminAssessorListFixture.items[0]?.capacityStatus).toBe("available");
    expect(adminAssessorDetailFixture.allocationCandidateGenerationAvailable).toBe(false);
    expect(assessorPreferencesUpdateFixture.profile.version).toBe(2);
    expect(assessorAvailabilityUpdateFixture.profile.availability[0]?.availabilityType).toBe("available");
    expect(assessorCapacityUpdateFixture.profile.capacity[0]?.maxAssignments).toBe(10);
    const serialized = JSON.stringify({
      assessorSelfProfileFixture,
      adminAssessorListFixture,
      adminAssessorDetailFixture
    });
    expect(serialized).not.toContain("MYSTERY_SHOP");
    expect(serialized).not.toContain("assignmentId");
    expect(serialized).not.toContain("provider_credentials");
  });

  it("exposes stable foundation metadata", () => {
    expect(contractMetadataResponseSchema.parse(contractMetadataFixture).episodeFirst).toBe(true);
    expect(contractMetadataFixture.forbiddenProductionValues).toContain("production_fees");
    expect(safeDisplayStatuses).toContain("APPLICATION_UNDER_REVIEW");
    expect(errorCodes).toContain("idempotency_conflict");
  });

  it("models authenticated session profiles for identity and RBAC", () => {
    expect(globalAdminSessionFixture.actor.role).toBe("SUPER_ADMIN");
    expect(globalAdminSessionFixture.internalUser.mfaSatisfied).toBe(true);
    expect(globalAdminSessionFixture.roleAssignments).toHaveLength(1);
    expect(globalAdminSessionFixture.authenticationSource).toBe("cognito");
  });

  it("models immutable audit events with request metadata", () => {
    expect(auditEventFixture.action).toBe("ASSIGN_ROLE");
    expect(auditEventFixture.request.requestId).toBe("request-0001");
    expect(auditEventFixture.createdAt).toBe("2026-05-05T00:00:00Z");
  });

  it("models the organisation, park, cycle, and episode foundation", () => {
    expect(lowerEnvironmentOrganisationFixture.name).toBe("Lower Environment Council");
    expect(lowerEnvironmentParkFixture.organisationId).toBe(lowerEnvironmentOrganisationFixture.id);
    expect(lowerEnvironmentParkLocationFixture.w3wAddress).toBe("///lower.environment.park");
    expect(lowerEnvironmentAwardCycle2025Fixture.cycleYear).toBe(2025);
    expect(lowerEnvironmentAwardCycle2026Fixture.cycleYear).toBe(2026);
    expect(lowerEnvironmentParkCycleSnapshotFixture.assessmentEpisodes).toHaveLength(2);
    expect(lowerEnvironmentParkCycleSnapshotFixture.assessmentEpisodes[0]?.episodeType).toBeDefined();
    expect(awardTrackFixtures[0]?.operationalStatus).toBe("OPERATIONAL");
    expect(JSON.stringify(lowerEnvironmentParkCycleSnapshotFixture)).not.toContain("applications");
    expect(lowerEnvironmentFullEpisodeFixture.status).toBe("APPLICATION_DRAFT");
  });

  it("models the registration, verification, and admin approval contracts", () => {
    expect(registrationSubmissionRequestFixture.eligibility.publiclyAccessible).toBe(true);
    expect(registrationSubmissionResponseFixture.status).toBe("PENDING_VERIFICATION");
    expect(registrationSubmissionResponseFixture.duplicateWarning.acknowledged).toBe(true);
    expect(registrationLocationSuggestionFixture.requiresApplicantConfirmation).toBe(true);
    expect(registrationLocationSuggestionFixture.source).toContain("mock");
    expect(adminRegistrationReviewQueueFixture.items[0]?.status).toBe("VERIFIED_PENDING_REVIEW");
    expect(parkActivationResponseFixture.parkStatus).toBe("ACTIVE");
    expect(JSON.stringify(registrationSubmissionResponseFixture)).not.toContain("production");
  });

  it("models configurable allocation contracts without applicant Mystery leakage", () => {
    expect(allocationReadyEpisodesFixture.items[0]?.suggestedJudgeCount).toBe(2);
    expect(allocationCandidatesFixture.candidates[0]?.hardExcluded).toBe(false);
    expect(allocationCandidatesFixture.candidates[0]?.flags[0]?.type).toBe("rotation");
    expect(heldAllocationFixture.status).toBe("HELD");
    expect(releasedAllocationFixture.notificationIntents).toContain("assignment_release_email_batch");
    expect(assessorAssignmentsFixture.items[0]?.contactRevealAvailable).toBe(false);
    expect(acceptedAssignmentFixture.assignment.status).toBe("ACCEPTED");
    const serialized = JSON.stringify({
      allocationReadyEpisodesFixture,
      allocationCandidatesFixture,
      assessorAssignmentsFixture
    });
    expect(serialized).not.toContain("provider_credentials");
    expect(serialized).not.toContain("VAT");
  });

  it("models central Mystery redaction policy fixtures", () => {
    expect(mysteryRedactionDecisionFixture).toMatchObject({
      surface: "applicant_dashboard",
      action: "redact",
      safeDisplayStatus: "APPLICATION_UNDER_REVIEW"
    });
    for (const fixture of [
      mysteryNotificationProjectionFixture,
      mysteryMessageProjectionFixture,
      mysterySearchExportProjectionFixture
    ]) {
      const serialized = JSON.stringify(fixture);
      expect(serialized).not.toContain("MYSTERY_SHOP");
      expect(serialized).not.toContain("judge@example");
      expect(serialized).not.toContain("2026-05-20T");
    }
  });

  it("models configurable visit and assessment scoring contracts without official criteria", () => {
    expect(assessmentTemplateFixture.source).toBe("configurable_lower_env");
    expect(assessmentTemplateFixture.criteria.every((criterion) => criterion.placeholderOnly)).toBe(true);
    expect(assessorVisitsFixture.items[0]?.status).toBe("SCHEDULED");
    expect(judgeAssessmentFixture.assessment.status).toBe("IN_PROGRESS");
    expect(assessmentSubmittedFixture.assessment.status).toBe("SUBMITTED");
    expect(assessmentSubmittedFixture.assessment.thresholdMet).toBe(true);
    expect(adminAssessmentDetailFixture.applicantSafeProjectionAvailable).toBe(false);
    const serialized = JSON.stringify({
      assessmentTemplateFixture,
      judgeAssessmentFixture,
      assessmentSubmittedFixture
    });
    expect(serialized).not.toContain("official");
    expect(serialized).not.toContain("score band");
    expect(serialized).not.toContain("MYSTERY_SHOP");
  });

  it("models episode-first result publication without official bands", () => {
    expect(adminResultDetailFixture.decision?.status).toBe("CONFIRMED_HELD");
    expect(resultPublishedFixture.decision.status).toBe("PUBLISHED");
    expect(resultPublishedFixture.publicMapEvent?.status).toBe("PENDING");
    expect(JSON.stringify(applicantResultPublishedFixture)).not.toContain("rawScoreTotal");
    expect(JSON.stringify(applicantResultPublishedFixture)).not.toContain("internalNotes");
  });

  it("models notifications, messages, jobs, and exports without provider delivery", () => {
    expect(notificationQueueFixture.items[0]?.status).toBe("QUEUED");
    expect(notificationQueueFixture.items[1]?.status).toBe("SUPPRESSED");
    expect(notificationDispatchStubFixture.log.provider).toBe("adapter_not_configured");
    expect(messageThreadsFixture.threads[0]?.visibleToApplicant).toBe(true);
    expect(messageCommandFixture.auditEventId).toBeDefined();
    expect(renewalReminderRunFixture.jobRun.status).toBe("COMPLETED");
    expect(jobRunsFixture.items[0]?.jobType).toBe("renewal_reminders");
    expect(exportCommandFixture.exportJob.storageProvider).toBe("lower_env_stub");
    expect(exportJobsFixture.items[0]?.status).toBe("COMPLETED");
    const serialized = JSON.stringify({
      notificationQueueFixture,
      messageThreadsFixture,
      exportCommandFixture
    });
    expect(serialized).not.toContain("api key");
    expect(serialized).not.toContain("provider_credentials");
    expect(serialized).not.toContain("MYSTERY_SHOP");
  });
});
