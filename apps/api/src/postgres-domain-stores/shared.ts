
export function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function safeDisplayStatus(status: string) {
  if (status === "DRAFT") return "DRAFT";
  if (status === "SUBMITTED" || status === "SUBMITTED_WITH_MISSING_PLAN") return "SUBMITTED";
  return "IN_PROGRESS";
}

export function chunkProgress(acceptedChunks: number[], totalChunks: number) {
  return Math.round((acceptedChunks.length / totalChunks) * 100);
}
