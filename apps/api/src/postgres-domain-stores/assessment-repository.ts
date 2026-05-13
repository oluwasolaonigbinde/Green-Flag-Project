import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { SqlClient, UnitOfWork } from "@green-flag/db";
import {
  adminAssessmentDetailResponseSchema,
  assessmentCommandResponseSchema,
  assessorVisitsResponseSchema,
  judgeAssessmentResponseSchema,
  type AssignmentStatus
} from "@green-flag/contracts";
import { hasRoleAssignmentForResource, requireMutationAllowed, type ResourceOwnership } from "../authorization.js";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile } from "../auth.js";
import { iso } from "./shared.js";

type Assessment = ReturnType<typeof judgeAssessmentResponseSchema.shape.assessment.parse>;
type AssessmentVisit = ReturnType<typeof assessorVisitsResponseSchema.shape.items.element.parse>;
type AssessmentTemplate = Assessment["template"];
type AssignmentAccess = {
  assignmentId: string;
  allocationId: string;
  episodeId: string;
  assessorId: string;
  status: AssignmentStatus | "HELD" | "WITHDRAWN" | "REMOVED";
  episodeType: "FULL_ASSESSMENT" | "MYSTERY_SHOP";
  parkId: string;
  organisationId: string;
  countryCode: string;
};
type AssessmentRow = {
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
  afterState
}: {
  action: string;
  entityId?: string;
  actor: SessionProfile["actor"];
  request: ReturnType<typeof requestMetadata>;
  beforeState?: unknown;
  afterState?: unknown;
}): AuditEvent {
  return {
    id: randomUUID(),
    actor,
    action,
    entityType: "judge_assessment",
    entityId,
    beforeState,
    afterState,
    request,
    createdAt: new Date().toISOString()
  };
}

function syntheticAssessmentIdForAssignment(assignmentId: string) {
  return assignmentId;
}

function ensureJudge(session: SessionProfile) {
  if (!session.roleAssignments.some((assignment) => assignment.status === "ACTIVE" && assignment.role === "JUDGE")) {
    throw new ApiError("forbidden", 403, "Assessment access requires judge role.");
  }
}

function ensureAdminAccess(session: SessionProfile, ownership: ResourceOwnership) {
  if (!hasRoleAssignmentForResource(session, ownership, ["SUPER_ADMIN", "KBT_ADMIN"])) {
    throw new ApiError("forbidden", 403, "Actor is not allowed to access this episode.");
  }
}

function assertAccepted(access: AssignmentAccess) {
  if (access.status !== "ACCEPTED") {
    throw new ApiError("forbidden", 403, "Assessment mutations require an accepted judge assignment.");
  }
}

async function loadTemplate(client: SqlClient): Promise<AssessmentTemplate> {
  const template = (await client.query<{
    id: string;
    award_track_code: string;
    cycle_year: number;
    source: string;
    pass_threshold_percent: number;
  }>(
    "SELECT id, award_track_code, cycle_year, source, pass_threshold_percent FROM assessment_template_configs ORDER BY updated_at_utc DESC LIMIT 1"
  )).rows[0];
  if (!template) throw new ApiError("dependency_missing", 404, "Assessment template configuration was not found.");
  const criteria = await client.query<{
    criterion_id: string;
    code: string;
    label: string;
    max_score: number;
    placeholder_only: boolean;
  }>(
    "SELECT criterion_id, code, label, max_score, placeholder_only FROM assessment_template_criteria WHERE template_config_id = $1 ORDER BY sort_order",
    [template.id]
  );
  return {
    templateId: template.id,
    awardTrackCode: template.award_track_code,
    cycleYear: template.cycle_year,
    source: "configurable_lower_env",
    passThresholdPercent: template.pass_threshold_percent,
    criteria: criteria.rows.map((criterion) => ({
      criterionId: criterion.criterion_id,
      code: criterion.code,
      label: criterion.label,
      maxScore: criterion.max_score,
      placeholderOnly: true
    }))
  };
}

