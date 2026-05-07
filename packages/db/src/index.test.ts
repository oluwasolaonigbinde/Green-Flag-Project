import { describe, expect, it } from "vitest";
import {
  auditEventTablePolicy,
  adminOverrideEventTablePolicy,
  lowerEnvironmentSeedPolicy,
  migrationConvention,
  slice2DomainTables,
  slice8AssessorManagementTables,
  slice9AllocationTables,
  slice11AssessmentTables,
  slice12ResultTables,
  slice125NormalisedReadModelTables,
  slice13NotificationJobExportTables,
  slice1IdentityAuditTables
} from "./index.js";

describe("db foundation conventions", () => {
  it("requires explicit migration naming and down markers", () => {
    expect(migrationConvention.pattern.test("0001_foundation_extensions.sql")).toBe(true);
    expect(migrationConvention.requiresDownMarker).toBe(true);
  });

  it("keeps seed policy synthetic", () => {
    expect(lowerEnvironmentSeedPolicy.syntheticOnly).toBe(true);
    expect(lowerEnvironmentSeedPolicy.forbiddenValues).toContain("production_fees");
  });

  it("tracks the approved Slice 1 identity and audit tables", () => {
    expect(slice1IdentityAuditTables).toContain("audit_events");
    expect(slice1IdentityAuditTables).toContain("admin_override_events");
    expect(auditEventTablePolicy.appendOnly).toBe(true);
    expect(auditEventTablePolicy.immutableOperations).toContain("DELETE");
    expect(adminOverrideEventTablePolicy.requiresReason).toBe(true);
    expect(adminOverrideEventTablePolicy.linksAuditEventWhereAvailable).toBe(true);
  });

  it("tracks the approved Slice 2 domain tables", () => {
    expect(slice2DomainTables).toContain("assessment_episodes");
    expect(slice2DomainTables).toContain("parks");
  });

  it("tracks the approved Slice 8 assessor management tables", () => {
    expect(slice8AssessorManagementTables).toContain("assessor_profiles");
    expect(slice8AssessorManagementTables).toContain("assessor_capacity_declarations");
  });

  it("tracks the approved Slice 9 allocation tables", () => {
    expect(slice9AllocationTables).toContain("allocations");
    expect(slice9AllocationTables).toContain("judge_assignments");
    expect(slice9AllocationTables).toContain("allocation_coi_flags");
  });

  it("tracks the approved Slice 11 assessment tables", () => {
    expect(slice11AssessmentTables).toContain("assessment_template_criteria");
    expect(slice11AssessmentTables).toContain("assessment_visits");
    expect(slice11AssessmentTables).toContain("judge_assessments");
    expect(slice11AssessmentTables).toContain("assessment_evidence");
  });

  it("tracks the approved Slice 12 result publication tables", () => {
    expect(slice12ResultTables).toContain("decision_results");
    expect(slice12ResultTables).toContain("result_artifacts");
    expect(slice12ResultTables).toContain("public_map_update_events");
  });

  it("tracks the approved Slice 12.5 normalized read-model tables", () => {
    expect(slice125NormalisedReadModelTables).toContain("assessment_score_entries");
  });

  it("tracks the approved Slice 13 notification, job, and export tables", () => {
    expect(slice13NotificationJobExportTables).toContain("notification_queue");
    expect(slice13NotificationJobExportTables).toContain("message_threads");
    expect(slice13NotificationJobExportTables).toContain("export_jobs");
  });
});
