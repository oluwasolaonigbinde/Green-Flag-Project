import { describe, expect, it } from "vitest";
import { lowerEnvironmentSeedPolicy, migrationConvention } from "./index.js";

describe("db foundation conventions", () => {
  it("requires explicit migration naming and down markers", () => {
    expect(migrationConvention.pattern.test("0001_foundation_extensions.sql")).toBe(true);
    expect(migrationConvention.requiresDownMarker).toBe(true);
  });

  it("keeps seed policy synthetic", () => {
    expect(lowerEnvironmentSeedPolicy.syntheticOnly).toBe(true);
    expect(lowerEnvironmentSeedPolicy.forbiddenValues).toContain("production_fees");
  });
});
