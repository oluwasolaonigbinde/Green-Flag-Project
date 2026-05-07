export interface RuntimeSafetyIssue {
  code: string;
  component: string;
  detail: string;
  action: string;
}

const lowerEnvProviderIssues: RuntimeSafetyIssue[] = [
  {
    code: "lower_env_fixture_provider",
    component: "lower-env fixture providers",
    detail: "The API still exposes lowerEnvironment* fixtures and configurable_lower_env template/policy defaults for local and test workflows.",
    action: "Replace fixture-backed read/model defaults with production import/config providers before enabling production or staging."
  },
  {
    code: "lower_env_storage_provider",
    component: "document/result/evidence storage",
    detail: "Document upload/download, assessment evidence, result artifacts, and certificate shells use lower_env_stub storage or lower-env-storage.invalid URLs.",
    action: "Wire a production object-storage provider and signed URL implementation, then update this startup guard."
  },
  {
    code: "lower_env_notification_dispatcher",
    component: "notifications",
    detail: "Notification dispatch is queued/stubbed with adapter_not_configured logs and no production email/SMS dispatcher.",
    action: "Wire production notification dispatchers and approved templates before enabling production or staging."
  },
  {
    code: "lower_env_export_provider",
    component: "exports",
    detail: "Export jobs currently complete against lower_env_stub artifact storage.",
    action: "Wire a production export artifact provider and retention/delivery policy before enabling production or staging."
  },
  {
    code: "fake_contact_provider",
    component: "allocation contact reveal",
    detail: "Assessor contact reveal still uses example.invalid lower-env contact details.",
    action: "Wire contact details from the authoritative production applicant/park contact source before enabling production or staging."
  }
];

function paymentRuntimeIssues(env: NodeJS.ProcessEnv): RuntimeSafetyIssue[] {
  const manualMvpEnabled = env.PAYMENT_RUNTIME_MODE === "manual_mvp";
  const manualOfflineInvoiceEnabled = env.INVOICE_RUNTIME_MODE === "manual_offline";
  const issues: RuntimeSafetyIssue[] = [];
  if (!manualMvpEnabled) {
    issues.push({
      code: "lower_env_payment_provider",
      component: "payments and invoices",
      detail: "Payment handling is not configured for an approved production/staging mode. Fake/lower-env payment shells and placeholder online automation are blocked.",
      action: "Set PAYMENT_RUNTIME_MODE=manual_mvp for approved manual payment confirmation, or configure a real provider in a later pass."
    });
  }
  if (!manualOfflineInvoiceEnabled) {
    issues.push({
      code: "missing_production_invoice_configuration",
      component: "invoice generation",
      detail: "Production/staging invoice generation still uses external_value_unavailable fee markers and lacks approved fee, VAT, and legal invoice configuration.",
      action: "Provide approved fee/VAT/legal invoice configuration or explicitly set INVOICE_RUNTIME_MODE=manual_offline for approved manual/offline invoice handling."
    });
  }
  return issues;
}

export function isProductionLikeRuntime(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" || env.API_RUNTIME_MODE === "production" || env.API_RUNTIME_MODE === "staging";
}

export function collectProductionRuntimeSafetyIssues({
  env = process.env,
  databaseConfigured,
  dbFirstRepositoriesConfigured = false
}: {
  env?: NodeJS.ProcessEnv;
  databaseConfigured: boolean;
  dbFirstRepositoriesConfigured?: boolean;
}): RuntimeSafetyIssue[] {
  if (!isProductionLikeRuntime(env)) {
    return [];
  }

  const issues: RuntimeSafetyIssue[] = [];
  if (!databaseConfigured) {
    issues.push({
      code: "in_memory_mutable_stores",
      component: "domain stores",
      detail: "DATABASE_URL is not configured, so startup would fall back to map-backed mutable in-memory stores.",
      action: "Set DATABASE_URL for the PostgreSQL runtime or run with API_RUNTIME_MODE=local/test/lower-env."
    });
  }
  if (databaseConfigured && !dbFirstRepositoriesConfigured) {
    issues.push({
      code: "canonical_mutable_postgres_hydrated_stores",
      component: "registration/applicant/document/payment/allocation/assessor persistence",
      detail: "Production/staging registration, applicant, document, payment, allocation, or assessor routes would use mutable PostgreSQL-hydrated Map stores as canonical persistence.",
      action: "Wire DB-first repositories for these route families; Map-backed stores are allowed only in explicit local/test/lower-env modes."
    });
  }
  issues.push(...lowerEnvProviderIssues);
  issues.push(...paymentRuntimeIssues(env));
  return issues;
}

export function assertProductionRuntimeSafety({
  env = process.env,
  databaseConfigured,
  dbFirstRepositoriesConfigured = false
}: {
  env?: NodeJS.ProcessEnv;
  databaseConfigured: boolean;
  dbFirstRepositoriesConfigured?: boolean;
}) {
  const issues = collectProductionRuntimeSafetyIssues({ env, databaseConfigured, dbFirstRepositoriesConfigured });
  if (issues.length === 0) {
    return;
  }

  const details = issues
    .map((issue) => `- ${issue.component}: ${issue.detail} Action: ${issue.action}`)
    .join("\n");
  throw new Error(
    `Unsafe production-like API runtime configuration. Production/staging startup is fail-closed until unsafe lower-env providers and mutable store fallbacks are removed.\n${details}`
  );
}
