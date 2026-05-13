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
import { PostgresCommunicationsRepository } from "./postgres-domain-stores/communications-repository.js";
import { PostgresResultsRepository } from "./postgres-domain-stores/results-repository.js";
import { PostgresDocumentMigrationRepository } from "./postgres-domain-stores/document-migration-repository.js";
import { DocumentMigrationValidationService } from "./document-migration-validation.js";
import { PostgresParkAreaService } from "./park-area.js";
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
  await pool.query(
    `
      INSERT INTO park_area_measurements (
        id,
        park_id,
        area_hectares,
        source_kind,
        source_label,
        is_current,
        captured_by_actor_id
      )
      VALUES ($1, $2, 12.50, 'applicant_confirmed', 'Synthetic lower-env applicant area', true, $3)
    `,
    [randomUUID(), parkId, globalAdminSessionFixture.actor.actorId]
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

async function seedSubmittedResultEpisode(
  pool: SqlPool,
  label: string,
  episodeType: "FULL_ASSESSMENT" | "MYSTERY_SHOP" = "FULL_ASSESSMENT",
  thresholdMet = true
) {
  const seeded = await seedAssessmentAssignment(pool, label, "ACCEPTED", episodeType);
  const template = assessmentSubmittedFixture.assessment.template;
  await pool.query(
    `
      INSERT INTO assessment_template_configs (
        id, award_track_code, cycle_year, source, pass_threshold_percent, updated_at_utc
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (award_track_code, cycle_year) DO UPDATE SET updated_at_utc = now()
    `,
    [
      template.templateId,
      template.awardTrackCode,
      template.cycleYear,
      template.source,
      template.passThresholdPercent
    ]
  );
  for (const [index, criterion] of template.criteria.entries()) {
    await pool.query(
      `
        INSERT INTO assessment_template_criteria (
          template_config_id, criterion_id, code, label, max_score, placeholder_only, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, true, $6)
        ON CONFLICT (template_config_id, criterion_id) DO NOTHING
      `,
      [template.templateId, criterion.criterionId, criterion.code, criterion.label, criterion.maxScore, index]
    );
  }
  const assessmentId = randomUUID();
  await pool.query(
    `
      INSERT INTO judge_assessments (
        id, judge_assignment_id, assessment_episode_id, assessor_profile_id, status,
        raw_score_total, max_score_total, threshold_met, offline_sync_version, version, updated_at_utc
      )
      VALUES ($1, $2, $3, $4, 'SUBMITTED', $5, $6, $7, 0, 1, now())
    `,
    [
      assessmentId,
      seeded.assignmentId,
      seeded.episodeId,
      seeded.profileId,
      thresholdMet ? 80 : 20,
      100,
      thresholdMet
    ]
  );
  await pool.query(
    `
      INSERT INTO assessment_score_entries (assessment_id, criterion_id, score, notes, updated_at_utc)
      VALUES ($1, $2, $3, NULL, now())
      ON CONFLICT (assessment_id, criterion_id) DO UPDATE SET score = EXCLUDED.score, updated_at_utc = now()
    `,
    [assessmentId, template.criteria[0]!.criterionId, thresholdMet ? 80 : 20]
  );
  return { ...seeded, assessmentId };
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

  it("persists Goal 3B internal document ownerships and migration file references with safe replay", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const service = new DocumentMigrationValidationService(
      new PostgresDocumentMigrationRepository(pool, unitOfWork),
      { unitOfWork, auditLedger: ledger }
    );
    const seeded = await seedAllocationEpisode(pool);
    const documentAssetId = randomUUID();
    await pool.query(
      `
        INSERT INTO document_assets (
          id, application_id, assessment_episode_id, park_id, document_type, filename, content_type,
          byte_size, sha256, storage_provider, storage_key, status, visibility, version, is_current,
          uploaded_by_actor_id, scan_status
        )
        VALUES (
          $1, $2, $3, $4, 'management_plan', 'goal-3b-management-plan.pdf', 'application/pdf',
          12345, $5, 'lower_env_stub', $6, 'ARCHIVED', 'APPLICANT_AND_ADMIN', 1, false,
          $7, 'clean_stub'
        )
      `,
      [
        documentAssetId,
        seeded.applicationId,
        seeded.episodeId,
        seeded.parkId,
        "b".repeat(64),
        `lower-env/applications/${documentAssetId}/goal-3b-management-plan.pdf`,
        parkManagerRoleAssignmentFixture.internalUserId
      ]
    );

    const ownership = await service.registerDocumentAssetOwnership({
      documentAssetId,
      documentSubtype: "management_plan",
      ownerType: "application",
      ownerId: seeded.applicationId,
      ownerContextRole: "application_package",
      applyDocumentAssetMetadata: true
    }, { requestId: "goal-3b-db-ownership" });
    expect(ownership).toMatchObject({
      documentAssetId,
      ownerType: "application",
      ownerId: seeded.applicationId
    });
    const ownershipRows = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM document_asset_ownerships WHERE document_asset_id = $1",
      [documentAssetId]
    );
    expect(ownershipRows.rows[0]?.count).toBe("1");
    const assetMetadata = await pool.query<{
      document_subtype: string | null;
      retention_category: string | null;
      sensitivity_classification: string | null;
      redaction_classification: string | null;
      import_status: string | null;
    }>(
      `
        SELECT document_subtype, retention_category, sensitivity_classification, redaction_classification, import_status
        FROM document_assets
        WHERE id = $1
      `,
      [documentAssetId]
    );
    expect(assetMetadata.rows[0]).toMatchObject({
      document_subtype: "management_plan",
      retention_category: "assessment_record_min_7_years",
      sensitivity_classification: "low",
      redaction_classification: "standard",
      import_status: "validated_internal"
    });

    const importBatchId = randomUUID();
    await pool.query(
      `
        INSERT INTO migration_import_batches (
          id, batch_key, source_system, source_database, source_export_label,
          environment, batch_kind, status, source_file_manifest
        )
        VALUES ($1, $2, 'legacy_greenflag_live', 'GreenFlag_Live', 'goal-3b-db-test', 'local', 'dry_run', 'created', '[]'::jsonb)
      `,
      [importBatchId, `goal-3b-${importBatchId}`]
    );
    const referenceInput = {
      importBatchId,
      sourceTable: "ParkDocument",
      sourceColumn: "Filename",
      sourcePrimaryKey: "legacy-document-1",
      legacyFilename: "secret-mystery-visit-plan.pdf",
      originalRelativePath: "legacy/private/secret-mystery-visit-plan.pdf",
      resolvedStorageKey: "lower-env/private/secret-mystery-visit-plan.pdf",
      externalArchiveLocation: "archive://private/secret-mystery-visit-plan.pdf",
      importStatus: "metadata_only" as const,
      ownerEntityType: "application",
      ownerEntityId: seeded.applicationId,
      documentSubtype: "management_plan"
    };
    const reference = await service.registerMigrationFileReference(referenceInput, { requestId: "goal-3b-db-reference" });
    const replay = await service.registerMigrationFileReference(referenceInput, { requestId: "goal-3b-db-reference-replay" });
    expect(replay.id).toBe(reference.id);
    const referenceRows = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM migration_document_file_references
        WHERE import_batch_id = $1 AND source_table = 'ParkDocument' AND source_column = 'Filename'
      `,
      [importBatchId]
    );
    expect(referenceRows.rows[0]?.count).toBe("1");
    await expect(service.registerMigrationFileReference({
      ...referenceInput,
      sha256: "c".repeat(64)
    }, { requestId: "goal-3b-db-reference-conflict" })).rejects.toMatchObject({
      code: "idempotency_conflict",
      message: expect.not.stringContaining("secret-mystery-visit-plan.pdf")
    });

    const assetCountBeforeArchiveOnly = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM document_assets");
    const archiveOnly = await service.registerArchiveOnlyFileReference({
      importBatchId,
      sourceTable: "ParkDocument",
      sourceColumn: "ArchiveFilename",
      sourcePrimaryKey: "legacy-document-2",
      sourceReferenceKey: "archive-only",
      externalArchiveLocation: "archive://private/archive-only-document.pdf",
      importStatus: "external_archive_only",
      documentSubtype: "archive_only_file"
    }, { requestId: "goal-3b-db-archive-only" });
    expect(archiveOnly).toMatchObject({
      importStatus: "external_archive_only",
      documentSubtype: "archive_only_file"
    });
    const assetCountAfterArchiveOnly = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM document_assets");
    expect(assetCountAfterArchiveOnly.rows[0]?.count).toBe(assetCountBeforeArchiveOnly.rows[0]?.count);

    const auditRows = await pool.query<{ after_state: string }>(
      `
        SELECT after_state::text AS after_state
        FROM audit_events
        WHERE action IN ('REGISTER_DOCUMENT_ASSET_OWNERSHIP', 'REGISTER_DOCUMENT_MIGRATION_FILE_REFERENCE')
          AND request_id LIKE 'goal-3b-db-%'
        ORDER BY created_at_utc
      `
    );
    const auditPayload = JSON.stringify(auditRows.rows);
    expect(auditPayload).not.toContain("secret-mystery-visit-plan.pdf");
    expect(auditPayload).not.toContain("legacy/private");
    expect(auditPayload).not.toContain("lower-env/private");
    expect(auditPayload).not.toContain("archive://private");
    expect(auditPayload).toContain("hasLegacyFilename");
    expect(auditPayload).toContain("hasExternalArchiveLocation");
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
    expect(JSON.stringify(completed.json())).not.toContain("storageKey");

    const signedAccess = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationId}/documents/${completed.json().document.documentId}/access`
    });
    expect(signedAccess.statusCode).toBe(200);
    const accessAudit = await pool.query<{ count: string }>(
      "SELECT count(*) FROM audit_events WHERE entity_id = $1 AND action = 'DOCUMENT_ACCESS_REQUESTED'",
      [completed.json().document.documentId]
    );
    expect(accessAudit.rows[0]?.count).toBe("1");

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
    const financeRows = await pool.query<{
      invoice_number: string;
      invoice_number_scope: string;
      amount_marker: string;
      currency: string;
      subtotal_amount: string;
      tax_amount: string;
      total_amount: string;
      tax_rate: string;
      due_date_source: string;
      payment_terms_snapshot: unknown;
      billing_name: string;
      park_name_snapshot: string;
      organisation_name_snapshot: string;
      line_total: string;
      line_subtotal: string;
      line_tax_amount: string;
      application_area_snapshot_id: string;
      area_hectares: string;
    }>(
      `
        SELECT
          i.invoice_number,
          i.invoice_number_scope,
          i.amount_marker,
          i.currency,
          i.subtotal_amount::text,
          i.tax_amount::text,
          i.total_amount::text,
          i.tax_rate::text,
          i.due_date_source,
          i.payment_terms_snapshot,
          i.billing_name,
          i.park_name_snapshot,
          i.organisation_name_snapshot,
          il.line_total::text,
          il.line_subtotal::text,
          il.tax_amount::text AS line_tax_amount,
          il.application_area_snapshot_id,
          aas.area_hectares::text
        FROM invoices i
        JOIN invoice_lines il ON il.invoice_id = i.id
        JOIN application_area_snapshots aas ON aas.id = il.application_area_snapshot_id
        WHERE i.id = $1
      `,
      [submitted.json().invoice.invoiceId]
    );
    expect(financeRows.rows[0]).toMatchObject({
      invoice_number_scope: "lower_env_placeholder",
      amount_marker: "external_value_unavailable",
      currency: "XXX",
      subtotal_amount: "0.00",
      tax_amount: "0.00",
      total_amount: "0.00",
      tax_rate: "0.0000",
      due_date_source: "lower_env_placeholder",
      billing_name: lowerEnvironmentParkCycleSnapshotFixture.organisation.name,
      organisation_name_snapshot: lowerEnvironmentParkCycleSnapshotFixture.organisation.name,
      line_total: "0.00",
      line_subtotal: "0.00",
      line_tax_amount: "0.00",
      area_hectares: "12.50"
    });
    expect(financeRows.rows[0]?.invoice_number).toMatch(/^LOWER-ENV-INVOICE-/);
    expect(JSON.stringify(financeRows.rows[0]?.payment_terms_snapshot)).toContain("lower_env_placeholder");

    const areaService = new PostgresParkAreaService(pool, unitOfWork, ledger);
    await areaService.overrideArea({
      parkId: applicantEpisode.parkId,
      areaHectares: 99,
      reason: "Synthetic post-submission area correction.",
      actor: globalAdminSessionFixture.actor,
      request: { requestId: "goal2-post-submit-area-override", idempotencyKey: "goal2-post-submit-area-override" }
    });
    const frozenInvoiceRows = await pool.query<{ total_amount: string; application_area_snapshot_id: string; area_hectares: string }>(
      `
        SELECT i.total_amount::text, il.application_area_snapshot_id, aas.area_hectares::text
        FROM invoices i
        JOIN invoice_lines il ON il.invoice_id = i.id
        JOIN application_area_snapshots aas ON aas.id = il.application_area_snapshot_id
        WHERE i.id = $1
      `,
      [submitted.json().invoice.invoiceId]
    );
    expect(frozenInvoiceRows.rows[0]).toMatchObject({
      total_amount: "0.00",
      application_area_snapshot_id: financeRows.rows[0]?.application_area_snapshot_id,
      area_hectares: "12.50"
    });
    await expect(pool.query(
      "UPDATE invoice_lines SET description = description WHERE invoice_id = $1",
      [submitted.json().invoice.invoiceId]
    )).rejects.toThrow(/immutable/);

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
    const paymentEvents = await pool.query<{ event_type: string; count: string; audit_count: string; override_count: string }>(
      `
        SELECT
          event_type,
          count(*)::text AS count,
          count(audit_event_id)::text AS audit_count,
          count(admin_override_event_id)::text AS override_count
        FROM payment_events
        WHERE invoice_id = $1
        GROUP BY event_type
      `,
      [submitted.json().invoice.invoiceId]
    );
    const paymentEventCounts = new Map(paymentEvents.rows.map((row) => [row.event_type, row]));
    expect(paymentEventCounts.get("deadline_block_applied")).toMatchObject({ count: "1", audit_count: "1" });
    expect(paymentEventCounts.get("payment_override")).toMatchObject({ count: "1", audit_count: "1", override_count: "1" });
    expect(paymentEventCounts.get("manual_mark_paid")).toMatchObject({ count: "1", audit_count: "1" });
    await expect(pool.query(
      "UPDATE payment_events SET notes = notes WHERE invoice_id = $1",
      [submitted.json().invoice.invoiceId]
    )).rejects.toThrow(/append-only/);

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

  it("enriches only newly created management-plan upload assets with internal metadata", async () => {
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
    const stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    const app = buildApp({
      applicantStore: stores.applicantStore,
      applicantRepository,
      resolveSession: async () => applicantSession,
      auditLedger: ledger
    });
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/applications",
      payload: {
        parkId: applicantEpisode.parkId,
        episodeId: applicantEpisode.episodeId,
        idempotencyKey: "goal3b1-create-application"
      }
    });
    expect(created.statusCode).toBe(201);
    const applicationId = created.json().applicationId;

    const expectedApplicantDocumentKeys = [
      "byteSize",
      "contentType",
      "createdAt",
      "documentId",
      "documentType",
      "filename",
      "isCurrent",
      "scanStatus",
      "signedAccessAvailable",
      "status",
      "updatedAt",
      "version",
      "visibility"
    ].sort();
    const expectedSignedAccessKeys = ["contentType", "documentId", "expiresAt", "filename", "method", "url", "visibility"].sort();
    const expectNoInternalGoal3Metadata = (value: unknown) => {
      const json = JSON.stringify(value);
      for (const key of [
        "documentSubtype",
        "document_subtype",
        "sourceOrigin",
        "source_origin",
        "retentionCategory",
        "retention_category",
        "sensitivityClassification",
        "sensitivity_classification",
        "redactionClassification",
        "redaction_classification",
        "ownerType",
        "ownerContextRole",
        "migration"
      ]) {
        expect(json).not.toContain(key);
      }
    };
    const completeManagementPlanUpload = async ({
      idempotencyKey,
      filename,
      sha256,
      byteSize,
      storageKey
    }: {
      idempotencyKey: string;
      filename: string;
      sha256: string;
      byteSize: number;
      storageKey: string;
    }) => {
      const upload = await app.inject({
        method: "POST",
        url: `/api/v1/applicant/applications/${applicationId}/documents/upload-sessions`,
        payload: {
          documentType: "management_plan",
          filename,
          contentType: "application/pdf",
          byteSize,
          sha256,
          totalChunks: 1,
          idempotencyKey
        }
      });
      expect(upload.statusCode).toBe(201);
      const chunk = await app.inject({
        method: "PATCH",
        url: `/api/v1/applicant/applications/${applicationId}/documents/upload-sessions/${upload.json().sessionId}/chunks/0`,
        payload: {
          clientVersion: upload.json().version,
          chunkSize: byteSize,
          chunkChecksum: `${idempotencyKey}-chunk`,
          idempotencyKey: `${idempotencyKey}-chunk`
        }
      });
      expect(chunk.statusCode).toBe(200);
      const completed = await app.inject({
        method: "POST",
        url: `/api/v1/applicant/applications/${applicationId}/documents/upload-sessions/${upload.json().sessionId}/complete`,
        payload: {
          clientVersion: chunk.json().version,
          sha256,
          byteSize,
          storageKey
        }
      });
      expect(completed.statusCode, completed.body).toBe(200);
      return completed;
    };

    const firstCompleted = await completeManagementPlanUpload({
      idempotencyKey: "goal3b1-first-upload",
      filename: "goal-3b1-management-plan.pdf",
      sha256: "1".repeat(64),
      byteSize: 123456,
      storageKey: "lower-env/applications/goal-3b1-management-plan.pdf"
    });
    const firstBody = firstCompleted.json();
    expect(Object.keys(firstBody).sort()).toEqual(["applicationId", "document"].sort());
    expect(Object.keys(firstBody.document).sort()).toEqual(expectedApplicantDocumentKeys);
    expectNoInternalGoal3Metadata(firstBody);
    const firstDocumentId = firstBody.document.documentId;

    const firstAsset = await pool.query<{
      document_subtype: string | null;
      source_origin: string | null;
      retention_category: string | null;
      sensitivity_classification: string | null;
      redaction_classification: string | null;
      visibility: string;
      import_status: string | null;
    }>(
      `
        SELECT document_subtype, source_origin, retention_category,
          sensitivity_classification, redaction_classification, visibility, import_status
        FROM document_assets
        WHERE id = $1
      `,
      [firstDocumentId]
    );
    expect(firstAsset.rows[0]).toMatchObject({
      document_subtype: "management_plan",
      source_origin: "user_upload",
      retention_category: "assessment_record_min_7_years",
      sensitivity_classification: "low",
      redaction_classification: "standard",
      visibility: "APPLICANT_AND_ADMIN",
      import_status: "user_uploaded"
    });

    const firstOwnership = await pool.query<{
      id: string;
      owner_type: string;
      owner_id: string;
      owner_context_role: string;
      required_for_access: boolean;
      visibility_override: string | null;
      redaction_override: string | null;
      created_by_process: string;
    }>(
      `
        SELECT id, owner_type, owner_id, owner_context_role, required_for_access,
          visibility_override, redaction_override, created_by_process
        FROM document_asset_ownerships
        WHERE document_asset_id = $1
      `,
      [firstDocumentId]
    );
    expect(firstOwnership.rows).toHaveLength(1);
    expect(firstOwnership.rows[0]).toMatchObject({
      owner_type: "application",
      owner_id: applicationId,
      owner_context_role: "application_package",
      required_for_access: true,
      visibility_override: null,
      redaction_override: null,
      created_by_process: "management_plan_upload_metadata_enrichment"
    });

    const signedAccess = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/applications/${applicationId}/documents/${firstDocumentId}/access`
    });
    expect(signedAccess.statusCode).toBe(200);
    expect(Object.keys(signedAccess.json()).sort()).toEqual(expectedSignedAccessKeys);
    expectNoInternalGoal3Metadata(signedAccess.json());

    const secondCompleted = await completeManagementPlanUpload({
      idempotencyKey: "goal3b1-replacement",
      filename: "goal-3b1-management-plan-replacement.pdf",
      sha256: "2".repeat(64),
      byteSize: 234567,
      storageKey: "lower-env/applications/goal-3b1-management-plan-replacement.pdf"
    });
    const secondBody = secondCompleted.json();
    const secondDocumentId = secondBody.document.documentId;
    expect(secondBody.archivedDocumentId).toBe(firstDocumentId);
    const replacementRows = await pool.query<{
      id: string;
      status: string;
      is_current: boolean;
      replaces_document_id: string | null;
      replaced_by_document_id: string | null;
    }>(
      `
        SELECT id, status, is_current, replaces_document_id, replaced_by_document_id
        FROM document_assets
        WHERE id = ANY($1::uuid[])
      `,
      [[firstDocumentId, secondDocumentId]]
    );
    const archivedPrevious = replacementRows.rows.find((row) => row.id === firstDocumentId);
    const currentReplacement = replacementRows.rows.find((row) => row.id === secondDocumentId);
    expect(archivedPrevious).toMatchObject({
      status: "ARCHIVED",
      is_current: false,
      replaced_by_document_id: secondDocumentId
    });
    expect(currentReplacement).toMatchObject({
      status: "AVAILABLE",
      is_current: true,
      replaces_document_id: firstDocumentId
    });
    const firstOwnershipAfterArchive = await pool.query<{
      id: string;
      owner_type: string;
      owner_id: string;
      owner_context_role: string;
      created_by_process: string;
    }>(
      `
        SELECT id, owner_type, owner_id, owner_context_role, created_by_process
        FROM document_asset_ownerships
        WHERE document_asset_id = $1
      `,
      [firstDocumentId]
    );
    expect(firstOwnershipAfterArchive.rows).toHaveLength(1);
    expect(firstOwnershipAfterArchive.rows[0]).toMatchObject({
      id: firstOwnership.rows[0]?.id,
      owner_type: "application",
      owner_id: applicationId,
      owner_context_role: "application_package",
      created_by_process: "management_plan_upload_metadata_enrichment"
    });
    const secondOwnership = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM document_asset_ownerships WHERE document_asset_id = $1",
      [secondDocumentId]
    );
    expect(secondOwnership.rows[0]?.count).toBe("1");

    const duplicateDocumentId = randomUUID();
    const duplicateUpdatedAt = "2026-01-01T00:00:00.000Z";
    await pool.query(
      `
        INSERT INTO document_assets (
          id, application_id, assessment_episode_id, park_id, document_type, filename, content_type,
          byte_size, sha256, storage_provider, storage_key, status, visibility, version, is_current,
          uploaded_by_actor_id, scan_status, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, 'management_plan', 'pre-existing-duplicate-management-plan.pdf', 'application/pdf',
          345678, $5, 'lower_env_stub', $6, 'ARCHIVED', 'APPLICANT_AND_ADMIN', 99, false,
          $7, 'clean_stub', $8::timestamptz, $8::timestamptz
        )
      `,
      [
        duplicateDocumentId,
        applicationId,
        applicantEpisode.episodeId,
        applicantEpisode.parkId,
        "3".repeat(64),
        "lower-env/applications/pre-existing-duplicate-management-plan.pdf",
        applicantSession.actor.actorId,
        duplicateUpdatedAt
      ]
    );
    const duplicateCompleted = await completeManagementPlanUpload({
      idempotencyKey: "goal3b1-duplicate",
      filename: "goal-3b1-duplicate-management-plan.pdf",
      sha256: "3".repeat(64),
      byteSize: 345678,
      storageKey: "lower-env/applications/goal-3b1-duplicate-management-plan.pdf"
    });
    expect(duplicateCompleted.json().duplicateOfDocumentId).toBe(duplicateDocumentId);
    const duplicateAsset = await pool.query<{
      document_subtype: string | null;
      source_origin: string | null;
      retention_category: string | null;
      sensitivity_classification: string | null;
      redaction_classification: string | null;
      import_status: string | null;
      updated_at: Date | string;
    }>(
      `
        SELECT document_subtype, source_origin, retention_category, sensitivity_classification,
          redaction_classification, import_status, updated_at
        FROM document_assets
        WHERE id = $1
      `,
      [duplicateDocumentId]
    );
    expect(duplicateAsset.rows[0]).toMatchObject({
      document_subtype: null,
      source_origin: null,
      retention_category: null,
      sensitivity_classification: null,
      redaction_classification: null,
      import_status: null
    });
    expect(new Date(duplicateAsset.rows[0]!.updated_at).toISOString()).toBe(duplicateUpdatedAt);
    const duplicateOwnership = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM document_asset_ownerships WHERE document_asset_id = $1",
      [duplicateDocumentId]
    );
    expect(duplicateOwnership.rows[0]?.count).toBe("0");
  });

  it("replays concurrent upload-session idempotency without duplicate sessions or raw unique errors", async () => {
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
    const stores = await createPostgresDomainStores({ client: pool, unitOfWork });
    const app = buildApp({
      applicantStore: stores.applicantStore,
      applicantRepository,
      resolveSession: async () => applicantSession,
      auditLedger: ledger
    });
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/applications",
      payload: {
        parkId: applicantEpisode.parkId,
        episodeId: applicantEpisode.episodeId,
        idempotencyKey: "integration-upload-idem-application"
      }
    });
    expect(created.statusCode).toBe(201);
    const payload = {
      documentType: "management_plan",
      filename: "idempotent-management-plan.pdf",
      contentType: "application/pdf",
      byteSize: 123456,
      sha256: "a".repeat(64),
      totalChunks: 3,
      idempotencyKey: "integration-upload-session-concurrent"
    };

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/v1/applicant/applications/${created.json().applicationId}/documents/upload-sessions`,
        payload
      }),
      app.inject({
        method: "POST",
        url: `/api/v1/applicant/applications/${created.json().applicationId}/documents/upload-sessions`,
        payload
      })
    ]);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().sessionId).toBe(second.json().sessionId);
    const sessions = await pool.query<{ count: string }>(
      "SELECT count(*) FROM document_upload_sessions WHERE application_id = $1 AND idempotency_key = $2",
      [created.json().applicationId, payload.idempotencyKey]
    );
    expect(sessions.rows[0]?.count).toBe("1");

    const collision = await app.inject({
      method: "POST",
      url: `/api/v1/applicant/applications/${created.json().applicationId}/documents/upload-sessions`,
      payload: {
        ...payload,
        filename: "different-management-plan.pdf"
      }
    });
    expect(collision.statusCode).toBe(409);
    expect(collision.json().error.code).toBe("idempotency_conflict");
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

  it("keeps operational episode uniqueness on award cycle while source cycle remains provenance", async () => {
    const snapshot = lowerEnvironmentParkCycleSnapshotFixture;
    const countryCode = `Z${randomUUID().slice(0, 2).toUpperCase()}`;
    const priorCycleId = randomUUID();
    const currentCycleId = randomUUID();
    const priorWindowId = randomUUID();
    const currentWindowId = randomUUID();
    const parkId = randomUUID();
    const priorEpisodeId = randomUUID();
    const currentEpisodeId = randomUUID();
    const priorApplicationId = randomUUID();
    const currentApplicationId = randomUUID();

    await pool.query(
      "INSERT INTO parks (id, organisation_id, award_track_code, name, status) VALUES ($1, $2, $3, $4, 'ACTIVE')",
      [parkId, snapshot.organisation.id, snapshot.awardTrack.code, `Goal 5 Carryover Park ${parkId}`]
    );
    for (const [cycleId, cycleYear] of [[priorCycleId, 2025], [currentCycleId, 2026]] as const) {
      await pool.query(
        `
          INSERT INTO award_cycles (
            id, country_code, cycle_year, application_window_opens_at_utc,
            application_window_closes_at_utc, result_announced_at_utc
          )
          VALUES ($1, $2, $3, '2026-01-01T00:00:00Z'::timestamptz, '2026-04-01T00:00:00Z'::timestamptz, NULL)
        `,
        [cycleId, countryCode, cycleYear]
      );
    }
    await pool.query(
      `
        INSERT INTO cycle_windows (id, award_cycle_id, episode_type, opens_at_utc, closes_at_utc)
        VALUES
          ($1, $2, 'MYSTERY_SHOP', '2025-05-01T00:00:00Z'::timestamptz, '2025-08-01T00:00:00Z'::timestamptz),
          ($3, $4, 'FULL_ASSESSMENT', '2026-05-01T00:00:00Z'::timestamptz, '2026-08-01T00:00:00Z'::timestamptz)
      `,
      [priorWindowId, priorCycleId, currentWindowId, currentCycleId]
    );
    await pool.query(
      `
        INSERT INTO assessment_episodes (
          id, park_id, award_cycle_id, cycle_window_id, award_track_code,
          episode_type, status, mystery_suppressed
        )
        VALUES ($1, $2, $3, $4, $5, 'MYSTERY_SHOP', 'READY_FOR_ALLOCATION', true)
      `,
      [priorEpisodeId, parkId, priorCycleId, priorWindowId, snapshot.awardTrack.code]
    );
    await pool.query(
      `
        INSERT INTO assessment_episodes (
          id, park_id, award_cycle_id, source_cycle_id, cycle_window_id, award_track_code,
          episode_type, status, mystery_suppressed
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'FULL_ASSESSMENT', 'APPLICATION_DRAFT', false)
      `,
      [currentEpisodeId, parkId, currentCycleId, priorCycleId, currentWindowId, snapshot.awardTrack.code]
    );
    await pool.query(
      `
        INSERT INTO applications (id, assessment_episode_id, park_id, owner_internal_user_id, status, completion_percent, version, updated_at_utc)
        VALUES
          ($1, $2, $3, $5, 'SUBMITTED', 100, 0, now()),
          ($4, $6, $3, $5, 'DRAFT', 20, 0, now())
      `,
      [
        priorApplicationId,
        priorEpisodeId,
        parkId,
        currentApplicationId,
        parkManagerRoleAssignmentFixture.internalUserId,
        currentEpisodeId
      ]
    );

    const episodes = await pool.query<{
      id: string;
      award_cycle_id: string;
      source_cycle_id: string;
      operational_year: number;
      episode_type: string;
    }>(
      `
        SELECT id, award_cycle_id, source_cycle_id, operational_year, episode_type
        FROM assessment_episodes
        WHERE id = ANY($1::uuid[])
        ORDER BY episode_type
      `,
      [[priorEpisodeId, currentEpisodeId]]
    );
    expect(episodes.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: currentEpisodeId,
        award_cycle_id: currentCycleId,
        source_cycle_id: priorCycleId,
        operational_year: 2026,
        episode_type: "FULL_ASSESSMENT"
      }),
      expect.objectContaining({
        id: priorEpisodeId,
        award_cycle_id: priorCycleId,
        source_cycle_id: priorCycleId,
        operational_year: 2025,
        episode_type: "MYSTERY_SHOP"
      })
    ]));

    const applications = await pool.query<{ id: string; status: string }>(
      "SELECT id, status FROM applications WHERE id = ANY($1::uuid[])",
      [[priorApplicationId, currentApplicationId]]
    );
    expect(applications.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: priorApplicationId, status: "SUBMITTED" }),
      expect.objectContaining({ id: currentApplicationId, status: "DRAFT" })
    ]));

    await expect(pool.query(
      `
        INSERT INTO assessment_episodes (
          id, park_id, award_cycle_id, cycle_window_id, award_track_code,
          episode_type, status, mystery_suppressed
        )
        VALUES ($1, $2, $3, $4, $5, 'FULL_ASSESSMENT', 'APPLICATION_DRAFT', false)
      `,
      [randomUUID(), parkId, currentCycleId, priorWindowId, snapshot.awardTrack.code]
    )).rejects.toThrow();
  });

  it("tracks typed park area sources and preserves immutable application area snapshots for allocation rules", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const areaService = new PostgresParkAreaService(pool, unitOfWork, ledger);
    const episode = await seedAllocationEpisode(pool);

    await areaService.recordOsSuggestion({
      parkId: episode.parkId,
      areaHectares: 24,
      sourceLabel: "OS Open Greenspace lower-env suggestion"
    });
    await areaService.recordLegacyImport({
      parkId: episode.parkId,
      areaHectares: 20,
      sourceLabel: "Legacy Park.ParkSize",
      makeCurrent: true
    });
    await areaService.recordManualEntry({
      parkId: episode.parkId,
      areaHectares: 22,
      actor: globalAdminSessionFixture.actor,
      request: { requestId: "goal5-manual-area" }
    });
    await areaService.confirmApplicantArea({
      parkId: episode.parkId,
      areaHectares: 26.5,
      actor: globalAdminSessionFixture.actor,
      request: { requestId: "goal5-applicant-area" }
    });
    const snapshot = await areaService.captureApplicationSnapshot({
      applicationId: episode.applicationId,
      snapshotReason: "application_submission"
    });
    await areaService.overrideArea({
      parkId: episode.parkId,
      areaHectares: 12,
      reason: "Synthetic correction after application snapshot.",
      actor: globalAdminSessionFixture.actor,
      request: { requestId: "goal5-area-override", idempotencyKey: "goal5-area-override" }
    });

    const measurements = await pool.query<{ source_kind: string; is_current: boolean }>(
      "SELECT source_kind, is_current FROM park_area_measurements WHERE park_id = $1 ORDER BY captured_at_utc",
      [episode.parkId]
    );
    expect(measurements.rows.map((row) => row.source_kind)).toEqual(expect.arrayContaining([
      "os_open_greenspace_suggestion",
      "legacy_import",
      "manual_entry",
      "applicant_confirmed",
      "admin_override"
    ]));
    expect(measurements.rows.filter((row) => row.is_current)).toEqual([
      expect.objectContaining({ source_kind: "admin_override", is_current: true })
    ]);
    expect(snapshot).toMatchObject({
      applicationId: episode.applicationId,
      areaHectares: 26.5,
      sourceKind: "applicant_confirmed",
      snapshotReason: "application_submission"
    });
    const persistedSnapshot = await pool.query<{ area_hectares: string; source_kind: string }>(
      "SELECT area_hectares, source_kind FROM application_area_snapshots WHERE application_id = $1",
      [episode.applicationId]
    );
    expect(Number(persistedSnapshot.rows[0]?.area_hectares)).toBe(26.5);
    expect(persistedSnapshot.rows[0]?.source_kind).toBe("applicant_confirmed");
    const overrideEvidence = await pool.query<{ audit_count: string; override_count: string }>(
      `
        SELECT
          (SELECT count(*)::text FROM audit_events WHERE action = 'OVERRIDE_PARK_AREA' AND entity_id = $1) AS audit_count,
          (SELECT count(*)::text FROM admin_override_events WHERE override_type = 'PARK_AREA_OVERRIDE' AND target_id = $1) AS override_count
      `,
      [episode.parkId]
    );
    expect(overrideEvidence.rows[0]).toMatchObject({ audit_count: "1", override_count: "1" });

    const repository = new PostgresAllocationRepository(pool, unitOfWork, ledger);
    const readyEpisodes = await repository.readyEpisodes(globalAdminSessionFixture);
    expect(JSON.stringify(readyEpisodes)).toContain("over_25_hectares");
  });

  it("persists allocation hold, release, judge decisions, reassignment, and contact reveal through DB-first repositories", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const allocationRepository = new PostgresAllocationRepository(pool, unitOfWork, ledger);
    const firstAssessor = await seedAssessorProfile(pool, "allocation-first");
    const secondAssessor = await seedAssessorProfile(pool, "allocation-second");
    const observerAssessor = await seedAssessorProfile(pool, "allocation-observer");
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
        assessorIds: [firstAssessor.profileId, secondAssessor.profileId, observerAssessor.profileId],
        finalJudgeCount: 3,
        reason: "Synthetic training observer coverage.",
        acknowledgedFlagTypes: [],
        idempotencyKey: "allocation-hold-db-first"
      }
    });
    expect(held.statusCode).toBe(200);
    const allocationId = held.json().allocationId;
    const heldRoles = await pool.query<{ assessor_profile_id: string; assignment_role: string; required_for_contact_reveal: boolean }>(
      `
        SELECT assessor_profile_id, assignment_role, required_for_contact_reveal
        FROM judge_assignments
        WHERE allocation_id = $1
      `,
      [allocationId]
    );
    expect(heldRoles.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assessor_profile_id: firstAssessor.profileId,
        assignment_role: "PRIMARY_JUDGE",
        required_for_contact_reveal: true
      }),
      expect.objectContaining({
        assessor_profile_id: secondAssessor.profileId,
        assignment_role: "SECONDARY_JUDGE",
        required_for_contact_reveal: true
      }),
      expect.objectContaining({
        assessor_profile_id: observerAssessor.profileId,
        assignment_role: "TRAINING_OBSERVER",
        required_for_contact_reveal: false
      })
    ]));

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
    const replacementRole = await pool.query<{ assignment_role: string; required_for_contact_reveal: boolean }>(
      "SELECT assignment_role, required_for_contact_reveal FROM judge_assignments WHERE assessor_profile_id = $1 AND allocation_id = $2",
      [replacementAssessor.profileId, allocationId]
    );
    expect(replacementRole.rows[0]).toMatchObject({
      assignment_role: "PRIMARY_JUDGE",
      required_for_contact_reveal: true
    });

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
    const mysteryRole = await pool.query<{ assignment_role: string; required_for_contact_reveal: boolean }>(
      "SELECT assignment_role, required_for_contact_reveal FROM judge_assignments WHERE id = $1",
      [assignment.assignmentId]
    );
    expect(mysteryRole.rows[0]).toMatchObject({
      assignment_role: "MYSTERY_JUDGE",
      required_for_contact_reveal: true
    });
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

  it("persists communications message commands and DB-backed listings across cold starts", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const episode = await seedAllocationEpisode(pool, "FULL_ASSESSMENT");
    const applicantSession = structuredClone(parkManagerSessionFixture);
    applicantSession.actor.scopes = [{ type: "PARK", id: episode.parkId }];
    applicantSession.roleAssignments = [{ ...applicantSession.roleAssignments[0]!, scope: { type: "PARK", id: episode.parkId } }];

    const app = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, unitOfWork, ledger),
      resolveSession: async (request) => request.url.includes("/api/v1/admin/") ? globalAdminSessionFixture : applicantSession,
      auditLedger: ledger,
      productionLike: true
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/messages",
      payload: {
        episodeId: episode.episodeId,
        subject: "Application support",
        body: "Please help with this application.",
        idempotencyKey: "communications-full-create"
      }
    });
    expect(created.statusCode).toBe(200);
    const threadId = created.json().thread.threadId;
    const messageId = created.json().message.messageId;

    const coldUnitOfWork = createUnitOfWork(pool);
    const coldApp = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, coldUnitOfWork, new PostgresAuditLedger(pool, coldUnitOfWork)),
      resolveSession: async (request) => request.url.includes("/api/v1/admin/") ? globalAdminSessionFixture : applicantSession,
      productionLike: true
    });
    const applicantListing = await coldApp.inject({ method: "GET", url: "/api/v1/applicant/messages" });
    expect(applicantListing.statusCode).toBe(200);
    expect(applicantListing.json().threads.map((thread: { threadId: string }) => thread.threadId)).toContain(threadId);
    expect(applicantListing.json().messages.map((message: { messageId: string }) => message.messageId)).toContain(messageId);

    const adminListing = await coldApp.inject({ method: "GET", url: "/api/v1/admin/messages" });
    expect(adminListing.statusCode).toBe(200);
    expect(adminListing.json().threads.map((thread: { threadId: string }) => thread.threadId)).toContain(threadId);
    expect(adminListing.json().messages.map((message: { messageId: string }) => message.messageId)).toContain(messageId);

    const audit = await pool.query<{ count: string }>(
      "SELECT count(*) FROM audit_events WHERE entity_id = $1 AND action = 'CREATE_APPLICANT_MESSAGE_THREAD'",
      [threadId]
    );
    expect(audit.rows[0]?.count).toBe("1");
  });

  it("suppresses admin-created and applicant-created Mystery message threads from applicant listings", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const episode = await seedAllocationEpisode(pool, "MYSTERY_SHOP");
    const applicantSession = structuredClone(parkManagerSessionFixture);
    applicantSession.actor.scopes = [{ type: "PARK", id: episode.parkId }];
    applicantSession.roleAssignments = [{ ...applicantSession.roleAssignments[0]!, scope: { type: "PARK", id: episode.parkId } }];
    const app = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, unitOfWork, ledger),
      resolveSession: async (request) => request.url.includes("/api/v1/admin/") ? globalAdminSessionFixture : applicantSession,
      auditLedger: ledger,
      productionLike: true
    });

    const adminCreated = await app.inject({
      method: "POST",
      url: "/api/v1/admin/messages",
      payload: {
        episodeId: episode.episodeId,
        subject: "Mystery operational detail",
        body: "Mystery assignment operational message.",
        idempotencyKey: "communications-mystery-admin-create"
      }
    });
    expect(adminCreated.statusCode).toBe(200);
    expect(adminCreated.json().thread).toMatchObject({
      status: "SUPPRESSED",
      visibleToApplicant: false,
      subject: "Application query"
    });

    const applicantCreated = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/messages",
      payload: {
        episodeId: episode.episodeId,
        subject: "Applicant Mystery query",
        body: "Applicant should not see operational Mystery metadata.",
        idempotencyKey: "communications-mystery-applicant-create"
      }
    });
    expect(applicantCreated.statusCode).toBe(200);
    expect(applicantCreated.json().thread.status).toBe("SUPPRESSED");
    expect(JSON.stringify(applicantCreated.json())).not.toContain("visibleToApplicant");
    expect(JSON.stringify(applicantCreated.json())).not.toContain("participantActorIds");
    expect(JSON.stringify(applicantCreated.json())).not.toContain("senderActorId");

    const applicantListing = await app.inject({ method: "GET", url: "/api/v1/applicant/messages" });
    expect(applicantListing.statusCode).toBe(200);
    expect(applicantListing.json().threads.map((thread: { threadId: string }) => thread.threadId)).not.toContain(adminCreated.json().thread.threadId);
    expect(applicantListing.json().threads.map((thread: { threadId: string }) => thread.threadId)).not.toContain(applicantCreated.json().thread.threadId);

    const adminListing = await app.inject({ method: "GET", url: "/api/v1/admin/messages" });
    expect(adminListing.statusCode).toBe(200);
    expect(adminListing.json().threads.map((thread: { threadId: string }) => thread.threadId)).toEqual(
      expect.arrayContaining([adminCreated.json().thread.threadId, applicantCreated.json().thread.threadId])
    );
    const suppressions = await pool.query<{ count: string }>(
      "SELECT count(*) FROM notification_suppressions WHERE reason = 'mystery_redaction' AND related_entity_type = 'message_thread' AND related_entity_id IN ($1, $2)",
      [adminCreated.json().thread.threadId, applicantCreated.json().thread.threadId]
    );
    expect(suppressions.rows[0]?.count).toBe("2");
  });

  it("uses current DB visibility state across independently initialized communications runtimes", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const episode = await seedAllocationEpisode(pool, "FULL_ASSESSMENT");
    const applicantSession = structuredClone(parkManagerSessionFixture);
    applicantSession.actor.scopes = [{ type: "PARK", id: episode.parkId }];
    applicantSession.roleAssignments = [{ ...applicantSession.roleAssignments[0]!, scope: { type: "PARK", id: episode.parkId } }];
    const appA = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, unitOfWork, ledger),
      resolveSession: async () => applicantSession,
      auditLedger: ledger,
      productionLike: true
    });
    const created = await appA.inject({
      method: "POST",
      url: "/api/v1/applicant/messages",
      payload: {
        episodeId: episode.episodeId,
        subject: "Visibility race",
        body: "Visible before DB-side suppression.",
        idempotencyKey: "communications-visibility-race"
      }
    });
    expect(created.statusCode).toBe(200);
    const threadId = created.json().thread.threadId;

    await pool.query(
      "UPDATE message_threads SET visible_to_applicant = false, status = 'SUPPRESSED', version = version + 1, updated_at_utc = now() WHERE id = $1",
      [threadId]
    );
    const unitOfWorkB = createUnitOfWork(pool);
    const appB = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, unitOfWorkB, new PostgresAuditLedger(pool, unitOfWorkB)),
      resolveSession: async () => applicantSession,
      productionLike: true
    });
    const listing = await appB.inject({ method: "GET", url: "/api/v1/applicant/messages" });
    expect(listing.statusCode).toBe(200);
    expect(listing.json().threads.map((thread: { threadId: string }) => thread.threadId)).not.toContain(threadId);
  });

  it("rolls back communications domain writes when audit append fails", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const episode = await seedAllocationEpisode(pool, "FULL_ASSESSMENT");
    const failingLedger = {
      async append() {
        throw new Error("forced communications audit failure");
      }
    };
    const app = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, unitOfWork, failingLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: failingLedger,
      productionLike: true
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/messages",
      payload: {
        episodeId: episode.episodeId,
        subject: "Rollback communications",
        body: "This should roll back.",
        idempotencyKey: "communications-audit-rollback"
      }
    });
    expect(response.statusCode).toBe(500);
    const rows = await pool.query<{ count: string }>(
      "SELECT count(*) FROM message_threads WHERE assessment_episode_id = $1 AND subject = 'Rollback communications'",
      [episode.episodeId]
    );
    expect(rows.rows[0]?.count).toBe("0");
  });

  it("persists held Full Assessment decisions across cold starts and publishes through batch release", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const episode = await seedSubmittedResultEpisode(pool, "results-full-held", "FULL_ASSESSMENT", true);
    const applicantSession = structuredClone(parkManagerSessionFixture);
    applicantSession.actor.scopes = [{ type: "PARK", id: episode.parkId }];
    applicantSession.roleAssignments = [{ ...applicantSession.roleAssignments[0]!, scope: { type: "PARK", id: episode.parkId } }];
    const app = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, unitOfWork, ledger),
      resolveSession: async (request) => request.url.includes("/api/v1/applicant/") ? applicantSession : globalAdminSessionFixture,
      auditLedger: ledger,
      productionLike: true
    });

    const held = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${episode.episodeId}/hold`,
      payload: {
        thresholdAcknowledged: true,
        internalNotes: "DB-first internal result note.",
        idempotencyKey: "results-full-hold-0001"
      }
    });
    expect(held.statusCode).toBe(200);
    expect(held.json().decision).toMatchObject({
      status: "CONFIRMED_HELD",
      outcome: "THRESHOLD_MET",
      assessmentCount: 1,
      thresholdAcknowledged: true
    });

    const coldUnitOfWork = createUnitOfWork(pool);
    const coldApp = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, coldUnitOfWork, new PostgresAuditLedger(pool, coldUnitOfWork)),
      resolveSession: async (request) => request.url.includes("/api/v1/applicant/") ? applicantSession : globalAdminSessionFixture,
      productionLike: true
    });
    const adminDetail = await coldApp.inject({ method: "GET", url: `/api/v1/admin/results/${episode.episodeId}` });
    expect(adminDetail.statusCode).toBe(200);
    expect(adminDetail.json().decision.status).toBe("CONFIRMED_HELD");
    expect(adminDetail.json().assessments[0]).toMatchObject({ status: "SUBMITTED" });

    const singleRelease = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
      payload: {
        releaseMode: "single",
        idempotencyKey: "results-full-single-denied"
      }
    });
    expect(singleRelease.statusCode).toBe(409);

    const published = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
      payload: {
        releaseMode: "full_batch",
        idempotencyKey: "results-full-publish-0001"
      }
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().decision.status).toBe("PUBLISHED");
    expect(published.json().artifacts[0]).toMatchObject({ artifactType: "certificate_shell", publicVisible: true });
    expect(published.json().awardCache).toMatchObject({ resultStatus: "PUBLISHED", displayLabel: "Award published" });
    expect(published.json().publicMapEvent).toMatchObject({ eventType: "award_published", payload: { published: true } });
    const publicMapPayload = JSON.stringify(published.json().publicMapEvent.payload);
    expect(publicMapPayload).not.toContain("rawScore");
    expect(publicMapPayload).not.toContain("judge");
    expect(publicMapPayload).not.toContain("visit");
    expect(publicMapPayload).not.toContain("storage");

    const replayedPublish = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
      payload: {
        releaseMode: "full_batch",
        idempotencyKey: "results-full-publish-0001"
      }
    });
    expect(replayedPublish.statusCode).toBe(200);
    expect(replayedPublish.json().decision.status).toBe("PUBLISHED");
    expect(replayedPublish.json().artifacts[0].artifactId).toBe(published.json().artifacts[0].artifactId);
    expect(replayedPublish.json().publicMapEvent.eventId).toBe(published.json().publicMapEvent.eventId);

    const applicant = await app.inject({ method: "GET", url: `/api/v1/applicant/results/${episode.episodeId}` });
    expect(applicant.statusCode).toBe(200);
    expect(applicant.json()).toMatchObject({ status: "published", displayLabel: "Award published" });
    const applicantPayload = JSON.stringify(applicant.json());
    expect(applicantPayload).not.toContain("rawScore");
    expect(applicantPayload).not.toContain("judge");
    expect(applicantPayload).not.toContain("assignment");
    expect(applicantPayload).not.toContain("internal");
    expect(applicantPayload).not.toContain("storageKey");
    expect(applicantPayload).not.toContain("MYSTERY");

    const rows = await Promise.all([
      pool.query<{ count: string }>("SELECT count(*) FROM result_artifacts WHERE decision_result_id = $1", [held.json().decision.decisionId]),
      pool.query<{ count: string }>("SELECT count(*) FROM public_map_update_events WHERE decision_result_id = $1 AND event_type = 'award_published'", [held.json().decision.decisionId]),
      pool.query<{ count: string }>("SELECT count(*) FROM audit_events WHERE entity_id = $1 AND action IN ('HOLD_DECISION_RESULT', 'PUBLISH_DECISION_RESULT')", [held.json().decision.decisionId])
    ]);
    expect(rows[0].rows[0]?.count).toBe("1");
    expect(rows[1].rows[0]?.count).toBe("1");
    expect(rows[2].rows[0]?.count).toBe("2");
  });

  it("publishes Mystery decisions individually and keeps public/applicant payloads Mystery-safe", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const episode = await seedSubmittedResultEpisode(pool, "results-mystery", "MYSTERY_SHOP", false);
    const applicantSession = structuredClone(parkManagerSessionFixture);
    applicantSession.actor.scopes = [{ type: "PARK", id: episode.parkId }];
    applicantSession.roleAssignments = [{ ...applicantSession.roleAssignments[0]!, scope: { type: "PARK", id: episode.parkId } }];
    const app = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, unitOfWork, ledger),
      resolveSession: async (request) => request.url.includes("/api/v1/applicant/") ? applicantSession : globalAdminSessionFixture,
      auditLedger: ledger,
      productionLike: true
    });

    const held = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${episode.episodeId}/hold`,
      payload: {
        thresholdAcknowledged: true,
        reason: "Below threshold acknowledged for lower-env test.",
        idempotencyKey: "results-mystery-hold-0001"
      }
    });
    expect(held.statusCode).toBe(200);
    expect(held.json().decision).toMatchObject({ status: "CONFIRMED_HELD", outcome: "THRESHOLD_NOT_MET", thresholdMet: false });

    const batch = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
      payload: {
        releaseMode: "full_batch",
        idempotencyKey: "results-mystery-batch-denied"
      }
    });
    expect(batch.statusCode).toBe(409);

    const published = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
      payload: {
        releaseMode: "single",
        idempotencyKey: "results-mystery-publish-0001"
      }
    });
    expect(published.statusCode).toBe(200);
    const eventPayload = JSON.stringify(published.json().publicMapEvent.payload);
    expect(eventPayload).toContain(episode.parkId);
    expect(eventPayload).not.toContain("MYSTERY");
    expect(eventPayload).not.toContain("visit");
    expect(eventPayload).not.toContain("assessment");
    expect(eventPayload).not.toContain("rawScore");

    const applicant = await app.inject({ method: "GET", url: `/api/v1/applicant/results/${episode.episodeId}` });
    expect(applicant.statusCode).toBe(200);
    expect(JSON.stringify(applicant.json())).not.toContain("MYSTERY");
    expect(JSON.stringify(applicant.json())).not.toContain("rawScore");
  });

  it("prevents double publication across independent results runtimes and rolls back on audit failure", async () => {
    const episode = await seedSubmittedResultEpisode(pool, "results-concurrency", "FULL_ASSESSMENT", true);
    const firstUnitOfWork = createUnitOfWork(pool);
    const firstLedger = new PostgresAuditLedger(pool, firstUnitOfWork);
    const firstApp = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, firstUnitOfWork, firstLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: firstLedger,
      productionLike: true
    });
    const held = await firstApp.inject({
      method: "POST",
      url: `/api/v1/admin/results/${episode.episodeId}/hold`,
      payload: {
        thresholdAcknowledged: true,
        idempotencyKey: "results-concurrent-hold"
      }
    });
    expect(held.statusCode).toBe(200);

    const secondUnitOfWork = createUnitOfWork(pool);
    const secondLedger = new PostgresAuditLedger(pool, secondUnitOfWork);
    const appA = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, firstUnitOfWork, firstLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: firstLedger,
      productionLike: true
    });
    const appB = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, secondUnitOfWork, secondLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: secondLedger,
      productionLike: true
    });
    const [publishA, publishB] = await Promise.all([
      appA.inject({
        method: "POST",
        url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
        payload: { releaseMode: "full_batch", idempotencyKey: "results-concurrent-publish-a" }
      }),
      appB.inject({
        method: "POST",
        url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
        payload: { releaseMode: "full_batch", idempotencyKey: "results-concurrent-publish-b" }
      })
    ]);
    expect([publishA.statusCode, publishB.statusCode].sort()).toEqual([200, 409]);
    const sideEffects = await Promise.all([
      pool.query<{ count: string }>("SELECT count(*) FROM result_artifacts WHERE decision_result_id = $1", [held.json().decision.decisionId]),
      pool.query<{ count: string }>("SELECT count(*) FROM public_map_update_events WHERE decision_result_id = $1 AND event_type = 'award_published'", [held.json().decision.decisionId])
    ]);
    expect(sideEffects[0].rows[0]?.count).toBe("1");
    expect(sideEffects[1].rows[0]?.count).toBe("1");

    const rollbackEpisode = await seedSubmittedResultEpisode(pool, "results-audit-rollback", "FULL_ASSESSMENT", true);
    const failingLedger = {
      async append() {
        throw new Error("forced results audit failure");
      }
    };
    const failingApp = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, createUnitOfWork(pool), failingLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: failingLedger,
      productionLike: true
    });
    const failedHold = await failingApp.inject({
      method: "POST",
      url: `/api/v1/admin/results/${rollbackEpisode.episodeId}/hold`,
      payload: {
        thresholdAcknowledged: true,
        idempotencyKey: "results-audit-rollback-hold"
      }
    });
    expect(failedHold.statusCode).toBe(500);
    const heldRows = await pool.query<{ count: string }>("SELECT count(*) FROM decision_results WHERE assessment_episode_id = $1", [rollbackEpisode.episodeId]);
    expect(heldRows.rows[0]?.count).toBe("0");

    const publishRollbackEpisode = await seedSubmittedResultEpisode(pool, "results-publish-audit-rollback", "FULL_ASSESSMENT", true);
    const publishRollbackUnitOfWork = createUnitOfWork(pool);
    const publishRollbackLedger = new PostgresAuditLedger(pool, publishRollbackUnitOfWork);
    const publishRollbackApp = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, publishRollbackUnitOfWork, publishRollbackLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: publishRollbackLedger,
      productionLike: true
    });
    const rollbackHeld = await publishRollbackApp.inject({
      method: "POST",
      url: `/api/v1/admin/results/${publishRollbackEpisode.episodeId}/hold`,
      payload: {
        thresholdAcknowledged: true,
        idempotencyKey: "results-publish-rollback-hold"
      }
    });
    expect(rollbackHeld.statusCode).toBe(200);
    const publishFailingLedger = {
      async append() {
        throw new Error("forced results publish audit failure");
      }
    };
    const publishFailingApp = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, createUnitOfWork(pool), publishFailingLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: publishFailingLedger,
      productionLike: true
    });
    const failedPublish = await publishFailingApp.inject({
      method: "POST",
      url: `/api/v1/admin/results/${rollbackHeld.json().decision.decisionId}/publish`,
      payload: {
        releaseMode: "full_batch",
        idempotencyKey: "results-publish-audit-rollback"
      }
    });
    expect(failedPublish.statusCode).toBe(500);
    const publishRollbackRows = await Promise.all([
      pool.query<{ status: string }>("SELECT status FROM decision_results WHERE id = $1", [rollbackHeld.json().decision.decisionId]),
      pool.query<{ count: string }>("SELECT count(*) FROM result_artifacts WHERE decision_result_id = $1", [rollbackHeld.json().decision.decisionId]),
      pool.query<{ count: string }>("SELECT count(*) FROM public_map_update_events WHERE decision_result_id = $1 AND event_type = 'award_published'", [rollbackHeld.json().decision.decisionId]),
      pool.query<{ count: string }>("SELECT count(*) FROM park_award_cache WHERE decision_result_id = $1", [rollbackHeld.json().decision.decisionId])
    ]);
    expect(publishRollbackRows[0].rows[0]?.status).toBe("CONFIRMED_HELD");
    expect(publishRollbackRows[1].rows[0]?.count).toBe("0");
    expect(publishRollbackRows[2].rows[0]?.count).toBe("0");
    expect(publishRollbackRows[3].rows[0]?.count).toBe("0");
  });

  it("withdraws published results and enqueues a withdrawal public map event", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const episode = await seedSubmittedResultEpisode(pool, "results-withdraw", "FULL_ASSESSMENT", true);
    const applicantSession = structuredClone(parkManagerSessionFixture);
    applicantSession.actor.scopes = [{ type: "PARK", id: episode.parkId }];
    applicantSession.roleAssignments = [{ ...applicantSession.roleAssignments[0]!, scope: { type: "PARK", id: episode.parkId } }];
    const app = buildApp({
      resultsRepository: new PostgresResultsRepository(pool, unitOfWork, ledger),
      resolveSession: async (request) => request.url.includes("/api/v1/applicant/") ? applicantSession : globalAdminSessionFixture,
      auditLedger: ledger,
      productionLike: true
    });
    const held = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${episode.episodeId}/hold`,
      payload: { thresholdAcknowledged: true, idempotencyKey: "results-withdraw-hold" }
    });
    const published = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
      payload: { releaseMode: "full_batch", idempotencyKey: "results-withdraw-publish" }
    });
    expect(published.statusCode).toBe(200);
    const withdrawn = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${held.json().decision.decisionId}/withdraw`,
      payload: {
        reason: "Publication withdrawn during lower-env integration verification.",
        idempotencyKey: "results-withdraw-command"
      }
    });
    expect(withdrawn.statusCode).toBe(200);
    expect(withdrawn.json().decision.status).toBe("WITHDRAWN");
    expect(withdrawn.json().publicMapEvent).toMatchObject({ eventType: "award_withdrawn", payload: { published: false } });
    const applicant = await app.inject({ method: "GET", url: `/api/v1/applicant/results/${episode.episodeId}` });
    expect(applicant.statusCode).toBe(200);
    expect(applicant.json()).toMatchObject({ status: "withdrawn", displayLabel: "Result withdrawn" });
    const cache = await pool.query<{ count: string }>("SELECT count(*) FROM park_award_cache WHERE park_id = $1", [episode.parkId]);
    expect(cache.rows[0]?.count).toBe("0");
  });

  it("writes audit events for converted notification dispatch and renewal reminder commands", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const notificationId = randomUUID();
    await pool.query(
      `
        INSERT INTO notification_queue (
          id, template_key, channel, recipient_actor_id, recipient_address_marker,
          status, related_entity_type, related_entity_id, created_at_utc, updated_at_utc
        )
        VALUES ($1, 'integration_dispatch', 'email', $2, 'provider_address_deferred', 'QUEUED', 'integration_test', $3, now(), now())
      `,
      [notificationId, globalAdminSessionFixture.actor.actorId, notificationId]
    );

    const app = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, unitOfWork, ledger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: ledger,
      productionLike: true
    });

    const dispatch = await app.inject({
      method: "POST",
      url: `/api/v1/admin/notifications/${notificationId}/dispatch-stub`
    });
    expect(dispatch.statusCode).toBe(200);

    const reminders = await app.inject({
      method: "POST",
      url: "/api/v1/admin/jobs/renewal-reminders/run",
      payload: {
        cycleYear: lowerEnvironmentAwardCycle2026Fixture.cycleYear,
        idempotencyKey: "communications-renewal-audit-positive"
      }
    });
    expect(reminders.statusCode).toBe(200);
    const jobRunId = reminders.json().jobRun.jobRunId;

    const dispatchAudit = await pool.query<{ count: string }>(
      "SELECT count(*) FROM audit_events WHERE entity_id = $1 AND action = 'DISPATCH_NOTIFICATION_STUB'",
      [notificationId]
    );
    expect(dispatchAudit.rows[0]?.count).toBe("1");

    const reminderAudit = await pool.query<{ count: string }>(
      "SELECT count(*) FROM audit_events WHERE entity_id = $1 AND action = 'RUN_RENEWAL_REMINDERS'",
      [jobRunId]
    );
    expect(reminderAudit.rows[0]?.count).toBe("1");
  });

  it("suppresses renewal reminder and export duplicates on retry", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    const app = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, unitOfWork, ledger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: ledger,
      productionLike: true
    });

    const remindersA = await app.inject({
      method: "POST",
      url: "/api/v1/admin/jobs/renewal-reminders/run",
      payload: {
        cycleYear: 2120,
        idempotencyKey: "communications-renewal-retry"
      }
    });
    const remindersB = await app.inject({
      method: "POST",
      url: "/api/v1/admin/jobs/renewal-reminders/run",
      payload: {
        cycleYear: 2120,
        idempotencyKey: "communications-renewal-retry"
      }
    });
    expect(remindersA.statusCode).toBe(200);
    expect(remindersB.statusCode).toBe(200);
    expect(remindersB.json().jobRun.jobRunId).toBe(remindersA.json().jobRun.jobRunId);
    expect(remindersB.json().queuedNotifications[0].notificationId).toBe(remindersA.json().queuedNotifications[0].notificationId);
    const reminderRows = await Promise.all([
      pool.query<{ count: string }>("SELECT count(*) FROM job_runs WHERE dedupe_key = $1", ["renewal_reminders:job:idempotency:communications-renewal-retry"]),
      pool.query<{ count: string }>("SELECT count(*) FROM notification_queue WHERE dedupe_key = $1", ["renewal_reminders:notification:idempotency:communications-renewal-retry"])
    ]);
    expect(reminderRows[0].rows[0]?.count).toBe("1");
    expect(reminderRows[1].rows[0]?.count).toBe("1");

    const exportA = await app.inject({
      method: "POST",
      url: "/api/v1/admin/exports",
      payload: {
        exportType: "payments",
        format: "csv",
        idempotencyKey: "communications-export-retry"
      }
    });
    const exportB = await app.inject({
      method: "POST",
      url: "/api/v1/admin/exports",
      payload: {
        exportType: "payments",
        format: "csv",
        idempotencyKey: "communications-export-retry"
      }
    });
    expect(exportA.statusCode).toBe(200);
    expect(exportB.statusCode).toBe(200);
    expect(exportB.json().exportJob.exportId).toBe(exportA.json().exportJob.exportId);
    const exportRows = await pool.query<{ count: string }>(
      "SELECT count(*) FROM export_jobs WHERE dedupe_key = $1",
      [`export:${globalAdminSessionFixture.actor.actorId}:payments:csv:communications-export-retry`]
    );
    expect(exportRows.rows[0]?.count).toBe("1");
    const financeExportRows = await pool.query<{ count: string; export_type: string; status: string }>(
      `
        SELECT count(*)::text AS count, max(export_type) AS export_type, max(status) AS status
        FROM finance_export_runs
        WHERE export_job_id = $1
      `,
      [exportA.json().exportJob.exportId]
    );
    expect(financeExportRows.rows[0]).toMatchObject({
      count: "1",
      export_type: "payment_csv",
      status: "generated"
    });
  });

  it("rolls back dispatch-stub notification and log rows when audit append fails", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const notificationId = randomUUID();
    const failingLedger = {
      async append() {
        throw new Error("forced dispatch audit failure");
      }
    };
    await pool.query(
      `
        INSERT INTO notification_queue (
          id, template_key, channel, recipient_actor_id, recipient_address_marker,
          status, related_entity_type, related_entity_id, created_at_utc, updated_at_utc
        )
        VALUES ($1, 'integration_dispatch_rollback', 'email', $2, 'provider_address_deferred', 'QUEUED', 'integration_test', $3, now(), now())
      `,
      [notificationId, globalAdminSessionFixture.actor.actorId, notificationId]
    );

    const app = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, unitOfWork, failingLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: failingLedger,
      productionLike: true
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/notifications/${notificationId}/dispatch-stub`
    });
    expect(response.statusCode).toBe(500);

    const notification = await pool.query<{ status: string }>("SELECT status FROM notification_queue WHERE id = $1", [notificationId]);
    expect(notification.rows[0]?.status).toBe("QUEUED");
    const logs = await pool.query<{ count: string }>("SELECT count(*) FROM notification_logs WHERE notification_id = $1", [notificationId]);
    expect(logs.rows[0]?.count).toBe("0");
  });

  it("rolls back renewal reminder notification and job rows when audit append fails", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const failingLedger = {
      async append() {
        throw new Error("forced renewal audit failure");
      }
    };

    const app = buildApp({
      communicationsRepository: new PostgresCommunicationsRepository(pool, unitOfWork, failingLedger),
      resolveSession: async () => globalAdminSessionFixture,
      auditLedger: failingLedger,
      productionLike: true
    });
    const notificationsBefore = await pool.query<{ count: string }>(
      "SELECT count(*) FROM notification_queue WHERE template_key = 'renewal_reminder' AND recipient_actor_id = $1 AND related_entity_type = 'award_cycle'",
      [globalAdminSessionFixture.actor.actorId]
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/jobs/renewal-reminders/run",
      payload: {
        cycleYear: 2099,
        idempotencyKey: "communications-renewal-audit-rollback"
      }
    });
    expect(response.statusCode).toBe(500);

    const notifications = await pool.query<{ count: string }>(
      "SELECT count(*) FROM notification_queue WHERE template_key = 'renewal_reminder' AND recipient_actor_id = $1 AND related_entity_type = 'award_cycle'",
      [globalAdminSessionFixture.actor.actorId]
    );
    expect(notifications.rows[0]?.count).toBe(notificationsBefore.rows[0]?.count);
    const jobs = await pool.query<{ count: string }>(
      "SELECT count(*) FROM job_runs WHERE job_type = 'renewal_reminders' AND detail = 'Lower-env renewal reminder queue run for 2099.'"
    );
    expect(jobs.rows[0]?.count).toBe("0");
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
