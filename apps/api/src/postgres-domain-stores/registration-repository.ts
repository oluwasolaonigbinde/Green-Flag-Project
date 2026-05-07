import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { SqlClient, UnitOfWork } from "@green-flag/db";
import {
  actorContextSchema,
  adminRegistrationReviewQueueResponseSchema,
  parkActivationResponseSchema,
  registrationLocationSuggestionSchema,
  registrationSubmissionResponseSchema,
  registrationSummarySchema,
  type RegistrationStatus
} from "@green-flag/contracts";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile } from "../auth.js";

type RegistrationRecord = {
  registrationId: string;
  parkName: string;
  organisationName: string;
  contactEmail: string;
  submittedAt: string;
  status: RegistrationStatus;
  eligibility: {
    eligible: boolean;
    failedCriteria: Array<"publicly_accessible" | "free_to_enter" | "minimum_size">;
  };
  duplicateWarning: {
    hasPotentialDuplicate: boolean;
    matchedFields: Array<"park_name" | "postcode" | "address">;
    acknowledged: boolean;
  };
  token: string;
  parkId?: string;
};

type RegistrationRow = {
  id: string;
  park_id: string | null;
  status: string;
  park_name: string;
  organisation_name: string;
  contact_email: string;
  publicly_accessible: boolean;
  free_to_enter: boolean;
  minimum_size_confirmed: boolean;
  duplicate_warning_state: string;
  duplicate_matched_fields: string[];
  submitted_at_utc: Date | string;
  token_hash: string | null;
};

const publicRegistrationActor = actorContextSchema.parse({
  actorId: "00000000-0000-4000-8000-000000000003",
  cognitoSubject: "public-registration",
  role: "SYSTEM",
  scopes: [{ type: "GLOBAL" }],
  redactionProfile: "public_result"
});

export interface PostgresRegistrationRepositoryOptions {
  allowStaticLowerEnvVerificationToken?: boolean;
}

const lowerEnvVerificationTokenPrefix = "lower-env-verification-token:";

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function generateVerificationToken(allowStaticLowerEnvVerificationToken: boolean, registrationId: string) {
  if (allowStaticLowerEnvVerificationToken) {
    return `${lowerEnvVerificationTokenPrefix}${registrationId}`;
  }
  return `registration-verification-token:${randomBytes(32).toString("base64url")}`;
}

function verificationTokenMatches({
  providedToken,
  storedToken,
  allowStaticLowerEnvVerificationToken
}: {
  providedToken: string;
  storedToken: string;
  allowStaticLowerEnvVerificationToken: boolean;
}) {
  if (providedToken === storedToken) {
    return true;
  }
  return (
    allowStaticLowerEnvVerificationToken &&
    providedToken === "lower-env-verification-token" &&
    storedToken.startsWith(lowerEnvVerificationTokenPrefix)
  );
}

function requestMetadata(request: FastifyRequest, idempotencyKey?: string) {
  return {
    requestId: request.id,
    idempotencyKey,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  };
}

function buildAuditEvent({
  action,
  entityId,
  actor,
  request,
  beforeState,
  afterState,
  reason
}: {
  action: string;
  entityId?: string;
  actor: SessionProfile["actor"];
  request: ReturnType<typeof requestMetadata>;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | undefined;
}): AuditEvent {
  return {
    id: randomUUID(),
    actor,
    action,
    entityType: "registration_submission",
    entityId,
    beforeState,
    afterState,
    request,
    reason,
    createdAt: new Date().toISOString()
  };
}

function evaluateEligibility(input: {
  publiclyAccessible: boolean;
  freeToEnter: boolean;
  minimumSizeConfirmed: boolean;
}) {
  const failedCriteria: RegistrationRecord["eligibility"]["failedCriteria"] = [];
  if (!input.publiclyAccessible) failedCriteria.push("publicly_accessible");
  if (!input.freeToEnter) failedCriteria.push("free_to_enter");
  if (!input.minimumSizeConfirmed) failedCriteria.push("minimum_size");
  return {
    eligible: failedCriteria.length === 0,
    failedCriteria
  };
}

function detectDuplicate(input: {
  parkName: string;
  postcode?: string | undefined;
  duplicateAcknowledged: boolean;
}) {
  const matchedFields: RegistrationRecord["duplicateWarning"]["matchedFields"] = [];
  if (/lower environment park/i.test(input.parkName)) matchedFields.push("park_name");
  if (input.postcode?.toUpperCase() === "LE1 2AB") matchedFields.push("postcode");
  return {
    hasPotentialDuplicate: matchedFields.length > 0,
    matchedFields,
    acknowledged: matchedFields.length === 0 ? false : input.duplicateAcknowledged
  };
}

