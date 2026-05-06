import { dirname, resolve } from "node:path";
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
  assessorSelfProfileFixture,
  currentManagementPlanDocumentFixture,
  globalAdminRoleAssignmentFixture,
  globalAdminSessionFixture,
  internalUserSummaryFixture,
  judgeRoleAssignmentFixture,
  judgeSessionFixture,
  lowerEnvironmentParkCycleSnapshotFixture,
  parkManagerRoleAssignmentFixture,
  paymentSummaryFixture,
  pendingInvoiceFixture,
  scopedAdminRoleAssignmentFixture,
  scopedAdminSessionFixture
} from "@green-flag/contracts";
import { PostgresAuditLedger } from "./postgres-runtime.js";
import { createPostgresDomainStores } from "./postgres-domain-stores.js";

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

  it("round-trips Slices 3-8 domain stores through table-specific PostgreSQL payload columns", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const stores = await createPostgresDomainStores({ client: pool, unitOfWork });
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
    expect(rehydrated.applicantStore.applications.get(applicationDraftFixture.applicationId)?.version).toBe(applicationDraftFixture.version);
    expect(rehydrated.applicantStore.documents.get(currentManagementPlanDocumentFixture.documentId)?.visibility).toBe("APPLICANT_AND_ADMIN");
    expect(rehydrated.applicantStore.payments.get(pendingInvoiceFixture.invoiceId)?.invoice.status).toBe("PENDING");
    expect(rehydrated.assessorStore.profiles.get("20202020-2020-4202-8202-202020202020")?.profileStatus).toBe("ACTIVE");
  });

  it("rolls back audit and domain work in one UnitOfWork transaction", async () => {
    const unitOfWork = createUnitOfWork(pool);
    const ledger = new PostgresAuditLedger(pool, unitOfWork);
    await expect(unitOfWork.run(async () => {
      await ledger.append({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        actor: globalAdminSessionFixture.actor,
        action: "ROLLBACK_TEST",
        entityType: "integration_test",
        request: { requestId: "rollback-request" },
        createdAt: "2026-05-06T00:00:00.000Z"
      });
      throw new Error("force rollback");
    })).rejects.toThrow("force rollback");

    const result = await pool.query<{ count: string }>("SELECT count(*) FROM audit_events WHERE action = 'ROLLBACK_TEST'");
    expect(result.rows[0]?.count).toBe("0");
  });
});