async function loadAssignmentAccess(client: SqlClient, session: SessionProfile, assignmentId: string, lock = false): Promise<AssignmentAccess> {
  ensureJudge(session);
  const row = (await client.query<{
    assignment_id: string;
    allocation_id: string;
    episode_id: string;
    assessor_profile_id: string;
    assignment_status: string;
    episode_type: string;
    park_id: string;
    organisation_id: string;
    country_code: string | null;
  }>(
    `
      SELECT ja.id AS assignment_id, ja.allocation_id, ja.assessment_episode_id AS episode_id,
        ja.assessor_profile_id, ja.status AS assignment_status, ae.episode_type,
        ae.park_id, p.organisation_id, ac.country_code
      FROM judge_assignments ja
      JOIN assessor_profiles ap ON ap.id = ja.assessor_profile_id
      JOIN assessment_episodes ae ON ae.id = ja.assessment_episode_id
      JOIN parks p ON p.id = ae.park_id
      JOIN award_cycles ac ON ac.id = ae.award_cycle_id
      WHERE ja.id = $1 AND ap.internal_user_id = $2
      ${lock ? "FOR UPDATE OF ja, ae" : ""}
    `,
    [assignmentId, session.actor.actorId]
  )).rows[0];
  if (!row) throw new ApiError("dependency_missing", 404, "Assignment was not found.");
  if (!["RELEASED", "ACCEPTED"].includes(row.assignment_status)) {
    throw new ApiError("forbidden", 403, "Judge assignment is not active for assessment access.");
  }
  return {
    assignmentId: row.assignment_id,
    allocationId: row.allocation_id,
    episodeId: row.episode_id,
    assessorId: row.assessor_profile_id,
    status: row.assignment_status as AssignmentAccess["status"],
    episodeType: row.episode_type as AssignmentAccess["episodeType"],
    parkId: row.park_id,
    organisationId: row.organisation_id,
    countryCode: row.country_code ?? "lower-env"
  };
}

async function loadAccessForAssessment(client: SqlClient, session: SessionProfile, assessmentId: string, lock = false) {
  const assessment = (await client.query<{ judge_assignment_id: string }>(
    `SELECT judge_assignment_id FROM judge_assessments WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [assessmentId]
  )).rows[0];
  const assignmentId = assessment?.judge_assignment_id ?? assessmentId;
  return loadAssignmentAccess(client, session, assignmentId, lock);
}

async function rowToAssessment(client: SqlClient, row: AssessmentRow, template: AssessmentTemplate): Promise<Assessment> {
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
  return judgeAssessmentResponseSchema.shape.assessment.parse({
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

async function loadAssessmentById(client: SqlClient, assessmentId: string, template: AssessmentTemplate, lock = false) {
  const row = (await client.query<AssessmentRow>(
    `SELECT * FROM judge_assessments WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [assessmentId]
  )).rows[0];
  return row ? rowToAssessment(client, row, template) : null;
}