function duplicateState(record: RegistrationRecord) {
  if (!record.duplicateWarning.hasPotentialDuplicate) return "NONE";
  return record.duplicateWarning.acknowledged ? "ACKNOWLEDGED" : "WARNING_REQUIRES_ACK";
}

function rowToRecord(row: RegistrationRow): RegistrationRecord {
  const failedCriteria: RegistrationRecord["eligibility"]["failedCriteria"] = [];
  if (!row.publicly_accessible) failedCriteria.push("publicly_accessible");
  if (!row.free_to_enter) failedCriteria.push("free_to_enter");
  if (!row.minimum_size_confirmed) failedCriteria.push("minimum_size");
  return {
    registrationId: row.id,
    parkName: row.park_name,
    organisationName: row.organisation_name,
    contactEmail: row.contact_email,
    submittedAt: iso(row.submitted_at_utc),
    status: row.status as RegistrationStatus,
    eligibility: {
      eligible: failedCriteria.length === 0,
      failedCriteria
    },
    duplicateWarning: {
      hasPotentialDuplicate: row.duplicate_warning_state !== "NONE",
      matchedFields: row.duplicate_matched_fields as RegistrationRecord["duplicateWarning"]["matchedFields"],
      acknowledged: row.duplicate_warning_state === "ACKNOWLEDGED"
    },
    token: row.token_hash ?? "",
    ...(row.park_id ? { parkId: row.park_id } : {})
  };
}

async function findRegistration(client: SqlClient, registrationId: string, lock = false) {
  const result = await client.query<RegistrationRow>(
    `
      SELECT rs.id, rs.park_id, rs.status, rs.park_name, rs.organisation_name, rs.contact_email,
        rs.publicly_accessible, rs.free_to_enter, rs.minimum_size_confirmed,
        rs.duplicate_warning_state, rs.duplicate_matched_fields, rs.submitted_at_utc,
        rvt.token_hash
      FROM registration_submissions rs
      LEFT JOIN LATERAL (
        SELECT token_hash
        FROM registration_verification_tokens
        WHERE registration_submission_id = rs.id
        ORDER BY created_at_utc DESC
        LIMIT 1
      ) rvt ON true
      WHERE rs.id = $1
      ${lock ? "FOR UPDATE OF rs" : ""}
    `,
    [registrationId]
  );
  return result.rows[0] ? rowToRecord(result.rows[0]) : null;
}

export interface RegistrationRepository {
  submit(input: {
    body: {
      parkName: string;
      organisationName: string;
      contactName: string;
      contactEmail: string;
      addressLine1: string;
      town: string;
      postcode?: string | undefined;
      country: string;
      eligibility: {
        publiclyAccessible: boolean;
        freeToEnter: boolean;
        minimumSizeConfirmed: boolean;
      };
      duplicateAcknowledged: boolean;
      location: unknown;
    };
    idempotencyKey?: string | undefined;
    request: FastifyRequest;
  }): Promise<unknown>;
  getSummary(registrationId: string): Promise<unknown>;
  recordLocationLookup(input: { registrationId: string; body: unknown; request: FastifyRequest }): Promise<unknown>;
  verifyEmail(input: { registrationId: string; token: string; request: FastifyRequest }): Promise<unknown>;
  listPendingReview(): Promise<unknown>;
  approve(input: { registrationId: string; actor: SessionProfile["actor"]; request: FastifyRequest; idempotencyKey?: string | undefined }): Promise<unknown>;
  reject(input: { registrationId: string; actor: SessionProfile["actor"]; request: FastifyRequest; idempotencyKey?: string | undefined; reason?: string | undefined }): Promise<unknown>;
}

export class PostgresRegistrationRepository implements RegistrationRepository {
  private readonly allowStaticLowerEnvVerificationToken: boolean;

  constructor(
    private readonly client: SqlClient,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditLedger: AuditLedger,
    options: PostgresRegistrationRepositoryOptions = {}
  ) {
    this.allowStaticLowerEnvVerificationToken = options.allowStaticLowerEnvVerificationToken === true;
  }

