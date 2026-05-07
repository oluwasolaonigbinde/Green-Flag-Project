
import { randomUUID } from "node:crypto";
import type { SqlClient } from "@green-flag/db";
import { createRegistrationStore, type RegistrationStore } from "../registration.js";
import { iso } from "./shared.js";

export async function hydrateRegistrationStore(client: SqlClient) {
  const store = createRegistrationStore();
  const rows = await client.query<{
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
  }>(`
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
  `);
  for (const row of rows.rows) {
    const failedCriteria: Array<"publicly_accessible" | "free_to_enter" | "minimum_size"> = [];
    if (!row.publicly_accessible) failedCriteria.push("publicly_accessible");
    if (!row.free_to_enter) failedCriteria.push("free_to_enter");
    if (!row.minimum_size_confirmed) failedCriteria.push("minimum_size");
    store.records.set(row.id, {
      registrationId: row.id,
      parkName: row.park_name,
      organisationName: row.organisation_name,
      contactEmail: row.contact_email,
      submittedAt: iso(row.submitted_at_utc),
      status: row.status as RegistrationStore["records"] extends Map<string, infer R> ? R extends { status: infer S } ? S : never : never,
      eligibility: {
        eligible: failedCriteria.length === 0,
        failedCriteria
      },
      duplicateWarning: {
        hasPotentialDuplicate: row.duplicate_warning_state !== "NONE",
        matchedFields: row.duplicate_matched_fields as Array<"park_name" | "postcode" | "address">,
        acknowledged: row.duplicate_warning_state === "ACKNOWLEDGED"
      },
      token: row.token_hash ?? "",
      ...(row.park_id ? { parkId: row.park_id } : {})
    });
  }
  return store;
}

function duplicateState(record: RegistrationStore["records"] extends Map<string, infer R> ? R : never) {
  if (!record.duplicateWarning.hasPotentialDuplicate) return "NONE";
  return record.duplicateWarning.acknowledged ? "ACKNOWLEDGED" : "WARNING_REQUIRES_ACK";
}

export async function flushRegistrationStore(client: SqlClient, store: RegistrationStore) {
  for (const [id, record] of store.records) {
    let organisationId: string | null = null;
    if (record.parkId) {
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
      organisationId = existingOrganisation.rows[0]?.id ?? randomUUID();
      if (!existingOrganisation.rows[0]) {
        await client.query(
          "INSERT INTO organisations (id, name) VALUES ($1, $2)",
          [organisationId, record.organisationName]
        );
      }
      await client.query(
        `
          INSERT INTO parks (id, organisation_id, award_track_code, name, status)
          VALUES ($1, $2, 'STANDARD_GREEN_FLAG', $3, $4)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            updated_at_utc = now()
        `,
        [record.parkId, organisationId, record.parkName, record.status === "APPROVED" ? "ACTIVE" : "INACTIVE"]
      );
    }
    const publiclyAccessible = !record.eligibility.failedCriteria.includes("publicly_accessible");
    const freeToEnter = !record.eligibility.failedCriteria.includes("free_to_enter");
    const minimumSizeConfirmed = !record.eligibility.failedCriteria.includes("minimum_size");
    await client.query(
      `
        INSERT INTO registration_submissions (
          id, organisation_id, park_id, status, park_name, organisation_name, contact_name, contact_email,
          address_line_1, town, postcode, country, publicly_accessible, free_to_enter,
          minimum_size_confirmed, duplicate_warning_state, duplicate_matched_fields,
          location_payload, submitted_payload, submitted_at_utc
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, $12, $13, $14, $15, $16, '{}'::jsonb, $17::jsonb, $18::timestamptz)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          organisation_id = COALESCE(EXCLUDED.organisation_id, registration_submissions.organisation_id),
          park_id = COALESCE(EXCLUDED.park_id, registration_submissions.park_id),
          duplicate_warning_state = EXCLUDED.duplicate_warning_state,
          duplicate_matched_fields = EXCLUDED.duplicate_matched_fields,
          email_verified_at_utc = CASE
            WHEN EXCLUDED.status IN ('VERIFIED_PENDING_REVIEW', 'APPROVED', 'REJECTED') THEN COALESCE(registration_submissions.email_verified_at_utc, now())
            ELSE registration_submissions.email_verified_at_utc
          END,
          reviewed_at_utc = CASE
            WHEN EXCLUDED.status IN ('APPROVED', 'REJECTED') THEN COALESCE(registration_submissions.reviewed_at_utc, now())
            ELSE registration_submissions.reviewed_at_utc
          END,
          submitted_payload = EXCLUDED.submitted_payload,
          updated_at_utc = now()
      `,
      [
        id,
        organisationId,
        record.parkId ?? null,
        record.status,
        record.parkName,
        record.organisationName,
        "Captured in registration payload",
        record.contactEmail,
        "Captured in registration payload",
        "Captured in registration payload",
        "lower-env",
        publiclyAccessible,
        freeToEnter,
        minimumSizeConfirmed,
        duplicateState(record),
        record.duplicateWarning.matchedFields,
        JSON.stringify(record),
        record.submittedAt
      ]
    );
    await client.query(
      `
        INSERT INTO registration_verification_tokens (
          id, registration_submission_id, token_hash, status, expires_at_utc, used_at_utc
        )
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
        ON CONFLICT (token_hash) DO UPDATE SET
          status = EXCLUDED.status,
          used_at_utc = EXCLUDED.used_at_utc
      `,
      [
        randomUUID(),
        id,
        record.token,
        record.status === "PENDING_VERIFICATION" ? "ACTIVE" : record.status === "PURGED" ? "PURGED" : "USED",
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        record.status === "PENDING_VERIFICATION" ? null : record.submittedAt
      ]
    );
  }
}
