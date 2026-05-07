import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPostgresPool,
  createUnitOfWork,
  runMigrations,
  type SqlPool
} from "@green-flag/db";
import {
  applicationDraftFixture,
  assessmentSubmittedFixture,
  assessorSelfProfileFixture,
  currentManagementPlanDocumentFixture,
  documentUploadSessionFixture,
  registrationSubmissionRequestFixture,
  globalAdminRoleAssignmentFixture,
  globalAdminSessionFixture,
  internalUserSummaryFixture,
  judgeRoleAssignmentFixture,
  judgeSessionFixture,
  heldAllocationFixture,
  lowerEnvironmentAwardCycle2026Fixture,
  messageThreadsFixture,
  notificationQueueFixture,
  resultPublishedFixture,
  renewalReminderRunFixture,
  exportCommandFixture,
  lowerEnvironmentParkCycleSnapshotFixture,
  parkManagerRoleAssignmentFixture,
  paymentSummaryFixture,
  pendingInvoiceFixture,
  parkManagerSessionFixture,
  scopedAdminRoleAssignmentFixture,
  scopedAdminSessionFixture
} from "@green-flag/contracts";
import { PostgresAuditLedger } from "./postgres-runtime.js";
import { createPostgresDomainStores } from "./postgres-domain-stores.js";
import { PostgresRegistrationRepository } from "./postgres-domain-stores/registration-repository.js";
import { PostgresApplicantRepository } from "./postgres-domain-stores/applicant-repository.js";
import { PostgresAssessorRepository } from "./postgres-domain-stores/assessor-repository.js";
import { PostgresAllocationRepository } from "./postgres-domain-stores/allocation-repository.js";
import { PostgresAssessmentRepository } from "./postgres-domain-stores/assessment-repository.js";
import { buildApp } from "./app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

async function seedIdentity(pool: SqlPool) {
  const users = [
    internalUserSummaryFixture,
    scopedAdminSessionFixture.internalUser,
    judgeSessionFixture.internalUser,
    globalAdminSessionFixture.internalUser,
    {
      id: parkManagerRoleAssignmentFixture.internalUserId,
      email: "park.manager@example.invalid",
      displayName: "Park Manager",
      status: "ACTIVE",
      cognitoSubject: "cognito-subject-park-manager"
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      email: "public.registration@example.invalid",
      displayName: "Public Registration System",
      status: "ACTIVE",
      cognitoSubject: "public-registration"
    }
  ];

  for (const user of users) {
    await pool.query(
      `
        INSERT INTO internal_users (id, email, display_name, status, redaction_profile)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `,
      [user.id, user.email, user.displayName, user.status, "super_admin_full_access"]
    );
  }

  for (const assignment of [
    globalAdminRoleAssignmentFixture,
    scopedAdminRoleAssignmentFixture,
    judgeRoleAssignmentFixture,
    parkManagerRoleAssignmentFixture
  ]) {
    await pool.query(
      `
        INSERT INTO role_assignments (id, internal_user_id, role_type, scope_type, scope_id, status, redaction_profile)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        assignment.id,
        assignment.internalUserId,
        assignment.role,
        assignment.scope.type,
        assignment.scope.id ?? null,
        assignment.status,
        assignment.redactionProfile
      ]
    );
  }
}

async function seedDomain(pool: SqlPool) {
  const snapshot = lowerEnvironmentParkCycleSnapshotFixture;
  await pool.query("INSERT INTO organisations (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [
    snapshot.organisation.id,
    snapshot.organisation.name
  ]);
  await pool.query(
    "INSERT INTO award_tracks (code, label, operational_status) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING",
    [snapshot.awardTrack.code, snapshot.awardTrack.label, snapshot.awardTrack.operationalStatus]
  );
  await pool.query(
    "INSERT INTO parks (id, organisation_id, award_track_code, name, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
    [snapshot.park.id, snapshot.organisation.id, snapshot.awardTrack.code, snapshot.park.name, snapshot.park.status]
  );
  await pool.query(
    "INSERT INTO parks (id, organisation_id, award_track_code, name, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
    [
      applicationDraftFixture.parkId,
      snapshot.organisation.id,
      snapshot.awardTrack.code,
      "Lower Environment Application Park",
      "ACTIVE"
    ]
  );
  const fullAssessmentWindowId =
    snapshot.cycleWindows.find((window) => window.episodeType === "FULL_ASSESSMENT")?.id ?? snapshot.cycleWindows[0]?.id;
  if (!fullAssessmentWindowId) {
    throw new Error("Expected a full assessment cycle window fixture for PostgreSQL domain store integration tests.");
  }
  await pool.query(
    `
      INSERT INTO award_cycles (id, country_code, cycle_year, application_window_opens_at_utc, application_window_closes_at_utc, result_announced_at_utc)
      VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::timestamptz)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      snapshot.awardCycle.id,
      snapshot.awardCycle.countryCode,
      snapshot.awardCycle.cycleYear,
      snapshot.awardCycle.applicationWindowOpensAt,
      snapshot.awardCycle.applicationWindowClosesAt,
      snapshot.awardCycle.resultAnnouncementAt ?? null
    ]
  );
  for (const window of snapshot.cycleWindows) {
    await pool.query(
      `
        INSERT INTO cycle_windows (id, award_cycle_id, episode_type, opens_at_utc, closes_at_utc)
        VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)
        ON CONFLICT (id) DO NOTHING
      `,
      [window.id, snapshot.awardCycle.id, window.episodeType, window.opensAt, window.closesAt]
    );
  }
  for (const episode of snapshot.assessmentEpisodes) {
    await pool.query(
      `
        INSERT INTO assessment_episodes (id, park_id, award_cycle_id, cycle_window_id, award_track_code, episode_type, status, mystery_suppressed)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        episode.id,
        snapshot.park.id,
        snapshot.awardCycle.id,
        episode.cycleWindowId,
        snapshot.awardTrack.code,
        episode.episodeType,
        episode.status,
        episode.mysterySuppressed
      ]
    );
  }
  await pool.query(
    `
      INSERT INTO assessment_episodes (id, park_id, award_cycle_id, cycle_window_id, award_track_code, episode_type, status, mystery_suppressed)
      VALUES ($1, $2, $3, $4, $5, 'FULL_ASSESSMENT', 'APPLICATION_DRAFT', false)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      applicationDraftFixture.episodeId,
      applicationDraftFixture.parkId,
      snapshot.awardCycle.id,
      fullAssessmentWindowId,
      snapshot.awardTrack.code
    ]
  );
}

async function seedApplicantEpisode(pool: SqlPool) {
  const snapshot = lowerEnvironmentParkCycleSnapshotFixture;
  const parkId = randomUUID();
  const episodeId = randomUUID();
  const fullAssessmentWindowId =
    snapshot.cycleWindows.find((window) => window.episodeType === "FULL_ASSESSMENT")?.id ?? snapshot.cycleWindows[0]?.id;
  if (!fullAssessmentWindowId) {
    throw new Error("Expected a full assessment cycle window fixture for applicant persistence tests.");
  }
  await pool.query(
    "INSERT INTO parks (id, organisation_id, award_track_code, name, status) VALUES ($1, $2, $3, $4, 'ACTIVE')",
    [parkId, snapshot.organisation.id, snapshot.awardTrack.code, `Durable Applicant Park ${parkId}`]
  );
  await pool.query(
    `
      INSERT INTO assessment_episodes (id, park_id, award_cycle_id, cycle_window_id, award_track_code, episode_type, status, mystery_suppressed)
      VALUES ($1, $2, $3, $4, $5, 'FULL_ASSESSMENT', 'APPLICATION_DRAFT', false)
    `,
    [episodeId, parkId, snapshot.awardCycle.id, fullAssessmentWindowId, snapshot.awardTrack.code]
  );
  return { parkId, episodeId };
}

async function seedAllocationEpisode(pool: SqlPool, episodeType: "FULL_ASSESSMENT" | "MYSTERY_SHOP" = "FULL_ASSESSMENT") {
  const snapshot = lowerEnvironmentParkCycleSnapshotFixture;
  const parkId = randomUUID();
  const episodeId = randomUUID();
  const applicationId = randomUUID();
  const windowId =
    snapshot.cycleWindows.find((window) => window.episodeType === episodeType)?.id ?? snapshot.cycleWindows[0]?.id;
  if (!windowId) throw new Error("Expected a cycle window fixture for allocation persistence tests.");
  await pool.query(
    "INSERT INTO parks (id, organisation_id, award_track_code, name, status) VALUES ($1, $2, $3, $4, 'ACTIVE')",
    [parkId, snapshot.organisation.id, snapshot.awardTrack.code, `Durable Allocation Park ${parkId}`]
  );
  await pool.query(
    `
      INSERT INTO assessment_episodes (id, park_id, award_cycle_id, cycle_window_id, award_track_code, episode_type, status, mystery_suppressed)
      VALUES ($1, $2, $3, $4, $5, $6, 'READY_FOR_ALLOCATION', $7)
    `,
    [episodeId, parkId, snapshot.awardCycle.id, windowId, snapshot.awardTrack.code, episodeType, episodeType === "MYSTERY_SHOP"]
  );
  await pool.query(
    `
      INSERT INTO applications (id, assessment_episode_id, park_id, owner_internal_user_id, status, completion_percent, version, updated_at_utc)
      VALUES ($1, $2, $3, $4, 'SUBMITTED', 100, 0, now())
    `,
    [applicationId, episodeId, parkId, parkManagerRoleAssignmentFixture.internalUserId]
  );
  return { parkId, episodeId, applicationId };
}

