import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationDir = new URL("../migrations", import.meta.url);
const migrationDirPath = fileURLToPath(migrationDir);
const files = readdirSync(migrationDir).filter((file) => file.endsWith(".sql"));

if (files.length === 0) {
  throw new Error("No SQL migrations found");
}

for (const file of files) {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) {
    throw new Error(`Migration ${file} does not match NNNN_descriptive_name.sql`);
  }

  const sql = readFileSync(join(migrationDirPath, file), "utf8");
  const sqlBody = sql.replace(/^--.*$/gm, "");
  if (!sql.includes("-- migrate:down")) {
    throw new Error(`Migration ${file} is missing -- migrate:down marker`);
  }

  if (/audit_events|assessment_episodes|applications|role_assignments/i.test(sqlBody)) {
    throw new Error(`Migration ${file} contains later-slice domain tables`);
  }
}

console.log(`Migration convention check passed for ${files.length} file(s)`);
