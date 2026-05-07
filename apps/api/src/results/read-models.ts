
import type { AssessmentStore } from "../assessment.js";
import type { DecisionResult, ResultsStore } from "./store.js";

export function assessmentsForEpisode(assessmentStore: AssessmentStore, episodeId: string) {
  return [...assessmentStore.assessments.values()].filter((assessment) => assessment.episodeId === episodeId);
}

export function decisionForEpisode(store: ResultsStore, episodeId: string) {
  return [...store.decisions.values()].find((decision) => decision.episodeId === episodeId);
}

export function safeDisplayLabel(decision: DecisionResult) {
  if (decision.status === "PUBLISHED") return "Award published";
  if (decision.status === "WITHDRAWN") return "Result withdrawn";
  return "Result held";
}