async function loadAssessmentByAssignment(client: SqlClient, assignmentId: string, template: AssessmentTemplate, lock = false) {
  const row = (await client.query<AssessmentRow>(
    `SELECT * FROM judge_assessments WHERE judge_assignment_id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [assignmentId]
  )).rows[0];
  return row ? rowToAssessment(client, row, template) : null;
}

function draftAssessment(access: AssignmentAccess, template: AssessmentTemplate): Assessment {
  const maxScoreTotal = template.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
  return judgeAssessmentResponseSchema.shape.assessment.parse({
    assessmentId: syntheticAssessmentIdForAssignment(access.assignmentId),
    assignmentId: access.assignmentId,
    episodeId: access.episodeId,
    assessorId: access.assessorId,
    status: "NOT_STARTED",
    template,
    scores: [],
    rawScoreTotal: 0,
    maxScoreTotal,
    thresholdMet: false,
    evidence: [],
    offlineSyncVersion: 0,
    version: 0,
    updatedAt: new Date(0).toISOString()
  });
}

async function ensureAssessmentRow(client: SqlClient, access: AssignmentAccess, template: AssessmentTemplate, assessmentId: string) {
  const existing = await loadAssessmentById(client, assessmentId, template, true);
  if (existing) return existing;
  if (assessmentId !== syntheticAssessmentIdForAssignment(access.assignmentId)) {
    throw new ApiError("dependency_missing", 404, "Assessment was not found.");
  }
  const maxScoreTotal = template.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
  await client.query(
    `
      INSERT INTO judge_assessments (
        id, judge_assignment_id, assessment_episode_id, assessor_profile_id, status,
        raw_score_total, max_score_total, threshold_met, offline_sync_version, version, updated_at_utc
      )
      VALUES ($1, $2, $3, $4, 'NOT_STARTED', 0, $5, false, 0, 0, now())
      ON CONFLICT (judge_assignment_id) DO NOTHING
    `,
    [assessmentId, access.assignmentId, access.episodeId, access.assessorId, maxScoreTotal]
  );
  const created = await loadAssessmentByAssignment(client, access.assignmentId, template, true);
  if (!created) throw new Error("Assessment row was not readable after creation.");
  return created;
}

function calculateTotals(template: AssessmentTemplate, scores: { score: number }[]) {
  const rawScoreTotal = scores.reduce((sum, score) => sum + score.score, 0);
  const maxScoreTotal = template.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
  return {
    rawScoreTotal,
    maxScoreTotal,
    thresholdMet: (rawScoreTotal / maxScoreTotal) * 100 >= template.passThresholdPercent
  };
}

export interface AssessmentRepository {
  listVisits(actorId: string): Promise<unknown>;
  getAssessment(input: { assignmentId: string; session: SessionProfile }): Promise<unknown>;
  scheduleVisit(input: { assignmentId: string; body: { scheduledStartAt: string; scheduledEndAt: string; clientVersion: number; idempotencyKey?: string | undefined }; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  updateScores(input: { assessmentId: string; body: { clientVersion: number; offlineSyncVersion: number; scores: { criterionId: string; score: number; notes?: string | undefined }[]; idempotencyKey?: string | undefined }; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  addEvidence(input: { assessmentId: string; body: { evidenceType: "photo" | "note" | "document"; filename: string; idempotencyKey?: string | undefined }; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  submit(input: { assessmentId: string; body: { clientVersion: number; idempotencyKey?: string | undefined }; session: SessionProfile; request: FastifyRequest }): Promise<unknown>;
  adminDetail(input: { episodeId: string; session: SessionProfile }): Promise<unknown>;
}

export class PostgresAssessmentRepository implements AssessmentRepository {
  constructor(
    private readonly client: SqlClient,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditLedger: AuditLedger
  ) {}

  async listVisits(actorId: string) {
    const visits = await this.client.query<{
      id: string;
      judge_assignment_id: string;
      assessment_episode_id: string;
      assessor_profile_id: string;
      status: string;
      scheduled_start_at_utc: Date | string | null;
      scheduled_end_at_utc: Date | string | null;
      location_disclosure: string;
      version: number;
    }>(
      `
        SELECT av.*
        FROM assessment_visits av
        JOIN assessor_profiles ap ON ap.id = av.assessor_profile_id
        WHERE ap.internal_user_id = $1
        ORDER BY av.scheduled_start_at_utc DESC NULLS LAST, av.updated_at_utc DESC
      `,
      [actorId]
    );
    return assessorVisitsResponseSchema.parse({
      items: visits.rows.map((row) => ({
        visitId: row.id,
        assignmentId: row.judge_assignment_id,
        episodeId: row.assessment_episode_id,
        assessorId: row.assessor_profile_id,
        status: row.status,
        ...(row.scheduled_start_at_utc ? { scheduledStartAt: iso(row.scheduled_start_at_utc) } : {}),
        ...(row.scheduled_end_at_utc ? { scheduledEndAt: iso(row.scheduled_end_at_utc) } : {}),
        locationDisclosure: row.location_disclosure,
        version: row.version
      }))
    });
  }

  async getAssessment({ assignmentId, session }: Parameters<AssessmentRepository["getAssessment"]>[0]) {
    const access = await loadAssignmentAccess(this.client, session, assignmentId);
    const template = await loadTemplate(this.client);
    const assessment = await loadAssessmentByAssignment(this.client, assignmentId, template);
    return judgeAssessmentResponseSchema.parse({ assessment: assessment ?? draftAssessment(access, template) });
  }

  async scheduleVisit({ assignmentId, body, session, request }: Parameters<AssessmentRepository["scheduleVisit"]>[0]) {
    requireMutationAllowed(session);
    return this.unitOfWork.run(async ({ client }) => {
      const access = await loadAssignmentAccess(client, session, assignmentId, true);
      assertAccepted(access);
      const existing = (await client.query<AssessmentVisit & { id: string; version: number }>(
        "SELECT id, version FROM assessment_visits WHERE judge_assignment_id = $1 FOR UPDATE",
        [assignmentId]
      )).rows[0];
      if (existing && existing.version !== body.clientVersion) {
        throw new ApiError("idempotency_conflict", 409, "Visit version has changed.");
      }
      const visitId = existing?.id ?? randomUUID();
      const locationDisclosure = access.episodeType === "MYSTERY_SHOP" ? "mystery_restricted" : "visible_to_assessor_only";
      if (existing) {
        await client.query(
          `
            UPDATE assessment_visits
            SET status = 'SCHEDULED',
              scheduled_start_at_utc = $2::timestamptz,
              scheduled_end_at_utc = $3::timestamptz,
              location_disclosure = $4,
              version = version + 1,
              updated_at_utc = now()
            WHERE id = $1 AND version = $5
          `,
          [visitId, body.scheduledStartAt, body.scheduledEndAt, locationDisclosure, body.clientVersion]
        );
      } else {
        await client.query(
          `
            INSERT INTO assessment_visits (
              id, judge_assignment_id, assessment_episode_id, assessor_profile_id, status,
              scheduled_start_at_utc, scheduled_end_at_utc, location_disclosure, version
            )
            VALUES ($1, $2, $3, $4, 'SCHEDULED', $5::timestamptz, $6::timestamptz, $7, 1)
          `,
          [visitId, assignmentId, access.episodeId, access.assessorId, body.scheduledStartAt, body.scheduledEndAt, locationDisclosure]
        );
      }
      const row = (await client.query<{
        id: string;
        judge_assignment_id: string;
        assessment_episode_id: string;
        assessor_profile_id: string;
        status: string;
        scheduled_start_at_utc: Date | string | null;
        scheduled_end_at_utc: Date | string | null;
        location_disclosure: string;
        version: number;
      }>("SELECT * FROM assessment_visits WHERE id = $1", [visitId])).rows[0]!;
      const visit = assessorVisitsResponseSchema.shape.items.element.parse({
        visitId: row.id,
        assignmentId: row.judge_assignment_id,
        episodeId: row.assessment_episode_id,
        assessorId: row.assessor_profile_id,
        status: row.status,
        ...(row.scheduled_start_at_utc ? { scheduledStartAt: iso(row.scheduled_start_at_utc) } : {}),
        ...(row.scheduled_end_at_utc ? { scheduledEndAt: iso(row.scheduled_end_at_utc) } : {}),
        locationDisclosure: row.location_disclosure,
        version: row.version
      });
      await appendAuditEvent(this.auditLedger, buildAuditEvent({
        action: "SCHEDULE_ASSESSMENT_VISIT",
        entityId: visit.visitId,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: existing,
        afterState: visit
      }));
      return visit;
    });
  }

  async updateScores({ assessmentId, body, session, request }: Parameters<AssessmentRepository["updateScores"]>[0]) {
    requireMutationAllowed(session);
    return this.unitOfWork.run(async ({ client }) => {
      const access = await loadAccessForAssessment(client, session, assessmentId, true);
      assertAccepted(access);
      const template = await loadTemplate(client);
      const before = await ensureAssessmentRow(client, access, template, assessmentId);
      if (before.version !== body.clientVersion) throw new ApiError("idempotency_conflict", 409, "Assessment version has changed.");
      const validCriteria = new Set(template.criteria.map((criterion) => criterion.criterionId));
      if (body.scores.some((score) => !validCriteria.has(score.criterionId))) {
        throw new ApiError("validation_failed", 400, "Assessment score criterion is not in the configured template.");
      }
      const totals = calculateTotals(template, body.scores);
      await client.query(
        `
          UPDATE judge_assessments
          SET status = 'IN_PROGRESS',
            raw_score_total = $2,
            max_score_total = $3,
            threshold_met = $4,
            offline_sync_version = $5,
            version = version + 1,
            updated_at_utc = now()
          WHERE id = $1 AND version = $6
        `,
        [assessmentId, totals.rawScoreTotal, totals.maxScoreTotal, totals.thresholdMet, body.offlineSyncVersion, body.clientVersion]
      );
      await client.query("DELETE FROM assessment_score_entries WHERE assessment_id = $1", [assessmentId]);
      for (const score of body.scores) {
        await client.query(
          `
            INSERT INTO assessment_score_entries (assessment_id, criterion_id, score, notes, updated_at_utc)
            VALUES ($1, $2, $3, $4, now())
          `,
          [assessmentId, score.criterionId, score.score, score.notes ?? null]
        );
      }
      const assessment = await loadAssessmentById(client, assessmentId, template);
      if (!assessment) throw new Error("Assessment was not readable after score update.");
      const audit = buildAuditEvent({
        action: "UPDATE_ASSESSMENT_SCORES",
        entityId: assessmentId,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: before,
        afterState: assessment
      });
      await appendAuditEvent(this.auditLedger, audit);
      return assessmentCommandResponseSchema.parse({ assessment, auditEventId: audit.id });
    });
  }

  async addEvidence({ assessmentId, body, session, request }: Parameters<AssessmentRepository["addEvidence"]>[0]) {
    requireMutationAllowed(session);
    return this.unitOfWork.run(async ({ client }) => {
      const access = await loadAccessForAssessment(client, session, assessmentId, true);
      assertAccepted(access);
      const template = await loadTemplate(client);
      const before = await ensureAssessmentRow(client, access, template, assessmentId);
      const evidenceId = randomUUID();
      const visibility = access.episodeType === "MYSTERY_SHOP" ? "mystery_restricted" : "admin_and_assessor";
      await client.query(
        `
          INSERT INTO assessment_evidence (id, assessment_id, evidence_type, filename, visibility, storage_provider, storage_key)
          VALUES ($1, $2, $3, $4, $5, 'lower_env_stub', $6)
        `,
        [evidenceId, assessmentId, body.evidenceType, body.filename, visibility, `metadata-only/assessments/${assessmentId}/${evidenceId}`]
      );
      await client.query(
        "UPDATE judge_assessments SET version = version + 1, updated_at_utc = now() WHERE id = $1",
        [assessmentId]
      );
      const assessment = await loadAssessmentById(client, assessmentId, template);
      if (!assessment) throw new Error("Assessment was not readable after evidence update.");
      const audit = buildAuditEvent({
        action: "ADD_ASSESSMENT_EVIDENCE",
        entityId: assessmentId,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: { evidenceCount: before.evidence.length },
        afterState: assessment.evidence.at(-1)
      });
      await appendAuditEvent(this.auditLedger, audit);
      return assessmentCommandResponseSchema.parse({ assessment, auditEventId: audit.id });
    });
  }

  async submit({ assessmentId, body, session, request }: Parameters<AssessmentRepository["submit"]>[0]) {
    requireMutationAllowed(session);
    return this.unitOfWork.run(async ({ client }) => {
      const access = await loadAccessForAssessment(client, session, assessmentId, true);
      assertAccepted(access);
      const template = await loadTemplate(client);
      const before = await loadAssessmentById(client, assessmentId, template, true);
      if (!before) throw new ApiError("dependency_missing", 404, "Assessment was not found.");
      if (before.version !== body.clientVersion) throw new ApiError("idempotency_conflict", 409, "Assessment version has changed.");
      if (before.scores.length < template.criteria.length) {
        throw new ApiError("invalid_state", 409, "All placeholder criteria require a score before submission.");
      }
      await client.query(
        `
          UPDATE judge_assessments
          SET status = 'SUBMITTED',
            version = version + 1,
            updated_at_utc = now()
          WHERE id = $1 AND version = $2
        `,
        [assessmentId, body.clientVersion]
      );
      const assessment = await loadAssessmentById(client, assessmentId, template);
      if (!assessment) throw new Error("Assessment was not readable after submit.");
      const audit = buildAuditEvent({
        action: "SUBMIT_ASSESSMENT",
        entityId: assessmentId,
        actor: session.actor,
        request: requestMetadata(request, body.idempotencyKey),
        beforeState: before,
        afterState: assessment
      });
      await appendAuditEvent(this.auditLedger, audit);
      return assessmentCommandResponseSchema.parse({ assessment, auditEventId: audit.id });
    });
  }

  async adminDetail({ episodeId, session }: Parameters<AssessmentRepository["adminDetail"]>[0]) {
    const context = (await this.client.query<{
      park_id: string;
      organisation_id: string;
      country_code: string | null;
    }>(
      `
        SELECT ae.park_id, p.organisation_id, ac.country_code
        FROM assessment_episodes ae
        JOIN parks p ON p.id = ae.park_id
        JOIN award_cycles ac ON ac.id = ae.award_cycle_id
        WHERE ae.id = $1
      `,
      [episodeId]
    )).rows[0];
    if (!context) throw new ApiError("dependency_missing", 404, "Assessment episode was not found.");
    ensureAdminAccess(session, {
      parkId: context.park_id,
      organisationId: context.organisation_id,
      countryCode: context.country_code ?? "lower-env"
    });
    const template = await loadTemplate(this.client);
    const rows = await this.client.query<AssessmentRow>(
      "SELECT * FROM judge_assessments WHERE assessment_episode_id = $1 ORDER BY updated_at_utc DESC, id",
      [episodeId]
    );
    const assessments = [];
    for (const row of rows.rows) {
      assessments.push(await rowToAssessment(this.client, row, template));
    }
    return adminAssessmentDetailResponseSchema.parse({
      episodeId,
      assessments,
      applicantSafeProjectionAvailable: false
    });
  }
}
