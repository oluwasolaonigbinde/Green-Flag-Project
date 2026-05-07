
import type { SqlClient } from "@green-flag/db";
import { assessorSelfProfileResponseSchema } from "@green-flag/contracts";
import { createAssessorStore, type AssessorStore } from "../assessor.js";
import { iso } from "./shared.js";

export async function hydrateAssessorStore(client: SqlClient) {
  const store = createAssessorStore();
  store.profiles.clear();
  const rows = await client.query<{
    id: string;
    internal_user_id: string;
    display_name: string;
    email: string | null;
    profile_status: string;
    accreditation_status: string;
    accreditation_provider: string;
    primary_region: string | null;
    version: number;
    updated_at: Date | string;
  }>("SELECT * FROM assessor_profiles");
  for (const row of rows.rows) {
    const preferences = await client.query<{
      preferred_regions: string[];
      preferred_award_track_codes: string[];
      unavailable_notes: string | null;
      accepts_mystery_shop: boolean;
    }>("SELECT preferred_regions, preferred_award_track_codes, unavailable_notes, accepts_mystery_shop FROM assessor_preferences WHERE assessor_profile_id = $1", [row.id]);
    const availability = await client.query<{
      id: string;
      starts_at: Date | string;
      ends_at: Date | string;
      availability_type: string;
      notes: string | null;
    }>("SELECT id, starts_at, ends_at, availability_type, notes FROM assessor_availability_windows WHERE assessor_profile_id = $1 ORDER BY starts_at", [row.id]);
    const capacity = await client.query<{
      id: string;
      cycle_year: number;
      max_assignments: number;
      current_assigned_count: number;
      capacity_status: string;
    }>("SELECT id, cycle_year, max_assignments, current_assigned_count, capacity_status FROM assessor_capacity_declarations WHERE assessor_profile_id = $1 ORDER BY cycle_year", [row.id]);
    const preference = preferences.rows[0];
    store.profiles.set(row.id, assessorSelfProfileResponseSchema.shape.profile.parse({
      assessorId: row.id,
      internalUserId: row.internal_user_id,
      displayName: row.display_name,
      ...(row.email ? { email: row.email } : {}),
      profileStatus: row.profile_status,
      accreditationStatus: row.accreditation_status,
      accreditationProvider: row.accreditation_provider,
      ...(row.primary_region ? { primaryRegion: row.primary_region } : {}),
      preferences: {
        preferredRegions: preference?.preferred_regions ?? [],
        preferredAwardTrackCodes: preference?.preferred_award_track_codes ?? [],
        ...(preference?.unavailable_notes ? { unavailableNotes: preference.unavailable_notes } : {}),
        acceptsMysteryShop: preference?.accepts_mystery_shop ?? false
      },
      availability: availability.rows.map((item) => ({
        availabilityId: item.id,
        assessorId: row.id,
        startsAt: iso(item.starts_at),
        endsAt: iso(item.ends_at),
        availabilityType: item.availability_type,
        ...(item.notes ? { notes: item.notes } : {})
      })),
      capacity: capacity.rows.map((item) => ({
        capacityId: item.id,
        assessorId: row.id,
        cycleYear: item.cycle_year,
        maxAssignments: item.max_assignments,
        currentAssignedCount: item.current_assigned_count,
        capacityStatus: item.capacity_status
      })),
      version: row.version,
      updatedAt: iso(row.updated_at)
    }));
  }
  return store;
}

export async function flushAssessorStore(client: SqlClient, store: AssessorStore) {
  for (const [id, profile] of store.profiles) {
    await client.query(
      `
        INSERT INTO assessor_profiles (
          id, internal_user_id, display_name, email, profile_status, accreditation_status,
          accreditation_provider, primary_region, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          email = EXCLUDED.email,
          profile_status = EXCLUDED.profile_status,
          accreditation_status = EXCLUDED.accreditation_status,
          primary_region = EXCLUDED.primary_region,
          version = EXCLUDED.version,
          updated_at = now()
      `,
      [
        id,
        profile.internalUserId,
        profile.displayName,
        profile.email,
        profile.profileStatus,
        profile.accreditationStatus,
        profile.accreditationProvider,
        profile.primaryRegion,
        profile.version
      ]
    );

    await client.query(
      `
        INSERT INTO assessor_preferences (
          assessor_profile_id, preferred_regions, preferred_award_track_codes,
          unavailable_notes, accepts_mystery_shop, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        ON CONFLICT (assessor_profile_id) DO UPDATE SET
          preferred_regions = EXCLUDED.preferred_regions,
          preferred_award_track_codes = EXCLUDED.preferred_award_track_codes,
          unavailable_notes = EXCLUDED.unavailable_notes,
          accepts_mystery_shop = EXCLUDED.accepts_mystery_shop,
          updated_at = EXCLUDED.updated_at
      `,
      [
        id,
        profile.preferences.preferredRegions,
        profile.preferences.preferredAwardTrackCodes,
        profile.preferences.unavailableNotes ?? null,
        profile.preferences.acceptsMysteryShop,
        profile.updatedAt
      ]
    );

    await client.query("DELETE FROM assessor_availability_windows WHERE assessor_profile_id = $1", [id]);
    for (const availability of profile.availability) {
      await client.query(
        `
          INSERT INTO assessor_availability_windows (
            id, assessor_profile_id, starts_at, ends_at, availability_type, notes
          )
          VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6)
        `,
        [
          availability.availabilityId,
          id,
          availability.startsAt,
          availability.endsAt,
          availability.availabilityType,
          availability.notes ?? null
        ]
      );
    }

    await client.query("DELETE FROM assessor_capacity_declarations WHERE assessor_profile_id = $1", [id]);
    for (const capacity of profile.capacity) {
      await client.query(
        `
          INSERT INTO assessor_capacity_declarations (
            id, assessor_profile_id, cycle_year, max_assignments,
            current_assigned_count, capacity_status, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
        `,
        [
          capacity.capacityId,
          id,
          capacity.cycleYear,
          capacity.maxAssignments,
          capacity.currentAssignedCount,
          capacity.capacityStatus,
          profile.updatedAt
        ]
      );
    }
  }
}
