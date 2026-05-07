import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createUnitOfWork, readPostgresRuntimeConfig, withTransaction, type SqlPool, type SqlPoolClient } from "./postgres.js";

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
      ssl: { rejectUnauthorized: true },
      maxConnections: 3
    });
  });

  it("reads CA/certificate paths for verified PostgreSQL TLS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "green-flag-db-ssl-"));
    try {
      const caPath = join(dir, "ca.pem");
      const certPath = join(dir, "client-cert.pem");
      const keyPath = join(dir, "client-key.pem");
      await writeFile(caPath, "test-ca");
      await writeFile(certPath, "test-cert");
      await writeFile(keyPath, "test-key");

      expect(readPostgresRuntimeConfig({
        DATABASE_URL: "postgres://green_flag:secret@db.example:5432/green_flag",
        DATABASE_SSL: "true",
        DATABASE_SSL_CA_PATH: caPath,
        DATABASE_SSL_CERT_PATH: certPath,
        DATABASE_SSL_KEY_PATH: keyPath,
        API_RUNTIME_MODE: "production"
      })).toEqual({
        databaseUrl: "postgres://green_flag:secret@db.example:5432/green_flag",
        ssl: {
          rejectUnauthorized: true,
          ca: "test-ca",
          cert: "test-cert",
          key: "test-key"
        }
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses unsafe PostgreSQL TLS in production and staging", () => {
    const baseEnv = {
      DATABASE_URL: "postgres://green_flag:secret@db.example:5432/green_flag",
      DATABASE_SSL: "true",
      DATABASE_SSL_ALLOW_UNAUTHORIZED_LOCAL: "true"
    };
    expect(() => readPostgresRuntimeConfig({ ...baseEnv, API_RUNTIME_MODE: "production" })).toThrow("cannot be disabled");
    expect(() => readPostgresRuntimeConfig({ ...baseEnv, API_RUNTIME_MODE: "staging" })).toThrow("cannot be disabled");
    expect(() => readPostgresRuntimeConfig({
      DATABASE_URL: baseEnv.DATABASE_URL,
      DATABASE_SSL: "true",
      DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
      NODE_ENV: "test"
    })).toThrow("DATABASE_SSL_REJECT_UNAUTHORIZED=false is not supported");
  });

  it("allows unsafe PostgreSQL TLS only in explicit local/test modes", () => {
    expect(readPostgresRuntimeConfig({
      DATABASE_URL: "postgres://green_flag:secret@localhost:5432/green_flag",
      DATABASE_SSL: "true",
      DATABASE_SSL_ALLOW_UNAUTHORIZED_LOCAL: "true",
      NODE_ENV: "test"
    })).toEqual({
      databaseUrl: "postgres://green_flag:secret@localhost:5432/green_flag",
      ssl: { rejectUnauthorized: false }
    });

    expect(() => readPostgresRuntimeConfig({
      DATABASE_URL: "postgres://green_flag:secret@localhost:5432/green_flag",
      DATABASE_SSL: "true",
      DATABASE_SSL_ALLOW_UNAUTHORIZED_LOCAL: "true"
    })).toThrow("allowed only");
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

  it("exposes the transaction client through UnitOfWork context", async () => {
    const pool = new FakePool();
    const uow = createUnitOfWork(pool);
    await uow.run(async ({ client }) => {
      expect(uow.currentClient()).toBe(client);
      await uow.currentClient().query("SELECT in_transaction");
    });
    expect(pool.client.statements).toEqual(["BEGIN", "SELECT in_transaction", "COMMIT", "RELEASE"]);
  });
});
