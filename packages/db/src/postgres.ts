import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
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

export interface PostgresRuntimeConfig {
  databaseUrl: string;
  ssl?: boolean;
  maxConnections?: number;
}

export function readPostgresRuntimeConfig(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig | null {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  const config: PostgresRuntimeConfig = {
    databaseUrl,
    ssl: env.DATABASE_SSL === "true"
  };
  if (env.DATABASE_MAX_CONNECTIONS) {
    config.maxConnections = Number(env.DATABASE_MAX_CONNECTIONS);
  }
  return config;
}

export function createPostgresPool(config: PostgresRuntimeConfig): SqlPool {
  return new Pool({
    connectionString: config.databaseUrl,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    max: config.maxConnections ?? 10
  }) as unknown as SqlPool;
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
