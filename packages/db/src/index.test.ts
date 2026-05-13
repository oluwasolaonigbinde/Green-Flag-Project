import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  auditEventTablePolicy,
  adminOverrideEventTablePolicy,
  financeFactTablePolicy,
  goal3ADocumentMigrationSchemaPolicy,
  goal3ADocumentMigrationSchemaTables,
  goal2FinanceMigrationCoverageTables,
  lowerEnvironmentSeedPolicy,
  migrationConvention,
  slice2DomainTables,
  slice8AssessorManagementTables,
  slice9AllocationTables,
  goal5HighRiskModelTables,
  slice11AssessmentTables,
  slice12ResultTables,
  slice125NormalisedReadModelTables,
  slice13NotificationJobExportTables,
  slice1IdentityAuditTables
} from "./index.js";

const migration024Sql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/0024_document_migration_schema_foundation.sql"),
  "utf8"
);
const migration024UpSql = migration024Sql.split("-- migrate:down")[0] ?? "";

describe("db foundation conventions", () => {
  it("requires explicit migration naming and down markers", () => {
    expect(migrationConvention.pattern.test("0001_foundation_extensions.sql")).toBe(true);
    expect(migrationConvention.requiresDownMarker).toBe(true);
  });

  it("keeps seed policy synthetic", () => {
    expect(lowerEnvironmentSeedPolicy.syntheticOnly).toBe(true);
    expect(lowerEnvironmentSeedPolicy.forbiddenValues).toContain("production_fees");
  });

  it("tracks the approved Slice 1 identity and audit tables", () => {
    expect(slice1IdentityAuditTables).toContain("audit_events");
    expect(slice1IdentityAuditTables).toContain("admin_override_events");
    expect(auditEventTablePolicy.appendOnly).toBe(true);
    expect(auditEventTablePolicy.immutableOperations).toContain("DELETE");
    expect(adminOverrideEventTablePolicy.requiresReason).toBe(true);
    expect(adminOverrideEventTablePolicy.linksAuditEventWhereAvailable).toBe(true);
  });

  it("tracks the approved Slice 2 domain tables", () => {
    expect(slice2DomainTables).toContain("assessment_episodes");
    expect(slice2DomainTables).toContain("parks");
  });

  it("tracks the approved Slice 8 assessor management tables", () => {
    expect(slice8AssessorManagementTables).toContain("assessor_profiles");
    expect(slice8AssessorManagementTables).toContain("assessor_capacity_declarations");
  });

  it("tracks the approved Slice 9 allocation tables", () => {
    expect(slice9AllocationTables).toContain("allocations");
    expect(slice9AllocationTables).toContain("judge_assignments");
    expect(slice9AllocationTables).toContain("allocation_coi_flags");
  });

  it("tracks the approved Goal 5 high-risk model correction tables", () => {
    expect(goal5HighRiskModelTables).toContain("park_area_measurements");
    expect(goal5HighRiskModelTables).toContain("application_area_snapshots");
  });

  it("tracks the approved Goal 2 finance migration coverage tables", () => {
    expect(goal2FinanceMigrationCoverageTables).toContain("fee_schedules");
    expect(goal2FinanceMigrationCoverageTables).toContain("fee_schedule_lines");
    expect(goal2FinanceMigrationCoverageTables).toContain("invoice_lines");
    expect(goal2FinanceMigrationCoverageTables).toContain("payment_events");
    expect(goal2FinanceMigrationCoverageTables).toContain("finance_export_runs");
    expect(financeFactTablePolicy.paymentEventsAppendOnly).toBe(true);
    expect(financeFactTablePolicy.invoiceLinesImmutable).toBe(true);
    expect(financeFactTablePolicy.issuedInvoiceFactsImmutable).toBe(true);
  });

  it("tracks the approved Goal 3A inert document migration schema tables", () => {
    expect(goal3ADocumentMigrationSchemaTables).toContain("document_subtypes");
    expect(goal3ADocumentMigrationSchemaTables).toContain("document_asset_ownerships");
    expect(goal3ADocumentMigrationSchemaTables).toContain("migration_document_file_references");
    expect(goal3ADocumentMigrationSchemaPolicy.inertAdditiveSchemaOnly).toBe(true);
    expect(goal3ADocumentMigrationSchemaPolicy.subtypePrimaryKey).toBe("code");
    expect(goal3ADocumentMigrationSchemaPolicy.taxonomyVersionIsMetadata).toBe(true);
    expect(goal3ADocumentMigrationSchemaPolicy.rawLegacyFileEvidenceInternalOnly).toBe(true);
  });

  it("keeps Goal 3A subtype taxonomy stable and version metadata-only", () => {
    expect(migration024UpSql).toContain("CREATE TABLE IF NOT EXISTS document_subtypes");
    expect(migration024UpSql).toContain("code text PRIMARY KEY");
    expect(migration024UpSql).toContain("taxonomy_version text NOT NULL");
    expect(migration024UpSql).not.toContain("PRIMARY KEY (code, taxonomy_version)");
    expect(migration024UpSql).toContain("allowed_mime_types text[] NOT NULL DEFAULT '{}'::text[]");
    expect(migration024UpSql).toContain("max_byte_size integer CHECK");
    expect(migration024UpSql).toContain("migration_required boolean NOT NULL DEFAULT false");
    expect(migration024UpSql).toContain("status text NOT NULL CHECK (status IN ('active', 'planned', 'external_approval_required', 'superseded', 'voided'))");
    expect(migration024UpSql).toContain("('management_plan', 'document-subtypes.v1', 'Management plan', 'active'");
    expect(migration024UpSql).toContain("('invoice_artifact', 'document-subtypes.v1', 'Invoice artifact', 'external_approval_required'");
    expect(migration024UpSql).toContain("('certificate', 'document-subtypes.v1', 'Certificate', 'external_approval_required'");
    expect(migration024UpSql).toContain("('assessor_cv', 'document-subtypes.v1', 'Assessor CV', 'external_approval_required'");
    expect(migration024UpSql).toContain("('voice_note', 'document-subtypes.v1', 'Voice note', 'external_approval_required'");
    expect(migration024UpSql).toContain("('public_resource', 'document-subtypes.v1', 'Public resource', 'external_approval_required'");
  });

  it("keeps Goal 3A ownership and provenance schema additive and duplicate-safe", () => {
    expect(migration024UpSql).toContain("ADD COLUMN IF NOT EXISTS document_subtype text REFERENCES document_subtypes(code) ON DELETE RESTRICT");
    expect(migration024UpSql).not.toMatch(/ALTER TABLE document_upload_sessions/i);
    expect(migration024UpSql).not.toMatch(/ALTER TABLE document_upload_chunks/i);
    expect(migration024UpSql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
    expect(migration024UpSql).toContain("UNIQUE (document_asset_id, owner_type, owner_id, owner_context_role)");
    expect(migration024UpSql).toContain("source_reference_key text NOT NULL DEFAULT 'default'");
    expect(migration024UpSql).toContain("UNIQUE (import_batch_id, source_table, source_column, source_primary_key, source_reference_key)");
    expect(migration024UpSql).toContain("import_status text NOT NULL CHECK (import_status IN (");
    expect(migration024UpSql).toContain("'pending_manifest'");
    expect(migration024UpSql).toContain("'intentionally_not_needed'");
  });

  it("tracks the approved Slice 11 assessment tables", () => {
    expect(slice11AssessmentTables).toContain("assessment_template_criteria");
    expect(slice11AssessmentTables).toContain("assessment_visits");
    expect(slice11AssessmentTables).toContain("judge_assessments");
    expect(slice11AssessmentTables).toContain("assessment_evidence");
  });

  it("tracks the approved Slice 12 result publication tables", () => {
    expect(slice12ResultTables).toContain("decision_results");
    expect(slice12ResultTables).toContain("result_artifacts");
    expect(slice12ResultTables).toContain("public_map_update_events");
  });

  it("tracks the approved Slice 12.5 normalized read-model tables", () => {
    expect(slice125NormalisedReadModelTables).toContain("assessment_score_entries");
  });

  it("tracks the approved Slice 13 notification, job, and export tables", () => {
    expect(slice13NotificationJobExportTables).toContain("notification_queue");
    expect(slice13NotificationJobExportTables).toContain("message_threads");
    expect(slice13NotificationJobExportTables).toContain("export_jobs");
  });
});
