import { randomUUID } from "node:crypto";
import type { SqlClient, UnitOfWork } from "@green-flag/db";
import { ApiError, appendAuditEvent, type AuditLedger, type SessionProfile } from "./auth.js";
import { buildAdminOverrideEvent } from "./overrides.js";
import { flushAdminOverrideEvents } from "./postgres-domain-stores/overrides.js";

export type ParkAreaSourceKind =
  | "os_open_greenspace_suggestion"
  | "applicant_confirmed"
  | "manual_entry"
  | "legacy_import"
  | "admin_override";

export type ApplicationAreaSnapshotReason =
  | "application_submission"
  | "legacy_import"
  | "manual_reconciliation"
  | "admin_override";

export interface ParkAreaMeasurement {
  id: string;
  parkId: string;
  areaHectares: number;
  sourceKind: ParkAreaSourceKind;
  sourceLabel?: string;
  isCurrent: boolean;
}

export interface ApplicationAreaSnapshot {
  id: string;
  applicationId: string;
  assessmentEpisodeId: string;
  parkId: string;
  parkAreaMeasurementId?: string;
  areaHectares: number;
  sourceKind: ParkAreaSourceKind;
  snapshotReason: ApplicationAreaSnapshotReason;
}

type RequestContext = {
  requestId: string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
};

type AreaRow = {
  id: string;
  park_id: string;
  area_hectares: string | number;
  source_kind: ParkAreaSourceKind;
  source_label: string | null;
  is_current: boolean;
};

type SnapshotRow = {
  id: string;
  application_id: string;
  assessment_episode_id: string;
  park_id: string;
  park_area_measurement_id: string | null;
  area_hectares: string | number;
  source_kind: ParkAreaSourceKind;
  snapshot_reason: ApplicationAreaSnapshotReason;
};

function toMeasurement(row: AreaRow): ParkAreaMeasurement {
  return {
    id: row.id,
    parkId: row.park_id,
    areaHectares: Number(row.area_hectares),
    sourceKind: row.source_kind,
    ...(row.source_label ? { sourceLabel: row.source_label } : {}),
    isCurrent: row.is_current
  };
}

function toSnapshot(row: SnapshotRow): ApplicationAreaSnapshot {
  return {
    id: row.id,
    applicationId: row.application_id,
    assessmentEpisodeId: row.assessment_episode_id,
    parkId: row.park_id,
    ...(row.park_area_measurement_id ? { parkAreaMeasurementId: row.park_area_measurement_id } : {}),
    areaHectares: Number(row.area_hectares),
    sourceKind: row.source_kind,
    snapshotReason: row.snapshot_reason
  };
}

function assertArea(areaHectares: number) {
  if (!Number.isFinite(areaHectares) || areaHectares <= 0) {
    throw new ApiError("validation_failed", 400, "Park area must be greater than zero hectares.");
  }
}

async function insertMeasurement(
  client: SqlClient,
  input: {
    parkId: string;
    areaHectares: number;
    sourceKind: ParkAreaSourceKind;
    sourceLabel?: string;
    isCurrent: boolean;
    actorId?: string;
    adminOverrideReason?: string;
    auditEventId?: string;
    adminOverrideEventId?: string;
  }
) {
  assertArea(input.areaHectares);
  if (input.isCurrent) {
    await client.query(
      "UPDATE park_area_measurements SET is_current = false, updated_at_utc = now() WHERE park_id = $1 AND is_current",
      [input.parkId]
    );
  }
  const row = (await client.query<AreaRow>(
    `
      INSERT INTO park_area_measurements (
        id, park_id, area_hectares, source_kind, source_label, admin_override_reason,
        audit_event_id, admin_override_event_id, is_current, captured_by_actor_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, park_id, area_hectares, source_kind, source_label, is_current
    `,
    [
      randomUUID(),
      input.parkId,
      input.areaHectares,
      input.sourceKind,
      input.sourceLabel ?? null,
      input.adminOverrideReason ?? null,
      input.auditEventId ?? null,
      input.adminOverrideEventId ?? null,
      input.isCurrent,
      input.actorId ?? null
    ]
  )).rows[0]!;
  return toMeasurement(row);
}

export class PostgresParkAreaService {
  constructor(
    private readonly client: SqlClient,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditLedger: AuditLedger
  ) {}

  async recordOsSuggestion(input: { parkId: string; areaHectares: number; sourceLabel?: string }) {
    return insertMeasurement(this.client, {
      parkId: input.parkId,
      areaHectares: input.areaHectares,
      sourceKind: "os_open_greenspace_suggestion",
      ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
      isCurrent: false
    });
  }

  async recordLegacyImport(input: { parkId: string; areaHectares: number; sourceLabel?: string; makeCurrent?: boolean }) {
    return insertMeasurement(this.client, {
      parkId: input.parkId,
      areaHectares: input.areaHectares,
      sourceKind: "legacy_import",
      ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
      isCurrent: input.makeCurrent ?? true
    });
  }

  async recordManualEntry(input: {
    parkId: string;
    areaHectares: number;
    actor: SessionProfile["actor"];
    request: RequestContext;
    sourceLabel?: string;
  }) {
    return this.unitOfWork.run(async ({ client }) => {
      const audit = await appendAuditEvent(this.auditLedger, {
        id: randomUUID(),
        actor: input.actor,
        action: "RECORD_PARK_AREA_MANUAL_ENTRY",
        entityType: "park",
        entityId: input.parkId,
        afterState: { areaHectares: input.areaHectares, sourceKind: "manual_entry" },
        request: input.request,
        createdAt: new Date().toISOString()
      });
      return insertMeasurement(client, {
        parkId: input.parkId,
        areaHectares: input.areaHectares,
        sourceKind: "manual_entry",
        ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
        isCurrent: true,
        actorId: input.actor.actorId,
        auditEventId: audit.id
      });
    });
  }

