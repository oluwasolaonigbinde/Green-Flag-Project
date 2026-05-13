import { describe, expect, it } from "vitest";
import {
  applicationDraftFixture,
  assessmentSubmittedFixture,
  globalAdminSessionFixture,
  parkManagerSessionFixture,
  scopedAdminSessionFixture,
  sessionProfileSchema
} from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { createApplicantStore } from "./applicant.js";
import { createAssessmentStore } from "./assessment.js";
import { createCommunicationsStore } from "./communications.js";
import { createResultsStore } from "./results.js";
import type { SessionProfile } from "./auth.js";

function buildHardeningApp(initialSession: SessionProfile = globalAdminSessionFixture) {
  const applicantStore = createApplicantStore();
  const assessmentStore = createAssessmentStore();
  const resultsStore = createResultsStore();
  const communicationsStore = createCommunicationsStore();
  const submittedAssessment = {
    ...assessmentSubmittedFixture.assessment,
    episodeId: applicationDraftFixture.episodeId
  };
  assessmentStore.assessments.set(submittedAssessment.assessmentId, submittedAssessment);
  let activeSession = initialSession;
  const app = buildApp({
    applicantStore,
    assessmentStore,
    resultsStore,
    communicationsStore,
    resolveSession: async () => activeSession
  });
  return {
    app,
    setSession(session: SessionProfile) {
      activeSession = session;
    }
  };
}

