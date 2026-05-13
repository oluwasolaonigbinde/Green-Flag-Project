import { describe, expect, it } from "vitest";
import {
  loadLegacyFieldMappingManifest,
  planLegacyScoreFormImport,
  validateLegacyFieldMappingManifest
} from "./legacy-field-mapping.js";

describe("legacy Goal 5 mapping manifest", () => {
  it("covers the required legacy field groups and expanded finance/profile/archive inputs", () => {
    const manifest = validateLegacyFieldMappingManifest(loadLegacyFieldMappingManifest());
    const keys = new Set(manifest.entries.map((entry) => `${entry.sourceTable}.${entry.sourceColumn}`));

    for (const requiredKey of [
      "Park.ParkTitle",
      "Park.ParkAlternateTitle",
      "Park.ParkWalkTime",
      "Park.ParkContractor",
      "Park.BecomeAFriend",
      "Park.IsTrustProtected",
      "ParkAwardApplication.AverageYearlyVisitors",
      "ParkAwardApplication.TrainingBudgetPerStaffMember",
      "ParkAwardApplication.RevenueSpentLastYear",
      "ParkAwardApplication.CapitalSpentLastYear",
      "ParkAwardApplication.AwardYearFirstApplied",
      "ParkAwardApplication.SpecialAwardYearFirstApplied",
      "ParkAwardApplication.WonGreenPennantAward",
      "ParkAwardApplication.WonGreenHeritageAward",
      "ParkAwardApplication.WonSpecialInnovationAward",
      "AdditionalField.*",
      "AdditionalFieldData.*",
      "ContactTypeAdditionalField.*",
      "ResetLog.*",
      "Votes.*",
      "ParksVote.*",
      "Settings.ActiveKeys",
      "InvoicingOrganisation.*",
      "InvoicingOrganisationTeam.*"
    ]) {
      expect(keys).toContain(requiredKey);
    }
  });

  it("blocks passed reconciliation when unknown AdditionalField definitions are observed", () => {
    const manifest = loadLegacyFieldMappingManifest();
    expect(() =>
      validateLegacyFieldMappingManifest(manifest, {
        observedAdditionalFieldDefinitions: ["AdditionalField.UnclassifiedLegacyPrompt"]
      })
    ).toThrow("Unknown AdditionalField definitions block passed reconciliation");
  });

  it("archives unsupported legacy FormsValue payloads without exposing raw form content", () => {
    const plan = planLegacyScoreFormImport({
      formType: "historic-score-form",
      formsValue: "{\"TotalScore\":87,\"InternalNotes\":\"raw notes\"}"
    });
    expect(plan).toMatchObject({
      action: "archive_only",
      structuredImportAllowed: false,
      archiveRequired: true,
      formType: "historic-score-form"
    });
    expect(JSON.stringify(plan)).not.toContain("InternalNotes");
    expect(plan.formsValueChecksum).toHaveLength(64);
  });

  it("allows structured score import only when an approved template mapping key is supplied", () => {
    expect(planLegacyScoreFormImport({ formType: "approved", formsValue: "{}", approvedTemplateMappingKey: "template-v1" }))
      .toMatchObject({
        action: "structured_import_with_approved_mapping",
        structuredImportAllowed: true,
        approvedTemplateMappingKey: "template-v1"
      });
  });
});
