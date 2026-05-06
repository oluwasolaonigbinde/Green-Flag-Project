import type { UnitOfWork, SqlClient } from "@green-flag/db";
import {
  lowerEnvironmentAwardCycle2026Fixture,
  lowerEnvironmentOrganisationFixture,
  lowerEnvironmentParkFixture
} from "@green-flag/contracts";
import { createApplicantStore, type ApplicantStore } from "./applicant.js";
import { createAssessorStore, type AssessorStore } from "./assessor.js";
import { createRegistrationStore, type RegistrationStore } from "./registration.js";

type JsonRow = {
  id: string;
  runtime_payload: unknown;
};

export interface DomainStoreBundle {
  registrationStore: RegistrationStore;
  applicantStore: ApplicantStore;
  assessorStore: AssessorStore;
}

function payload<T>(value: unknown): T | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as T;
}

async function loadRuntimePayloads(client: SqlClient, tableName: string, keyColumn = "id") {
  return client.query<JsonRow>(`SELECT ${keyColumn} AS id, runtime_payload FROM ${tableName} WHERE runtime_payload IS NOT NULL`);
}

async function hydrateRegistrationStore(client: SqlClient) {
  const store = createRegistrationStore();
  const rows = await loadRuntimePayloads(client, "registration_submissions");
  for (const row of rows.rows) {
    const record = payload<RegistrationStore["records"] extends Map<string, infer R> ? R : never>(row.runtime_payload);
    if (record) {
      store.records.set(row.id, record);
    }
  }
  return store;
}

async function hydrateApplicantStore(client: SqlClient) {
  const store = createApplicantStore();
  store.applications.clear();
  store.documents.clear();
  store.uploadSessions.clear();
  store.invoices.clear();
  store.payments.clear();
  store.episodeStatuses.clear();
  store.overrideEvents = [];

  for (const row of (await loadRuntimePayloads(client, "applications")).rows) {
    const record = payload<ApplicantStore["applications"] extends Map<string, infer R> ? R : never>(row.runtime_payload);
    if (record) {
      store.applications.set(row.id, record);
      store.episodeStatuses.set(record.episodeId, "APPLICATION_DRAFT");
    }
  }
  for (const row of (await loadRuntimePayloads(client, "document_assets")).rows) {
    const record = payload<ApplicantStore["documents"] extends Map<string, infer R> ? R : never>(row.runtime_payload);
    if (record) {
      store.documents.set(row.id, record);
    }
  }
  for (const row of (await loadRuntimePayloads(client, "document_upload_sessions")).rows) {
    const record = payload<ApplicantStore["uploadSessions"] extends Map<string, infer R> ? R : never>(row.runtime_payload);
    if (record) {
      store.uploadSessions.set(row.id, record);
    }
  }
  for (const row of (await loadRuntimePayloads(client, "invoices")).rows) {
    const record = payload<ApplicantStore["invoices"] extends Map<string, infer R> ? R : never>(row.runtime_payload);
    if (record) {
      store.invoices.set(row.id, record);
    }
  }
  for (const row of (await loadRuntimePayloads(client, "payment_states", "invoice_id")).rows) {
    const record = payload<ApplicantStore["payments"] extends Map<string, infer R> ? R : never>(row.runtime_payload);
    if (record) {
      store.payments.set(row.id, record);
      store.episodeStatuses.set(record.invoice.episodeId, record.blockedForAllocation ? "PAYMENT_OVERDUE_BLOCKED" : "READY_FOR_ALLOCATION");
    }
  }

  return store;
}

async function hydrateAssessorStore(client: SqlClient) {
  const store = createAssessorStore();
  store.profiles.clear();
  const rows = await loadRuntimePayloads(client, "assessor_profiles");
  for (const row of rows.rows) {
    const record = payload<AssessorStore["profiles"] extends Map<string, infer R> ? R : never>(row.runtime_payload);
    if (record) {
      store.profiles.set(row.id, record);
    }
  }
  return store;
}

function duplicateState(record: RegistrationStore["records"] extends Map<string, infer R> ? R : never) {
  if (!record.duplicateWarning.hasPotentialDuplicate) return "NONE";
  return record.duplicateWarning.acknowledged ? "ACKNOWLEDGED" : "WARNING_REQUIRES_ACK";
}

