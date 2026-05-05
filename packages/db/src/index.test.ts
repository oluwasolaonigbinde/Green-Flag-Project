import { describe, expect, it } from "vitest";
import {
  auditEventTablePolicy,
  adminOverrideEventTablePolicy,
  lowerEnvironmentSeedPolicy,
  migrationConvention,
  slice2DomainTables,
  slice8AssessorManagementTables,
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
});
