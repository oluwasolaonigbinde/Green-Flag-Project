
import type { SqlClient } from "@green-flag/db";
import { assessorVisitsResponseSchema, judgeAssessmentResponseSchema } from "@green-flag/contracts";
import { createAssessmentStore, type AssessmentStore } from "../assessment.js";
import { iso } from "./shared.js";

export async function hydrateAssessmentStore(client: SqlClient) {
  const store = createAssessmentStore();
  store.visits.clear();
  store.assessments.clear();
  const templateRows = await client.query<{
    id: string;
    award_track_code: string;
    cycle_year: number;
    source: string;
    pass_threshold_percent: number;
  }>("SELECT id, award_track_code, cycle_year, source, pass_threshold_percent FROM assessment_template_configs ORDER BY updated_at_utc DESC LIMIT 1");
  const templateRow = templateRows.rows[0];
  if (templateRow) {
    const criteria = await client.query<{
      criterion_id: string;
      code: string;
      label: string;
      max_score: number;
      placeholder_only: boolean;
    }>("SELECT criterion_id, code, label, max_score, placeholder_only FROM assessment_template_criteria WHERE template_config_id = $1 ORDER BY sort_order", [templateRow.id]);
    store.template = {
      templateId: templateRow.id,
      awardTrackCode: templateRow.award_track_code,
      cycleYear: templateRow.cycle_year,
      source: templateRow.source as "configurable_lower_env",
      passThresholdPercent: templateRow.pass_threshold_percent,
      criteria: criteria.rows.map((criterion) => ({
        criterionId: criterion.criterion_id,
        code: criterion.code,
        label: criterion.label,
        maxScore: criterion.max_score,
        placeholderOnly: criterion.placeholder_only as true
      }))
    };
  }
  const visitRows = await client.query<{
    id: string;
    judge_assignment_id: string;
    assessment_episode_id: string;
    assessor_profile_id: string;
    status: string;
    scheduled_start_at_utc: Date | string | null;
    scheduled_end_at_utc: Date | string | null;
    location_disclosure: string;
    version: number;
  }>("SELECT * FROM assessment_visits");
  for (const row of visitRows.rows) {
    store.visits.set(row.id, assessorVisitsResponseSchema.shape.items.element.parse({
      visitId: row.id,
      assignmentId: row.judge_assignment_id,
      episodeId: row.assessment_episode_id,
      assessorId: row.assessor_profile_id,
      status: row.status,
      ...(row.scheduled_start_at_utc ? { scheduledStartAt: iso(row.scheduled_start_at_utc) } : {}),
      ...(row.scheduled_end_at_utc ? { scheduledEndAt: iso(row.scheduled_end_at_utc) } : {}),
      locationDisclosure: row.location_disclosure,
      version: row.version
    }));
  }
  const assessmentRows = await client.query<{
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
  }>("SELECT * FROM judge_assessments");
  for (const row of assessmentRows.rows) {
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
    }>("SELECT * FROM assessment_evidence WHERE assessment_id = $1 ORDER BY created_at_utc", [row.id]);
    store.assessments.set(row.id, judgeAssessmentResponseSchema.shape.assessment.parse({
      assessmentId: row.id,
      assignmentId: row.judge_assignment_id,
      episodeId: row.assessment_episode_id,
      assessorId: row.assessor_profile_id,
      status: row.status,
      template: store.template,
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
    }));
  }
  return store;
}

export async function flushAssessmentStore(client: SqlClient, store: AssessmentStore) {
  await client.query(
    `
      INSERT INTO assessment_template_configs (id, award_track_code, cycle_year, source, pass_threshold_percent)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        source = EXCLUDED.source,
        pass_threshold_percent = EXCLUDED.pass_threshold_percent,
        updated_at_utc = now()
    `,
    [
      store.template.templateId,
      store.template.awardTrackCode,
      store.template.cycleYear,
      store.template.source,
      store.template.passThresholdPercent
    ]
  );
  await client.query("DELETE FROM assessment_template_criteria WHERE template_config_id = $1", [store.template.templateId]);
  for (const [index, criterion] of store.template.criteria.entries()) {
    await client.query(
      `
        INSERT INTO assessment_template_criteria (
          template_config_id, criterion_id, code, label, max_score, placeholder_only, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (template_config_id, criterion_id) DO UPDATE SET
          code = EXCLUDED.code,
          label = EXCLUDED.label,
          max_score = EXCLUDED.max_score,
          placeholder_only = EXCLUDED.placeholder_only,
          sort_order = EXCLUDED.sort_order
      `,
      [
        store.template.templateId,
        criterion.criterionId,
        criterion.code,
        criterion.label,
        criterion.maxScore,
        criterion.placeholderOnly,
        index
      ]
    );
  }
  for (const [id, visit] of store.visits) {
    await client.query(
      `
        INSERT INTO assessment_visits (
          id, judge_assignment_id, assessment_episode_id, assessor_profile_id, status,
          scheduled_start_at_utc, scheduled_end_at_utc, location_disclosure, version
        )
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          scheduled_start_at_utc = EXCLUDED.scheduled_start_at_utc,
          scheduled_end_at_utc = EXCLUDED.scheduled_end_at_utc,
          location_disclosure = EXCLUDED.location_disclosure,
          version = EXCLUDED.version,
          updated_at_utc = now()
      `,
      [id, visit.assignmentId, visit.episodeId, visit.assessorId, visit.status, visit.scheduledStartAt ?? null, visit.scheduledEndAt ?? null, visit.locationDisclosure, visit.version]
    );
  }
  for (const [id, assessment] of store.assessments) {
    await client.query(
      `
        INSERT INTO judge_assessments (
          id, judge_assignment_id, assessment_episode_id, assessor_profile_id, status,
          raw_score_total, max_score_total, threshold_met, offline_sync_version, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          raw_score_total = EXCLUDED.raw_score_total,
          max_score_total = EXCLUDED.max_score_total,
          threshold_met = EXCLUDED.threshold_met,
          offline_sync_version = EXCLUDED.offline_sync_version,
          version = EXCLUDED.version,
          updated_at_utc = now()
      `,
      [id, assessment.assignmentId, assessment.episodeId, assessment.assessorId, assessment.status, assessment.rawScoreTotal, assessment.maxScoreTotal, assessment.thresholdMet, assessment.offlineSyncVersion, assessment.version]
    );
    await client.query("DELETE FROM assessment_score_entries WHERE assessment_id = $1", [id]);
    for (const score of assessment.scores) {
      await client.query(
        `
          INSERT INTO assessment_score_entries (assessment_id, criterion_id, score, notes, updated_at_utc)
          VALUES ($1, $2, $3, $4, $5::timestamptz)
          ON CONFLICT (assessment_id, criterion_id) DO UPDATE SET
            score = EXCLUDED.score,
            notes = EXCLUDED.notes,
            updated_at_utc = EXCLUDED.updated_at_utc
        `,
        [id, score.criterionId, score.score, score.notes ?? null, assessment.updatedAt]
      );
    }
    for (const evidence of assessment.evidence) {
      await client.query(
        `
          INSERT INTO assessment_evidence (id, assessment_id, evidence_type, filename, visibility, storage_provider, storage_key, created_at_utc)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
          ON CONFLICT (id) DO NOTHING
        `,
        [evidence.evidenceId, id, evidence.evidenceType, evidence.filename, evidence.visibility, evidence.storageProvider, evidence.storageKey, evidence.createdAt]
      );
    }
  }
}
