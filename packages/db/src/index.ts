export const migrationConvention = {
  directory: "packages/db/migrations",
  pattern: /^\d{4}_[a-z0-9_]+\.sql$/,
  requiresDownMarker: true
} as const;

export const lowerEnvironmentSeedPolicy = {
  syntheticOnly: true,
  forbiddenValues: [
    "production_fees",
    "vat_treatment",
    "legal_invoice_wording",
    "official_scoring_criteria",
    "applicant_score_bands",
    "provider_credentials",
    "kbt_approvals"
  ]
} as const;

export const slice2DomainTables = [
  "organisations",
  "parks",
  "park_locations",
  "award_tracks",
  "award_cycles",
  "cycle_windows",
  "assessment_episodes"
] as const;

export const slice3RegistrationTables = [
  "registration_submissions",
  "registration_verification_tokens",
  "registration_notification_intents"
] as const;

export const slice4ApplicationDraftTables = [
  "applications",
  "application_sections",
  "application_field_values",
  "application_feedback_responses"
] as const;

export const slice5DocumentTables = [
  "document_assets",
  "document_upload_sessions",
  "document_upload_chunks"
] as const;

export const slice6SubmissionPaymentTables = [
  "application_submissions",
  "invoices",
  "payment_states",
  "payment_notification_intents"
] as const;

export const slice8AssessorManagementTables = [
  "assessor_profiles",
  "assessor_preferences",
  "assessor_availability_windows",
  "assessor_capacity_declarations"
] as const;

export const slice9AllocationTables = [
  "allocation_policy_configs",
  "allocations",
  "judge_assignments",
  "allocation_coi_flags"
] as const;

export const slice11AssessmentTables = [
  "assessment_template_configs",
  "assessment_template_criteria",
  "assessment_visits",
  "judge_assessments",
  "assessment_evidence"
] as const;

export const slice12ResultTables = [
  "decision_results",
  "result_artifacts",
  "park_award_cache",
  "public_map_update_events"
] as const;

export const slice125NormalisedReadModelTables = [
  "assessment_score_entries"
] as const;

export const slice13NotificationJobExportTables = [
  "notification_template_versions",
  "notification_queue",
  "notification_logs",
  "notification_suppressions",
  "message_threads",
  "message_entries",
  "job_runs",
  "export_jobs"
] as const;

export const slice1IdentityAuditTables = [
  "internal_users",
  "cognito_identity_links",
  "role_assignments",
  "audit_events",
  "admin_override_events"
] as const;

export const auditEventTablePolicy = {
  appendOnly: true,
  immutableOperations: ["UPDATE", "DELETE"] as const
} as const;

export const adminOverrideEventTablePolicy = {
  appendOnly: true,
  requiresReason: true,
  linksAuditEventWhereAvailable: true,
  immutableOperations: ["UPDATE", "DELETE"] as const
} as const;

export {
  createPostgresPool,
  createUnitOfWork,
  isProductionLikePostgresRuntime,
  readPostgresRuntimeConfig,
  runMigrations,
  UnitOfWork,
  withTransaction,
  type PostgresRuntimeConfig,
  type PostgresSslConfig,
  type SqlClient,
  type SqlPool,
  type SqlPoolClient,
  type SqlQueryResult,
  type TransactionContext
} from "./postgres.js";
