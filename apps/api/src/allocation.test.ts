import { describe, expect, it } from "vitest";
import {
  applicationDraftFixture,
  assessorSelfProfileFixture,
  globalAdminSessionFixture,
  judgeSessionFixture,
  parkManagerSessionFixture
} from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { createApplicantStore } from "./applicant.js";
import { createAllocationStore } from "./allocation.js";
import { createAssessorStore } from "./assessor.js";

function buildAllocationApp(resolveSession = async () => globalAdminSessionFixture) {
  const applicantStore = createApplicantStore();
  const assessorStore = createAssessorStore();
  const allocationStore = createAllocationStore();
  applicantStore.episodeStatuses.set(applicationDraftFixture.episodeId, "READY_FOR_ALLOCATION");
  return {
    app: buildApp({
      applicantStore,
      assessorStore,
      allocationStore,
      resolveSession
    }),
    applicantStore,
    assessorStore,
    allocationStore
  };
}

describe("allocation workflow slice api", () => {
  it("lists ready episodes and candidates with configurable COI and rotation flags", async () => {
    const { app, allocationStore } = buildAllocationApp();
    allocationStore.rotationFlagAssessorIds.add(assessorSelfProfileFixture.profile.assessorId);

    const ready = await app.inject({
      method: "GET",
      url: "/api/v1/admin/allocations/ready-episodes"
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().items[0]).toMatchObject({
      episodeId: applicationDraftFixture.episodeId,
      episodeStatus: "READY_FOR_ALLOCATION",
      suggestedJudgeCount: 2,
      allocationStatus: "not_started"
    });

    const candidates = await app.inject({
      method: "GET",
      url: `/api/v1/admin/allocations/${applicationDraftFixture.episodeId}/candidates`
    });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json()).toMatchObject({
      suggestedJudgeCount: 2,
      excludedCandidateCount: 0,
      policy: {
        source: "configurable_lower_env"
      }
    });
    expect(candidates.json().candidates[0].flags[0]).toMatchObject({
      type: "rotation",
      requiresAcknowledgement: true
    });
  });

  it("holds, releases, and accepts allocation assignments with audit and override events", async () => {
    let activeSession: typeof globalAdminSessionFixture = globalAdminSessionFixture;
    const { app, applicantStore, allocationStore } = buildAllocationApp(async () => activeSession);
    allocationStore.rotationFlagAssessorIds.add(assessorSelfProfileFixture.profile.assessorId);

    const unacknowledged = await app.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${applicationDraftFixture.episodeId}/hold`,
      payload: {
        assessorIds: [assessorSelfProfileFixture.profile.assessorId],
        finalJudgeCount: 1,
        reason: "Lower-env single judge override.",
        idempotencyKey: "allocation-hold-0001"
      }
    });
    expect(unacknowledged.statusCode).toBe(409);
    expect(applicantStore.episodeStatuses.get(applicationDraftFixture.episodeId)).toBe("READY_FOR_ALLOCATION");

    const held = await app.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${applicationDraftFixture.episodeId}/hold`,
      payload: {
        assessorIds: [assessorSelfProfileFixture.profile.assessorId],
        finalJudgeCount: 1,
        reason: "Lower-env single judge override.",
        acknowledgedFlagTypes: ["rotation"],
        idempotencyKey: "allocation-hold-0001"
      }
    });
    expect(held.statusCode).toBe(200);
    expect(held.json()).toMatchObject({
      status: "HELD",
      finalJudgeCount: 1
    });
    expect(held.json().overrideEventIds).toHaveLength(1);
    expect(allocationStore.overrideEvents[0]).toMatchObject({
      overrideType: "JUDGE_COUNT_OVERRIDE",
      reason: "Lower-env single judge override."
    });
    expect(applicantStore.episodeStatuses.get(applicationDraftFixture.episodeId)).toBe("ALLOCATED_HELD");

    const replayHold = await app.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${applicationDraftFixture.episodeId}/hold`,
      payload: {
        assessorIds: [assessorSelfProfileFixture.profile.assessorId],
        finalJudgeCount: 1,
        reason: "Lower-env single judge override.",
        acknowledgedFlagTypes: ["rotation"],
        idempotencyKey: "allocation-hold-0001"
      }
    });
    expect(replayHold.statusCode).toBe(200);
    expect(replayHold.json().allocationId).toBe(held.json().allocationId);
    expect(allocationStore.audits.filter((event) => event.action === "HOLD_ALLOCATION")).toHaveLength(1);

    activeSession = judgeSessionFixture;
    const heldAssignments = await app.inject({
      method: "GET",
      url: "/api/v1/assessor/assignments"
    });
    expect(heldAssignments.statusCode).toBe(200);
    expect(heldAssignments.json().items).toEqual([]);

    activeSession = globalAdminSessionFixture;
    const released = await app.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${held.json().allocationId}/release`,
      payload: {
        releaseMode: "now",
        idempotencyKey: "allocation-release-0001"
      }
    });
    expect(released.statusCode).toBe(200);
    expect(released.json()).toMatchObject({
      status: "RELEASED",
      notificationIntents: ["assignment_release_email_batch"],
      contactRevealAvailable: false
    });
    expect(applicantStore.episodeStatuses.get(applicationDraftFixture.episodeId)).toBe("ALLOCATED_RELEASED");

    const replayRelease = await app.inject({
      method: "POST",
      url: `/api/v1/admin/allocations/${held.json().allocationId}/release`,
      payload: {
        releaseMode: "now",
        idempotencyKey: "allocation-release-0001"
      }
    });
    expect(replayRelease.statusCode).toBe(200);
    expect(allocationStore.audits.filter((event) => event.action === "RELEASE_ALLOCATION")).toHaveLength(1);

    activeSession = judgeSessionFixture;
    const assignments = await app.inject({
      method: "GET",
      url: "/api/v1/assessor/assignments"
    });
    expect(assignments.statusCode).toBe(200);
    expect(assignments.json().items[0]).toMatchObject({
      status: "RELEASED",
      contactRevealAvailable: false
    });
    expect(assignments.json().items[0]).not.toHaveProperty("contact");

    const accepted = await app.inject({
      method: "POST",
      url: `/api/v1/assessor/assignments/${assignments.json().items[0].assignmentId}/accept`,
      payload: {
        clientVersion: assignments.json().items[0].version,
        idempotencyKey: "allocation-accept-0001"
      }
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().assignment).toMatchObject({
      status: "ACCEPTED",
      contactRevealAvailable: true
    });
  });

  it("enforces allocation admin scope boundaries", async () => {
    const wrongCountryAdmin: typeof globalAdminSessionFixture = {
      ...globalAdminSessionFixture,
      actor: {
        ...globalAdminSessionFixture.actor,
        role: "KBT_ADMIN",
        scopes: [{ type: "COUNTRY", id: "01010101-0101-4101-8101-010101010101" }]
      },
      roleAssignments: [{
        ...globalAdminSessionFixture.roleAssignments[0]!,
        role: "KBT_ADMIN",
        scope: { type: "COUNTRY", id: "01010101-0101-4101-8101-010101010101" }
      }]
    };

    const applicantAttempt = buildAllocationApp(async () => parkManagerSessionFixture);
    const applicantReady = await applicantAttempt.app.inject({
      method: "GET",
      url: "/api/v1/admin/allocations/ready-episodes"
    });
    expect(applicantReady.statusCode).toBe(403);

    const scopedAttempt = buildAllocationApp(async () => wrongCountryAdmin);
    const scopedReady = await scopedAttempt.app.inject({
      method: "GET",
      url: "/api/v1/admin/allocations/ready-episodes"
    });
    expect(scopedReady.statusCode).toBe(200);
    expect(scopedReady.json().items).toEqual([]);

    const scopedCandidates = await scopedAttempt.app.inject({
      method: "GET",
      url: `/api/v1/admin/allocations/${applicationDraftFixture.episodeId}/candidates`
    });
    expect(scopedCandidates.statusCode).toBe(403);
  });
});
