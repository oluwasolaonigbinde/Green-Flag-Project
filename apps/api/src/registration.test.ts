import { describe, expect, it } from "vitest";
import {
  globalAdminSessionFixture,
  registrationSubmissionRequestFixture
} from "@green-flag/contracts";
import { buildApp } from "./app.js";
import { createRegistrationStore } from "./registration.js";

describe("registration slice api", () => {
  it("submits an eligible registration with duplicate acknowledgement and audit", async () => {
    const store = createRegistrationStore();
    const app = buildApp({ registrationStore: store });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/registrations",
      headers: {
        "idempotency-key": "registration-idempotency-key-0001"
      },
      payload: registrationSubmissionRequestFixture
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "PENDING_VERIFICATION",
      duplicateWarning: {
        hasPotentialDuplicate: true,
        acknowledged: true
      },
      verificationRequired: true
    });
    expect(store.audits.map((event) => event.action)).toContain("SUBMIT_REGISTRATION");
  });

  it("blocks eligibility failure before verification", async () => {
    const app = buildApp({ registrationStore: createRegistrationStore() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/registrations",
      payload: {
        ...registrationSubmissionRequestFixture,
        parkName: "Ineligible Lower Environment Site",
        postcode: "IF1 1AA",
        duplicateAcknowledged: false,
        eligibility: {
          publiclyAccessible: false,
          freeToEnter: true,
          minimumSizeConfirmed: false
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "ELIGIBILITY_FAILED",
      eligibility: {
        eligible: false,
        failedCriteria: ["publicly_accessible", "minimum_size"]
      },
      verificationRequired: false
    });
  });

  it("requires duplicate acknowledgement", async () => {
    const app = buildApp({ registrationStore: createRegistrationStore() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/registrations",
      payload: {
        ...registrationSubmissionRequestFixture,
        duplicateAcknowledged: false
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "conflict"
      }
    });
  });

  it("verifies email and exposes the admin review queue only to admins", async () => {
    const store = createRegistrationStore();
    const app = buildApp({
      registrationStore: store,
      resolveSession: async () => globalAdminSessionFixture
    });

    const submit = await app.inject({
      method: "POST",
      url: "/api/v1/registrations",
      payload: registrationSubmissionRequestFixture
    });
    const registrationId = submit.json().registrationId;
    const verify = await app.inject({
      method: "POST",
      url: `/api/v1/registrations/${registrationId}/verify-email`,
      payload: {
        token: "lower-env-verification-token"
      }
    });

    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toMatchObject({
      status: "VERIFIED_PENDING_REVIEW",
      emailVerified: true,
      nextStep: "admin_review"
    });

    const queue = await app.inject({
      method: "GET",
      url: "/api/v1/admin/registration-review-queue"
    });

    expect(queue.statusCode).toBe(200);
    expect(queue.json().items).toHaveLength(1);
    expect(store.audits.map((event) => event.action)).toContain("VERIFY_REGISTRATION_EMAIL");
  });

  it("approves and rejects through audited admin decisions", async () => {
    const store = createRegistrationStore();
    const app = buildApp({
      registrationStore: store,
      resolveSession: async () => globalAdminSessionFixture
    });

    const submit = await app.inject({
      method: "POST",
      url: "/api/v1/registrations",
      payload: {
        ...registrationSubmissionRequestFixture,
        parkName: "Fresh Approval Park",
        postcode: "FA1 1AA",
        duplicateAcknowledged: false
      }
    });
    const registrationId = submit.json().registrationId;
    await app.inject({
      method: "POST",
      url: `/api/v1/registrations/${registrationId}/verify-email`,
      payload: {
        token: "lower-env-verification-token"
      }
    });

    const approval = await app.inject({
      method: "POST",
      url: `/api/v1/admin/registration-review-queue/${registrationId}/approve`
    });

    expect(approval.statusCode).toBe(200);
    expect(approval.json()).toMatchObject({
      registrationStatus: "APPROVED",
      parkStatus: "ACTIVE"
    });
    expect(store.audits.map((event) => event.action)).toContain("APPROVE_REGISTRATION");
  });

  it("returns mock location enrichment that requires applicant confirmation", async () => {
    const store = createRegistrationStore();
    const app = buildApp({ registrationStore: store });
    const submit = await app.inject({
      method: "POST",
      url: "/api/v1/registrations",
      payload: registrationSubmissionRequestFixture
    });

    const lookup = await app.inject({
      method: "POST",
      url: `/api/v1/registrations/${submit.json().registrationId}/location-lookup`,
      payload: registrationSubmissionRequestFixture.location
    });

    expect(lookup.statusCode).toBe(200);
    expect(lookup.json()).toMatchObject({
      source: "ons_geography_mock",
      requiresApplicantConfirmation: true
    });
  });
});