  async submit({ body, idempotencyKey, request }: Parameters<RegistrationRepository["submit"]>[0]) {
    const eligibility = evaluateEligibility(body.eligibility);
    const duplicateWarning = detectDuplicate({
      parkName: body.parkName,
      postcode: body.postcode,
      duplicateAcknowledged: body.duplicateAcknowledged
    });
    if (duplicateWarning.hasPotentialDuplicate && !duplicateWarning.acknowledged) {
      throw new ApiError("conflict", 409, "Potential duplicate park requires acknowledgement.", {
        duplicateWarning
      });
    }

    const existing = await this.client.query<RegistrationRow>(
      `
        SELECT rs.id, rs.park_id, rs.status, rs.park_name, rs.organisation_name, rs.contact_email,
          rs.publicly_accessible, rs.free_to_enter, rs.minimum_size_confirmed,
          rs.duplicate_warning_state, rs.duplicate_matched_fields, rs.submitted_at_utc,
          rvt.token_hash
        FROM registration_submissions rs
        LEFT JOIN LATERAL (
          SELECT token_hash
          FROM registration_verification_tokens
          WHERE registration_submission_id = rs.id
          ORDER BY created_at_utc DESC
          LIMIT 1
        ) rvt ON true
        WHERE rs.contact_email = $1 AND rs.park_name = $2
        ORDER BY rs.submitted_at_utc ASC
        LIMIT 1
      `,
      [body.contactEmail, body.parkName]
    );
    if (existing.rows[0] && idempotencyKey) {
      const record = rowToRecord(existing.rows[0]);
      return registrationSubmissionResponseSchema.parse({
        registrationId: record.registrationId,
        status: record.status,
        eligibility: record.eligibility,
        duplicateWarning: record.duplicateWarning,
        verificationRequired: record.status === "PENDING_VERIFICATION",
        notificationIntents: ["registration_verification_email"]
      });
    }

    const registrationId = randomUUID();
    const submittedAt = new Date().toISOString();
    const status: RegistrationStatus = eligibility.eligible ? "PENDING_VERIFICATION" : "ELIGIBILITY_FAILED";
    const record: RegistrationRecord = {
      registrationId,
      parkName: body.parkName,
      organisationName: body.organisationName,
      contactEmail: body.contactEmail,
      submittedAt,
      status,
      eligibility,
      duplicateWarning,
      token: generateVerificationToken(this.allowStaticLowerEnvVerificationToken, registrationId)
    };

    await this.unitOfWork.run(async ({ client }) => {
      await client.query(
        `
          INSERT INTO registration_submissions (
            id, status, park_name, organisation_name, contact_name, contact_email,
            address_line_1, town, postcode, country, publicly_accessible, free_to_enter,
            minimum_size_confirmed, duplicate_warning_state, duplicate_matched_fields,
            location_payload, submitted_payload, submitted_at_utc
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18::timestamptz)
        `,
        [
          registrationId,
          status,
          body.parkName,
          body.organisationName,
          body.contactName,
          body.contactEmail,
          body.addressLine1,
          body.town,
          body.postcode ?? null,
          body.country,
          body.eligibility.publiclyAccessible,
          body.eligibility.freeToEnter,
          body.eligibility.minimumSizeConfirmed,
          duplicateState(record),
          duplicateWarning.matchedFields,
          JSON.stringify(body.location),
          JSON.stringify(record),
          submittedAt
        ]
      );
      await client.query(
        `
          INSERT INTO registration_verification_tokens (id, registration_submission_id, token_hash, status, expires_at_utc)
          VALUES ($1, $2, $3, $4, $5::timestamptz)
        `,
        [
          randomUUID(),
          registrationId,
          record.token,
          status === "PENDING_VERIFICATION" ? "ACTIVE" : "USED",
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      );
      for (const intent of duplicateWarning.hasPotentialDuplicate
        ? ["registration_verification_email", "admin_duplicate_alert"] as const
        : ["registration_verification_email"] as const) {
        await client.query(
          `
            INSERT INTO registration_notification_intents (
              id, registration_submission_id, intent_type, status, payload_snapshot
            )
            VALUES ($1, $2, $3, 'QUEUED', $4::jsonb)
          `,
          [randomUUID(), registrationId, intent, JSON.stringify({ registrationId, intent })]
        );
      }
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "SUBMIT_REGISTRATION",
          entityId: registrationId,
          actor: publicRegistrationActor,
          request: requestMetadata(request, idempotencyKey),
          afterState: record
        })
      );
    });

    return registrationSubmissionResponseSchema.parse({
      registrationId,
      status,
      eligibility,
      duplicateWarning,
      verificationRequired: status === "PENDING_VERIFICATION",
      notificationIntents: duplicateWarning.hasPotentialDuplicate
        ? ["registration_verification_email", "admin_duplicate_alert"]
        : ["registration_verification_email"]
    });
  }

  async getSummary(registrationId: string) {
    const record = await findRegistration(this.client, registrationId);
    if (!record) {
      throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
    }
    return registrationSummarySchema.parse({
      ...record,
      verificationRequired: record.status === "PENDING_VERIFICATION",
      notificationIntents: ["registration_verification_email"]
    });
  }

  async recordLocationLookup({ registrationId, body, request }: Parameters<RegistrationRepository["recordLocationLookup"]>[0]) {
    const record = await findRegistration(this.client, registrationId);
    if (!record) {
      throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
    }
    await this.unitOfWork.run(async () => {
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "RESOLVE_REGISTRATION_LOCATION",
          entityId: registrationId,
          actor: publicRegistrationActor,
          request: requestMetadata(request),
          afterState: body
        })
      );
    });
    return registrationLocationSuggestionSchema.parse({
      source: "ons_geography_mock",
      label: "Mock location enrichment",
      latitude: (body as { latitude: number }).latitude,
      longitude: (body as { longitude: number }).longitude,
      w3wAddress: (body as { w3wAddress?: string }).w3wAddress ?? "///lower.environment.park",
      parkNameSuggestion: "Lower Environment Park",
      sizeBand: "suggested_from_os_open_greenspace",
      localAuthority: "Lower Environment Borough",
      region: "North West",
      country: "England",
      constituency: "Lower Environment North",
      requiresApplicantConfirmation: true
    });
  }

  async verifyEmail({ registrationId, token, request }: Parameters<RegistrationRepository["verifyEmail"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const record = await findRegistration(client, registrationId, true);
      if (!record) {
        throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
      }
      const beforeState = { status: record.status };
      if (record.status === "VERIFIED_PENDING_REVIEW") {
        return {
          registrationId: record.registrationId,
          status: record.status,
          emailVerified: true,
          nextStep: "already_verified"
        };
      }
      const tokenMatches = verificationTokenMatches({
        providedToken: token,
        storedToken: record.token,
        allowStaticLowerEnvVerificationToken: this.allowStaticLowerEnvVerificationToken
      });
      if (record.status !== "PENDING_VERIFICATION" || !tokenMatches) {
        return {
          registrationId: record.registrationId,
          status: record.status,
          emailVerified: false,
          nextStep: "cannot_verify"
        };
      }
      await client.query(
        `
          UPDATE registration_submissions
          SET status = 'VERIFIED_PENDING_REVIEW',
            email_verified_at_utc = COALESCE(email_verified_at_utc, now()),
            updated_at_utc = now()
          WHERE id = $1 AND status = 'PENDING_VERIFICATION'
        `,
        [registrationId]
      );
      await client.query(
        `
          UPDATE registration_verification_tokens
          SET status = 'USED', used_at_utc = COALESCE(used_at_utc, now())
          WHERE registration_submission_id = $1 AND token_hash = $2 AND status = 'ACTIVE'
        `,
        [registrationId, record.token]
      );
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "VERIFY_REGISTRATION_EMAIL",
          entityId: registrationId,
          actor: publicRegistrationActor,
          request: requestMetadata(request),
          beforeState,
          afterState: { status: "VERIFIED_PENDING_REVIEW" }
        })
      );
      return {
        registrationId: record.registrationId,
        status: "VERIFIED_PENDING_REVIEW",
        emailVerified: true,
        nextStep: "admin_review"
      };
    });
  }

  async listPendingReview() {
    const result = await this.client.query<RegistrationRow>(
      `
        SELECT rs.id, rs.park_id, rs.status, rs.park_name, rs.organisation_name, rs.contact_email,
          rs.publicly_accessible, rs.free_to_enter, rs.minimum_size_confirmed,
          rs.duplicate_warning_state, rs.duplicate_matched_fields, rs.submitted_at_utc,
          NULL::text AS token_hash
        FROM registration_submissions rs
        WHERE rs.status = 'VERIFIED_PENDING_REVIEW'
        ORDER BY rs.submitted_at_utc ASC
      `
    );
    return adminRegistrationReviewQueueResponseSchema.parse({
      items: result.rows.map((row) => {
        const record = rowToRecord(row);
        return {
          registrationId: record.registrationId,
          status: record.status,
          parkName: record.parkName,
          organisationName: record.organisationName,
          contactEmail: record.contactEmail,
          eligibility: record.eligibility,
          duplicateWarning: record.duplicateWarning,
          submittedAt: record.submittedAt
        };
      })
    });
  }

  async approve({ registrationId, actor, request, idempotencyKey }: Parameters<RegistrationRepository["approve"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const record = await findRegistration(client, registrationId, true);
      if (!record) {
        throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
      }
      if (record.status !== "VERIFIED_PENDING_REVIEW" && record.status !== "APPROVED") {
        throw new ApiError("conflict", 409, "Registration cannot be approved from its current state.");
      }
      const beforeState = { status: record.status };
      const parkId = record.parkId ?? randomUUID();
      await client.query(
        `
          INSERT INTO award_tracks (code, label, operational_status)
          VALUES ('STANDARD_GREEN_FLAG', 'Standard Green Flag Award', 'OPERATIONAL')
          ON CONFLICT (code) DO NOTHING
        `
      );
      const existingOrganisation = await client.query<{ id: string }>(
        "SELECT id FROM organisations WHERE name = $1 LIMIT 1",
        [record.organisationName]
      );
      const organisationId = existingOrganisation.rows[0]?.id ?? randomUUID();
      if (!existingOrganisation.rows[0]) {
        await client.query("INSERT INTO organisations (id, name) VALUES ($1, $2)", [
          organisationId,
          record.organisationName
        ]);
      }
      await client.query(
        `
          INSERT INTO parks (id, organisation_id, award_track_code, name, status)
          VALUES ($1, $2, 'STANDARD_GREEN_FLAG', $3, 'ACTIVE')
          ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', updated_at_utc = now()
        `,
        [parkId, organisationId, record.parkName]
      );
      await client.query(
        `
          UPDATE registration_submissions
          SET status = 'APPROVED',
            organisation_id = $2,
            park_id = $3,
            reviewed_by_internal_user_id = $4,
            reviewed_at_utc = COALESCE(reviewed_at_utc, now()),
            updated_at_utc = now()
          WHERE id = $1
        `,
        [registrationId, organisationId, parkId, actor.actorId]
      );
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "APPROVE_REGISTRATION",
          entityId: registrationId,
          actor,
          request: requestMetadata(request, idempotencyKey),
          beforeState,
          afterState: { status: "APPROVED", parkStatus: "ACTIVE", parkId }
        })
      );
      return parkActivationResponseSchema.parse({
        registrationId,
        registrationStatus: "APPROVED",
        parkId,
        parkStatus: "ACTIVE",
        notificationIntents: ["registration_approved_email"]
      });
    });
  }

  async reject({ registrationId, actor, request, idempotencyKey, reason }: Parameters<RegistrationRepository["reject"]>[0]) {
    return this.unitOfWork.run(async ({ client }) => {
      const record = await findRegistration(client, registrationId, true);
      if (!record) {
        throw new ApiError("dependency_missing", 404, "Registration submission was not found.");
      }
      if (record.status !== "VERIFIED_PENDING_REVIEW" && record.status !== "REJECTED") {
        throw new ApiError("conflict", 409, "Registration cannot be rejected from its current state.");
      }
      const beforeState = { status: record.status };
      await client.query(
        `
          UPDATE registration_submissions
          SET status = 'REJECTED',
            reviewed_by_internal_user_id = $2,
            admin_decision_reason = $3,
            reviewed_at_utc = COALESCE(reviewed_at_utc, now()),
            updated_at_utc = now()
          WHERE id = $1
        `,
        [registrationId, actor.actorId, reason ?? null]
      );
      await appendAuditEvent(
        this.auditLedger,
        buildAuditEvent({
          action: "REJECT_REGISTRATION",
          entityId: registrationId,
          actor,
          request: requestMetadata(request, idempotencyKey),
          beforeState,
          afterState: { status: "REJECTED", parkStatus: "INACTIVE" },
          reason
        })
      );
      return parkActivationResponseSchema.parse({
        registrationId,
        registrationStatus: "REJECTED",
        parkStatus: "INACTIVE",
        notificationIntents: ["registration_rejected_email"]
      });
    });
  }
}
