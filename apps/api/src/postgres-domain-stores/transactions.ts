
import type { UnitOfWork } from "@green-flag/db";
import type { RegistrationStore } from "../registration.js";
import type { ApplicantStore } from "../applicant.js";
import type { AssessorStore } from "../assessor.js";
import type { AllocationStore } from "../allocation.js";
import type { AssessmentStore } from "../assessment.js";
import type { ResultsStore } from "../results.js";
import type { CommunicationsStore } from "../communications.js";
import { flushRegistrationStore } from "./registration.js";
import { flushApplicantStore } from "./applicant.js";
import { flushAssessorStore } from "./assessor.js";
import { flushAllocationStore } from "./allocation.js";
import { flushAssessmentStore } from "./assessment.js";
import { flushResultsStore } from "./results.js";
import { flushCommunicationsStore } from "./communications.js";

export interface TransactionalDomainStores {
  registrationStore: RegistrationStore;
  applicantStore: ApplicantStore;
  assessorStore: AssessorStore;
  allocationStore: AllocationStore;
  assessmentStore: AssessmentStore;
  resultsStore: ResultsStore;
  communicationsStore: CommunicationsStore;
}

function snapshotRegistrationStore(store: RegistrationStore) {
  return {
    records: structuredClone([...store.records.entries()]),
    audits: structuredClone(store.audits)
  };
}

function restoreRegistrationStore(store: RegistrationStore, snapshot: ReturnType<typeof snapshotRegistrationStore>) {
  store.records = new Map(snapshot.records);
  store.audits = snapshot.audits;
}

function snapshotApplicantStore(store: ApplicantStore) {
  return {
    applications: structuredClone([...store.applications.entries()]),
    previousFeedbackResponses: structuredClone([...store.previousFeedbackResponses.entries()]),
    documents: structuredClone([...store.documents.entries()]),
    uploadSessions: structuredClone([...store.uploadSessions.entries()]),
    invoices: structuredClone([...store.invoices.entries()]),
    payments: structuredClone([...store.payments.entries()]),
    episodeStatuses: structuredClone([...store.episodeStatuses.entries()]),
    audits: structuredClone(store.audits),
    overrideEvents: structuredClone(store.overrideEvents)
  };
}

function restoreApplicantStore(store: ApplicantStore, snapshot: ReturnType<typeof snapshotApplicantStore>) {
  store.applications = new Map(snapshot.applications);
  store.previousFeedbackResponses = new Map(snapshot.previousFeedbackResponses);
  store.documents = new Map(snapshot.documents);
  store.uploadSessions = new Map(snapshot.uploadSessions);
  store.invoices = new Map(snapshot.invoices);
  store.payments = new Map(snapshot.payments);
  store.episodeStatuses = new Map(snapshot.episodeStatuses);
  store.audits = snapshot.audits;
  store.overrideEvents = snapshot.overrideEvents;
}

export function installTransactionalFlushes({
  unitOfWork,
  registrationStore,
  applicantStore,
  assessorStore,
  allocationStore,
  assessmentStore,
  resultsStore,
  communicationsStore
}: TransactionalDomainStores & { unitOfWork: UnitOfWork }) {
  registrationStore.withTransaction = async (work) => {
    const snapshot = snapshotRegistrationStore(registrationStore);
    try {
      return await unitOfWork.run(async ({ client }) => {
        const result = await work();
        await flushRegistrationStore(client, registrationStore);
        return result;
      });
    } catch (error) {
      restoreRegistrationStore(registrationStore, snapshot);
      throw error;
    }
  };

  applicantStore.withTransaction = async (work) => {
    const snapshot = snapshotApplicantStore(applicantStore);
    try {
      return await unitOfWork.run(async ({ client }) => {
        const result = await work();
        await flushApplicantStore(client, applicantStore);
        return result;
      });
    } catch (error) {
      restoreApplicantStore(applicantStore, snapshot);
      throw error;
    }
  };

  assessorStore.withTransaction = async (work) =>
    unitOfWork.run(async ({ client }) => {
      const result = await work();
      await flushAssessorStore(client, assessorStore);
      return result;
    });

  allocationStore.withTransaction = async (work) =>
    unitOfWork.run(async ({ client }) => {
      const result = await work();
      await flushApplicantStore(client, applicantStore);
      await flushAllocationStore(client, allocationStore, applicantStore);
      return result;
    });

  assessmentStore.withTransaction = async (work) =>
    unitOfWork.run(async ({ client }) => {
      const result = await work();
      await flushAssessmentStore(client, assessmentStore);
      return result;
    });

  resultsStore.withTransaction = async (work) =>
    unitOfWork.run(async ({ client }) => {
      const result = await work();
      await flushApplicantStore(client, applicantStore);
      await flushResultsStore(client, resultsStore);
      return result;
    });

  communicationsStore.withTransaction = async (work) =>
    unitOfWork.run(async ({ client }) => {
      const result = await work();
      await flushCommunicationsStore(client, communicationsStore);
      return result;
    });
}
