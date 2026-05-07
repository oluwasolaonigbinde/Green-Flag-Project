import { describe, expect, it } from "vitest";
import {
  applicationDraftFixture,
  globalAdminSessionFixture,
  parkManagerSessionFixture
} from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { createApplicantStore } from "./applicant.js";
import { createCommunicationsStore } from "./communications.js";

function buildCommunicationsApp() {
  const applicantStore = createApplicantStore();
  const communicationsStore = createCommunicationsStore();
  let activeSession: typeof globalAdminSessionFixture = globalAdminSessionFixture;
  const app = buildApp({
    applicantStore,
    communicationsStore,
    resolveSession: async () => activeSession
  });
  return {
    app,
    communicationsStore,
    setSession(session: typeof globalAdminSessionFixture) {
      activeSession = session;
    }
  };
}

describe("notifications messaging jobs exports slice api", () => {
  it("queues renewal reminders, dispatch-stubs notifications, creates messages, and exports without providers", async () => {
    const { app, communicationsStore, setSession } = buildCommunicationsApp();

    const job = await app.inject({
      method: "POST",
      url: "/api/v1/admin/jobs/renewal-reminders/run",
      payload: {
        cycleYear: 2026,
        idempotencyKey: "renewal-reminders-0001"
      }
    });
    expect(job.statusCode).toBe(200);
    expect(job.json().jobRun).toMatchObject({
      jobType: "renewal_reminders",
      status: "COMPLETED",
      processedCount: 1
    });
    const notificationId = job.json().queuedNotifications[0].notificationId;

    const dispatched = await app.inject({
      method: "POST",
      url: `/api/v1/admin/notifications/${notificationId}/dispatch-stub`
    });
    expect(dispatched.statusCode).toBe(200);
    expect(dispatched.json().log).toMatchObject({
      provider: "adapter_not_configured",
      status: "DISPATCH_STUBBED"
    });

    const adminMessage = await app.inject({
      method: "POST",
      url: "/api/v1/admin/messages",
      payload: {
        episodeId: applicationDraftFixture.episodeId,
        subject: "Admin application query",
        body: "Synthetic lower-env admin message.",
        idempotencyKey: "admin-message-0001"
      }
    });
    expect(adminMessage.statusCode).toBe(200);
    expect(adminMessage.json().thread.visibleToApplicant).toBe(true);

    const exportJob = await app.inject({
      method: "POST",
      url: "/api/v1/admin/exports",
      payload: {
        exportType: "results",
        format: "csv",
        idempotencyKey: "export-results-0001"
      }
    });
    expect(exportJob.statusCode).toBe(200);
    expect(exportJob.json().exportJob).toMatchObject({
      status: "COMPLETED",
      storageProvider: "lower_env_stub"
    });
    expect(communicationsStore.audits.map((event) => event.action)).toEqual(expect.arrayContaining([
      "CREATE_ADMIN_MESSAGE_THREAD",
      "CREATE_EXPORT_JOB"
    ]));

    setSession(parkManagerSessionFixture);
    const applicantMessages = await app.inject({ method: "GET", url: "/api/v1/applicant/messages" });
    expect(applicantMessages.statusCode).toBe(200);
    expect(applicantMessages.json().threads).toHaveLength(1);
  });

  it("suppresses applicant Mystery message surfaces server-side", async () => {
    const { app, setSession } = buildCommunicationsApp();
    setSession({
      ...parkManagerSessionFixture,
      actor: {
        ...parkManagerSessionFixture.actor,
        redactionProfile: "applicant_mystery"
      }
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/applicant/messages",
      payload: {
        episodeId: applicationDraftFixture.episodeId,
        subject: "Mystery visit question",
        body: "This should not leak to applicant surfaces.",
        idempotencyKey: "mystery-message-0001"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().thread).toMatchObject({
      status: "SUPPRESSED",
      visibleToApplicant: false
    });

    const listing = await app.inject({ method: "GET", url: "/api/v1/applicant/messages" });
    expect(listing.statusCode).toBe(200);
    expect(listing.json().threads).toHaveLength(0);
    expect(JSON.stringify(listing.json())).not.toContain("Mystery visit question");
  });
});