async function seedAssessorProfile(pool: SqlPool, label: string) {
  const userId = randomUUID();
  const profileId = randomUUID();
  await pool.query(
    `
      INSERT INTO internal_users (id, email, display_name, status, redaction_profile)
      VALUES ($1, $2, $3, 'ACTIVE', 'assessor_mystery_safe')
    `,
    [userId, `${label}.${userId}@example.invalid`, `Judge ${label}`]
  );
  await pool.query(
    `
      INSERT INTO assessor_profiles (
        id, internal_user_id, display_name, email, profile_status, accreditation_status,
        accreditation_provider, primary_region, version
      )
      VALUES ($1, $2, $3, $4, 'ACTIVE', 'CURRENT_LOWER_ENV', 'external_value_unavailable', 'North West', 0)
    `,
    [profileId, userId, `Judge ${label}`, `${label}.${userId}@example.invalid`]
  );
  await pool.query(
    `
      INSERT INTO assessor_preferences (
        assessor_profile_id, preferred_regions, preferred_award_track_codes, accepts_mystery_shop
      )
      VALUES ($1, ARRAY['North West']::text[], ARRAY['STANDARD_GREEN_FLAG']::text[], true)
    `,
    [profileId]
  );
  await pool.query(
    `
      INSERT INTO assessor_capacity_declarations (
        id, assessor_profile_id, cycle_year, max_assignments, current_assigned_count, capacity_status
      )
      VALUES ($1, $2, $3, 4, 0, 'available')
    `,
    [randomUUID(), profileId, lowerEnvironmentAwardCycle2026Fixture.cycleYear]
  );
  return { userId, profileId };
}

async function seedAssessmentAssignment(
  pool: SqlPool,
  label: string,
  status: "RELEASED" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" = "ACCEPTED",
  episodeType: "FULL_ASSESSMENT" | "MYSTERY_SHOP" = "FULL_ASSESSMENT"
) {
  const assessor = await seedAssessorProfile(pool, label);
  const episode = await seedAllocationEpisode(pool, episodeType);
  const allocationId = randomUUID();
  const assignmentId = randomUUID();
  await pool.query(
    `
      INSERT INTO allocations (
        id, assessment_episode_id, status, final_judge_count, suggested_judge_count, contact_reveal_available, notification_intents
      )
      VALUES ($1, $2, 'RELEASED', 1, 1, $3, ARRAY['assignment_release_email_batch']::text[])
    `,
    [allocationId, episode.episodeId, status === "ACCEPTED" && episodeType === "FULL_ASSESSMENT"]
  );
  await pool.query(
    `
      INSERT INTO judge_assignments (
        id, allocation_id, assessment_episode_id, assessor_profile_id, status, contact_reveal_available, version, updated_at_utc
      )
      VALUES ($1, $2, $3, $4, $5, $6, 1, now())
    `,
    [assignmentId, allocationId, episode.episodeId, assessor.profileId, status, status === "ACCEPTED" && episodeType === "FULL_ASSESSMENT"]
  );
  return { ...episode, ...assessor, allocationId, assignmentId };
}

