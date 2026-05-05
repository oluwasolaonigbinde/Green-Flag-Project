import Fastify from "fastify";
import {
  contractMetadataFixture,
  contractMetadataResponseSchema,
  healthResponseSchema,
  sessionProfileSchema
} from "@green-flag/contracts";
import { ApiError, createDependencyMissingResolver, type AuditLedger, type SessionResolver } from "./auth.js";
import { registerAdminRoutes } from "./admin.js";
import {
  registerApplicantRoutes,
  type ApplicantStore
} from "./applicant.js";
import {
  registerAssessorRoutes,
  type AssessorStore
} from "./assessor.js";
import {
  registerRegistrationRoutes,
  type RegistrationStore
} from "./registration.js";

export interface BuildAppOptions {
  resolveSession?: SessionResolver;
  applicantStore?: ApplicantStore;
  assessorStore?: AssessorStore;
  registrationStore?: RegistrationStore;
  auditLedger?: AuditLedger;
}

function errorPayload(error: ApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details
    }
  };
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false
  });
  const resolveSession = options.resolveSession ?? createDependencyMissingResolver();
  const applicantStore = options.applicantStore;
  const assessorStore = options.assessorStore;
  const registrationStore = options.registrationStore;

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

  app.get("/api/v1/session", async (request, reply) => {
    const session = await resolveSession(request);
    reply.send(sessionProfileSchema.parse(session));
  });

  if (registrationStore) {
    registerRegistrationRoutes(app, {
      resolveSession,
      store: registrationStore,
      ...(options.auditLedger ? { auditLedger: options.auditLedger } : {})
    });
  }

  if (applicantStore) {
    registerApplicantRoutes(app, {
      resolveSession,
      store: applicantStore,
      ...(options.auditLedger ? { auditLedger: options.auditLedger } : {})
    });
  }

  if (applicantStore && registrationStore) {
    registerAdminRoutes(app, {
      resolveSession,
      applicantStore,
      registrationStore
    });
  }

  if (assessorStore) {
    registerAssessorRoutes(app, {
      resolveSession,
      store: assessorStore,
      ...(options.auditLedger ? { auditLedger: options.auditLedger } : {})
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send(errorPayload(error));
      return;
    }

    reply.status(500).send({
      error: {
        code: "validation_failed",
        message: error instanceof Error ? error.message : "Unexpected API error."
      }
    });
  });

  return app;
}
