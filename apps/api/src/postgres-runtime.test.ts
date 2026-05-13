import { describe, expect, it } from "vitest";
import type { SqlClient } from "@green-flag/db";
import { globalAdminSessionFixture } from "@green-flag/contracts";
import { createPostgresApiRuntime, isProductionLikeRuntime, PostgresAuditLedger, PostgresIdentityRepository } from "./postgres-runtime.js";

class FakeSqlClient implements SqlClient {
  calls: Array<{ text: string; values?: unknown[] }> = [];

  constructor(private readonly responses: unknown[][] = []) {}

  async query<Row = unknown>(text: string, values?: unknown[]) {
    this.calls.push(values ? { text, values } : { text });
    return {
      rows: (this.responses.shift() ?? []) as Row[],
      rowCount: 1
    };
  }
}

describe("Postgres API runtime adapters", () => {
  it("refuses production-like runtime without DATABASE_URL", async () => {
    expect(isProductionLikeRuntime({ NODE_ENV: "production" })).toBe(true);
    await expect(createPostgresApiRuntime({ NODE_ENV: "production" })).rejects.toThrow("DATABASE_URL");
    await expect(createPostgresApiRuntime({ API_RUNTIME_MODE: "staging" })).rejects.toThrow("DATABASE_URL");
    await expect(createPostgresApiRuntime({ NODE_ENV: "test" })).resolves.toBeNull();
  });

  it("refuses production-like runtime while lower-env providers are wired", async () => {
    for (const env of [
      { NODE_ENV: "production" },
      { API_RUNTIME_MODE: "staging" },
      { API_RUNTIME_MODE: "production" }
    ]) {
      await expect(createPostgresApiRuntime({
        ...env,
        DATABASE_URL: "postgres://green_flag:secret@db.example:5432/green_flag",
        COGNITO_ISSUER: "https://issuer.example",
        COGNITO_AUDIENCE: "green-flag-api",
        COGNITO_JWKS_URL: "https://issuer.example/.well-known/jwks.json"
      })).rejects.toThrow("lower-env providers");
    }
  });

  it("maps Cognito subjects to internal users and scoped role assignments", async () => {
    const adminRoleAssignment = globalAdminSessionFixture.roleAssignments[0];
    if (!adminRoleAssignment) {
      throw new Error("Expected global admin role assignment fixture.");
    }
    const client = new FakeSqlClient([
      [{
        id: globalAdminSessionFixture.internalUser.id,
        email: globalAdminSessionFixture.internalUser.email,
        display_name: globalAdminSessionFixture.internalUser.displayName,
        status: globalAdminSessionFixture.internalUser.status
      }],
      [{
        id: adminRoleAssignment.id,
        internal_user_id: globalAdminSessionFixture.internalUser.id,
        role_type: "SUPER_ADMIN",
        scope_type: "GLOBAL",
        scope_id: null,
        status: "ACTIVE",
        redaction_profile: "super_admin_full_access"
      }]
    ]);
    const repository = new PostgresIdentityRepository(client);

    await expect(repository.findInternalUserByCognitoSubject("subject-123")).resolves.toMatchObject({
      id: globalAdminSessionFixture.internalUser.id,
      cognitoSubject: "subject-123"
    });
    await expect(repository.listRoleAssignmentsByUserId(globalAdminSessionFixture.internalUser.id)).resolves.toEqual([
      expect.objectContaining({ role: "SUPER_ADMIN", scope: { type: "GLOBAL" } })
    ]);
  });

  it("appends audit events to the immutable audit_events table shape", async () => {
    const client = new FakeSqlClient();
    const ledger = new PostgresAuditLedger(client);
    await ledger.append({
      id: "00000000-0000-4000-8000-000000000099",
      actor: globalAdminSessionFixture.actor,
      action: "TEST_ACTION",
      entityType: "test_entity",
      entityId: "00000000-0000-4000-8000-000000000088",
      afterState: { ok: true },
      request: { requestId: "request-1" },
      createdAt: "2026-05-05T00:00:00.000Z"
    });

    expect(client.calls[0]?.text).toContain("INSERT INTO audit_events");
    expect(client.calls[0]?.values).toContain("TEST_ACTION");
    expect(client.calls[0]?.values).toContain(JSON.stringify({ ok: true }));
  });
});
