
import type { UnitOfWork, SqlClient } from "@green-flag/db";
import {
  lowerEnvironmentAwardCycle2026Fixture,
  lowerEnvironmentOrganisationFixture,
  lowerEnvironmentParkFixture
} from "@green-flag/contracts";
import type { ApplicantStore } from "./applicant.js";
import type { AllocationStore } from "./allocation.js";
import type { AssessmentStore } from "./assessment.js";
import type { AssessorStore } from "./assessor.js";
import type { CommunicationsStore } from "./communications.js";
import type { RegistrationStore } from "./registration.js";
import type { ResultsStore } from "./results.js";
import { hydrateRegistrationStore } from "./postgres-domain-stores/registration.js";
import { hydrateApplicantStore } from "./postgres-domain-stores/applicant.js";
import { hydrateAssessorStore } from "./postgres-domain-stores/assessor.js";
import { hydrateAllocationStore } from "./postgres-domain-stores/allocation.js";
import { hydrateAssessmentStore } from "./postgres-domain-stores/assessment.js";
import { hydrateResultsStore } from "./postgres-domain-stores/results.js";
import { hydrateCommunicationsStore } from "./postgres-domain-stores/communications.js";
import { installTransactionalFlushes } from "./postgres-domain-stores/transactions.js";

export interface DomainStoreBundle {
  registrationStore: RegistrationStore;
  applicantStore: ApplicantStore;
  assessorStore: AssessorStore;
  allocationStore: AllocationStore;
  assessmentStore: AssessmentStore;
  resultsStore: ResultsStore;
  communicationsStore: CommunicationsStore;
}

export async function createPostgresDomainStores({
  client,
  unitOfWork,
  allowLowerEnvironmentFixtures = true
}: {
  client: SqlClient;
  unitOfWork: UnitOfWork;
  allowLowerEnvironmentFixtures?: boolean;
}): Promise<DomainStoreBundle> {
  const registrationStore = await hydrateRegistrationStore(client);
  const applicantStore = await hydrateApplicantStore(client);
  const assessorStore = await hydrateAssessorStore(client);
  const allocationStore = await hydrateAllocationStore(client);
  const assessmentStore = await hydrateAssessmentStore(client);
  const resultsStore = await hydrateResultsStore(client);
  const communicationsStore = await hydrateCommunicationsStore(client);

  if (allowLowerEnvironmentFixtures) {
    applicantStore.parkOwnerships.set(lowerEnvironmentParkFixture.id, {
      parkId: lowerEnvironmentParkFixture.id,
      organisationId: lowerEnvironmentOrganisationFixture.id,
      countryCode: lowerEnvironmentAwardCycle2026Fixture.countryCode
    });
  }

  installTransactionalFlushes({ unitOfWork, registrationStore, applicantStore, assessorStore, allocationStore, assessmentStore, resultsStore, communicationsStore });
  return { registrationStore, applicantStore, assessorStore, allocationStore, assessmentStore, resultsStore, communicationsStore };
}
