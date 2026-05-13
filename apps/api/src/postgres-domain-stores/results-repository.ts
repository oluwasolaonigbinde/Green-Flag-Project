import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { SqlClient, UnitOfWork } from "@green-flag/db";
import {
  adminResultDetailResponseSchema,
  applicantResultResponseSchema,
  assessmentTemplateSchema,
  resultCommandResponseSchema,
  type holdDecisionRequestSchema,
  type publishDecisionRequestSchema,
  type withdrawDecisionRequestSchema
} from "@green-flag/contracts";
import type { z } from "zod";
import { requireApplicantResourceAccess, requireMutationAllowed, requireOperationalResourceAccess, type ResourceOwnership } from "../authorization.js";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile } from "../auth.js";
import { iso } from "./shared.js";

type HoldInput = z.infer<typeof holdDecisionRequestSchema>;
type PublishInput = z.infer<typeof publishDecisionRequestSchema>;
type WithdrawInput = z.infer<typeof withdrawDecisionRequestSchema>;

type EpisodeContext = ResourceOwnership & {
  episodeId: string;
  episodeType: "FULL_ASSESSMENT" | "MYSTERY_SHOP";
  mysterySuppressed: boolean;
  applicationId?: string | undefined;
};

type DecisionRow = {
  id: string;
  assessment_episode_id: string;
  park_id: string;
  application_id: string | null;
  status: string;
  outcome: string;
  threshold_acknowledged: boolean;
  threshold_met: boolean;
  assessment_count: number;
  raw_score_total: number;
  max_score_total: number;
  internal_notes: string | null;
  published_at_utc: Date | string | null;
  certificate_id: string | null;
  public_map_event_id: string | null;
  version: number;
  updated_at_utc: Date | string;
};

type ArtifactRow = {
  id: string;
  decision_result_id: string;
  assessment_episode_id: string;
  artifact_type: string;
  storage_provider: string;
  storage_key: string;
  public_visible: boolean;
  created_at_utc: Date | string;
};

type PublicMapEventRow = {
  id: string;
  decision_result_id: string;
  park_id: string;
  assessment_episode_id: string;
  event_type: string;
  status: string;
  payload: unknown;
  created_at_utc: Date | string;
};

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
    entityType: "decision_result",
    entityId,
    beforeState,
    afterState,
    request,
    ...(reason ? { reason } : {}),
    createdAt: new Date().toISOString()
  };
}

function safeDisplayLabel(decision: { status: string }) {
  if (decision.status === "PUBLISHED") return "Award published";
  if (decision.status === "WITHDRAWN") return "Result withdrawn";
  return "Result held";
}

function decisionFromRow(row: DecisionRow) {
  return adminResultDetailResponseSchema.shape.decision.unwrap().parse({
    decisionId: row.id,
    episodeId: row.assessment_episode_id,
    parkId: row.park_id,
    ...(row.application_id ? { applicationId: row.application_id } : {}),
    status: row.status,
    outcome: row.outcome,
    thresholdAcknowledged: row.threshold_acknowledged,
    thresholdMet: row.threshold_met,
    assessmentCount: row.assessment_count,
    rawScoreTotal: row.raw_score_total,
    maxScoreTotal: row.max_score_total,
    ...(row.internal_notes ? { internalNotes: row.internal_notes } : {}),
    ...(row.published_at_utc ? { publishedAt: iso(row.published_at_utc) } : {}),
    ...(row.certificate_id ? { certificateId: row.certificate_id } : {}),
    ...(row.public_map_event_id ? { publicMapEventId: row.public_map_event_id } : {}),
    version: row.version,
    updatedAt: iso(row.updated_at_utc)
  });
}

function artifactFromRow(row: ArtifactRow) {
  return adminResultDetailResponseSchema.shape.artifacts.element.parse({
    artifactId: row.id,
    decisionId: row.decision_result_id,
    episodeId: row.assessment_episode_id,
    artifactType: row.artifact_type,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    publicVisible: row.public_visible,
    createdAt: iso(row.created_at_utc)
  });
}

