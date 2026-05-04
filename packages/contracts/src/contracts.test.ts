import { describe, expect, it } from "vitest";
import {
  contractMetadataFixture,
  contractMetadataResponseSchema,
  errorCodes,
  fullAssessmentDashboardFixture,
  mysteryApplicantDashboardFixture,
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

  it("exposes stable foundation metadata", () => {
    expect(contractMetadataResponseSchema.parse(contractMetadataFixture).episodeFirst).toBe(true);
    expect(contractMetadataFixture.forbiddenProductionValues).toContain("production_fees");
    expect(safeDisplayStatuses).toContain("APPLICATION_UNDER_REVIEW");
    expect(errorCodes).toContain("idempotency_conflict");
  });
});
