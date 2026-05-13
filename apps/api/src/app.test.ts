import { describe, expect, it } from "vitest";
import { globalAdminSessionFixture } from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { ApiError } from "./auth.js";
import { createApplicantStore } from "./applicant.js";
import { createRegistrationStore } from "./registration.js";
import { createAllocationStore } from "./allocation.js";
import { createAssessorStore } from "./assessor.js";
import { createAssessmentStore } from "./assessment.js";
import { createCommunicationsStore } from "./communications.js";
import { createResultsStore } from "./results.js";

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

  it("returns the resolved session profile when auth is available", async () => {
    const app = buildApp({
      resolveSession: async () => globalAdminSessionFixture
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/session",
      headers: {
        authorization: "Bearer test-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      actor: {
        role: "SUPER_ADMIN",
        redactionProfile: "super_admin_full_access"
      },
      mfaSatisfied: true,
      authenticationSource: "cognito"
    });
  });

  it("returns a stable error envelope when auth is missing", async () => {
    const app = buildApp({
      resolveSession: async () => {
        throw new ApiError("unauthorized", 401, "Missing Authorization header.");
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/session"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "unauthorized",
        message: "Missing Authorization header."
      }
    });
  });

  it("requires DB-first repositories for production-like registration and applicant route wiring", () => {
    expect(() =>
      buildApp({
        productionLike: true,
        registrationStore: createRegistrationStore()
      })
    ).toThrow("DB-first registration repository");

    expect(() =>
      buildApp({
        productionLike: true,
        applicantStore: createApplicantStore()
      })
    ).toThrow("DB-first applicant repository");

    expect(() =>
      buildApp({
        productionLike: true,
        assessorStore: createAssessorStore()
      })
    ).toThrow("DB-first assessor repository");

    expect(() =>
      buildApp({
        productionLike: true,
        allocationStore: createAllocationStore()
      })
    ).toThrow("DB-first allocation repository");

    expect(() =>
      buildApp({
        productionLike: true,
        assessmentStore: createAssessmentStore()
      })
    ).toThrow("DB-first assessment repository");

    expect(() =>
      buildApp({
        productionLike: true,
        communicationsStore: createCommunicationsStore()
      })
    ).toThrow("DB-first communications repository");

    expect(() =>
      buildApp({
        productionLike: true,
        resultsStore: createResultsStore()
      })
    ).toThrow("DB-first results repository");
  });

  it("prefers communications repository over lower-env store transaction fallback when both are wired", async () => {
    const communicationsStore = createCommunicationsStore();
    communicationsStore.withTransaction = async () => {
      throw new Error("store flush should not run");
    };
    const repository = {
      async listNotificationQueue() { return { items: [], logs: [] }; },
      async dispatchNotificationStub() { return {}; },
      async listApplicantMessages() { return { threads: [], messages: [] }; },
      async createThread() { return { ok: true }; },
      async listAdminMessages() { return { threads: [], messages: [] }; },
      async runRenewalReminders() { return { jobRun: {}, queuedNotifications: [] }; },
      async listJobs() { return { items: [] }; },
      async createExport() { return {}; },
      async listExports() { return { items: [] }; }
    };
    const app = buildApp({
      communicationsStore,
      applicantStore: createApplicantStore(),
      communicationsRepository: repository,
      resolveSession: async () => globalAdminSessionFixture
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/messages",
      payload: {
        subject: "Repository path",
        body: "Do not flush the communications store."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("prefers results repository over lower-env store transaction fallback when both are wired", async () => {
    const resultsStore = createResultsStore();
    resultsStore.withTransaction = async () => {
      throw new Error("store flush should not run");
    };
    const repository = {
      async adminDetail() { return {}; },
      async hold() { return { ok: true }; },
      async publish() { return {}; },
      async withdraw() { return {}; },
      async applicantResult() { return {}; }
    };
    const app = buildApp({
      resultsStore,
      assessmentStore: createAssessmentStore(),
      applicantStore: createApplicantStore(),
      resultsRepository: repository,
      resolveSession: async () => globalAdminSessionFixture
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/results/11111111-1111-4111-8111-111111111111/hold",
      payload: {
        thresholdAcknowledged: true,
        idempotencyKey: "results-repository-path"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