function publicMapEventFromRow(row: PublicMapEventRow) {
  return adminResultDetailResponseSchema.shape.publicMapEvents.element.parse({
    eventId: row.id,
    decisionId: row.decision_result_id,
    parkId: row.park_id,
    episodeId: row.assessment_episode_id,
    eventType: row.event_type,
    status: row.status,
    payload: row.payload,
    createdAt: iso(row.created_at_utc)
  });
}

function awardCacheFromRow(row: {
  park_id: string;
  assessment_episode_id: string;
  decision_result_id: string;
  result_status: string;
  display_label: string;
  published_at_utc: Date | string | null;
  updated_at_utc: Date | string;
}) {
  return adminResultDetailResponseSchema.shape.awardCache.unwrap().parse({
    parkId: row.park_id,
    episodeId: row.assessment_episode_id,
    decisionId: row.decision_result_id,
    resultStatus: row.result_status,
    displayLabel: row.display_label,
    ...(row.published_at_utc ? { publishedAt: iso(row.published_at_utc) } : {}),
    updatedAt: iso(row.updated_at_utc)
  });
}

async function loadEpisodeContext(client: SqlClient, episodeId: string, lock = false): Promise<EpisodeContext> {
  const row = (await client.query<{
    episode_id: string;
    episode_type: string;
    mystery_suppressed: boolean;
    park_id: string;
    organisation_id: string;
    country_code: string | null;
    application_id: string | null;
  }>(
    `
      SELECT ae.id AS episode_id, ae.episode_type, ae.mystery_suppressed,
        ae.park_id, p.organisation_id, ac.country_code, app.id AS application_id
      FROM assessment_episodes ae
      JOIN parks p ON p.id = ae.park_id
      JOIN award_cycles ac ON ac.id = ae.award_cycle_id
      LEFT JOIN applications app ON app.assessment_episode_id = ae.id
      WHERE ae.id = $1
      ${lock ? "FOR UPDATE OF ae" : ""}
    `,
    [episodeId]
  )).rows[0];
  if (!row) throw new ApiError("dependency_missing", 404, "Assessment episode was not found.");
  return {
    episodeId: row.episode_id,
    episodeType: row.episode_type as EpisodeContext["episodeType"],
    mysterySuppressed: row.mystery_suppressed,
    parkId: row.park_id,
    organisationId: row.organisation_id,
    countryCode: row.country_code ?? "lower-env",
    ...(row.application_id ? { applicationId: row.application_id } : {})
  };
}

async function loadDecisionByEpisode(client: SqlClient, episodeId: string, lock = false) {
  return (await client.query<DecisionRow>(
    `SELECT * FROM decision_results WHERE assessment_episode_id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [episodeId]
  )).rows[0];
}

async function loadDecisionById(client: SqlClient, decisionId: string, lock = false) {
  return (await client.query<DecisionRow>(
    `SELECT * FROM decision_results WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [decisionId]
  )).rows[0];
}

async function matchingAuditByIdempotency(client: SqlClient, action: string, entityId: string, idempotencyKey?: string) {
  if (!idempotencyKey) return false;
  const row = (await client.query<{ id: string }>(
    "SELECT id FROM audit_events WHERE action = $1 AND entity_id = $2 AND idempotency_key = $3 LIMIT 1",
    [action, entityId, idempotencyKey]
  )).rows[0];
  return Boolean(row);
}

async function loadSubmittedAssessmentSummary(client: SqlClient, episodeId: string) {
  const result = await client.query<{
    raw_score_total: number;
    max_score_total: number;
    threshold_met: boolean;
  }>(
    `
      SELECT raw_score_total, max_score_total, threshold_met
      FROM judge_assessments
      WHERE assessment_episode_id = $1 AND status = 'SUBMITTED'
      ORDER BY updated_at_utc, id
      FOR UPDATE
    `,
    [episodeId]
  );
  if (result.rows.length === 0) throw new ApiError("invalid_state", 409, "At least one submitted assessment is required before result decision.");
  return {
    assessmentCount: result.rows.length,
    rawScoreTotal: result.rows.reduce((sum, row) => sum + row.raw_score_total, 0),
    maxScoreTotal: result.rows.reduce((sum, row) => sum + row.max_score_total, 0),
    thresholdMet: result.rows.every((row) => row.threshold_met)
  };
}

