import { describe, expect, it } from "vitest";
import {
  applicationDraftFixture,
  assessorSelfProfileFixture,
  globalAdminSessionFixture,
  judgeSessionFixture,
  type AssignmentStatus
} from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { createApplicantStore } from "./applicant.js";
import { createAllocationStore } from "./allocation.js";
import { createAssessmentStore } from "./assessment.js";
import { createAssessorStore } from "./assessor.js";

function buildAssessmentApp() {
  const applicantStore = createApplicantStore();
  const allocationStore = createAllocationStore();
  const assessmentStore = createAssessmentStore();
  const assessorStore = createAssessorStore();
  const assignmentId = "53535353-5353-4535-8535-535353535353";
  const allocationId = "54545454-5454-4545-8545-545454545454";
  allocationStore.allocations.set(allocationId, {
    allocationId,
    episodeId: applicationDraftFixture.episodeId,
    status: "RELEASED",
    finalJudgeCount: 1,
    suggestedJudgeCount: 1,
    contactRevealAvailable: true,
    notificationIntents: ["assignment_release_email_batch"],
    auditEventId: "55555555-5555-4555-8555-555555555555",
    overrideEventIds: [],
    assignments: [
      {
        assignmentId,
        allocationId,
        episodeId: applicationDraftFixture.episodeId,
        assessorId: assessorSelfProfileFixture.profile.assessorId,
        status: "ACCEPTED" as AssignmentStatus,
        contactRevealAvailable: true,
        version: 1,
        updatedAt: "2026-05-20T08:00:00Z"
      }
    ]
  });
  let activeSession: typeof globalAdminSessionFixture = judgeSessionFixture;
  const app = buildApp({
    applicantStore,
    assessorStore,
    allocationStore,
    assessmentStore,
    resolveSession: async () => activeSession
  });
  return {
    app,
    assessmentStore,
    setSession(session: typeof globalAdminSessionFixture) {
      activeSession = session;
    },
    assignmentId
  };
}

describe("visits and configurable assessment scoring slice api", () => {
  it("schedules a visit, records scores/evidence, submits, and exposes admin detail", async () => {
    const { app, assessmentStore, setSession, assignmentId } = buildAssessmentApp();

    const scheduled = await app.inject({
      method: "POST",
      url: `/api/v1/assessor/visits/${assignmentId}/schedule`,
      payload: {
        scheduledStartAt: "2026-05-20T09:00:00Z",
        scheduledEndAt: "2026-05-20T11:00:00Z",
        clientVersion: 0,
        idempotencyKey: "schedule-visit-0001"
      }
    });
    expect(scheduled.statusCode).toBe(200);
    expect(scheduled.json()).toMatchObject({
      status: "SCHEDULED",
      locationDisclosure: "visible_to_assessor_only"
    });

    const visits = await app.inject({ method: "GET", url: "/api/v1/assessor/visits" });
    expect(visits.statusCode).toBe(200);
    expect(visits.json().items).toHaveLength(1);

    const opened = await app.inject({
      method: "GET",
      url: `/api/v1/assessor/assessments/${assignmentId}`
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json().assessment.template.source).toBe("configurable_lower_env");
    expect(JSON.stringify(opened.json())).not.toContain("official");

    const criteria = opened.json().assessment.template.criteria;
    const scored = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessor/assessments/${opened.json().assessment.assessmentId}/scores`,
      payload: {
        clientVersion: opened.json().assessment.version,
        offlineSyncVersion: 1,
        idempotencyKey: "assessment-scores-0001",
        scores: criteria.map((criterion: { criterionId: string }) => ({
          criterionId: criterion.criterionId,
          score: 8
        }))
      }
    });
    expect(scored.statusCode).toBe(200);
    expect(scored.json().assessment).toMatchObject({
      status: "IN_PROGRESS",
      rawScoreTotal: 16,
      thresholdMet: true
    });

    const evidence = await app.inject({
      method: "POST",
      url: `/api/v1/assessor/assessments/${opened.json().assessment.assessmentId}/evidence`,
      payload: {
        evidenceType: "photo",
        filename: "lower-env-evidence.jpg",
        idempotencyKey: "assessment-evidence-0001"
      }
    });
    expect(evidence.statusCode).toBe(200);
    expect(evidence.json().assessment.evidence[0]).toMatchObject({
      storageProvider: "lower_env_stub",
      visibility: "admin_and_assessor"
    });

    const submitted = await app.inject({
      method: "POST",
      url: `/api/v1/assessor/assessments/${opened.json().assessment.assessmentId}/submit`,
      payload: {
        clientVersion: evidence.json().assessment.version,
        idempotencyKey: "assessment-submit-0001"
      }
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().assessment.status).toBe("SUBMITTED");
    expect(assessmentStore.audits.map((event) => event.action)).toEqual(expect.arrayContaining([
      "SCHEDULE_ASSESSMENT_VISIT",
      "UPDATE_ASSESSMENT_SCORES",
      "ADD_ASSESSMENT_EVIDENCE",
      "SUBMIT_ASSESSMENT"
    ]));

    setSession(globalAdminSessionFixture);
    const admin = await app.inject({
      method: "GET",
      url: `/api/v1/admin/assessments/${applicationDraftFixture.episodeId}`
    });
    expect(admin.statusCode).toBe(200);
    expect(admin.json()).toMatchObject({
      applicantSafeProjectionAvailable: false
    });
  });
});