  async confirmApplicantArea(input: {
    parkId: string;
    areaHectares: number;
    actor: SessionProfile["actor"];
    request: RequestContext;
    sourceLabel?: string;
  }) {
    return this.unitOfWork.run(async ({ client }) => {
      const audit = await appendAuditEvent(this.auditLedger, {
        id: randomUUID(),
        actor: input.actor,
        action: "CONFIRM_APPLICANT_PARK_AREA",
        entityType: "park",
        entityId: input.parkId,
        afterState: { areaHectares: input.areaHectares, sourceKind: "applicant_confirmed" },
        request: input.request,
        createdAt: new Date().toISOString()
      });
      return insertMeasurement(client, {
        parkId: input.parkId,
        areaHectares: input.areaHectares,
        sourceKind: "applicant_confirmed",
        ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
        isCurrent: true,
        actorId: input.actor.actorId,
        auditEventId: audit.id
      });
    });
  }

  async overrideArea(input: {
    parkId: string;
    areaHectares: number;
    reason: string;
    actor: SessionProfile["actor"];
    request: RequestContext;
  }) {
    if (!input.reason.trim()) {
      throw new ApiError("validation_failed", 400, "Admin area override requires a reason.");
    }
    return this.unitOfWork.run(async ({ client }) => {
      const prior = (await client.query<AreaRow>(
        `
          SELECT id, park_id, area_hectares, source_kind, source_label, is_current
          FROM park_area_measurements
          WHERE park_id = $1 AND is_current
          LIMIT 1
        `,
        [input.parkId]
      )).rows[0];
      const audit = await appendAuditEvent(this.auditLedger, {
        id: randomUUID(),
        actor: input.actor,
        action: "OVERRIDE_PARK_AREA",
        entityType: "park",
        entityId: input.parkId,
        beforeState: prior ? toMeasurement(prior) : undefined,
        afterState: { areaHectares: input.areaHectares, sourceKind: "admin_override" },
        reason: input.reason,
        request: input.request,
        createdAt: new Date().toISOString()
      });
      const override = buildAdminOverrideEvent({
        overrideType: "PARK_AREA_OVERRIDE",
        targetType: "park",
        targetId: input.parkId,
        authority: input.actor.role,
        reason: input.reason,
        actor: input.actor,
        priorState: prior ? toMeasurement(prior) : null,
        afterState: { areaHectares: input.areaHectares, sourceKind: "admin_override" },
        linkedAuditEventId: audit.id,
        requestId: input.request.requestId,
        ...(input.request.idempotencyKey ? { correlationId: input.request.idempotencyKey } : {})
      });
      await flushAdminOverrideEvents(client, [override]);
      return insertMeasurement(client, {
        parkId: input.parkId,
        areaHectares: input.areaHectares,
        sourceKind: "admin_override",
        adminOverrideReason: input.reason,
        isCurrent: true,
        actorId: input.actor.actorId,
        auditEventId: audit.id,
        adminOverrideEventId: override.id
      });
    });
  }

  async captureApplicationSnapshot(input: { applicationId: string; snapshotReason: ApplicationAreaSnapshotReason }) {
    return this.unitOfWork.run(async ({ client }) => {
      const existing = (await client.query<SnapshotRow>(
        `
          SELECT id, application_id, assessment_episode_id, park_id, park_area_measurement_id,
            area_hectares, source_kind, snapshot_reason
          FROM application_area_snapshots
          WHERE application_id = $1
        `,
        [input.applicationId]
      )).rows[0];
      if (existing) return toSnapshot(existing);

      const selected = (await client.query<{
        application_id: string;
        assessment_episode_id: string;
        park_id: string;
        measurement_id: string;
        area_hectares: string | number;
        source_kind: ParkAreaSourceKind;
      }>(
        `
          SELECT a.id AS application_id, a.assessment_episode_id, a.park_id,
            pam.id AS measurement_id, pam.area_hectares, pam.source_kind
          FROM applications a
          JOIN park_area_measurements pam ON pam.park_id = a.park_id AND pam.is_current
          WHERE a.id = $1
          ORDER BY pam.captured_at_utc DESC, pam.id
          LIMIT 1
        `,
        [input.applicationId]
      )).rows[0];
      if (!selected) {
        throw new ApiError("dependency_missing", 404, "No current park area measurement is available for application snapshot.");
      }
      const row = (await client.query<SnapshotRow>(
        `
          INSERT INTO application_area_snapshots (
            id, application_id, assessment_episode_id, park_id, park_area_measurement_id,
            area_hectares, source_kind, snapshot_reason
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, application_id, assessment_episode_id, park_id, park_area_measurement_id,
            area_hectares, source_kind, snapshot_reason
        `,
        [
          randomUUID(),
          selected.application_id,
          selected.assessment_episode_id,
          selected.park_id,
          selected.measurement_id,
          selected.area_hectares,
          selected.source_kind,
          input.snapshotReason
        ]
      )).rows[0]!;
      return toSnapshot(row);
    });
  }
}
