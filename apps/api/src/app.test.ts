import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("foundation api", () => {
  it("returns health", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "green-flag-api" });
  });

  it("returns contract metadata", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/contract-metadata" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      slice: "S00-operating-layer-and-contract-build-baseline",
      episodeFirst: true
    });
  });
});