describe("S14 production readiness hardening", () => {
  it("fails closed on applicant access to admin-only communication and result surfaces", async () => {
    const { app, setSession } = buildHardeningApp();

    setSession(parkManagerSessionFixture);

    const notifications = await app.inject({
      method: "GET",
      url: "/api/v1/admin/notifications/queue"
    });
    expect(notifications.statusCode).toBe(403);

    const exportJob = await app.inject({
      method: "POST",
      url: "/api/v1/admin/exports",
      payload: {
        exportType: "results",
        format: "csv",
        idempotencyKey: "hardening-applicant-export"
      }
    });
    expect(exportJob.statusCode).toBe(403);

    const adminResult = await app.inject({
      method: "GET",
      url: `/api/v1/admin/results/${applicationDraftFixture.episodeId}`
    });
    expect(adminResult.statusCode).toBe(403);
  });

  it("keeps applicant result projections free of assessment, score, and internal decision detail", async () => {
    const { app, setSession } = buildHardeningApp();

    const held = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${applicationDraftFixture.episodeId}/hold`,
      payload: {
        thresholdAcknowledged: true,
        internalNotes: "Do not expose this internal decision note.",
        idempotencyKey: "hardening-result-hold"
      }
    });
    expect(held.statusCode).toBe(200);

    const published = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${held.json().decision.decisionId}/publish`,
      payload: {
        releaseMode: "full_batch",
        idempotencyKey: "hardening-result-publish"
      }
    });
    expect(published.statusCode).toBe(200);

    setSession(parkManagerSessionFixture);
    const applicant = await app.inject({
      method: "GET",
      url: `/api/v1/applicant/results/${applicationDraftFixture.episodeId}`
    });
    expect(applicant.statusCode).toBe(200);
    const payload = JSON.stringify(applicant.json());
    expect(payload).toContain("Award published");
    expect(payload).not.toContain("rawScoreTotal");
    expect(payload).not.toContain("maxScoreTotal");
    expect(payload).not.toContain("thresholdMet");
    expect(payload).not.toContain("THRESHOLD_MET");
    expect(payload).not.toContain("internalNotes");
    expect(payload).not.toContain("Do not expose this internal decision note.");
    expect(payload).not.toContain("assessment");
  });

  it("suppresses Mystery applicant message content and metadata from applicant listings", async () => {
    const { app, setSession } = buildHardeningApp({
      ...parkManagerSessionFixture,
      actor: {
        ...parkManagerSessionFixture.actor,
        redactionProfile: "applicant_mystery"
      }
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/messages",
      payload: {
        episodeId: applicationDraftFixture.episodeId,
        subject: "Mystery visit date and assessor query",
        body: "Assessor identity and visit timing must not be listed back to applicant surfaces.",
        idempotencyKey: "hardening-mystery-message"
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().thread.status).toBe("SUPPRESSED");
    expect(JSON.stringify(created.json())).not.toContain("visibleToApplicant");
    expect(JSON.stringify(created.json())).not.toContain("participantActorIds");
    expect(JSON.stringify(created.json())).not.toContain("senderActorId");

    const listing = await app.inject({
      method: "GET",
      url: "/api/v1/applicant/messages"
    });
    expect(listing.statusCode).toBe(200);
    expect(listing.json()).toMatchObject({ threads: [], messages: [] });
    const payload = JSON.stringify(listing.json());
    expect(payload).not.toContain("Mystery visit date");
    expect(payload).not.toContain("Assessor identity");
    expect(payload).not.toContain("visit timing");

    setSession(globalAdminSessionFixture);
    const adminListing = await app.inject({
      method: "GET",
      url: "/api/v1/admin/messages"
    });
    expect(adminListing.statusCode).toBe(200);
    expect(adminListing.json().threads).toHaveLength(1);
    expect(adminListing.json().threads[0]).toMatchObject({
      subject: "Application query",
      status: "SUPPRESSED"
    });
  });

  it("does not expose operational metadata in applicant message listings", async () => {
    const { app, setSession } = buildHardeningApp(parkManagerSessionFixture);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/messages",
      payload: {
        episodeId: applicationDraftFixture.episodeId,
        subject: "Application question",
        body: "Applicant-safe body.",
        idempotencyKey: "hardening-safe-message"
      }
    });
    expect(created.statusCode).toBe(200);

    const listing = await app.inject({ method: "GET", url: "/api/v1/applicant/messages" });
    expect(listing.statusCode).toBe(200);
    const payload = JSON.stringify(listing.json());
    expect(payload).toContain("Application question");
    expect(payload).not.toContain("participantActorIds");
    expect(payload).not.toContain("senderActorId");
    expect(payload).not.toContain("visibleToApplicant");
    expect(payload).not.toContain("suppressionReason");

    setSession(globalAdminSessionFixture);
    const adminListing = await app.inject({ method: "GET", url: "/api/v1/admin/messages" });
    expect(adminListing.statusCode).toBe(200);
    expect(JSON.stringify(adminListing.json())).toContain("participantActorIds");
  });

  it("denies read-only viewer representative mutations", async () => {
    const readOnlySession = sessionProfileSchema.parse({
      ...parkManagerSessionFixture,
      actor: {
        ...parkManagerSessionFixture.actor,
        role: "READ_ONLY_VIEWER" as const
      },
      roleAssignments: [{
        ...parkManagerSessionFixture.roleAssignments[0]!,
        role: "READ_ONLY_VIEWER" as const
      }]
    });
    const { app } = buildHardeningApp(readOnlySession);

    const message = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/messages",
      payload: {
        episodeId: applicationDraftFixture.episodeId,
        subject: "No mutation",
        body: "Denied",
        idempotencyKey: "hardening-read-only-message"
      }
    });
    expect(message.statusCode).toBe(403);

    const resultHold = await app.inject({
      method: "POST",
      url: `/api/v1/admin/results/${applicationDraftFixture.episodeId}/hold`,
      payload: {
        thresholdAcknowledged: true,
        idempotencyKey: "hardening-read-only-hold"
      }
    });
    expect(resultHold.statusCode).toBe(403);
  });

  it("prevents mixed-role users from combining unrelated role and scope tuples", async () => {
    const mixedSession = sessionProfileSchema.parse({
      ...scopedAdminSessionFixture,
      actor: {
        ...scopedAdminSessionFixture.actor,
        role: "KBT_ADMIN" as const,
        scopes: [
          { type: "COUNTRY" as const, id: "00000000-0000-4000-8000-000000000000" },
          parkManagerSessionFixture.roleAssignments[0]!.scope
        ]
      },
      roleAssignments: [
        {
          ...scopedAdminSessionFixture.roleAssignments[0]!,
          scope: { type: "COUNTRY" as const, id: "00000000-0000-4000-8000-000000000000" }
        },
        parkManagerSessionFixture.roleAssignments[0]!
      ]
    });
    const { app } = buildHardeningApp(mixedSession);

    const adminResult = await app.inject({
      method: "GET",
      url: `/api/v1/admin/results/${applicationDraftFixture.episodeId}`
    });
    expect(adminResult.statusCode).toBe(403);
  });

  it("keeps finance admins out of non-finance communication listings and exports", async () => {
    const financeSession = sessionProfileSchema.parse({
      ...globalAdminSessionFixture,
      actor: {
        ...globalAdminSessionFixture.actor,
        role: "FINANCE_ADMIN" as const,
        scopes: [{ type: "GLOBAL" as const }]
      },
      roleAssignments: [{
        ...globalAdminSessionFixture.roleAssignments[0]!,
        role: "FINANCE_ADMIN" as const
      }]
    });
    const { app, setSession } = buildHardeningApp(globalAdminSessionFixture);
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/messages",
      payload: {
        episodeId: applicationDraftFixture.episodeId,
        subject: "Operational message",
        body: "Not finance-visible.",
        idempotencyKey: "hardening-admin-message"
      }
    });

    setSession(financeSession);
    const messages = await app.inject({ method: "GET", url: "/api/v1/admin/messages" });
    expect(messages.statusCode).toBe(200);
    expect(messages.json().threads).toHaveLength(0);

    const exportJob = await app.inject({
      method: "POST",
      url: "/api/v1/admin/exports",
      payload: {
        exportType: "results",
        format: "csv",
        idempotencyKey: "hardening-finance-results-export"
      }
    });
    expect(exportJob.statusCode).toBe(403);
  });
});
