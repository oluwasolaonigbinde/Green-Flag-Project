import type { z } from "zod";
import { safeDisplayStatuses } from "./enums.js";
import { applicantDashboardItemSchema, contractMetadataResponseSchema } from "./schemas.js";

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
