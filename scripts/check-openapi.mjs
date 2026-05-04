import { readFileSync } from "node:fs";

const documentPath = new URL("../openapi/openapi.json", import.meta.url);
const document = JSON.parse(readFileSync(documentPath, "utf8"));

const requiredPaths = ["/health", "/api/v1/contract-metadata"];
const requiredSchemas = ["HealthResponse", "ContractMetadataResponse", "ErrorResponse"];

for (const path of requiredPaths) {
  if (!document.paths?.[path]?.get) {
    throw new Error(`Missing GET operation for ${path}`);
  }
}

for (const schema of requiredSchemas) {
  if (!document.components?.schemas?.[schema]) {
    throw new Error(`Missing schema ${schema}`);
  }
}

if (document.info?.title !== "Green Flag Award Foundation API") {
  throw new Error("Unexpected OpenAPI title");
}

console.log("OpenAPI skeleton check passed");
