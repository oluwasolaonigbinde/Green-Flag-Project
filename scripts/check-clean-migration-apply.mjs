import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations, createPostgresPool } from "../packages/db/dist/index.js";

const defaultUrl = "postgres://green_flag:green_flag_local_only@127.0.0.1:5432/green_flag_local";
const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.CLEAN_MIGRATION_DATABASE_URL ?? defaultUrl;
const runtimeMode = process.env.API_RUNTIME_MODE;

if (process.env.NODE_ENV === "production" || runtimeMode === "production" || runtimeMode === "staging") {
  throw new Error("Clean migration apply check refuses production/staging runtime modes.");
}

const parsed = new URL(baseUrl);
const databaseNameFromUrl = parsed.pathname.replace(/^\//, "");
const unsafeMarkers = ["prod", "production", "staging", "stage", "uat", "shared"];
const markerSource = `${parsed.hostname} ${databaseNameFromUrl}`.toLowerCase();
if (unsafeMarkers.some((marker) => markerSource.includes(marker))) {
  throw new Error(
    `Clean migration apply check refuses database URL/name/host containing production-like marker. Host=${parsed.hostname} database=${databaseNameFromUrl}`
  );
}
if (process.env.ALLOW_MIGRATION_APPLY_TO_TEST_DATABASE !== "true") {
  throw new Error("Set ALLOW_MIGRATION_APPLY_TO_TEST_DATABASE=true to confirm this check may create and drop a disposable test database.");
}
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) && process.env.CI !== "true") {
  throw new Error(`Clean migration apply check refuses non-local database host outside CI: ${parsed.hostname}`);
}

const maintenanceUrl = new URL(parsed.toString());
maintenanceUrl.pathname = "/postgres";

const databaseName = `green_flag_migration_check_${process.pid}_${Date.now()}`;
const testUrl = new URL(parsed.toString());
testUrl.pathname = `/${databaseName}`;

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

const maintenancePool = createPostgresPool({ databaseUrl: maintenanceUrl.toString(), maxConnections: 1 });

let dropError;
try {
  try {
    await maintenancePool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Unable to create disposable migration-check database. Grant local/CI create/drop database permission or provide a disposable TEST_DATABASE_URL. Reason: ${reason}`);
  }
  const pool = createPostgresPool({ databaseUrl: testUrl.toString() });
  try {
    const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../packages/db/migrations");
    const result = await runMigrations({ pool, migrationsDir });
    if (result.appliedNow.length !== result.discovered.length) {
      throw new Error(`Expected clean database to apply ${result.discovered.length} migration(s), applied ${result.appliedNow.length}.`);
    }
    console.log(`Clean migration apply check passed for ${result.appliedNow.length} migration(s).`);
  } finally {
    await pool.end();
  }
} finally {
  await maintenancePool.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [databaseName]
  );
  try {
    await maintenancePool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  } catch (error) {
    dropError = error;
  }
  await maintenancePool.end();
}

if (dropError) {
  const reason = dropError instanceof Error ? dropError.message : "unknown error";
  throw new Error(`Unable to drop disposable migration-check database ${databaseName}. Remove it manually after confirming it is not in use. Reason: ${reason}`);
}
