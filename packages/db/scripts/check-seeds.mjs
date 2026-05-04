import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const seedDir = new URL("../seeds", import.meta.url);
const seedDirPath = fileURLToPath(seedDir);
const files = readdirSync(seedDir).filter((file) => file.endsWith(".json"));
const forbiddenTokens = [
  "vat",
  "invoice wording",
  "provider secret",
  "api key",
  "score band",
  "official criteria",
  "kbt approval"
];

if (files.length === 0) {
  throw new Error("No lower-env seed files found");
}

for (const file of files) {
  const raw = readFileSync(join(seedDirPath, file), "utf8");
  const seed = JSON.parse(raw);

  if (seed.syntheticOnly !== true || seed.environment !== "lower-env-only") {
    throw new Error(`Seed ${file} must be explicitly lower-env synthetic data`);
  }

  for (const token of forbiddenTokens) {
    if (raw.toLowerCase().includes(token)) {
      throw new Error(`Seed ${file} contains forbidden production-looking token: ${token}`);
    }
  }
}

console.log(`Lower-env seed safety check passed for ${files.length} file(s)`);