async function loadArtifacts(client: SqlClient, decisionId: string) {
  const rows = await client.query<ArtifactRow>(
    "SELECT * FROM result_artifacts WHERE decision_result_id = $1 ORDER BY created_at_utc, id",
    [decisionId]
  );
  return rows.rows.map(artifactFromRow);
}

async function loadPublicMapEvents(client: SqlClient, episodeId: string) {
  const rows = await client.query<PublicMapEventRow>(
    "SELECT * FROM public_map_update_events WHERE assessment_episode_id = $1 ORDER BY created_at_utc, id",
    [episodeId]
  );
  return rows.rows.map(publicMapEventFromRow);
}

async function loadPublicMapEventByDedupeKey(client: SqlClient, dedupeKey: string) {
  return (await client.query<PublicMapEventRow>(
    "SELECT * FROM public_map_update_events WHERE dedupe_key = $1 LIMIT 1",
    [dedupeKey]
  )).rows[0];
}

async function loadArtifactByDedupeKey(client: SqlClient, dedupeKey: string) {
  return (await client.query<ArtifactRow>(
    "SELECT * FROM result_artifacts WHERE dedupe_key = $1 LIMIT 1",
    [dedupeKey]
  )).rows[0];
}

async function loadAwardCache(client: SqlClient, parkId: string) {
  const row = (await client.query<Parameters<typeof awardCacheFromRow>[0]>(
    "SELECT * FROM park_award_cache WHERE park_id = $1",
    [parkId]
  )).rows[0];
  return row ? awardCacheFromRow(row) : undefined;
}

async function loadAdminAssessments(client: SqlClient, episodeId: string) {
  const templateRow = (await client.query<{
    id: string;
    award_track_code: string;
    cycle_year: number;
    source: string;
    pass_threshold_percent: number;
  }>(
    "SELECT id, award_track_code, cycle_year, source, pass_threshold_percent FROM assessment_template_configs ORDER BY updated_at_utc DESC LIMIT 1"
  )).rows[0];
  if (!templateRow) throw new ApiError("dependency_missing", 404, "Assessment template configuration was not found.");
  const criteria = await client.query<{
    criterion_id: string;
    code: string;
    label: string;
    max_score: number;
    placeholder_only: boolean;
  }>(
    "SELECT criterion_id, code, label, max_score, placeholder_only FROM assessment_template_criteria WHERE template_config_id = $1 ORDER BY sort_order",
    [templateRow.id]
  );
  const template = assessmentTemplateSchema.parse({
    templateId: templateRow.id,
    awardTrackCode: templateRow.award_track_code,
    cycleYear: templateRow.cycle_year,
    source: templateRow.source,
    passThresholdPercent: templateRow.pass_threshold_percent,
    criteria: criteria.rows.map((criterion) => ({
      criterionId: criterion.criterion_id,
      code: criterion.code,
      label: criterion.label,
      maxScore: criterion.max_score,
      placeholderOnly: criterion.placeholder_only
    }))
  });
  const rows = await client.query<{
    id: string;
    judge_assignment_id: string;
    assessment_episode_id: string;
    assessor_profile_id: string;
    status: string;
    raw_score_total: number;
    max_score_total: number;
    threshold_met: boolean;
    offline_sync_version: number;
    version: number;
    updated_at_utc: Date | string;
  }>(
    "SELECT * FROM judge_assessments WHERE assessment_episode_id = $1 ORDER BY updated_at_utc DESC, id",
    [episodeId]
  );
  const assessments = [];
  for (const row of rows.rows) {
    const scores = await client.query<{ criterion_id: string; score: number; notes: string | null }>(
      "SELECT criterion_id, score, notes FROM assessment_score_entries WHERE assessment_id = $1 ORDER BY criterion_id",
      [row.id]
    );
    const evidence = await client.query<{
      id: string;
      evidence_type: string;
      filename: string;
      visibility: string;
      storage_provider: string;
      storage_key: string;
      created_at_utc: Date | string;
    }>("SELECT * FROM assessment_evidence WHERE assessment_id = $1 ORDER BY created_at_utc, id", [row.id]);
    assessments.push({
      assessmentId: row.id,
      assignmentId: row.judge_assignment_id,
      episodeId: row.assessment_episode_id,
      assessorId: row.assessor_profile_id,
      status: row.status,
      template,
      scores: scores.rows.map((score) => ({
        criterionId: score.criterion_id,
        score: score.score,
        ...(score.notes ? { notes: score.notes } : {})
      })),
      rawScoreTotal: row.raw_score_total,
      maxScoreTotal: row.max_score_total,
      thresholdMet: row.threshold_met,
      evidence: evidence.rows.map((item) => ({
        evidenceId: item.id,
        assessmentId: row.id,
        evidenceType: item.evidence_type,
        filename: item.filename,
        visibility: item.visibility,
        storageProvider: item.storage_provider,
        storageKey: item.storage_key,
        createdAt: iso(item.created_at_utc)
      })),
      offlineSyncVersion: row.offline_sync_version,
      version: row.version,
      updatedAt: iso(row.updated_at_utc)
    });
  }
  return assessments;
}

