
import type { AssessmentStore } from "../assessment.js";
import { ApiError } from "../auth.js";
import type { ResultsStore } from "./store.js";
import { assessmentsForEpisode } from "./read-models.js";

export function matchingAuditByIdempotency(store: ResultsStore, action: string, entityId: string, idempotencyKey?: string) {
  return Boolean(idempotencyKey && store.audits.some((event) =>
    event.action === action &&
    event.entityId === entityId &&
    event.request.idempotencyKey === idempotencyKey
  ));
}

export function summarizeAssessments(assessmentStore: AssessmentStore, episodeId: string) {
  const submitted = assessmentsForEpisode(assessmentStore, episodeId).filter((assessment) => assessment.status === "SUBMITTED");
  if (submitted.length === 0) throw new ApiError("invalid_state", 409, "At least one submitted assessment is required before result decision.");
  const rawScoreTotal = submitted.reduce((sum, assessment) => sum + assessment.rawScoreTotal, 0);
  const maxScoreTotal = submitted.reduce((sum, assessment) => sum + assessment.maxScoreTotal, 0);
  const thresholdMet = submitted.every((assessment) => assessment.thresholdMet);
  return { submitted, rawScoreTotal, maxScoreTotal, thresholdMet };
}
