import { describe, expect, it } from "vitest";
import {
  assessorSelfProfileFixture,
  globalAdminSessionFixture,
  judgeSessionFixture,
  parkManagerSessionFixture
} from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { createAssessorStore } from "./assessor.js";

describe("assessor profile and management slice api", () => {
  it("returns assessor self-profile and records preference, availability, and capacity updates", async () => {
    const assessorStore = createAssessorStore();
    const app = buildApp({
      assessorStore,
      resolveSession: async () => judgeSessionFixture
    });

    const profile = await app.inject({
      method: "GET",
      url: "/api/v1/assessor/profile"
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({
      assignmentLoadDeferred: true,
      visitScheduleDeferred: true,
      profile: {
        accreditationProvider: "external_value_unavailable"
      }
    });
    expect(JSON.stringify(profile.json())).not.toContain("MYSTERY_SHOP");

    const preferences = await app.inject({
      method: "PATCH",
      url: "/api/v1/assessor/profile/preferences",
      payload: {
        clientVersion: assessorSelfProfileFixture.profile.version,
        idempotencyKey: "assessor-preferences-0001",
        preferences: {
          preferredRegions: ["North West", "Yorkshire"],
          preferredAwardTrackCodes: ["STANDARD_GREEN_FLAG"],
          unavailableNotes: "Synthetic preference update.",
          acceptsMysteryShop: false
        }
      }
    });
    expect(preferences.statusCode).toBe(200);
    expect(preferences.json().profile.version).toBe(2);

    const availability = await app.inject({
      method: "PATCH",
      url: "/api/v1/assessor/profile/availability",
      payload: {
        clientVersion: 2,
        idempotencyKey: "assessor-availability-0001",
        availability: [
          {
            availabilityId: "28282828-2828-4282-8282-282828282828",
            startsAt: "2026-05-20T09:00:00Z",
            endsAt: "2026-05-20T17:00:00Z",
            availabilityType: "available",
            notes: "Synthetic availability update."
          }
        ]
      }
    });
    expect(availability.statusCode).toBe(200);
    expect(availability.json().profile.availability[0]).toMatchObject({
      assessorId: assessorSelfProfileFixture.profile.assessorId,
      availabilityType: "available"
    });

    const capacity = await app.inject({
      method: "PATCH",
      url: "/api/v1/assessor/profile/capacity",
      payload: {
        clientVersion: 3,
        idempotencyKey: "assessor-capacity-0001",
        capacity: [
          {
            capacityId: "29292929-2929-4292-8292-292929292929",
            cycleYear: 2026,
            maxAssignments: 10,
            currentAssignedCount: 0,
            capacityStatus: "available"
          }
        ]
      }
    });
    expect(capacity.statusCode).toBe(200);
    expect(capacity.json().profile.capacity[0]).toMatchObject({
      assessorId: assessorSelfProfileFixture.profile.assessorId,
      maxAssignments: 10
    });
    expect(assessorStore.audits.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "UPDATE_ASSESSOR_PREFERENCES",
        "UPDATE_ASSESSOR_AVAILABILITY",
        "UPDATE_ASSESSOR_CAPACITY"
      ])
    );
  });

  it("lets admins manage assessor profiles without allocation behavior", async () => {
    const assessorStore = createAssessorStore();
    const app = buildApp({
      assessorStore,
      resolveSession: async () => globalAdminSessionFixture
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/assessors?capacityStatus=available"
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0]).toMatchObject({
      accreditationStatus: "CURRENT_LOWER_ENV",
      capacityStatus: "available"
    });

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/admin/assessors/${assessorSelfProfileFixture.profile.assessorId}`
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      allocationCandidateGenerationAvailable: false,
      providerSyncStatus: "external_value_unavailable"
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/assessors",
      payload: {
        internalUserId: "30303030-3030-4303-8303-303030303030",
        displayName: "Second Lower Env Judge",
        email: "second.judge@example.invalid",
        profileStatus: "PENDING_PROFILE_COMPLETION",
        accreditationStatus: "EXTERNAL_VALUE_UNAVAILABLE",
        primaryRegion: "Wales",
        idempotencyKey: "admin-create-assessor-0001"
      }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().profile).toMatchObject({
      accreditationProvider: "external_value_unavailable",
      primaryRegion: "Wales"
    });

    const disabled = await app.inject({
      method: "POST",
      url: `/api/v1/admin/assessors/${created.json().profile.assessorId}/disable`,
      payload: {
        reason: "Lower-env disable test.",
        idempotencyKey: "admin-disable-assessor-0001"
      }
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().profile.profileStatus).toBe("INACTIVE");
    expect(assessorStore.audits.map((event) => event.action)).toEqual(
      expect.arrayContaining(["CREATE_ASSESSOR_PROFILE", "DISABLE_ASSESSOR_PROFILE"])
    );
    expect(JSON.stringify(detail.json())).not.toContain("candidateId");
  });

  it("rejects applicants from assessor/admin assessor endpoints", async () => {
    const app = buildApp({
      assessorStore: createAssessorStore(),
      resolveSession: async () => parkManagerSessionFixture
    });

    const self = await app.inject({
      method: "GET",
      url: "/api/v1/assessor/profile"
    });
    expect(self.statusCode).toBe(403);

    const admin = await app.inject({
      method: "GET",
      url: "/api/v1/admin/assessors"
    });
    expect(admin.statusCode).toBe(403);
  });
});
