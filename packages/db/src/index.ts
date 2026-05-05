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
