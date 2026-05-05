import { describe, expect, it } from "vitest";
import { readPostgresRuntimeConfig, withTransaction, type SqlPool, type SqlPoolClient } from "./postgres.js";

class FakeClient implements SqlPoolClient {
  statements: string[] = [];

  async query<Row = unknown>(text: string) {
    this.statements.push(text);
    return { rows: [] as Row[], rowCount: 0 };
  }

  release() {
    this.statements.push("RELEASE");
  }
}

class FakePool implements SqlPool {
  client = new FakeClient();

  async connect() {
    return this.client;
  }

  async query<Row = unknown>(text: string) {
    this.client.statements.push(text);
    return { rows: [] as Row[], rowCount: 0 };
  }

  async end() {
    this.client.statements.push("END");
  }
}

describe("Postgres runtime utilities", () => {
  it("reads DATABASE_URL only when configured", () => {
    expect(readPostgresRuntimeConfig({})).toBeNull();
    expect(readPostgresRuntimeConfig({
      DATABASE_URL: "postgres://green_flag:secret@localhost:5432/green_flag",
      DATABASE_SSL: "true",
      DATABASE_MAX_CONNECTIONS: "3"
    })).toEqual({
      databaseUrl: "postgres://green_flag:secret@localhost:5432/green_flag",
      ssl: true,
      maxConnections: 3
    });
  });

  it("commits successful transactions", async () => {
    const pool = new FakePool();
    await withTransaction(pool, async (client) => {
      await client.query("SELECT 1");
    });
    expect(pool.client.statements).toEqual(["BEGIN", "SELECT 1", "COMMIT", "RELEASE"]);
  });

  it("rolls back failed transactions", async () => {
    const pool = new FakePool();
    await expect(withTransaction(pool, async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(pool.client.statements).toEqual(["BEGIN", "ROLLBACK", "RELEASE"]);
  });
});