export interface ResultsRepository {
  adminDetail(input: { episodeId: string; session: SessionProfile }): Promise<unknown>;
  hold(input: { episodeId: string; body: HoldInput; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  publish(input: { decisionId: string; body: PublishInput; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  withdraw(input: { decisionId: string; body: WithdrawInput; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  applicantResult(input: { episodeId: string; session: SessionProfile }): Promise<unknown>;
}

export class PostgresResultsRepository implements ResultsRepository {
  constructor(
    private readonly client: SqlClient,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditLedger: AuditLedger
  ) {}

  async adminDetail({ episodeId, session }: Parameters<ResultsRepository["adminDetail"]>[0]) {
    const context = await loadEpisodeContext(this.client, episodeId);
    requireOperationalResourceAccess(session, context);
    const decisionRow = await loadDecisionByEpisode(this.client, episodeId);
    const decision = decisionRow ? decisionFromRow(decisionRow) : undefined;
    return adminResultDetailResponseSchema.parse({
      episodeId,
      decision,
      assessments: await loadAdminAssessments(this.client, episodeId),
      artifacts: decision ? await loadArtifacts(this.client, decision.decisionId) : [],
      awardCache: decision ? await loadAwardCache(this.client, decision.parkId) : undefined,
      publicMapEvents: await loadPublicMapEvents(this.client, episodeId)
    });
  }

  async hold({ episodeId, body, session, request }: Parameters<ResultsRepository["hold"]>[0]) {
    requireMutationAllowed(session);
    return this.unitOfWork.run(async ({ client }) => {
      const context = await loadEpisodeContext(client, episodeId, true);
      requireOperationalResourceAccess(session, context);
      const existing = await loadDecisionByEpisode(client, episodeId, true);
      if (existing) {
        if (await matchingAuditByIdempotency(client, "HOLD_DECISION_RESULT", existing.id, body.idempotencyKey)) {
          return resultCommandResponseSchema.parse({
            decision: decisionFromRow(existing),
            artifacts: [],
            auditEventId: (await client.query<{ id: string }>(
              "SELECT id FROM audit_events WHERE action = 'HOLD_DECISION_RESULT' AND entity_id = $1 AND idempotency_key = $2 ORDER BY created_at_utc DESC LIMIT 1",
              [existing.id, body.idempotencyKey]
            )).rows[0]?.id ?? randomUUID()
          });
        }
        throw new ApiError("invalid_state", 409, "Decision result already exists for this episode.");
      }
      const summary = await loadSubmittedAssessmentSummary(client, episodeId);
      const decisionId = randomUUID();
      const now = new Date().toISOString();
      await client.query(
        `
          INSERT INTO decision_results (
            id, assessment_episode_id, park_id, application_id, status, outcome,
            threshold_acknowledged, threshold_met, assessment_count, raw_score_total,
            max_score_total, internal_notes, version, updated_at_utc
          )
          VALUES ($1, $2, $3, $4, 'CONFIRMED_HELD', $5, true, $6, $7, $8, $9, $10, 0, $11::timestamptz)
        `,
        [
          decisionId,
          episodeId,
          context.parkId,
          context.applicationId ?? null,
          summary.thresholdMet ? "THRESHOLD_MET" : "THRESHOLD_NOT_MET",
          summary.thresholdMet,
          summary.assessmentCount,
          summary.rawScoreTotal,
          summary.maxScoreTotal,
          body.internalNotes ?? null,
          now
        ]
      );
      await client.query("UPDATE assessment_episodes SET status = 'RESULT_CONFIRMED_HELD', updated_at_utc = now() WHERE id = $1", [episodeId]);
      const decision = decisionFromRow((await loadDecisionById(client, decisionId))!);
      const audit = buildAuditEvent({
        action: "HOLD_DECISION_RESULT",
        entityId: decisionId,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        afterState: decision,
        reason: body.reason
      });
      await appendAuditEvent(this.auditLedger, audit);
      return resultCommandResponseSchema.parse({ decision, artifacts: [], auditEventId: audit.id });
    });
  }

  async publish({ decisionId, body, session, request }: Parameters<ResultsRepository["publish"]>[0]) {
    requireMutationAllowed(session);
    return this.unitOfWork.run(async ({ client }) => {
      const before = await loadDecisionById(client, decisionId, true);
      if (!before) throw new ApiError("dependency_missing", 404, "Decision result was not found.");
      const context = await loadEpisodeContext(client, before.assessment_episode_id, true);
      requireOperationalResourceAccess(session, context);
      if (context.episodeType === "FULL_ASSESSMENT" && body.releaseMode !== "full_batch") {
        throw new ApiError("invalid_state", 409, "Full Assessment results require batch release.");
      }
      if (context.episodeType === "MYSTERY_SHOP" && body.releaseMode !== "single") {
        throw new ApiError("invalid_state", 409, "Mystery results publish individually.");
      }
      if (before.status === "PUBLISHED" && await matchingAuditByIdempotency(client, "PUBLISH_DECISION_RESULT", decisionId, body.idempotencyKey)) {
        const decision = decisionFromRow(before);
        return resultCommandResponseSchema.parse({
          decision,
          artifacts: await loadArtifacts(client, decisionId),
          awardCache: await loadAwardCache(client, before.park_id),
          publicMapEvent: before.public_map_event_id
            ? publicMapEventFromRow((await client.query<PublicMapEventRow>("SELECT * FROM public_map_update_events WHERE id = $1", [before.public_map_event_id])).rows[0]!)
            : undefined,
          auditEventId: (await client.query<{ id: string }>(
            "SELECT id FROM audit_events WHERE action = 'PUBLISH_DECISION_RESULT' AND entity_id = $1 AND idempotency_key = $2 ORDER BY created_at_utc DESC LIMIT 1",
            [decisionId, body.idempotencyKey]
          )).rows[0]?.id ?? randomUUID()
        });
      }
      if (before.status !== "CONFIRMED_HELD") throw new ApiError("invalid_state", 409, "Only held decisions can be published.");
      const now = new Date().toISOString();
      const artifactId = randomUUID();
      const publicMapEventId = randomUUID();
      const publishedDecision = { ...decisionFromRow(before), status: "PUBLISHED" as const };
      const displayLabel = safeDisplayLabel(publishedDecision);
      const artifactDedupeKey = body.idempotencyKey ? `publish:${decisionId}:artifact:certificate_shell:${body.idempotencyKey}` : null;
      const publicMapDedupeKey = body.idempotencyKey ? `publish:${decisionId}:public_map:award_published:${body.idempotencyKey}` : null;
      const insertedArtifact = await client.query<{ id: string }>(
        `
          INSERT INTO result_artifacts (
            id, decision_result_id, assessment_episode_id, artifact_type, storage_provider, storage_key, public_visible, dedupe_key, created_at_utc
          )
          VALUES ($1, $2, $3, 'certificate_shell', 'lower_env_stub', $4, true, $5, $6::timestamptz)
          ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
          RETURNING id
        `,
        [artifactId, decisionId, before.assessment_episode_id, `lower-env/results/${decisionId}/certificate-shell.pdf`, artifactDedupeKey, now]
      );
      const effectiveArtifactId = insertedArtifact.rows[0]?.id ??
        (artifactDedupeKey ? (await loadArtifactByDedupeKey(client, artifactDedupeKey))?.id : undefined) ??
        artifactId;
      await client.query(
        `
          INSERT INTO park_award_cache (
            park_id, assessment_episode_id, decision_result_id, result_status, display_label, published_at_utc, updated_at_utc
          )
          VALUES ($1, $2, $3, 'PUBLISHED', $4, $5::timestamptz, $5::timestamptz)
          ON CONFLICT (park_id) DO UPDATE SET
            assessment_episode_id = EXCLUDED.assessment_episode_id,
            decision_result_id = EXCLUDED.decision_result_id,
            result_status = EXCLUDED.result_status,
            display_label = EXCLUDED.display_label,
            published_at_utc = EXCLUDED.published_at_utc,
            updated_at_utc = EXCLUDED.updated_at_utc
        `,
        [before.park_id, before.assessment_episode_id, decisionId, displayLabel, now]
      );
      const insertedPublicMapEvent = await client.query<{ id: string }>(
        `
          INSERT INTO public_map_update_events (
            id, decision_result_id, park_id, assessment_episode_id, event_type, status, payload, dedupe_key, created_at_utc
          )
          VALUES ($1, $2, $3, $4, 'award_published', 'PENDING', $5::jsonb, $6, $7::timestamptz)
          ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
          RETURNING id
        `,
        [publicMapEventId, decisionId, before.park_id, before.assessment_episode_id, JSON.stringify({ parkId: before.park_id, displayLabel, published: true }), publicMapDedupeKey, now]
      );
      const effectivePublicMapEventId = insertedPublicMapEvent.rows[0]?.id ??
        (publicMapDedupeKey ? (await loadPublicMapEventByDedupeKey(client, publicMapDedupeKey))?.id : undefined) ??
        publicMapEventId;
      const updated = (await client.query<DecisionRow>(
        `
          UPDATE decision_results
          SET status = 'PUBLISHED',
            published_at_utc = $2::timestamptz,
            certificate_id = $3,
            public_map_event_id = $4,
            version = version + 1,
            updated_at_utc = $2::timestamptz
          WHERE id = $1 AND status = 'CONFIRMED_HELD' AND version = $5
          RETURNING *
        `,
        [decisionId, now, effectiveArtifactId, effectivePublicMapEventId, before.version]
      )).rows[0];
      if (!updated) throw new ApiError("idempotency_conflict", 409, "Decision result version has changed.");
      await client.query("UPDATE assessment_episodes SET status = 'PUBLISHED', updated_at_utc = now() WHERE id = $1", [before.assessment_episode_id]);
      const decision = decisionFromRow(updated);
      const artifacts = await loadArtifacts(client, decisionId);
      const awardCache = await loadAwardCache(client, before.park_id);
      const publicMapEvent = publicMapEventFromRow((await client.query<PublicMapEventRow>("SELECT * FROM public_map_update_events WHERE id = $1", [effectivePublicMapEventId])).rows[0]!);
      const audit = buildAuditEvent({
        action: "PUBLISH_DECISION_RESULT",
        entityId: decisionId,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: decisionFromRow(before),
        afterState: { decision, releaseMode: body.releaseMode, episodeType: context.episodeType }
      });
      await appendAuditEvent(this.auditLedger, audit);
      return resultCommandResponseSchema.parse({ decision, artifacts, awardCache, publicMapEvent, auditEventId: audit.id });
    });
  }

  async withdraw({ decisionId, body, session, request }: Parameters<ResultsRepository["withdraw"]>[0]) {
    requireMutationAllowed(session);
    return this.unitOfWork.run(async ({ client }) => {
      const before = await loadDecisionById(client, decisionId, true);
      if (!before) throw new ApiError("dependency_missing", 404, "Decision result was not found.");
      const context = await loadEpisodeContext(client, before.assessment_episode_id, true);
      requireOperationalResourceAccess(session, context);
      const now = new Date().toISOString();
      const publicMapEventId = randomUUID();
      await client.query(
        `
          INSERT INTO public_map_update_events (
            id, decision_result_id, park_id, assessment_episode_id, event_type, status, payload, created_at_utc
          )
          VALUES ($1, $2, $3, $4, 'award_withdrawn', 'PENDING', $5::jsonb, $6::timestamptz)
        `,
        [publicMapEventId, decisionId, before.park_id, before.assessment_episode_id, JSON.stringify({ parkId: before.park_id, displayLabel: "Result withdrawn", published: false }), now]
      );
      const updated = (await client.query<DecisionRow>(
        `
          UPDATE decision_results
          SET status = 'WITHDRAWN',
            public_map_event_id = $2,
            version = version + 1,
            updated_at_utc = $3::timestamptz
          WHERE id = $1 AND status <> 'WITHDRAWN' AND version = $4
          RETURNING *
        `,
        [decisionId, publicMapEventId, now, before.version]
      )).rows[0];
      if (!updated) throw new ApiError("idempotency_conflict", 409, "Decision result version has changed.");
      await client.query("DELETE FROM park_award_cache WHERE park_id = $1 AND decision_result_id = $2", [before.park_id, decisionId]);
      await client.query("UPDATE assessment_episodes SET status = 'WITHDRAWN', updated_at_utc = now() WHERE id = $1", [before.assessment_episode_id]);
      const decision = decisionFromRow(updated);
      const publicMapEvent = publicMapEventFromRow((await client.query<PublicMapEventRow>("SELECT * FROM public_map_update_events WHERE id = $1", [publicMapEventId])).rows[0]!);
      const audit = buildAuditEvent({
        action: "WITHDRAW_DECISION_RESULT",
        entityId: decisionId,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: decisionFromRow(before),
        afterState: decision,
        reason: body.reason
      });
      await appendAuditEvent(this.auditLedger, audit);
      return resultCommandResponseSchema.parse({ decision, artifacts: [], publicMapEvent, auditEventId: audit.id });
    });
  }

  async applicantResult({ episodeId, session }: Parameters<ResultsRepository["applicantResult"]>[0]) {
    const context = await loadEpisodeContext(this.client, episodeId);
    requireApplicantResourceAccess(session, context);
    const row = await loadDecisionByEpisode(this.client, episodeId);
    if (!row) {
      return applicantResultResponseSchema.parse({ episodeId, parkId: context.parkId, status: "not_available" });
    }
    if (row.status === "WITHDRAWN") {
      return applicantResultResponseSchema.parse({ episodeId, parkId: context.parkId, status: "withdrawn", displayLabel: "Result withdrawn" });
    }
    if (row.status !== "PUBLISHED") {
      return applicantResultResponseSchema.parse({ episodeId, parkId: context.parkId, status: "not_available" });
    }
    return applicantResultResponseSchema.parse({
      episodeId,
      parkId: context.parkId,
      status: "published",
      displayLabel: safeDisplayLabel({ status: row.status })
    });
  }
}