async function flushRegistrationStore(client: SqlClient, store: RegistrationStore) {
  for (const [id, record] of store.records) {
    await client.query(
      `
        INSERT INTO registration_submissions (
          id, status, park_name, organisation_name, contact_name, contact_email,
          address_line_1, town, postcode, country, publicly_accessible, free_to_enter,
          minimum_size_confirmed, duplicate_warning_state, duplicate_matched_fields,
          location_payload, submitted_payload, submitted_at_utc, runtime_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10, $11, $12, $13, $14, '{}'::jsonb, $15::jsonb, $16::timestamptz, $15::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          park_id = COALESCE(registration_submissions.park_id, EXCLUDED.park_id),
          duplicate_warning_state = EXCLUDED.duplicate_warning_state,
          duplicate_matched_fields = EXCLUDED.duplicate_matched_fields,
          submitted_payload = EXCLUDED.submitted_payload,
          runtime_payload = EXCLUDED.runtime_payload,
          updated_at_utc = now()
      `,
      [
        id,
        record.status,
        record.parkName,
        record.organisationName,
        "Captured in registration payload",
        record.contactEmail,
        "Captured in registration payload",
        "Captured in registration payload",
        "lower-env",
        record.eligibility.eligible,
        record.eligibility.eligible,
        record.eligibility.eligible,
        duplicateState(record),
        record.duplicateWarning.matchedFields,
        JSON.stringify(record),
        record.submittedAt
      ]
    );
  }
}

async function flushApplicantStore(client: SqlClient, store: ApplicantStore) {
  for (const [id, application] of store.applications) {
    await client.query(
      `
        INSERT INTO applications (id, assessment_episode_id, park_id, owner_internal_user_id, status, completion_percent, version, runtime_payload)
        VALUES ($1, $2, $3, NULL, $4, $5, $6, $7::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          completion_percent = EXCLUDED.completion_percent,
          version = EXCLUDED.version,
          runtime_payload = EXCLUDED.runtime_payload,
          updated_at_utc = now()
      `,
      [id, application.episodeId, application.parkId, application.status, application.completionPercent, application.version, JSON.stringify(application)]
    );
  }

  for (const [id, document] of store.documents) {
    await client.query(
      `
        INSERT INTO document_assets (
          id, application_id, assessment_episode_id, park_id, document_type, filename, content_type,
          byte_size, sha256, storage_provider, storage_key, status, visibility, version, is_current,
          replaces_document_id, replaced_by_document_id, uploaded_by_actor_id, scan_status, runtime_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          is_current = EXCLUDED.is_current,
          replaced_by_document_id = EXCLUDED.replaced_by_document_id,
          runtime_payload = EXCLUDED.runtime_payload,
          updated_at = now()
      `,
      [
        id,
        document.applicationId,
        document.episodeId,
        document.parkId,
        document.documentType,
        document.filename,
        document.contentType,
        document.byteSize,
        document.sha256,
        document.storageProvider,
        document.storageKey,
        document.status,
        document.visibility,
        document.version,
        document.isCurrent,
        document.replacesDocumentId && store.documents.has(document.replacesDocumentId) ? document.replacesDocumentId : null,
        document.replacedByDocumentId && store.documents.has(document.replacedByDocumentId) ? document.replacedByDocumentId : null,
        document.uploadedByActorId,
        document.scanStatus,
        JSON.stringify(document)
      ]
    );
  }

  for (const [id, session] of store.uploadSessions) {
    await client.query(
      `
        INSERT INTO document_upload_sessions (
          id, application_id, document_type, filename, content_type, byte_size, sha256,
          total_chunks, status, expires_at, version, runtime_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11, $12::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          version = EXCLUDED.version,
          runtime_payload = EXCLUDED.runtime_payload,
          updated_at = now()
      `,
      [id, session.applicationId, session.documentType, session.filename, session.contentType, session.byteSize, session.sha256, session.totalChunks, session.status, session.expiresAt, session.version, JSON.stringify(session)]
    );
  }

  for (const [id, invoice] of store.invoices) {
    await client.query(
      `
        INSERT INTO invoices (id, application_id, assessment_episode_id, status, amount_marker, due_at, available_in_portal, runtime_payload)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          runtime_payload = EXCLUDED.runtime_payload,
          updated_at = now()
      `,
      [id, invoice.applicationId, invoice.episodeId, invoice.status, invoice.amount, invoice.dueAt, invoice.availableInPortal, JSON.stringify(invoice)]
    );
  }

  for (const [id, payment] of store.payments) {
    await client.query(
      `
        INSERT INTO payment_states (
          invoice_id, purchase_order_number, no_purchase_order_declared,
          manually_marked_paid, override_applied, blocked_for_allocation, runtime_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (invoice_id) DO UPDATE SET
          purchase_order_number = EXCLUDED.purchase_order_number,
          no_purchase_order_declared = EXCLUDED.no_purchase_order_declared,
          manually_marked_paid = EXCLUDED.manually_marked_paid,
          override_applied = EXCLUDED.override_applied,
          blocked_for_allocation = EXCLUDED.blocked_for_allocation,
          runtime_payload = EXCLUDED.runtime_payload,
          updated_at = now()
      `,
      [
        id,
        payment.purchaseOrder?.purchaseOrderNumber ?? null,
        payment.purchaseOrder?.noPurchaseOrderDeclared ?? false,
        payment.manuallyMarkedPaid,
        payment.overrideApplied,
        payment.blockedForAllocation,
        JSON.stringify(payment)
      ]
    );
  }
}

