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
