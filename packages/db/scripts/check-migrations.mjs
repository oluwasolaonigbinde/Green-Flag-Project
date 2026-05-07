import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationDir = new URL("../migrations", import.meta.url);
const migrationDirPath = fileURLToPath(migrationDir);
const files = readdirSync(migrationDir).filter((file) => file.endsWith(".sql"));
const forbiddenLaterSliceTables = [
  /applications/i,
  /allocations/i,
  /documents/i,
  /invoices/i,
  /messages/i,
  /notifications/i,
  /payments/i,
  /public_map_update_events/i,
  /results/i,
  /scores/i,
  /assessment_template_configs/i,
  /assessment_visits/i,
  /judge_assessments/i,
  /assessment_evidence/i,
  /judge_profiles/i,
  /judge_exclusions/i,
  /judge_assignment_history/i,
  /judge_clusters/i,
  /judge_assignments/i,
  /decision_results/i,
  /result_artifacts/i,
  /park_award_cache/i,
  /assessment_score_entries/i,
  /visits/i
];
const approvedSlice3Tables = [
  "registration_submissions",
  "registration_verification_tokens",
  "registration_notification_intents"
];
const approvedSlice4Tables = [
  "applications",
  "application_sections",
  "application_field_values",
  "application_feedback_responses"
];
const approvedSlice5Tables = [
  "document_assets",
  "document_upload_sessions",
  "document_upload_chunks"
];
const approvedSlice6Tables = [
  "application_submissions",
  "invoices",
  "payment_states",
  "payment_notification_intents"
];
const approvedSlice8Tables = [
  "assessor_profiles",
  "assessor_preferences",
  "assessor_availability_windows",
  "assessor_capacity_declarations"
];
const approvedSlice9Tables = [
  "allocation_policy_configs",
  "allocations",
  "judge_assignments",
  "allocation_coi_flags"
];
const approvedSlice11Tables = [
  "assessment_template_configs",
  "assessment_template_criteria",
  "assessment_visits",
  "judge_assessments",
  "assessment_evidence"
];
const approvedSlice12Tables = [
  "decision_results",
  "result_artifacts",
  "park_award_cache",
  "public_map_update_events"
];
const approvedSlice125Tables = [
  "assessment_score_entries"
];
const approvedSlice13Tables = [
  "notification_template_versions",
  "notification_queue",
  "notification_logs",
  "notification_suppressions",
  "message_threads",
  "message_entries",
  "job_runs",
  "export_jobs",
  "applications",
  "payments",
  "results"
];

if (files.length === 0) {
  throw new Error("No SQL migrations found");
}

for (const file of files) {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) {
    throw new Error(`Migration ${file} does not match NNNN_descriptive_name.sql`);
  }

  const sql = readFileSync(join(migrationDirPath, file), "utf8");
  let sqlBody = sql.replace(/^--.*$/gm, "");
  for (const table of approvedSlice3Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  for (const table of approvedSlice4Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  for (const table of approvedSlice5Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  for (const table of approvedSlice6Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  for (const table of approvedSlice8Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  for (const table of approvedSlice9Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  for (const table of approvedSlice11Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  for (const table of approvedSlice12Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  for (const table of approvedSlice125Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  for (const table of approvedSlice13Tables) {
    sqlBody = sqlBody.replaceAll(table, "");
  }
  if (!sql.includes("-- migrate:down")) {
    throw new Error(`Migration ${file} is missing -- migrate:down marker`);
  }

  if (forbiddenLaterSliceTables.some((pattern) => pattern.test(sqlBody))) {
    throw new Error(`Migration ${file} contains later-slice domain tables`);
  }
}

console.log(`Migration convention check passed for ${files.length} file(s)`);
