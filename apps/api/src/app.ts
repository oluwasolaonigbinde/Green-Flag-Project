import Fastify from "fastify";
import {
  contractMetadataFixture,
  contractMetadataResponseSchema,
  healthResponseSchema
} from "@green-flag/contracts";

export function buildApp() {
  const app = Fastify({
    logger: false
  });

  app.get("/health", async () =>
    healthResponseSchema.parse({
      status: "ok",
      service: "green-flag-api",
      version: "0.0.0"
    })
  );

  app.get("/api/v1/contract-metadata", async () =>
    contractMetadataResponseSchema.parse(contractMetadataFixture)
  );

  return app;
}
