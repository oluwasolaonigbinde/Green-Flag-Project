import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

const { Pool } = pg;

export interface SqlQueryResult<Row = unknown> {
  rows: Row[];
  rowCount: number | null;
}

export interface SqlClient {
  query<Row = unknown>(text: string, values?: unknown[]): Promise<SqlQueryResult<Row>>;
}

export interface SqlPool extends SqlClient {
  connect(): Promise<SqlPoolClient>;
  end(): Promise<void>;
}

export interface SqlPoolClient extends SqlClient {
  release(): void;
}

export interface PostgresSslConfig {
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

export interface PostgresRuntimeConfig {
  databaseUrl: string;
  ssl?: PostgresSslConfig;
  maxConnections?: number;
}

export interface TransactionContext {
  client: SqlClient;
}

export class UnitOfWork {
  private readonly storage = new AsyncLocalStorage<TransactionContext>();

  constructor(private readonly pool: SqlPool) {}

  currentClient(): SqlClient {
    return this.storage.getStore()?.client ?? this.pool;
  }

  async run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return withTransaction(this.pool, async (client) =>
      this.storage.run({ client }, async () => work({ client }))
    );
  }
}

export function isProductionLikePostgresRuntime(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" || env.API_RUNTIME_MODE === "production" || env.API_RUNTIME_MODE === "staging";
}

function isExplicitLocalOrTestRuntime(env: NodeJS.ProcessEnv) {
  return (
    env.NODE_ENV === "test" ||
    env.NODE_ENV === "development" ||
    env.API_RUNTIME_MODE === "test" ||
    env.API_RUNTIME_MODE === "local" ||
    env.API_RUNTIME_MODE === "lower-env"
  );
}

function readCertificateFile(path: string, envName: string) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Unable to read ${envName} at ${path}: ${reason}`);
  }
}

function readPostgresSslConfig(env: NodeJS.ProcessEnv): PostgresSslConfig | undefined {
  if (env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") {
    throw new Error(
      "DATABASE_SSL_REJECT_UNAUTHORIZED=false is not supported. Use DATABASE_SSL_ALLOW_UNAUTHORIZED_LOCAL=true only in explicit local/test runtime modes."
    );
  }

  const unsafeLocalRequested = env.DATABASE_SSL_ALLOW_UNAUTHORIZED_LOCAL === "true";
  if (isProductionLikePostgresRuntime(env) && unsafeLocalRequested) {
    throw new Error(
      "PostgreSQL TLS certificate validation cannot be disabled in production or staging. Remove DATABASE_SSL_ALLOW_UNAUTHORIZED_LOCAL and configure DATABASE_SSL_CA_PATH if a private CA is required."
    );
  }
  if (unsafeLocalRequested && !isExplicitLocalOrTestRuntime(env)) {
    throw new Error(
      "DATABASE_SSL_ALLOW_UNAUTHORIZED_LOCAL=true is allowed only when NODE_ENV=test/development or API_RUNTIME_MODE=local/test/lower-env."
    );
  }

  if (env.DATABASE_SSL !== "true") {
    if (unsafeLocalRequested) {
      throw new Error("DATABASE_SSL_ALLOW_UNAUTHORIZED_LOCAL=true requires DATABASE_SSL=true.");
    }
    return undefined;
  }

  if (unsafeLocalRequested) {
    return { rejectUnauthorized: false };
  }

  const ssl: PostgresSslConfig = { rejectUnauthorized: true };
  if (env.DATABASE_SSL_CA_PATH) {
    ssl.ca = readCertificateFile(env.DATABASE_SSL_CA_PATH, "DATABASE_SSL_CA_PATH");
  }
  if (env.DATABASE_SSL_CERT_PATH) {
    ssl.cert = readCertificateFile(env.DATABASE_SSL_CERT_PATH, "DATABASE_SSL_CERT_PATH");
  }
  if (env.DATABASE_SSL_KEY_PATH) {
    ssl.key = readCertificateFile(env.DATABASE_SSL_KEY_PATH, "DATABASE_SSL_KEY_PATH");
  }
  return ssl;
}

export function readPostgresRuntimeConfig(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig | null {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  const ssl = readPostgresSslConfig(env);
  const config: PostgresRuntimeConfig = {
    databaseUrl,
    ...(ssl ? { ssl } : {})
  };
  if (env.DATABASE_MAX_CONNECTIONS) {
    config.maxConnections = Number(env.DATABASE_MAX_CONNECTIONS);
  }
  return config;
}

export function createPostgresPool(config: PostgresRuntimeConfig): SqlPool {
  return new Pool({
    connectionString: config.databaseUrl,
    ssl: config.ssl,
    max: config.maxConnections ?? 10
  }) as unknown as SqlPool;
}

export function createUnitOfWork(pool: SqlPool) {
  return new UnitOfWork(pool);
}

export async function withTransaction<T>(pool: SqlPool, work: (client: SqlClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations({
  pool,
  migrationsDir
}: {
  pool: SqlPool;
  migrationsDir: string;
}) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at_utc timestamptz NOT NULL DEFAULT now()
    )
  `);

  const filenames = (await readdir(migrationsDir))
    .filter((filename) => /^\d{4}_[a-z0-9_]+\.sql$/.test(filename))
    .sort();

  const applied = await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations");
  const appliedNames = new Set(applied.rows.map((row) => row.filename));
  const appliedNow: string[] = [];

  for (const filename of filenames) {
    if (appliedNames.has(filename)) {
      continue;
    }

    const raw = await readFile(join(migrationsDir, filename), "utf8");
    const [upSql] = raw.split("-- migrate:down");
    if (!upSql?.trim()) {
      throw new Error(`Migration ${filename} does not contain an up migration.`);
    }

    await withTransaction(pool, async (transactionClient) => {
      await transactionClient.query(upSql);
      await transactionClient.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    });
    appliedNow.push(filename);
  }

  return {
    discovered: filenames,
    appliedNow
  };
}