run("Postgres domain store adapters", () => {
  let pool: SqlPool;

  beforeAll(async () => {
    pool = createPostgresPool({ databaseUrl: databaseUrl! });
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/db/migrations");
    await runMigrations({ pool, migrationsDir });
    await seedIdentity(pool);
    await seedDomain(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("round-trips Slices 3-8 domain stores through relational PostgreSQL tables", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(stores.registrationStore).toBeDefined();
    expect(stores.applicantStore).toBeDefined();
    expect(stores.assessorStore).toBeDefined();
    expect(stores.allocationStore).toBeDefined();
    expect(stores.assessmentStore).toBeDefined();
    expect(stores.resultsStore).toBeDefined();
    expect(stores.communicationsStore).toBeDefined();

    const registration = {
      registrationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      parkName: "Lower Environment Integration Park",
      organisationName: "Lower Environment Organisation",
      contactEmail: "integration@example.invalid",
      submittedAt: "2026-05-06T00:00:00.000Z",
      status: "VERIFIED_PENDING_REVIEW" as const,
      eligibility: { eligible: true, failedCriteria: [] },
      duplicateWarning: { hasPotentialDuplicate: false, matchedFields: [], acknowledged: false },
      token: "integration-token"
    };

    stores.registrationStore.records.set(registration.registrationId, registration);
    await stores.registrationStore.withTransaction(async () => undefined);

    stores.applicantStore.applications.set(applicationDraftFixture.applicationId, structuredClone(applicationDraftFixture));
    stores.applicantStore.documents.set(currentManagementPlanDocumentFixture.documentId, structuredClone(currentManagementPlanDocumentFixture));
    stores.applicantStore.invoices.set(pendingInvoiceFixture.invoiceId, structuredClone(pendingInvoiceFixture));
    stores.applicantStore.payments.set(pendingInvoiceFixture.invoiceId, structuredClone(paymentSummaryFixture));
    await stores.applicantStore.withTransaction(async () => undefined);

    stores.assessorStore.profiles.set(
      "20202020-2020-4202-8202-202020202020",
      structuredClone(assessorSelfProfileFixture.profile)
    );
    await stores.assessorStore.withTransaction(async () => undefined);

    const rehydrated = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(rehydrated.registrationStore.records.get(registration.registrationId)?.status).toBe("VERIFIED_PENDING_REVIEW");
    expect(rehydrated.registrationStore.records.get(registration.registrationId)?.token).toBe("integration-token");
    expect(rehydrated.applicantStore.applications.get(applicationDraftFixture.applicationId)?.version).toBe(applicationDraftFixture.version);
    expect(rehydrated.applicantStore.documents.get(currentManagementPlanDocumentFixture.documentId)?.visibility).toBe("APPLICANT_AND_ADMIN");
    expect(rehydrated.applicantStore.payments.get(pendingInvoiceFixture.invoiceId)?.invoice.status).toBe("PENDING");
    expect(rehydrated.applicantStore.invoices.get(pendingInvoiceFixture.invoiceId)?.notificationIntents).toContain("invoice_available_email");
    expect(rehydrated.assessorStore.profiles.get("20202020-2020-4202-8202-202020202020")?.profileStatus).toBe("ACTIVE");
  });

  it("writes and cold-start rehydrates normalized relational runtime rows", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const stores = await createPostgresDomainStores({ client: pool, unitOfWork });

    const uploadSession = structuredClone(documentUploadSessionFixture);
    uploadSession.acceptedChunks = [0, 1];
    uploadSession.status = "IN_PROGRESS";
    uploadSession.progressPercent = 67;

    stores.applicantStore.applications.set(applicationDraftFixture.applicationId, structuredClone(applicationDraftFixture));
    stores.applicantStore.uploadSessions.set(uploadSession.sessionId, uploadSession);
    await stores.applicantStore.withTransaction(async () => undefined);

    stores.assessorStore.profiles.set(assessorSelfProfileFixture.profile.assessorId, structuredClone(assessorSelfProfileFixture.profile));
    await stores.assessorStore.withTransaction(async () => undefined);

    stores.allocationStore.allocations.set(heldAllocationFixture.allocationId, structuredClone(heldAllocationFixture));
    stores.applicantStore.episodeStatuses.set(heldAllocationFixture.episodeId, "ALLOCATED_HELD");
    await stores.allocationStore.withTransaction(async () => undefined);
    const allocationEpisodeStatus = await pool.query<{ status: string }>(
      "SELECT status FROM assessment_episodes WHERE id = $1",
      [heldAllocationFixture.episodeId]
    );
    expect(allocationEpisodeStatus.rows[0]?.status).toBe("ALLOCATED_HELD");

    stores.assessmentStore.assessments.set(assessmentSubmittedFixture.assessment.assessmentId, structuredClone(assessmentSubmittedFixture.assessment));
    await stores.assessmentStore.withTransaction(async () => undefined);

    stores.resultsStore.decisions.set(resultPublishedFixture.decision.decisionId, structuredClone(resultPublishedFixture.decision));
    for (const artifact of resultPublishedFixture.artifacts) {
      stores.resultsStore.artifacts.set(artifact.artifactId, structuredClone(artifact));
    }
    if (resultPublishedFixture.awardCache) {
      stores.resultsStore.awardCache.set(resultPublishedFixture.awardCache.parkId, structuredClone(resultPublishedFixture.awardCache));
    }
    if (resultPublishedFixture.publicMapEvent) {
      stores.resultsStore.publicMapEvents.set(resultPublishedFixture.publicMapEvent.eventId, structuredClone(resultPublishedFixture.publicMapEvent));
    }
    stores.applicantStore.episodeStatuses.set(resultPublishedFixture.decision.episodeId, "PUBLISHED");
    await stores.resultsStore.withTransaction(async () => undefined);
    const resultEpisodeStatus = await pool.query<{ status: string }>(
      "SELECT status FROM assessment_episodes WHERE id = $1",
      [resultPublishedFixture.decision.episodeId]
    );
    expect(resultEpisodeStatus.rows[0]?.status).toBe("PUBLISHED");

    stores.communicationsStore.notifications.set(notificationQueueFixture.items[0]!.notificationId, structuredClone(notificationQueueFixture.items[0]!));
    stores.communicationsStore.messageThreads.set(messageThreadsFixture.threads[0]!.threadId, structuredClone(messageThreadsFixture.threads[0]!));
    stores.communicationsStore.messages.set(messageThreadsFixture.messages[0]!.messageId, structuredClone(messageThreadsFixture.messages[0]!));
    stores.communicationsStore.jobRuns.set(renewalReminderRunFixture.jobRun.jobRunId, structuredClone(renewalReminderRunFixture.jobRun));
    stores.communicationsStore.exports.set(exportCommandFixture.exportJob.exportId, structuredClone(exportCommandFixture.exportJob));
    await stores.communicationsStore.withTransaction(async () => undefined);

    const [
      applicationSections,
      applicationFields,
      uploadChunks,
      assessorPreferences,
      assessorAvailability,
      assessorCapacity,
      assessmentTemplateCriteria,
      assessmentScores,
      resultArtifacts,
      publicMapEvents,
      notifications,
      messageThreads,
      exportJobs
    ] = await Promise.all([
      pool.query<{ count: string }>("SELECT count(*) FROM application_sections WHERE application_id = $1", [applicationDraftFixture.applicationId]),
      pool.query<{ count: string }>("SELECT count(*) FROM application_field_values WHERE application_id = $1", [applicationDraftFixture.applicationId]),
      pool.query<{ count: string }>("SELECT count(*) FROM document_upload_chunks WHERE upload_session_id = $1", [uploadSession.sessionId]),
      pool.query<{ count: string }>("SELECT count(*) FROM assessor_preferences WHERE assessor_profile_id = $1", [assessorSelfProfileFixture.profile.assessorId]),
      pool.query<{ count: string }>("SELECT count(*) FROM assessor_availability_windows WHERE assessor_profile_id = $1", [assessorSelfProfileFixture.profile.assessorId]),
      pool.query<{ count: string }>("SELECT count(*) FROM assessor_capacity_declarations WHERE assessor_profile_id = $1", [assessorSelfProfileFixture.profile.assessorId]),
      pool.query<{ count: string }>("SELECT count(*) FROM assessment_template_criteria WHERE template_config_id = $1", [assessmentSubmittedFixture.assessment.template.templateId]),
      pool.query<{ count: string }>("SELECT count(*) FROM assessment_score_entries WHERE assessment_id = $1", [assessmentSubmittedFixture.assessment.assessmentId]),
      pool.query<{ count: string }>("SELECT count(*) FROM result_artifacts WHERE decision_result_id = $1", [resultPublishedFixture.decision.decisionId]),
      pool.query<{ count: string }>("SELECT count(*) FROM public_map_update_events WHERE decision_result_id = $1", [resultPublishedFixture.decision.decisionId]),
      pool.query<{ count: string }>("SELECT count(*) FROM notification_queue WHERE id = $1", [notificationQueueFixture.items[0]!.notificationId]),
      pool.query<{ count: string }>("SELECT count(*) FROM message_threads WHERE id = $1", [messageThreadsFixture.threads[0]!.threadId]),
      pool.query<{ count: string }>("SELECT count(*) FROM export_jobs WHERE id = $1", [exportCommandFixture.exportJob.exportId])
    ]);

    expect(Number(applicationSections.rows[0]?.count)).toBe(applicationDraftFixture.sections.length);
    expect(Number(applicationFields.rows[0]?.count)).toBeGreaterThan(0);
    expect(uploadChunks.rows[0]?.count).toBe("2");
    expect(assessorPreferences.rows[0]?.count).toBe("1");
    expect(Number(assessorAvailability.rows[0]?.count)).toBeGreaterThan(0);
    expect(Number(assessorCapacity.rows[0]?.count)).toBeGreaterThan(0);
    expect(Number(assessmentTemplateCriteria.rows[0]?.count)).toBe(assessmentSubmittedFixture.assessment.template.criteria.length);
    expect(Number(assessmentScores.rows[0]?.count)).toBe(assessmentSubmittedFixture.assessment.scores.length);
    expect(Number(resultArtifacts.rows[0]?.count)).toBe(resultPublishedFixture.artifacts.length);
    expect(publicMapEvents.rows[0]?.count).toBe("1");
    expect(notifications.rows[0]?.count).toBe("1");
    expect(messageThreads.rows[0]?.count).toBe("1");
    expect(exportJobs.rows[0]?.count).toBe("1");

    const rehydrated = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(rehydrated.applicantStore.uploadSessions.get(uploadSession.sessionId)?.acceptedChunks).toEqual([0, 1]);
    expect(rehydrated.assessorStore.profiles.get(assessorSelfProfileFixture.profile.assessorId)?.capacity.length).toBeGreaterThan(0);
    expect(rehydrated.allocationStore.allocations.get(heldAllocationFixture.allocationId)?.assignments.length).toBe(heldAllocationFixture.assignments.length);
    expect(rehydrated.assessmentStore.template.criteria).toHaveLength(assessmentSubmittedFixture.assessment.template.criteria.length);
    expect(rehydrated.assessmentStore.assessments.get(assessmentSubmittedFixture.assessment.assessmentId)?.scores).toHaveLength(assessmentSubmittedFixture.assessment.scores.length);
    expect(rehydrated.resultsStore.decisions.get(resultPublishedFixture.decision.decisionId)?.internalNotes).toBe("Synthetic lower-env result note.");
    expect(rehydrated.resultsStore.artifacts.get(resultPublishedFixture.artifacts[0]!.artifactId)?.publicVisible).toBe(true);
    expect(rehydrated.resultsStore.awardCache.get(resultPublishedFixture.awardCache!.parkId)?.displayLabel).toBe("Award published");
    expect(rehydrated.resultsStore.publicMapEvents.get(resultPublishedFixture.publicMapEvent!.eventId)?.payload.published).toBe(true);
    expect(rehydrated.communicationsStore.notifications.get(notificationQueueFixture.items[0]!.notificationId)?.status).toBe("QUEUED");
    expect(rehydrated.communicationsStore.messageThreads.get(messageThreadsFixture.threads[0]!.threadId)?.visibleToApplicant).toBe(true);
    expect(rehydrated.communicationsStore.exports.get(exportCommandFixture.exportJob.exportId)?.status).toBe("COMPLETED");
  });

  it("rejects shared lower-env registration verification tokens unless explicitly enabled", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const registrationRepository = new PostgresRegistrationRepository(pool, unitOfWork, ledger);
    const stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    const app = buildApp({
      registrationStore: stores.registrationStore,
      registrationRepository,
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: ledger,
      productionLike: true
    });

    const submit = await app.inject({
      method: "POST",
      url: "/api/v1/registrations",
      payload: {
        ...registrationSubmissionRequestFixture,
        parkName: "Production Token Safety Park",
        organisationName: "Production Token Safety Organisation",
        contactEmail: "production-token-safety@example.invalid",
        postcode: "PT1 1AA",
        duplicateAcknowledged: false
      }
    });
    expect(submit.statusCode).toBe(201);
    const registrationId = submit.json().registrationId;

    const sharedTokenVerify = await app.inject({
      method: "POST",
      url: `/api/v1/registrations/${registrationId}/verify-email`,
      payload: { token: "lower-env-verification-token" }
    });
    expect(sharedTokenVerify.statusCode).toBe(200);
    expect(sharedTokenVerify.json()).toMatchObject({
      registrationId,
      status: "PENDING_VERIFICATION",
      emailVerified: false,
      nextStep: "cannot_verify"
    });

    const storedToken = await pool.query<{ token_hash: string }>(
      `
        SELECT token_hash
        FROM registration_verification_tokens
        WHERE registration_submission_id = $1
        ORDER BY created_at_utc DESC
        LIMIT 1
      `,
      [registrationId]
    );
    expect(storedToken.rows[0]?.token_hash).toBeDefined();
    expect(storedToken.rows[0]?.token_hash).not.toMatch(/^lower-env-verification-token:/);

    const exactTokenVerify = await app.inject({
      method: "POST",
      url: `/api/v1/registrations/${registrationId}/verify-email`,
      payload: { token: storedToken.rows[0]!.token_hash }
    });
    expect(exactTokenVerify.statusCode).toBe(200);
    expect(exactTokenVerify.json()).toMatchObject({
      registrationId,
      status: "VERIFIED_PENDING_REVIEW",
      emailVerified: true,
      nextStep: "admin_review"
    });
  });

  it("persists registration verify, approve, and reject route mutations across cold starts with explicit lower-env token compatibility", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const registrationRepository = new PostgresRegistrationRepository(pool, unitOfWork, ledger, {
      allowStaticLowerEnvVerificationToken: true
    });
    const stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    const app = buildApp({
      registrationStore: stores.registrationStore,
      registrationRepository,
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: ledger
    });

    const approvalSubmit = await app.inject({
      method: "POST",
      url: "/api/v1/registrations",
      payload: {
        ...registrationSubmissionRequestFixture,
        parkName: "Integration Approval Park",
        organisationName: "Integration Approval Organisation",
        contactEmail: "integration-approval@example.invalid",
        postcode: "IA1 1AA",
        duplicateAcknowledged: false
      }
    });
    expect(approvalSubmit.statusCode).toBe(201);
    const approvalRegistrationId = approvalSubmit.json().registrationId;

    const verify = await app.inject({
      method: "POST",
      url: `/api/v1/registrations/${approvalRegistrationId}/verify-email`,
      payload: { token: "lower-env-verification-token" }
    });
    expect(verify.statusCode).toBe(200);

    let rehydrated = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(rehydrated.registrationStore.records.get(approvalRegistrationId)?.status).toBe("VERIFIED_PENDING_REVIEW");

    const approveApp = buildApp({
      registrationStore: rehydrated.registrationStore,
      registrationRepository,
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: ledger
    });
    const approval = await approveApp.inject({
      method: "POST",
      url: `/api/v1/admin/registration-review-queue/${approvalRegistrationId}/approve`,
      headers: { "idempotency-key": "integration-approve-registration" }
    });
    expect(approval.statusCode).toBe(200);
    expect(approval.json()).toMatchObject({ registrationStatus: "APPROVED", parkStatus: "ACTIVE" });

    rehydrated = await createPostgresDomainStores({ client: pool, unitOfWork });
    const approvedRecord = rehydrated.registrationStore.records.get(approvalRegistrationId);
    expect(approvedRecord?.status).toBe("APPROVED");
    expect(approvedRecord?.parkId).toBe(approval.json().parkId);
    const approvedPark = await pool.query<{ status: string }>("SELECT status FROM parks WHERE id = $1", [
      approval.json().parkId
    ]);
    expect(approvedPark.rows[0]?.status).toBe("ACTIVE");

    const rejectionSubmit = await approveApp.inject({
      method: "POST",
      url: "/api/v1/registrations",
      payload: {
        ...registrationSubmissionRequestFixture,
        parkName: "Integration Rejection Park",
        organisationName: "Integration Rejection Organisation",
        contactEmail: "integration-rejection@example.invalid",
        postcode: "IR1 1AA",
        duplicateAcknowledged: false
      }
    });
    expect(rejectionSubmit.statusCode).toBe(201);
    const rejectionRegistrationId = rejectionSubmit.json().registrationId;
    await approveApp.inject({
      method: "POST",
      url: `/api/v1/registrations/${rejectionRegistrationId}/verify-email`,
      payload: { token: "lower-env-verification-token" }
    });
    const rejection = await approveApp.inject({
      method: "POST",
      url: `/api/v1/admin/registration-review-queue/${rejectionRegistrationId}/reject`,
      payload: { reason: "Synthetic integration rejection." }
    });
    expect(rejection.statusCode).toBe(200);

    rehydrated = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(rehydrated.registrationStore.records.get(rejectionRegistrationId)?.status).toBe("REJECTED");

    const auditActions = await pool.query<{ action: string; count: string }>(
      `
        SELECT action, count(*)::text AS count
        FROM audit_events
        WHERE entity_id IN ($1, $2)
        GROUP BY action
      `,
      [approvalRegistrationId, rejectionRegistrationId]
    );
    const counts = new Map(auditActions.rows.map((row) => [row.action, Number(row.count)]));
    expect(counts.get("VERIFY_REGISTRATION_EMAIL")).toBe(2);
    expect(counts.get("APPROVE_REGISTRATION")).toBe(1);
    expect(counts.get("REJECT_REGISTRATION")).toBe(1);
  });

  it("persists applicant upload, document completion, feedback, submission, and PO route mutations across cold starts", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const applicantRepository = new PostgresApplicantRepository(pool, unitOfWork, ledger);
    const applicantEpisode = await seedApplicantEpisode(pool);
    const applicantSession = structuredClone(parkManagerSessionFixture);
    applicantSession.actor.scopes = [{ type: "PARK", id: applicantEpisode.parkId }];
    applicantSession.roleAssignments = [
      {
        ...applicantSession.roleAssignments[0]!,
        scope: { type: "PARK", id: applicantEpisode.parkId }
      }
    ];
    let stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    let app = buildApp({
      applicantStore: stores.applicantStore,
      applicantRepository,
      resolveSession: async (request) =>
        request.url.includes("/api/v1/admin/") ? globalAdminSessionFixture : applicantSession,
      auditLedger: ledger
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/applications",
      payload: {
        parkId: applicantEpisode.parkId,
        episodeId: applicantEpisode.episodeId,
        idempotencyKey: "integration-create-application"
      }
    });
    expect(created.statusCode).toBe(201);
    const applicationId = created.json().applicationId;

    const autosaved = await app.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationId}/sections/site_information`,
      payload: {
        clientVersion: created.json().version,
        idempotencyKey: "integration-autosave-section",
        fields: {
          siteDescription: "Durable integration draft",
          hasAccessibleEntrances: true
        }
      }
    });
    expect(autosaved.statusCode).toBe(200);

    const feedback = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationId}/previous-feedback-response`,
      payload: {
        clientVersion: autosaved.json().version,
        responseText: "Durable previous feedback response."
      }
    });
    expect(feedback.statusCode).toBe(200);

    const upload = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationId}/documents/upload-sessions`,
      payload: {
        documentType: "management_plan",
        filename: "durable-management-plan.pdf",
        contentType: "application/pdf",
        byteSize: 2000000,
        sha256: "e".repeat(64),
        totalChunks: 2,
        idempotencyKey: "integration-upload-session"
      }
    });
    expect(upload.statusCode).toBe(201);
    const sessionId = upload.json().sessionId;

    const chunk0 = await app.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationId}/documents/upload-sessions/${sessionId}/chunks/0`,
      payload: {
        clientVersion: 0,
        chunkSize: 1000000,
        chunkChecksum: "chunk-0",
        idempotencyKey: "integration-upload-chunk-0"
      }
    });
    expect(chunk0.statusCode).toBe(200);
    const chunk1 = await app.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationId}/documents/upload-sessions/${sessionId}/chunks/1`,
      payload: {
        clientVersion: chunk0.json().version,
        chunkSize: 1000000,
        chunkChecksum: "chunk-1",
        idempotencyKey: "integration-upload-chunk-1"
      }
    });
    expect(chunk1.statusCode).toBe(200);

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationId}/documents/upload-sessions/${sessionId}/complete`,
      payload: {
        clientVersion: chunk1.json().version,
        sha256: "e".repeat(64),
        byteSize: 2000000,
        storageKey: "lower-env/applications/durable-management-plan.pdf"
      }
    });
    expect(completed.statusCode).toBe(200);

    const submitted = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${applicationId}/submit`,
      payload: {
        clientVersion: feedback.json().version,
        idempotencyKey: "integration-submit-application",
        purchaseOrder: { noPurchaseOrderDeclared: true }
      }
    });
    expect(submitted.statusCode).toBe(200);

    const po = await app.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationId}/purchase-order`,
      payload: {
        purchaseOrderNumber: "PO-DURABLE-001",
        noPurchaseOrderDeclared: false
      }
    });
    expect(po.statusCode).toBe(200);
    const deadline = await app.inject({
      method: "POST",
      url: "/api/v1/admin/payments/deadline-check",
      payload: {
        asOf: "2026-07-01T00:00:00Z",
        idempotencyKey: "integration-payment-deadline"
      }
    });
    expect(deadline.statusCode).toBe(200);
    expect(deadline.json().blockedInvoiceIds).toContain(submitted.json().invoice.invoiceId);

    const override = await app.inject({
      method: "POST",
      url: `/api/v1/admin/payments/${submitted.json().invoice.invoiceId}/override-block`,
      payload: {
        reason: "Durable integration payment override.",
        idempotencyKey: "integration-payment-override"
      }
    });
    expect(override.statusCode).toBe(200);

    const markPaid = await app.inject({
      method: "POST",
      url: `/api/v1/admin/payments/${submitted.json().invoice.invoiceId}/mark-paid`,
      payload: {
        reason: "Durable integration manual payment.",
        idempotencyKey: "integration-payment-paid"
      }
    });
    expect(markPaid.statusCode).toBe(200);

    stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(stores.applicantStore.applications.get(applicationId)?.status).toBe("SUBMITTED");
    expect(stores.applicantStore.previousFeedbackResponses.get(applicationId)?.responseText).toBe(
      "Durable previous feedback response."
    );
    expect(stores.applicantStore.uploadSessions.get(sessionId)?.acceptedChunks).toEqual([0, 1]);
    expect(stores.applicantStore.uploadSessions.get(sessionId)?.status).toBe("COMPLETED");
    expect(stores.applicantStore.documents.get(completed.json().document.documentId)?.isCurrent).toBe(true);
    expect(stores.applicantStore.payments.get(submitted.json().invoice.invoiceId)?.purchaseOrder).toMatchObject({
      purchaseOrderNumber: "PO-DURABLE-001",
      noPurchaseOrderDeclared: false
    });
    expect(stores.applicantStore.invoices.get(submitted.json().invoice.invoiceId)?.status).toBe("PAID");
    expect(stores.applicantStore.payments.get(submitted.json().invoice.invoiceId)).toMatchObject({
      manuallyMarkedPaid: true,
      overrideApplied: true,
      blockedForAllocation: false
    });
    const overrideEvents = await pool.query<{ count: string }>(
      "SELECT count(*) FROM admin_override_events WHERE target_id = $1 AND override_type = 'PAYMENT_BLOCK_OVERRIDE'",
      [submitted.json().invoice.invoiceId]
    );
    expect(overrideEvents.rows[0]?.count).toBe("1");

    app = buildApp({
      applicantStore: stores.applicantStore,
      applicantRepository,
      resolveSession: async () => applicantSession,
      auditLedger: ledger
    });
    const payment = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationId}/payment-summary`
    });
    expect(payment.statusCode).toBe(200);
    expect(payment.json().purchaseOrder.purchaseOrderNumber).toBe("PO-DURABLE-001");
  });

  it("prevents stale multi-instance applicant autosave overwrites with DB-enforced versions", async () => {
    const firstUnitOfWork = createUnitOfWork(pool);
    const secondUnitOfWork = createUnitOfWork(pool);
    const firstLedger = new PostgresAuditLedger(pool, firstUnitOfWork);
    const secondLedger = new PostgresAuditLedger(pool, secondUnitOfWork);
    const applicantEpisode = await seedApplicantEpisode(pool);
    const applicantSession = structuredClone(parkManagerSessionFixture);
    applicantSession.actor.scopes = [{ type: "PARK", id: applicantEpisode.parkId }];
    applicantSession.roleAssignments = [
      {
        ...applicantSession.roleAssignments[0]!,
        scope: { type: "PARK", id: applicantEpisode.parkId }
      }
    ];

    const firstStores = await createPostgresDomainStores({ client: pool, unitOfWork: firstUnitOfWork });
    const secondStores = await createPostgresDomainStores({ client: pool, unitOfWork: secondUnitOfWork });
    const firstApp = buildApp({
      applicantStore: firstStores.applicantStore,
      applicantRepository: new PostgresApplicantRepository(pool, firstUnitOfWork, firstLedger),
      resolveSession: async () => applicantSession,
      auditLedger: firstLedger
    });
    const secondApp = buildApp({
      applicantStore: secondStores.applicantStore,
      applicantRepository: new PostgresApplicantRepository(pool, secondUnitOfWork, secondLedger),
      resolveSession: async () => applicantSession,
      auditLedger: secondLedger
    });

    const created = await firstApp.inject({
      method: "POST",
      url: "/api/v1/applicant/applications",
      payload: {
        parkId: applicantEpisode.parkId,
        episodeId: applicantEpisode.episodeId,
        idempotencyKey: "multi-instance-create"
      }
    });
    expect(created.statusCode).toBe(201);
    const applicationId = created.json().applicationId;

    const firstAutosave = await firstApp.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationId}/sections/site_information`,
      payload: {
        clientVersion: 0,
        idempotencyKey: "multi-instance-autosave-1",
        fields: {
          siteDescription: "First writer wins through DB version.",
          hasAccessibleEntrances: true
        }
      }
    });
    expect(firstAutosave.statusCode).toBe(200);
    expect(firstAutosave.json().version).toBe(1);

    const staleAutosave = await secondApp.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationId}/sections/site_information`,
      payload: {
        clientVersion: 0,
        idempotencyKey: "multi-instance-autosave-2",
        fields: {
          siteDescription: "Stale writer must not overwrite.",
          staleOnlyField: true
        }
      }
    });
    expect(staleAutosave.statusCode).toBe(409);

    const [applicationVersion, fields, auditCount] = await Promise.all([
      pool.query<{ version: number }>("SELECT version FROM applications WHERE id = $1", [applicationId]),
      pool.query<{ field_key: string; field_value: unknown }>(
        "SELECT field_key, field_value FROM application_field_values WHERE application_id = $1 AND section_key = 'site_information'",
        [applicationId]
      ),
      pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM audit_events WHERE entity_id = $1 AND action = 'AUTOSAVE_APPLICATION_SECTION'",
        [applicationId]
      )
    ]);
    expect(applicationVersion.rows[0]?.version).toBe(1);
    const fieldKeys = fields.rows.map((row) => row.field_key);
    expect(fieldKeys).toContain("siteDescription");
    expect(fieldKeys).not.toContain("staleOnlyField");
    expect(auditCount.rows[0]?.count).toBe("1");
  });

  it("persists assessment visit, score, evidence, and submit commands across cold starts without GET row creation", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const assignment = await seedAssessmentAssignment(pool, "assessment-db-first");
    let stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    const judgeSession = {
      ...judgeSessionFixture,
      actor: { ...judgeSessionFixture.actor, actorId: assignment.userId },
      internalUser: { ...judgeSessionFixture.internalUser, id: assignment.userId }
    };
    let app = buildApp({
      applicantStore: stores.applicantStore,
      assessorStore: stores.assessorStore,
      allocationStore: stores.allocationStore,
      assessmentStore: stores.assessmentStore,
      assessmentRepository: new PostgresAssessmentRepository(pool, unitOfWork, ledger),
      resolveSession: async (request) => request.url.includes("/api/v1/admin/") ? globalAdminSessionFixture : judgeSession,
      auditLedger: ledger
    });

    const opened = await app.inject({ method: "GET", url: `/api/v1/assessor/assessments/${assignment.assignmentId}` });
    expect(opened.statusCode).toBe(200);
    expect(opened.json().assessment.status).toBe("NOT_STARTED");
    expect(opened.json().assessment.assessmentId).toMatch(/[0-9a-f-]{36}/);
    const rowsAfterGet = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM judge_assessments WHERE judge_assignment_id = $1", [assignment.assignmentId]);
    expect(rowsAfterGet.rows[0]?.count).toBe("0");

    const scheduled = await app.inject({
      method: "POST",
      url: `/api/v1/assessor/visits/${assignment.assignmentId}/schedule`,
      payload: {
        scheduledStartAt: "2026-05-20T09:00:00Z",
        scheduledEndAt: "2026-05-20T11:00:00Z",
        clientVersion: 0,
        idempotencyKey: "assessment-visit-db-first"
      }
    });
    expect(scheduled.statusCode).toBe(200);
    expect(scheduled.json().version).toBe(1);

    const criteria = opened.json().assessment.template.criteria;
    const scored = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessor/assessments/${opened.json().assessment.assessmentId}/scores`,
      payload: {
        clientVersion: 0,
        offlineSyncVersion: 1,
        idempotencyKey: "assessment-score-db-first",
        scores: criteria.map((criterion: { criterionId: string }) => ({
          criterionId: criterion.criterionId,
          score: 8
        }))
      }
    });
    expect(scored.statusCode).toBe(200);
    expect(scored.json().assessment.status).toBe("IN_PROGRESS");
    expect(scored.json().assessment.version).toBe(1);

    const evidence = await app.inject({
      method: "POST",
      url: `/api/v1/assessor/assessments/${scored.json().assessment.assessmentId}/evidence`,
      payload: {
        evidenceType: "photo",
        filename: "db-first-evidence.jpg",
        idempotencyKey: "assessment-evidence-db-first"
      }
    });
    expect(evidence.statusCode).toBe(200);
    expect(evidence.json().assessment.evidence[0].storageKey).toContain("metadata-only/assessments/");

    const submitted = await app.inject({
      method: "POST",
      url: `/api/v1/assessor/assessments/${scored.json().assessment.assessmentId}/submit`,
      payload: {
        clientVersion: evidence.json().assessment.version,
        idempotencyKey: "assessment-submit-db-first"
      }
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().assessment.status).toBe("SUBMITTED");

    stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(stores.assessmentStore.visits.get(scheduled.json().visitId)?.status).toBe("SCHEDULED");
    expect(stores.assessmentStore.assessments.get(scored.json().assessment.assessmentId)?.status).toBe("SUBMITTED");
    expect(stores.assessmentStore.assessments.get(scored.json().assessment.assessmentId)?.scores).toHaveLength(criteria.length);
    expect(stores.assessmentStore.assessments.get(scored.json().assessment.assessmentId)?.evidence).toHaveLength(1);

    app = buildApp({
      applicantStore: stores.applicantStore,
      assessorStore: stores.assessorStore,
      allocationStore: stores.allocationStore,
      assessmentStore: stores.assessmentStore,
      assessmentRepository: new PostgresAssessmentRepository(pool, unitOfWork, ledger),
      resolveSession: async (request) => request.url.includes("/api/v1/admin/") ? globalAdminSessionFixture : judgeSession,
      auditLedger: ledger
    });
    const admin = await app.inject({ method: "GET", url: `/api/v1/admin/assessments/${assignment.episodeId}` });
    expect(admin.statusCode).toBe(200);
    expect(admin.json().assessments[0].status).toBe("SUBMITTED");

    const applicantApp = buildApp({
      applicantStore: stores.applicantStore,
      applicantRepository: new PostgresApplicantRepository(pool, unitOfWork, ledger),
      resolveSession: async () => ({
        ...parkManagerSessionFixture,
        actor: { ...parkManagerSessionFixture.actor, scopes: [{ type: "PARK", id: assignment.parkId }] },
        roleAssignments: [{
          ...parkManagerSessionFixture.roleAssignments[0]!,
          scope: { type: "PARK", id: assignment.parkId }
        }]
      }),
      auditLedger: ledger
    });
    const dashboard = await applicantApp.inject({ method: "GET", url: "/api/v1/applicant/dashboard" });
    expect(dashboard.statusCode).toBe(200);
    expect(JSON.stringify(dashboard.json())).not.toContain(scored.json().assessment.assessmentId);
    expect(JSON.stringify(dashboard.json())).not.toContain("rawScoreTotal");
    expect(JSON.stringify(dashboard.json())).not.toContain("db-first-evidence.jpg");
  });

  it("enforces accepted-assignment access, stale assessment versions, and audit rollback for DB-first assessment commands", async () => {
    const firstUnitOfWork = createUnitOfWork(pool);
    const secondUnitOfWork = createUnitOfWork(pool);
    const firstLedger = new PostgresAuditLedger(pool, firstUnitOfWork);
    const secondLedger = new PostgresAuditLedger(pool, secondUnitOfWork);
    const accepted = await seedAssessmentAssignment(pool, "assessment-accepted");
    const released = await seedAssessmentAssignment(pool, "assessment-released", "RELEASED");
    const declined = await seedAssessmentAssignment(pool, "assessment-declined", "DECLINED");
    const withdrawn = await seedAssessmentAssignment(pool, "assessment-withdrawn", "WITHDRAWN");
    const firstStores = await createPostgresDomainStores({ client: pool, unitOfWork: firstUnitOfWork });
    const secondStores = await createPostgresDomainStores({ client: pool, unitOfWork: secondUnitOfWork });
    const sessionFor = (assignment: { userId: string }) => ({
      ...judgeSessionFixture,
      actor: { ...judgeSessionFixture.actor, actorId: assignment.userId },
      internalUser: { ...judgeSessionFixture.internalUser, id: assignment.userId }
    });
    const appFor = (assignment: { userId: string }, stores: typeof firstStores, unitOfWork: typeof firstUnitOfWork, ledger: PostgresAuditLedger) => buildApp({
      applicantStore: stores.applicantStore,
      assessorStore: stores.assessorStore,
      allocationStore: stores.allocationStore,
      assessmentStore: stores.assessmentStore,
      assessmentRepository: new PostgresAssessmentRepository(pool, unitOfWork, ledger),
      resolveSession: async () => sessionFor(assignment),
      auditLedger: ledger
    });

    for (const blocked of [released, declined, withdrawn]) {
      const blockedApp = appFor(blocked, firstStores, firstUnitOfWork, firstLedger);
      const schedule = await blockedApp.inject({
        method: "POST",
        url: `/api/v1/assessor/visits/${blocked.assignmentId}/schedule`,
        payload: {
          scheduledStartAt: "2026-05-20T09:00:00Z",
          scheduledEndAt: "2026-05-20T11:00:00Z",
          clientVersion: 0,
          idempotencyKey: `assessment-denied-${blocked.assignmentId}`
        }
      });
      expect([403, 404]).toContain(schedule.statusCode);
    }

    const firstApp = appFor(accepted, firstStores, firstUnitOfWork, firstLedger);
    const secondApp = appFor(accepted, secondStores, secondUnitOfWork, secondLedger);
    const opened = await firstApp.inject({ method: "GET", url: `/api/v1/assessor/assessments/${accepted.assignmentId}` });
    const criteria = opened.json().assessment.template.criteria;
    const scored = await firstApp.inject({
      method: "PATCH",
      url: `/api/v1/assessor/assessments/${opened.json().assessment.assessmentId}/scores`,
      payload: {
        clientVersion: 0,
        offlineSyncVersion: 1,
        idempotencyKey: "assessment-first-score",
        scores: criteria.map((criterion: { criterionId: string }) => ({
          criterionId: criterion.criterionId,
          score: 8
        }))
      }
    });
    expect(scored.statusCode).toBe(200);

    const staleScore = await secondApp.inject({
      method: "PATCH",
      url: `/api/v1/assessor/assessments/${opened.json().assessment.assessmentId}/scores`,
      payload: {
        clientVersion: 0,
        offlineSyncVersion: 2,
        idempotencyKey: "assessment-stale-score",
        scores: criteria.map((criterion: { criterionId: string }) => ({
          criterionId: criterion.criterionId,
          score: 1
        }))
      }
    });
    expect(staleScore.statusCode).toBe(409);

    const staleSubmit = await secondApp.inject({
      method: "POST",
      url: `/api/v1/assessor/assessments/${opened.json().assessment.assessmentId}/submit`,
      payload: {
        clientVersion: 0,
        idempotencyKey: "assessment-stale-submit"
      }
    });
    expect(staleSubmit.statusCode).toBe(409);

    const dbAssessment = await pool.query<{ raw_score_total: number; version: number; status: string }>(
      "SELECT raw_score_total, version, status FROM judge_assessments WHERE id = $1",
      [opened.json().assessment.assessmentId]
    );
    expect(dbAssessment.rows[0]).toMatchObject({ raw_score_total: 16, version: 1, status: "IN_PROGRESS" });

    const failingLedger = {
      async append(event: Parameters<PostgresAuditLedger["append"]>[0]) {
        await firstLedger.append(event);
        throw new Error("forced audit failure");
      }
    };
    const rollbackAssignment = await seedAssessmentAssignment(pool, "assessment-rollback");
    const rollbackStores = await createPostgresDomainStores({ client: pool, unitOfWork: firstUnitOfWork });
    const rollbackApp = buildApp({
      applicantStore: rollbackStores.applicantStore,
      assessorStore: rollbackStores.assessorStore,
      allocationStore: rollbackStores.allocationStore,
      assessmentStore: rollbackStores.assessmentStore,
      assessmentRepository: new PostgresAssessmentRepository(pool, firstUnitOfWork, failingLedger),
      resolveSession: async () => sessionFor(rollbackAssignment),
      auditLedger: failingLedger
    });
    const failedSchedule = await rollbackApp.inject({
      method: "POST",
      url: `/api/v1/assessor/visits/${rollbackAssignment.assignmentId}/schedule`,
      payload: {
        scheduledStartAt: "2026-05-20T09:00:00Z",
        scheduledEndAt: "2026-05-20T11:00:00Z",
        clientVersion: 0,
        idempotencyKey: "assessment-rollback-schedule"
      }
    });
    expect(failedSchedule.statusCode).toBe(500);
    const rollbackVisits = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assessment_visits WHERE judge_assignment_id = $1",
      [rollbackAssignment.assignmentId]
    );
    expect(rollbackVisits.rows[0]?.count).toBe("0");
    const rollbackAudits = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_events WHERE idempotency_key = 'assessment-rollback-schedule'"
    );
    expect(rollbackAudits.rows[0]?.count).toBe("0");
  });

  it("persists allocation hold, release, judge decisions, reassignment, and contact reveal through DB-first repositories", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const allocationRepository = new PostgresAllocationRepository(pool, unitOfWork, ledger);
    const firstAssessor = await seedAssessorProfile(pool, "allocation-first");
    const secondAssessor = await seedAssessorProfile(pool, "allocation-second");
    const replacementAssessor = await seedAssessorProfile(pool, "allocation-replacement");
    const episode = await seedAllocationEpisode(pool);
    let stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    const app = buildApp({
      applicantStore: stores.applicantStore,
      assessorStore: stores.assessorStore,
      allocationStore: stores.allocationStore,
      allocationRepository,
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: ledger
    });

    const held = await app.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${episode.episodeId}/hold`,
      payload: {
        assessorIds: [firstAssessor.profileId, secondAssessor.profileId],
        finalJudgeCount: 2,
        acknowledgedFlagTypes: [],
        idempotencyKey: "allocation-hold-db-first"
      }
    });
    expect(held.statusCode).toBe(200);
    const allocationId = held.json().allocationId;

    const released = await app.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${allocationId}/release`,
      payload: { releaseMode: "now", idempotencyKey: "allocation-release-db-first" }
    });
    expect(released.statusCode).toBe(200);
    expect(released.json().assignments.every((assignment: { status: string }) => assignment.status === "RELEASED")).toBe(true);

    stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(stores.allocationStore.allocations.get(allocationId)?.status).toBe("RELEASED");
    const firstAssignment = released.json().assignments.find((assignment: { assessorId: string }) => assignment.assessorId === firstAssessor.profileId);
    const secondAssignment = released.json().assignments.find((assignment: { assessorId: string }) => assignment.assessorId === secondAssessor.profileId);

    const firstJudgeApp = buildApp({
      applicantStore: stores.applicantStore,
      assessorStore: stores.assessorStore,
      allocationStore: stores.allocationStore,
      allocationRepository,
      resolveSession: async () => ({
        ...judgeSessionFixture,
        actor: { ...judgeSessionFixture.actor, actorId: firstAssessor.userId },
        internalUser: { ...judgeSessionFixture.internalUser, id: firstAssessor.userId }
      }),
      auditLedger: ledger
    });
    const firstAccept = await firstJudgeApp.inject({
      method: "POST",
      url: `/api/v1/assessor/assignments/${firstAssignment.assignmentId}/accept`,
      payload: { clientVersion: firstAssignment.version, idempotencyKey: "allocation-first-accept" }
    });
    expect(firstAccept.statusCode).toBe(200);
    expect(firstAccept.json().assignment.contactRevealAvailable).toBe(false);

    const secondJudgeApp = buildApp({
      applicantStore: stores.applicantStore,
      assessorStore: stores.assessorStore,
      allocationStore: stores.allocationStore,
      allocationRepository,
      resolveSession: async () => ({
        ...judgeSessionFixture,
        actor: { ...judgeSessionFixture.actor, actorId: secondAssessor.userId },
        internalUser: { ...judgeSessionFixture.internalUser, id: secondAssessor.userId }
      }),
      auditLedger: ledger
    });
    const secondAccept = await secondJudgeApp.inject({
      method: "POST",
      url: `/api/v1/assessor/assignments/${secondAssignment.assignmentId}/accept`,
      payload: { clientVersion: secondAssignment.version, idempotencyKey: "allocation-second-accept" }
    });
    expect(secondAccept.statusCode).toBe(200);
    expect(secondAccept.json().assignment.contactRevealAvailable).toBe(true);

    const reassign = await app.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${allocationId}/reassign`,
      payload: {
        replaceAssignmentId: firstAssignment.assignmentId,
        replacementAssessorId: replacementAssessor.profileId,
        reason: "Synthetic durable reassignment.",
        acknowledgedFlagTypes: [],
        idempotencyKey: "allocation-reassign-db-first"
      }
    });
    expect(reassign.statusCode).toBe(200);
    expect(reassign.json().assignments.find((assignment: { assignmentId: string }) => assignment.assignmentId === firstAssignment.assignmentId).status).toBe("WITHDRAWN");

    const revokedAccess = await firstJudgeApp.inject({ method: "GET", url: "/api/v1/assessor/assignments" });
    expect(revokedAccess.statusCode).toBe(200);
    expect(revokedAccess.json().items.some((item: { assignmentId: string }) => item.assignmentId === firstAssignment.assignmentId)).toBe(false);
  });

  it("keeps Mystery allocations contact-hidden and rejects stale multi-runtime assignment decisions", async () => {
    const firstUnitOfWork = createUnitOfWork(pool);
    const secondUnitOfWork = createUnitOfWork(pool);
    const firstLedger = new PostgresAuditLedger(pool, firstUnitOfWork);
    const secondLedger = new PostgresAuditLedger(pool, secondUnitOfWork);
    const assessor = await seedAssessorProfile(pool, "mystery-stale");
    const episode = await seedAllocationEpisode(pool, "MYSTERY_SHOP");
    const firstStores = await createPostgresDomainStores({ client: pool, unitOfWork: firstUnitOfWork });
    const secondStores = await createPostgresDomainStores({ client: pool, unitOfWork: secondUnitOfWork });
    const adminApp = buildApp({
      applicantStore: firstStores.applicantStore,
      assessorStore: firstStores.assessorStore,
      allocationStore: firstStores.allocationStore,
      allocationRepository: new PostgresAllocationRepository(pool, firstUnitOfWork, firstLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: firstLedger
    });
    const held = await adminApp.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${episode.episodeId}/hold`,
      payload: {
        assessorIds: [assessor.profileId],
        finalJudgeCount: 1,
        reason: "Synthetic one judge mystery allocation.",
        acknowledgedFlagTypes: [],
        idempotencyKey: "mystery-hold-db-first"
      }
    });
    expect(held.statusCode).toBe(200);
    const allocationId = held.json().allocationId;
    const released = await adminApp.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${allocationId}/release`,
      payload: { releaseMode: "now", idempotencyKey: "mystery-release-db-first" }
    });
    expect(released.statusCode).toBe(200);
    const assignment = released.json().assignments[0];
    const judgeSession = {
      ...judgeSessionFixture,
      actor: { ...judgeSessionFixture.actor, actorId: assessor.userId },
      internalUser: { ...judgeSessionFixture.internalUser, id: assessor.userId }
    };
    const firstJudgeApp = buildApp({
      applicantStore: firstStores.applicantStore,
      assessorStore: firstStores.assessorStore,
      allocationStore: firstStores.allocationStore,
      allocationRepository: new PostgresAllocationRepository(pool, firstUnitOfWork, firstLedger),
      resolveSession: async () => judgeSession,
      auditLedger: firstLedger
    });
    const secondJudgeApp = buildApp({
      applicantStore: secondStores.applicantStore,
      assessorStore: secondStores.assessorStore,
      allocationStore: secondStores.allocationStore,
      allocationRepository: new PostgresAllocationRepository(pool, secondUnitOfWork, secondLedger),
      resolveSession: async () => judgeSession,
      auditLedger: secondLedger
    });
    const accepted = await firstJudgeApp.inject({
      method: "POST",
      url: `/api/v1/assessor/assignments/${assignment.assignmentId}/accept`,
      payload: { clientVersion: 1, idempotencyKey: "mystery-accept-db-first" }
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().assignment.contactRevealAvailable).toBe(false);
    const staleDecline = await secondJudgeApp.inject({
      method: "POST",
      url: `/api/v1/assessor/assignments/${assignment.assignmentId}/decline`,
      payload: {
        clientVersion: 1,
        reason: "Stale writer should not overwrite.",
        idempotencyKey: "mystery-stale-decline"
      }
    });
    expect(staleDecline.statusCode).toBe(409);
    const dbAssignment = await pool.query<{ status: string; contact_reveal_available: boolean }>(
      "SELECT status, contact_reveal_available FROM judge_assignments WHERE id = $1",
      [assignment.assignmentId]
    );
    expect(dbAssignment.rows[0]).toMatchObject({ status: "ACCEPTED", contact_reveal_available: false });
  });

  it("rolls back allocation and assessor DB-first mutations when transactional audit append fails", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const failingLedger = {
      async append(event: Parameters<PostgresAuditLedger["append"]>[0]) {
        await ledger.append(event);
        throw new Error("forced audit failure");
      }
    };
    const assessor = await seedAssessorProfile(pool, "rollback-allocation");
    const episode = await seedAllocationEpisode(pool);
    const stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    const failingAllocationApp = buildApp({
      applicantStore: stores.applicantStore,
      assessorStore: stores.assessorStore,
      allocationStore: stores.allocationStore,
      allocationRepository: new PostgresAllocationRepository(pool, unitOfWork, failingLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: failingLedger
    });
    const hold = await failingAllocationApp.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${episode.episodeId}/hold`,
      payload: {
        assessorIds: [assessor.profileId],
        finalJudgeCount: 1,
        reason: "Rollback allocation audit failure.",
        acknowledgedFlagTypes: [],
        idempotencyKey: "rollback-allocation-hold"
      }
    });
    expect(hold.statusCode).toBe(500);
    const allocationRows = await pool.query<{ count: string }>("SELECT count(*) FROM allocations WHERE assessment_episode_id = $1", [episode.episodeId]);
    expect(allocationRows.rows[0]?.count).toBe("0");
    const auditRows = await pool.query<{ count: string }>("SELECT count(*) FROM audit_events WHERE action = 'HOLD_ALLOCATION' AND idempotency_key = 'rollback-allocation-hold'");
    expect(auditRows.rows[0]?.count).toBe("0");

    const failingAssessorApp = buildApp({
      assessorStore: stores.assessorStore,
      assessorRepository: new PostgresAssessorRepository(pool, unitOfWork, failingLedger),
      resolveSession: async () => ({
        ...judgeSessionFixture,
        actor: { ...judgeSessionFixture.actor, actorId: assessor.userId },
        internalUser: { ...judgeSessionFixture.internalUser, id: assessor.userId }
      }),
      auditLedger: failingLedger
    });
    const preferences = await failingAssessorApp.inject({
      method: "PATCH",
      url: "/api/v1/assessor/profile/preferences",
      payload: {
        clientVersion: 0,
        preferences: {
          preferredRegions: ["South East"],
          preferredAwardTrackCodes: ["STANDARD_GREEN_FLAG"],
          acceptsMysteryShop: false
        },
        idempotencyKey: "rollback-assessor-pref"
      }
    });
    expect(preferences.statusCode).toBe(500);
    const profile = await pool.query<{ version: number }>("SELECT version FROM assessor_profiles WHERE id = $1", [assessor.profileId]);
    expect(profile.rows[0]?.version).toBe(0);
  });

  it("persists assessor profile, preference, availability, and capacity mutations and rejects stale self updates", async () => {
    const firstUnitOfWork = createUnitOfWork(pool);
    const secondUnitOfWork = createUnitOfWork(pool);
    const firstLedger = new PostgresAuditLedger(pool, firstUnitOfWork);
    const secondLedger = new PostgresAuditLedger(pool, secondUnitOfWork);
    const assessor = await seedAssessorProfile(pool, "assessor-db-first");
    const firstStores = await createPostgresDomainStores({ client: pool, unitOfWork: firstUnitOfWork });
    const secondStores = await createPostgresDomainStores({ client: pool, unitOfWork: secondUnitOfWork });
    const session = {
      ...judgeSessionFixture,
      actor: { ...judgeSessionFixture.actor, actorId: assessor.userId },
      internalUser: { ...judgeSessionFixture.internalUser, id: assessor.userId }
    };
    const firstApp = buildApp({
      assessorStore: firstStores.assessorStore,
      assessorRepository: new PostgresAssessorRepository(pool, firstUnitOfWork, firstLedger),
      resolveSession: async () => session,
      auditLedger: firstLedger
    });
    const secondApp = buildApp({
      assessorStore: secondStores.assessorStore,
      assessorRepository: new PostgresAssessorRepository(pool, secondUnitOfWork, secondLedger),
      resolveSession: async () => session,
      auditLedger: secondLedger
    });

    const preferences = await firstApp.inject({
      method: "PATCH",
      url: "/api/v1/assessor/profile/preferences",
      payload: {
        clientVersion: 0,
        preferences: {
          preferredRegions: ["South East"],
          preferredAwardTrackCodes: ["STANDARD_GREEN_FLAG"],
          unavailableNotes: "Durable DB-first preference.",
          acceptsMysteryShop: true
        },
        idempotencyKey: "assessor-preferences-db-first"
      }
    });
    expect(preferences.statusCode).toBe(200);
    expect(preferences.json().profile.version).toBe(1);

    const stale = await secondApp.inject({
      method: "PATCH",
      url: "/api/v1/assessor/profile/capacity",
      payload: {
        clientVersion: 0,
        capacity: [{
          capacityId: randomUUID(),
          cycleYear: lowerEnvironmentAwardCycle2026Fixture.cycleYear,
          maxAssignments: 1,
          currentAssignedCount: 0,
          capacityStatus: "available"
        }],
        idempotencyKey: "assessor-capacity-stale"
      }
    });
    expect(stale.statusCode).toBe(409);

    const availability = await firstApp.inject({
      method: "PATCH",
      url: "/api/v1/assessor/profile/availability",
      payload: {
        clientVersion: 1,
        availability: [{
          availabilityId: randomUUID(),
          startsAt: "2026-06-01T09:00:00.000Z",
          endsAt: "2026-06-01T17:00:00.000Z",
          availabilityType: "available",
          notes: "Durable window."
        }],
        idempotencyKey: "assessor-availability-db-first"
      }
    });
    expect(availability.statusCode).toBe(200);

    const capacity = await firstApp.inject({
      method: "PATCH",
      url: "/api/v1/assessor/profile/capacity",
      payload: {
        clientVersion: 2,
        capacity: [{
          capacityId: randomUUID(),
          cycleYear: lowerEnvironmentAwardCycle2026Fixture.cycleYear,
          maxAssignments: 3,
          currentAssignedCount: 0,
          capacityStatus: "available"
        }],
        idempotencyKey: "assessor-capacity-db-first"
      }
    });
    expect(capacity.statusCode).toBe(200);

    const rehydrated = await createPostgresDomainStores({ client: pool, unitOfWork: firstUnitOfWork });
    const profile = rehydrated.assessorStore.profiles.get(assessor.profileId);
    expect(profile?.preferences.unavailableNotes).toBe("Durable DB-first preference.");
    expect(profile?.availability).toHaveLength(1);
    expect(profile?.capacity[0]?.maxAssignments).toBe(3);
  });

  it("rolls back registration and applicant route mutations when transactional audit append fails", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const failingLedger = {
      async append(event: Parameters<PostgresAuditLedger["append"]>[0]) {
        await ledger.append(event);
        throw new Error("forced audit failure");
      }
    };

    const stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    const registrationApp = buildApp({
      registrationStore: stores.registrationStore,
      registrationRepository: new PostgresRegistrationRepository(pool, unitOfWork, ledger, {
        allowStaticLowerEnvVerificationToken: true
      }),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: ledger
    });
    const submit = await registrationApp.inject({
      method: "POST",
      url: "/api/v1/registrations",
      payload: {
        ...registrationSubmissionRequestFixture,
        parkName: "Rollback Verify Park",
        organisationName: "Rollback Verify Organisation",
        contactEmail: "rollback-verify@example.invalid",
        postcode: "RV1 1AA",
        duplicateAcknowledged: false
      }
    });
    expect(submit.statusCode).toBe(201);
    const registrationId = submit.json().registrationId;

    const failingRegistrationApp = buildApp({
      registrationStore: stores.registrationStore,
      registrationRepository: new PostgresRegistrationRepository(pool, unitOfWork, failingLedger, {
        allowStaticLowerEnvVerificationToken: true
      }),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: failingLedger
    });
    const verify = await failingRegistrationApp.inject({
      method: "POST",
      url: `/api/v1/registrations/${registrationId}/verify-email`,
      payload: { token: "lower-env-verification-token" }
    });
    expect(verify.statusCode).toBe(500);
    let rehydrated = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(rehydrated.registrationStore.records.get(registrationId)?.status).toBe("PENDING_VERIFICATION");
    const verifyAudits = await pool.query<{ count: string }>(
      "SELECT count(*) FROM audit_events WHERE entity_id = $1 AND action = 'VERIFY_REGISTRATION_EMAIL'",
      [registrationId]
    );
    expect(verifyAudits.rows[0]?.count).toBe("0");

    const applicantEpisode = await seedApplicantEpisode(pool);
    const applicantSession = structuredClone(parkManagerSessionFixture);
    applicantSession.actor.scopes = [{ type: "PARK", id: applicantEpisode.parkId }];
    applicantSession.roleAssignments = [
      {
        ...applicantSession.roleAssignments[0]!,
        scope: { type: "PARK", id: applicantEpisode.parkId }
      }
    ];
    rehydrated = await createPostgresDomainStores({ client: pool, unitOfWork });
    const applicantApp = buildApp({
      applicantStore: rehydrated.applicantStore,
      applicantRepository: new PostgresApplicantRepository(pool, unitOfWork, ledger),
      resolveSession: async () => applicantSession,
      auditLedger: ledger
    });
    const created = await applicantApp.inject({
      method: "POST",
      url: "/api/v1/applicant/applications",
      payload: {
        parkId: applicantEpisode.parkId,
        episodeId: applicantEpisode.episodeId,
        idempotencyKey: "rollback-create-application"
      }
    });
    expect(created.statusCode).toBe(201);
    const applicationId = created.json().applicationId;

    const failingApplicantApp = buildApp({
      applicantStore: rehydrated.applicantStore,
      applicantRepository: new PostgresApplicantRepository(pool, unitOfWork, failingLedger),
      resolveSession: async () => applicantSession,
      auditLedger: failingLedger
    });
    const autosave = await failingApplicantApp.inject({
      method: "PATCH",
      url: `/api/v1/applicant/applications/${applicationId}/sections/site_information`,
      payload: {
        clientVersion: 0,
        fields: { siteDescription: "Should not persist" }
      }
    });
    expect(autosave.statusCode).toBe(500);
    const coldApplicantStores = await createPostgresDomainStores({ client: pool, unitOfWork });
    expect(coldApplicantStores.applicantStore.applications.get(applicationId)?.version).toBe(0);
    expect(
      coldApplicantStores.applicantStore.applications
        .get(applicationId)
        ?.sections.find((section) => section.sectionKey === "site_information")?.fields
    ).toEqual({});
    const autosaveAudits = await pool.query<{ count: string }>(
      "SELECT count(*) FROM audit_events WHERE entity_id = $1 AND action = 'AUTOSAVE_APPLICATION_SECTION'",
      [applicationId]
    );
    expect(autosaveAudits.rows[0]?.count).toBe("0");
  });

  it("rolls back audit and domain work in one UnitOfWork transaction", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const rolledBackRegistrationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const rolledBackTokenId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

    await expect(unitOfWork.run(async ({ client }) => {
      await ledger.append({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        actor: globalAdminSessionFixture.actor,
        action: "ROLLBACK_TEST",
        entityType: "integration_test",
        request: { requestId: "rollback-request" },
        createdAt: "2026-05-06T00:00:00.000Z"
      });
      await client.query(
        `
          INSERT INTO registration_submissions (
            id, status, park_name, organisation_name, contact_name, contact_email,
            address_line_1, town, country, publicly_accessible, free_to_enter,
            minimum_size_confirmed, duplicate_warning_state, duplicate_matched_fields,
            location_payload, submitted_payload
          )
          VALUES (
            $1, 'PENDING_VERIFICATION', 'Rollback Park', 'Rollback Org', 'Rollback Contact',
            'rollback@example.invalid', 'Rollback Street', 'Rollback Town', 'lower-env',
            true, true, true, 'NONE', ARRAY[]::text[], '{}'::jsonb, '{}'::jsonb
          )
        `,
        [rolledBackRegistrationId]
      );
      await client.query(
        `
          INSERT INTO registration_verification_tokens (id, registration_submission_id, token_hash, status, expires_at_utc)
          VALUES ($1, $2, 'rollback-token', 'ACTIVE', '2026-05-07T00:00:00.000Z'::timestamptz)
        `,
        [rolledBackTokenId, rolledBackRegistrationId]
      );
      throw new Error("force rollback");
    })).rejects.toThrow("force rollback");

    const [auditResult, parentResult, childResult] = await Promise.all([
      pool.query<{ count: string }>("SELECT count(*) FROM audit_events WHERE action = 'ROLLBACK_TEST'"),
      pool.query<{ count: string }>("SELECT count(*) FROM registration_submissions WHERE id = $1", [rolledBackRegistrationId]),
      pool.query<{ count: string }>("SELECT count(*) FROM registration_verification_tokens WHERE id = $1", [rolledBackTokenId])
    ]);
    expect(auditResult.rows[0]?.count).toBe("0");
    expect(parentResult.rows[0]?.count).toBe("0");
    expect(childResult.rows[0]?.count).toBe("0");
  });
});
