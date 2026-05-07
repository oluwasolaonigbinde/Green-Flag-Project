import { describe, expect, it } from "vitest";
import { assertProductionRuntimeSafety, collectProductionRuntimeSafetyIssues, isProductionLikeRuntime } from "./runtime-safety.js";

describe("API production runtime safety guardrails", () => {
  it("treats production and staging runtime modes as production-like", () => {
    expect(isProductionLikeRuntime({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionLikeRuntime({ API_RUNTIME_MODE: "production" })).toBe(true);
    expect(isProductionLikeRuntime({ API_RUNTIME_MODE: "staging" })).toBe(true);
    expect(isProductionLikeRuntime({ API_RUNTIME_MODE: "lower-env" })).toBe(false);
    expect(isProductionLikeRuntime({ NODE_ENV: "test" })).toBe(false);
  });

  it("allows lower-env providers in explicit local/test modes", () => {
    expect(collectProductionRuntimeSafetyIssues({
      env: { API_RUNTIME_MODE: "lower-env" },
      databaseConfigured: false
    })).toEqual([]);
    expect(collectProductionRuntimeSafetyIssues({
      env: { NODE_ENV: "test" },
      databaseConfigured: false
    })).toEqual([]);
  });

  it("fails production startup when DATABASE_URL would fall back to mutable in-memory stores", () => {
    expect(() => assertProductionRuntimeSafety({
      env: { API_RUNTIME_MODE: "production" },
      databaseConfigured: false
    })).toThrow("DATABASE_URL");
  });

  it("fails production startup while lower-env providers are wired", () => {
    expect(() => assertProductionRuntimeSafety({
      env: { API_RUNTIME_MODE: "production" },
      databaseConfigured: true,
      dbFirstRepositoriesConfigured: true
    })).toThrow(/lower-env fixture providers[\s\S]*document\/result\/evidence storage[\s\S]*notifications[\s\S]*example.invalid/i);
  });

  it("keeps lower-env fixtures out of production runtime", () => {
    const issues = collectProductionRuntimeSafetyIssues({
      env: { NODE_ENV: "production" },
      databaseConfigured: true,
      dbFirstRepositoriesConfigured: true
    });
    expect(issues.map((issue) => issue.code)).toContain("lower_env_fixture_provider");
    expect(issues.map((issue) => issue.code)).toContain("lower_env_storage_provider");
  });

  it("rejects canonical mutable PostgreSQL-hydrated stores in production-like runtime", () => {
    const issues = collectProductionRuntimeSafetyIssues({
      env: { API_RUNTIME_MODE: "staging" },
      databaseConfigured: true,
      dbFirstRepositoriesConfigured: false
    });
    expect(issues.map((issue) => issue.code)).toContain("canonical_mutable_postgres_hydrated_stores");
  });

  it("allows explicit manual MVP payment mode without enabling fake invoice generation", () => {
    const issues = collectProductionRuntimeSafetyIssues({
      env: { API_RUNTIME_MODE: "production", PAYMENT_RUNTIME_MODE: "manual_mvp" },
      databaseConfigured: true,
      dbFirstRepositoriesConfigured: true
    });
    expect(issues.map((issue) => issue.code)).not.toContain("lower_env_payment_provider");
    expect(issues.map((issue) => issue.code)).toContain("missing_production_invoice_configuration");
  });

  it("allows explicit manual offline invoice mode only when separately configured", () => {
    const issues = collectProductionRuntimeSafetyIssues({
      env: {
        API_RUNTIME_MODE: "production",
        PAYMENT_RUNTIME_MODE: "manual_mvp",
        INVOICE_RUNTIME_MODE: "manual_offline"
      },
      databaseConfigured: true,
      dbFirstRepositoriesConfigured: true
    });
    expect(issues.map((issue) => issue.code)).not.toContain("lower_env_payment_provider");
    expect(issues.map((issue) => issue.code)).not.toContain("missing_production_invoice_configuration");
  });
});
