import { describe, expect, it } from "vitest";
import {
  applicationDraftFixture,
  assessmentSubmittedFixture,
  globalAdminSessionFixture,
  parkManagerSessionFixture
} from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { createApplicantStore } from "./applicant.js";
import { createAssessmentStore } from "./assessment.js";
import { createResultsStore } from "./results.js";

function buildResultsApp() {
  const applicantStore = createApplicantStore();
  const assessmentStore = createAssessmentStore();
  const resultsStore = createResultsStore();
  const submittedAssessment = {
    ...assessmentSubmittedFixture.assessment,
    episodeId: applicationDraftFixture.episodeId
  };
  assessmentStore.assessments.set(submittedAssessment.assessmentId, submittedAssessment);
  let activeSession: typeof globalAdminSessionFixture = globalAdminSessionFixture;
  const app = buildApp({
    applicantStore,
    assessmentStore,
    resultsStore,
    resolveSession: async () => activeSession
  });
  return {
    app,
    resultsStore,
    applicantStore,
    setSession(session: typeof globalAdminSessionFixture) {
      activeSession = session;
    }
  };
}

describe("decisions, results, certificates, and public map event slice api", () => {
  it("holds and publishes an episode-first result with applicant-safe projection", async () => {
    const { app, resultsStore, applicantStore, setSession } = buildResultsApp();

    const held = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${applicationDraftFixture.episodeId}/hold`,
      payload: {
        thresholdAcknowledged: true,
        internalNotes: "Synthetic admin decision note.",
        idempotencyKey: "decision-hold-0001"
      }
    });
    expect(held.statusCode).toBe(200);
    expect(held.json().decision).toMatchObject({
      status: "CONFIRMED_HELD",
      outcome: "THRESHOLD_MET",
      thresholdAcknowledged: true
    });
    expect(applicantStore.episodeStatuses.get(applicationDraftFixture.episodeId)).toBe("RESULT_CONFIRMED_HELD");

    const admin = await app.inject({
      method: "GET",
      url: `/api/v1/admin/results/${applicationDraftFixture.episodeId}`
    });
    expect(admin.statusCode).toBe(200);
    expect(admin.json().assessments[0]).toMatchObject({ status: "SUBMITTED" });

    const published = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
      payload: {
        releaseMode: "full_batch",
        idempotencyKey: "decision-publish-0001"
      }
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().decision.status).toBe("PUBLISHED");
    expect(published.json().artifacts[0]).toMatchObject({
      artifactType: "certificate_shell",
      storageProvider: "lower_env_stub"
    });
    expect(published.json().publicMapEvent).toMatchObject({
      eventType: "award_published",
      status: "PENDING"
    });
    expect(resultsStore.audits.map((event) => event.action)).toEqual(expect.arrayContaining([
      "HOLD_DECISION_RESULT",
      "PUBLISH_DECISION_RESULT"
    ]));

    setSession(parkManagerSessionFixture);
    const applicant = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/results/${applicationDraftFixture.episodeId}`
    });
    expect(applicant.statusCode).toBe(200);
    expect(applicant.json()).toMatchObject({
      status: "published",
      displayLabel: "Award published"
    });
    expect(JSON.stringify(applicant.json())).not.toContain("rawScoreTotal");
    expect(JSON.stringify(applicant.json())).not.toContain("Synthetic admin decision note");
  });

  it("requires submitted assessments before holding a decision", async () => {
    const applicantStore = createApplicantStore();
    const assessmentStore = createAssessmentStore();
    const app = buildApp({
      applicantStore,
      assessmentStore,
      resultsStore: createResultsStore(),
      resolveSession: async () => globalAdminSessionFixture
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${applicationDraftFixture.episodeId}/hold`,
      payload: {
        thresholdAcknowledged: true,
        idempotencyKey: "decision-hold-0002"
      }
    });
    expect(response.statusCode).toBe(409);
  });
});
