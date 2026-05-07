
import type { SqlClient } from "@green-flag/db";
import { adminResultDetailResponseSchema } from "@green-flag/contracts";
import { createResultsStore, type ResultsStore } from "../results.js";
import { iso } from "./shared.js";

export async function hydrateResultsStore(client: SqlClient) {
  const store = createResultsStore();
  const decisionRows = await client.query<{
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
  }>("SELECT * FROM decision_results");
  for (const row of decisionRows.rows) {
    store.decisions.set(row.id, adminResultDetailResponseSchema.shape.decision.unwrap().parse({
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
    }));
  }
  const artifacts = await client.query<{
    id: string;
    decision_result_id: string;
    assessment_episode_id: string;
    artifact_type: string;
    storage_provider: string;
    storage_key: string;
    public_visible: boolean;
    created_at_utc: Date | string;
  }>("SELECT * FROM result_artifacts");
  for (const row of artifacts.rows) {
    store.artifacts.set(row.id, adminResultDetailResponseSchema.shape.artifacts.element.parse({
      artifactId: row.id,
      decisionId: row.decision_result_id,
      episodeId: row.assessment_episode_id,
      artifactType: row.artifact_type,
      storageProvider: row.storage_provider,
      storageKey: row.storage_key,
      publicVisible: row.public_visible,
      createdAt: iso(row.created_at_utc)
    }));
  }
  const cacheRows = await client.query<{
    park_id: string;
    assessment_episode_id: string;
    decision_result_id: string;
    result_status: string;
    display_label: string;
    published_at_utc: Date | string | null;
    updated_at_utc: Date | string;
  }>("SELECT * FROM park_award_cache");
  for (const row of cacheRows.rows) {
    store.awardCache.set(row.park_id, adminResultDetailResponseSchema.shape.awardCache.unwrap().parse({
      parkId: row.park_id,
      episodeId: row.assessment_episode_id,
      decisionId: row.decision_result_id,
      resultStatus: row.result_status,
      displayLabel: row.display_label,
      ...(row.published_at_utc ? { publishedAt: iso(row.published_at_utc) } : {}),
      updatedAt: iso(row.updated_at_utc)
    }));
  }
  const eventRows = await client.query<{
    id: string;
    decision_result_id: string;
    park_id: string;
    assessment_episode_id: string;
    event_type: string;
    status: string;
    payload: unknown;
    created_at_utc: Date | string;
  }>("SELECT * FROM public_map_update_events");
  for (const row of eventRows.rows) {
    store.publicMapEvents.set(row.id, adminResultDetailResponseSchema.shape.publicMapEvents.element.parse({
      eventId: row.id,
      decisionId: row.decision_result_id,
      parkId: row.park_id,
      episodeId: row.assessment_episode_id,
      eventType: row.event_type,
      status: row.status,
      payload: row.payload,
      createdAt: iso(row.created_at_utc)
    }));
  }
  return store;
}

export async function flushResultsStore(client: SqlClient, store: ResultsStore) {
  for (const [id, decision] of store.decisions) {
    await client.query(
      `
        INSERT INTO decision_results (
          id, assessment_episode_id, park_id, application_id, status, outcome,
          threshold_acknowledged, threshold_met, assessment_count, raw_score_total,
          max_score_total, internal_notes, published_at_utc, certificate_id, public_map_event_id,
          version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          outcome = EXCLUDED.outcome,
          threshold_acknowledged = EXCLUDED.threshold_acknowledged,
          threshold_met = EXCLUDED.threshold_met,
          assessment_count = EXCLUDED.assessment_count,
          raw_score_total = EXCLUDED.raw_score_total,
          max_score_total = EXCLUDED.max_score_total,
          internal_notes = EXCLUDED.internal_notes,
          published_at_utc = EXCLUDED.published_at_utc,
          certificate_id = EXCLUDED.certificate_id,
          public_map_event_id = EXCLUDED.public_map_event_id,
          version = EXCLUDED.version,
          updated_at_utc = now()
      `,
      [
        id,
        decision.episodeId,
        decision.parkId,
        decision.applicationId ?? null,
        decision.status,
        decision.outcome,
        decision.thresholdAcknowledged,
        decision.thresholdMet,
        decision.assessmentCount,
        decision.rawScoreTotal,
        decision.maxScoreTotal,
        decision.internalNotes ?? null,
        decision.publishedAt ?? null,
        decision.certificateId ?? null,
        decision.publicMapEventId ?? null,
        decision.version
      ]
    );
  }
  for (const [id, artifact] of store.artifacts) {
    await client.query(
      `
        INSERT INTO result_artifacts (id, decision_result_id, assessment_episode_id, artifact_type, storage_provider, storage_key, public_visible, created_at_utc)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
        ON CONFLICT (id) DO NOTHING
      `,
      [id, artifact.decisionId, artifact.episodeId, artifact.artifactType, artifact.storageProvider, artifact.storageKey, artifact.publicVisible, artifact.createdAt]
    );
  }
  for (const [parkId, cache] of store.awardCache) {
    await client.query(
      `
        INSERT INTO park_award_cache (park_id, assessment_episode_id, decision_result_id, result_status, display_label, published_at_utc)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        ON CONFLICT (park_id) DO UPDATE SET
          assessment_episode_id = EXCLUDED.assessment_episode_id,
          decision_result_id = EXCLUDED.decision_result_id,
          result_status = EXCLUDED.result_status,
          display_label = EXCLUDED.display_label,
          published_at_utc = EXCLUDED.published_at_utc,
          updated_at_utc = now()
      `,
      [parkId, cache.episodeId, cache.decisionId, cache.resultStatus, cache.displayLabel, cache.publishedAt ?? null]
    );
  }
  for (const [id, event] of store.publicMapEvents) {
    await client.query(
      `
        INSERT INTO public_map_update_events (id, decision_result_id, park_id, assessment_episode_id, event_type, status, payload, created_at_utc)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
        ON CONFLICT (id) DO NOTHING
      `,
      [id, event.decisionId, event.parkId, event.episodeId, event.eventType, event.status, JSON.stringify(event.payload), event.createdAt]
    );
  }
}
