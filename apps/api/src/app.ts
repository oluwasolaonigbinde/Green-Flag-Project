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
  registerAllocationRoutes,
  type AllocationStore
} from "./allocation.js";
import {
  registerAssessmentRoutes,
  type AssessmentStore
} from "./assessment.js";
import {
  registerCommunicationsRoutes,
  type CommunicationsStore
} from "./communications.js";
import {
  registerRegistrationRoutes,
  type RegistrationStore
} from "./registration.js";
import {
  registerResultsRoutes,
  type ResultsStore
} from "./results.js";
import type { RegistrationRepository } from "./postgres-domain-stores/registration-repository.js";
import type { ApplicantRepository } from "./postgres-domain-stores/applicant-repository.js";
import type { AssessorRepository } from "./postgres-domain-stores/assessor-repository.js";
import type { AllocationRepository } from "./postgres-domain-stores/allocation-repository.js";
import type { AssessmentRepository } from "./postgres-domain-stores/assessment-repository.js";
import type { CommunicationsRepository } from "./postgres-domain-stores/communications-repository.js";
import type { ResultsRepository } from "./postgres-domain-stores/results-repository.js";

export interface BuildAppOptions {
  resolveSession?: SessionResolver;
  applicantStore?: ApplicantStore;
  assessorStore?: AssessorStore;
  allocationStore?: AllocationStore;
  assessmentStore?: AssessmentStore;
  resultsStore?: ResultsStore;
  communicationsStore?: CommunicationsStore;
  registrationStore?: RegistrationStore;
  registrationRepository?: RegistrationRepository;
  applicantRepository?: ApplicantRepository;
  assessorRepository?: AssessorRepository;
  allocationRepository?: AllocationRepository;
  assessmentRepository?: AssessmentRepository;
  communicationsRepository?: CommunicationsRepository;
  resultsRepository?: ResultsRepository;
  auditLedger?: AuditLedger;
  productionLike?: boolean;
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
  const allocationStore = options.allocationStore;
  const assessmentStore = options.assessmentStore;
  const resultsStore = options.resultsStore;
  const communicationsStore = options.communicationsStore;
  const registrationStore = options.registrationStore;
  const registrationRepository = options.registrationRepository;
  const applicantRepository = options.applicantRepository;
  const assessorRepository = options.assessorRepository;
  const allocationRepository = options.allocationRepository;
  const assessmentRepository = options.assessmentRepository;
  const communicationsRepository = options.communicationsRepository;
  const resultsRepository = options.resultsRepository;

  if (options.productionLike) {
    if (registrationStore && !registrationRepository) {
      throw new Error("Production/staging registration routes require a DB-first registration repository.");
    }
    if (applicantStore && !applicantRepository) {
      throw new Error("Production/staging applicant/document/payment routes require a DB-first applicant repository.");
    }
    if (assessorStore && !assessorRepository) {
      throw new Error("Production/staging assessor command routes require a DB-first assessor repository.");
    }
    if (allocationStore && !allocationRepository) {
      throw new Error("Production/staging allocation command routes require a DB-first allocation repository.");
    }
    if (assessmentStore && !assessmentRepository) {
      throw new Error("Production/staging assessment command routes require a DB-first assessment repository.");
    }
    if (communicationsStore && !communicationsRepository) {
      throw new Error("Production/staging communications/message routes require a DB-first communications repository.");
    }
    if (resultsStore && !resultsRepository) {
      throw new Error("Production/staging results/decision/publication routes require a DB-first results repository.");
    }
  }

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

  if (registrationStore || registrationRepository) {
    registerRegistrationRoutes(app, {
      resolveSession,
      ...(registrationStore ? { store: registrationStore } : {}),
      ...(registrationRepository ? { repository: registrationRepository } : {}),
      ...(options.auditLedger ? { auditLedger: options.auditLedger } : {})
    });
  }

  if (applicantStore || applicantRepository) {
    registerApplicantRoutes(app, {
      resolveSession,
      ...(applicantStore ? { store: applicantStore } : {}),
      ...(applicantRepository ? { repository: applicantRepository } : {}),
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
      ...(assessorRepository ? { repository: assessorRepository } : {}),
      ...(options.auditLedger ? { auditLedger: options.auditLedger } : {})
    });
  }

  if (allocationStore && applicantStore && assessorStore) {
    registerAllocationRoutes(app, {
      resolveSession,
      allocationStore,
      applicantStore,
      assessorStore,
      ...(allocationRepository ? { repository: allocationRepository } : {}),
      ...(options.auditLedger ? { auditLedger: options.auditLedger } : {})
    });
  }

  if (assessmentStore && allocationStore && applicantStore && assessorStore) {
    registerAssessmentRoutes(app, {
      resolveSession,
      assessmentStore,
      allocationStore,
      applicantStore,
      assessorStore,
      ...(assessmentRepository ? { repository: assessmentRepository } : {}),
      ...(options.auditLedger ? { auditLedger: options.auditLedger } : {})
    });
  }

  if ((resultsStore && assessmentStore && applicantStore) || resultsRepository) {
    registerResultsRoutes(app, {
      resolveSession,
      ...(resultsStore ? { resultsStore } : {}),
      ...(assessmentStore ? { assessmentStore } : {}),
      ...(applicantStore ? { applicantStore } : {}),
      ...(resultsRepository ? { repository: resultsRepository } : {}),
      ...(options.auditLedger ? { auditLedger: options.auditLedger } : {})
    });
  }

  if ((communicationsStore && applicantStore) || communicationsRepository) {
    registerCommunicationsRoutes(app, {
      resolveSession,
      ...(communicationsStore ? { communicationsStore } : {}),
      ...(applicantStore ? { applicantStore } : {}),
      ...(communicationsRepository ? { repository: communicationsRepository } : {}),
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