async function flushAssessorStore(client: SqlClient, store: AssessorStore) {
  for (const [id, profile] of store.profiles) {
    await client.query(
      `
        INSERT INTO assessor_profiles (
          id, internal_user_id, display_name, email, profile_status, accreditation_status,
          accreditation_provider, primary_region, version, runtime_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          email = EXCLUDED.email,
          profile_status = EXCLUDED.profile_status,
          accreditation_status = EXCLUDED.accreditation_status,
          primary_region = EXCLUDED.primary_region,
          version = EXCLUDED.version,
          runtime_payload = EXCLUDED.runtime_payload,
          updated_at = now()
      `,
      [
        id,
        profile.internalUserId,
        profile.displayName,
        profile.email,
        profile.profileStatus,
        profile.accreditationStatus,
        profile.accreditationProvider,
        profile.primaryRegion,
        profile.version,
        JSON.stringify(profile)
      ]
    );
  }
}

function installTransactionalFlushes({
  unitOfWork,
  registrationStore,
  applicantStore,
  assessorStore
}: DomainStoreBundle & { unitOfWork: UnitOfWork }) {
  registrationStore.withTransaction = async (work) =>
    unitOfWork.run(async ({ client }) => {
      const result = await work();
      await flushRegistrationStore(client, registrationStore);
      return result;
    });

  applicantStore.withTransaction = async (work) =>
    unitOfWork.run(async ({ client }) => {
      const result = await work();
      await flushApplicantStore(client, applicantStore);
      return result;
    });

  assessorStore.withTransaction = async (work) =>
    unitOfWork.run(async ({ client }) => {
      const result = await work();
      await flushAssessorStore(client, assessorStore);
      return result;
    });
}

export async function createPostgresDomainStores({
  client,
  unitOfWork
}: {
  client: SqlClient;
  unitOfWork: UnitOfWork;
}): Promise<DomainStoreBundle> {
  const registrationStore = await hydrateRegistrationStore(client);
  const applicantStore = await hydrateApplicantStore(client);
  const assessorStore = await hydrateAssessorStore(client);

  applicantStore.parkOwnerships.set(lowerEnvironmentParkFixture.id, {
    parkId: lowerEnvironmentParkFixture.id,
    organisationId: lowerEnvironmentOrganisationFixture.id,
    countryCode: lowerEnvironmentAwardCycle2026Fixture.countryCode
  });

  installTransactionalFlushes({ unitOfWork, registrationStore, applicantStore, assessorStore });
  return { registrationStore, applicantStore, assessorStore };
}
