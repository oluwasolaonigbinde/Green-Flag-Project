import { randomUUID } from "node:crypto";
import type { SqlClient } from "@green-flag/db";
import { ApiError } from "../auth.js";
import type {
  MigrationArchiveRecord,
  MigrationBatchSourceTableManifest,
  MigrationEntityLink,
  MigrationImportBatch,
  MigrationMappingRule,
  MigrationReferenceRepository,
  MigrationReconciliationReport,
  MigrationReconciliationReportItem,
  MigrationReportWithItems,
  MigrationSourceRecord,
  MigrationSourceTableCatalogEntry,
  MigrationTargetEntityTypeEntry
} from "../migration-reference.js";

const targetExistenceQueries = new Map<string, string>([
  ["organisation", "SELECT 1 FROM organisations WHERE id = $1 LIMIT 1"],
  ["park", "SELECT 1 FROM parks WHERE id = $1 LIMIT 1"],
  ["park_location", "SELECT 1 FROM park_locations WHERE id = $1 LIMIT 1"],
  ["award_cycle", "SELECT 1 FROM award_cycles WHERE id = $1 LIMIT 1"],
  ["cycle_window", "SELECT 1 FROM cycle_windows WHERE id = $1 LIMIT 1"],
  ["assessment_episode", "SELECT 1 FROM assessment_episodes WHERE id = $1 LIMIT 1"],
  ["application", "SELECT 1 FROM applications WHERE id = $1 LIMIT 1"],
  ["application_section", "SELECT 1 FROM application_sections WHERE id = $1 LIMIT 1"],
  ["application_field_value", "SELECT 1 FROM application_field_values WHERE id = $1 LIMIT 1"],
  ["application_feedback_response", "SELECT 1 FROM application_feedback_responses WHERE id = $1 LIMIT 1"],
  ["document_asset", "SELECT 1 FROM document_assets WHERE id = $1 LIMIT 1"],
  ["application_submission", "SELECT 1 FROM application_submissions WHERE id = $1 LIMIT 1"],
  ["invoice", "SELECT 1 FROM invoices WHERE id = $1 LIMIT 1"],
  ["invoice_line", "SELECT 1 FROM invoice_lines WHERE id = $1 LIMIT 1"],
  ["payment_state", "SELECT 1 FROM payment_states WHERE invoice_id = $1 LIMIT 1"],
  ["payment_event", "SELECT 1 FROM payment_events WHERE id = $1 LIMIT 1"],
  ["fee_schedule", "SELECT 1 FROM fee_schedules WHERE id = $1 LIMIT 1"],
  ["fee_schedule_line", "SELECT 1 FROM fee_schedule_lines WHERE id = $1 LIMIT 1"],
  ["finance_export_run", "SELECT 1 FROM finance_export_runs WHERE id = $1 LIMIT 1"],
  ["internal_user", "SELECT 1 FROM internal_users WHERE id = $1 LIMIT 1"],
  ["role_assignment", "SELECT 1 FROM role_assignments WHERE id = $1 LIMIT 1"],
  ["assessor_profile", "SELECT 1 FROM assessor_profiles WHERE id = $1 LIMIT 1"],
  ["assessor_preference", "SELECT 1 FROM assessor_preferences WHERE assessor_profile_id = $1 LIMIT 1"],
  ["assessor_capacity_declaration", "SELECT 1 FROM assessor_capacity_declarations WHERE id = $1 LIMIT 1"],
  ["allocation", "SELECT 1 FROM allocations WHERE id = $1 LIMIT 1"],
  ["judge_assignment", "SELECT 1 FROM judge_assignments WHERE id = $1 LIMIT 1"],
  ["allocation_coi_flag", "SELECT 1 FROM allocation_coi_flags WHERE id = $1 LIMIT 1"],
  ["assessment_visit", "SELECT 1 FROM assessment_visits WHERE id = $1 LIMIT 1"],
  ["judge_assessment", "SELECT 1 FROM judge_assessments WHERE id = $1 LIMIT 1"],
  ["assessment_score_entry", "SELECT 1 FROM assessment_score_entries WHERE id = $1 LIMIT 1"],
  ["assessment_evidence", "SELECT 1 FROM assessment_evidence WHERE id = $1 LIMIT 1"],
  ["decision_result", "SELECT 1 FROM decision_results WHERE id = $1 LIMIT 1"],
  ["result_artifact", "SELECT 1 FROM result_artifacts WHERE id = $1 LIMIT 1"],
  ["park_award_cache", "SELECT 1 FROM park_award_cache WHERE park_id = $1 LIMIT 1"],
  ["public_map_update_event", "SELECT 1 FROM public_map_update_events WHERE id = $1 LIMIT 1"],
  ["notification_queue", "SELECT 1 FROM notification_queue WHERE id = $1 LIMIT 1"],
  ["notification_log", "SELECT 1 FROM notification_logs WHERE id = $1 LIMIT 1"],
  ["message_thread", "SELECT 1 FROM message_threads WHERE id = $1 LIMIT 1"],
  ["message_entry", "SELECT 1 FROM message_entries WHERE id = $1 LIMIT 1"],
  ["archive_record", "SELECT 1 FROM migration_archive_records WHERE id = $1 LIMIT 1"]
]);

function iso(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function json(value: unknown) {
  return JSON.stringify(value ?? {});
}

type BatchRow = {
  id: string;
  batch_key: string;
  source_system: string;
  source_database: string;
  source_export_label: string;
  environment: MigrationImportBatch["environment"];
  batch_kind: MigrationImportBatch["batchKind"];
  status: MigrationImportBatch["status"];
  source_file_manifest: unknown;
  initiated_by_actor_id: string | null;
  source_exported_at_utc: Date | string | null;
  started_at_utc: Date | string | null;
  completed_at_utc: Date | string | null;
  notes: string | null;
};

function batchFromRow(row: BatchRow): MigrationImportBatch {
  const sourceExportedAt = iso(row.source_exported_at_utc);
  const startedAt = iso(row.started_at_utc);
  const completedAt = iso(row.completed_at_utc);
  return {
    id: row.id,
    batchKey: row.batch_key,
    sourceSystem: row.source_system,
    sourceDatabase: row.source_database,
    sourceExportLabel: row.source_export_label,
    environment: row.environment,
    batchKind: row.batch_kind,
    status: row.status,
    sourceFileManifest: Array.isArray(row.source_file_manifest) ? row.source_file_manifest : [],
    ...(row.initiated_by_actor_id ? { initiatedByActorId: row.initiated_by_actor_id } : {}),
    ...(sourceExportedAt ? { sourceExportedAt } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(row.notes ? { notes: row.notes } : {})
  };
}

type CatalogRow = {
  id: string;
  source_system: string;
  source_database: string;
  source_schema: string;
  source_table: string;
  source_group: string;
  business_owner: string | null;
  classification: MigrationSourceTableCatalogEntry["classification"];
  primary_key_columns: string[];
  natural_key_columns: string[];
  retention_decision: MigrationSourceTableCatalogEntry["retentionDecision"];
  notes: string | null;
};

function catalogFromRow(row: CatalogRow): MigrationSourceTableCatalogEntry {
  return {
    id: row.id,
    sourceSystem: row.source_system,
    sourceDatabase: row.source_database,
    sourceSchema: row.source_schema,
    sourceTable: row.source_table,
    sourceGroup: row.source_group,
    classification: row.classification,
    primaryKeyColumns: row.primary_key_columns,
    naturalKeyColumns: row.natural_key_columns,
    retentionDecision: row.retention_decision,
    ...(row.business_owner ? { businessOwner: row.business_owner } : {}),
    ...(row.notes ? { notes: row.notes } : {})
  };
}

type ManifestRow = {
  id: string;
  import_batch_id: string;
  catalog_id: string;
  source_system: string;
  source_database: string;
  source_schema: string;
  source_table: string;
  source_export_file: string | null;
  source_export_file_checksum: string | null;
  expected_row_count: number;
  expected_source_hash: string | null;
  actual_registered_row_count: number | null;
  actual_registered_source_hash: string | null;
  manifest_status: MigrationBatchSourceTableManifest["manifestStatus"];
  notes: string | null;
};

function manifestFromRow(row: ManifestRow): MigrationBatchSourceTableManifest {
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    catalogId: row.catalog_id,
    sourceSystem: row.source_system,
    sourceDatabase: row.source_database,
    sourceSchema: row.source_schema,
    sourceTable: row.source_table,
    expectedRowCount: row.expected_row_count,
    manifestStatus: row.manifest_status,
    ...(row.source_export_file ? { sourceExportFile: row.source_export_file } : {}),
    ...(row.source_export_file_checksum ? { sourceExportFileChecksum: row.source_export_file_checksum } : {}),
    ...(row.expected_source_hash ? { expectedSourceHash: row.expected_source_hash } : {}),
    ...(row.actual_registered_row_count !== null ? { actualRegisteredRowCount: row.actual_registered_row_count } : {}),
    ...(row.actual_registered_source_hash ? { actualRegisteredSourceHash: row.actual_registered_source_hash } : {}),
    ...(row.notes ? { notes: row.notes } : {})
  };
}

type TargetTypeRow = {
  code: string;
  label: string;
  target_table: string;
  id_column: string;
  validation_mode: MigrationTargetEntityTypeEntry["validationMode"];
  active: boolean;
  notes: string | null;
};

function targetTypeFromRow(row: TargetTypeRow): MigrationTargetEntityTypeEntry {
  return {
    code: row.code,
    label: row.label,
    targetTable: row.target_table,
    idColumn: row.id_column,
    validationMode: row.validation_mode,
    active: row.active,
    ...(row.notes ? { notes: row.notes } : {})
  };
}

type RuleRow = {
  id: string;
  catalog_id: string;
  source_group: string;
  mapping_version: string;
  required_target_entity_types: string[];
  optional_target_entity_types: string[];
  archive_required: boolean;
  allow_unlinked_source: boolean;
  missing_target_severity: MigrationMappingRule["missingTargetSeverity"];
  rule_status: MigrationMappingRule["ruleStatus"];
  notes: string | null;
};

function ruleFromRow(row: RuleRow): MigrationMappingRule {
  return {
    id: row.id,
    catalogId: row.catalog_id,
    sourceGroup: row.source_group,
    mappingVersion: row.mapping_version,
    requiredTargetEntityTypes: row.required_target_entity_types,
    optionalTargetEntityTypes: row.optional_target_entity_types,
    archiveRequired: row.archive_required,
    allowUnlinkedSource: row.allow_unlinked_source,
    missingTargetSeverity: row.missing_target_severity,
    ruleStatus: row.rule_status,
    ...(row.notes ? { notes: row.notes } : {})
  };
}

type SourceRecordRow = {
  id: string;
  import_batch_id: string;
  catalog_id: string;
  batch_source_table_id: string;
  source_system: string;
  source_database: string;
  source_schema: string;
  source_table: string;
  source_primary_key: string;
  source_primary_key_json: Record<string, unknown> | null;
  source_natural_key: string | null;
  source_natural_key_json: Record<string, unknown> | null;
  source_row_checksum: string;
  source_row_hash_algorithm: string;
  source_row_fingerprint: Record<string, unknown>;
  fingerprint_sensitivity: MigrationSourceRecord["fingerprintSensitivity"];
  import_status: MigrationSourceRecord["importStatus"];
  duplicate_of_source_record_id: string | null;
  error_code: string | null;
  error_detail: string | null;
};

function sourceRecordFromRow(row: SourceRecordRow): MigrationSourceRecord {
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    catalogId: row.catalog_id,
    batchSourceTableId: row.batch_source_table_id,
    sourceSystem: row.source_system,
    sourceDatabase: row.source_database,
    sourceSchema: row.source_schema,
    sourceTable: row.source_table,
    sourcePrimaryKey: row.source_primary_key,
    sourceRowChecksum: row.source_row_checksum,
    sourceRowHashAlgorithm: row.source_row_hash_algorithm,
    sourceRowFingerprint: row.source_row_fingerprint,
    fingerprintSensitivity: row.fingerprint_sensitivity,
    importStatus: row.import_status,
    ...(row.source_primary_key_json ? { sourcePrimaryKeyJson: row.source_primary_key_json } : {}),
    ...(row.source_natural_key ? { sourceNaturalKey: row.source_natural_key } : {}),
    ...(row.source_natural_key_json ? { sourceNaturalKeyJson: row.source_natural_key_json } : {}),
    ...(row.duplicate_of_source_record_id ? { duplicateOfSourceRecordId: row.duplicate_of_source_record_id } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_detail ? { errorDetail: row.error_detail } : {})
  };
}

type LinkRow = {
  id: string;
  source_record_id: string;
  import_batch_id: string;
  target_entity_type: string;
  target_entity_id: string;
  link_role: string;
  link_status: MigrationEntityLink["linkStatus"];
  confidence: MigrationEntityLink["confidence"];
  mapping_version: string;
  created_by_process: string;
  notes: string | null;
};

function linkFromRow(row: LinkRow): MigrationEntityLink {
  return {
    id: row.id,
    sourceRecordId: row.source_record_id,
    importBatchId: row.import_batch_id,
    targetEntityType: row.target_entity_type,
    targetEntityId: row.target_entity_id,
    linkRole: row.link_role,
    linkStatus: row.link_status,
    confidence: row.confidence,
    mappingVersion: row.mapping_version,
    createdByProcess: row.created_by_process,
    ...(row.notes ? { notes: row.notes } : {})
  };
}

type ArchiveRow = {
  id: string;
  source_record_id: string;
  import_batch_id: string;
  archive_kind: MigrationArchiveRecord["archiveKind"];
  archive_location: string;
  archive_reference: string;
  archive_checksum: string | null;
  retention_category: string;
  sensitivity: MigrationArchiveRecord["sensitivity"];
  access_notes: string | null;
};

function archiveFromRow(row: ArchiveRow): MigrationArchiveRecord {
  return {
    id: row.id,
    sourceRecordId: row.source_record_id,
    importBatchId: row.import_batch_id,
    archiveKind: row.archive_kind,
    archiveLocation: row.archive_location,
    archiveReference: row.archive_reference,
    retentionCategory: row.retention_category,
    sensitivity: row.sensitivity,
    ...(row.archive_checksum ? { archiveChecksum: row.archive_checksum } : {}),
    ...(row.access_notes ? { accessNotes: row.access_notes } : {})
  };
}

type ReportRow = {
  id: string;
  import_batch_id: string;
  baseline_import_batch_id: string | null;
  compared_import_batch_id: string | null;
  report_key: string;
  report_type: MigrationReconciliationReport["reportType"];
  scope: string;
  status: MigrationReconciliationReport["status"];
  source_system: string;
  source_database: string | null;
  summary: Record<string, unknown>;
  summary_sensitivity: MigrationReconciliationReport["summarySensitivity"];
  generated_by_process: string;
  completed_at_utc: Date | string | null;
  notes: string | null;
};

function reportFromRow(row: ReportRow): MigrationReconciliationReport {
  const completedAt = iso(row.completed_at_utc);
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    reportKey: row.report_key,
    reportType: row.report_type,
    scope: row.scope,
    status: row.status,
    sourceSystem: row.source_system,
    summary: row.summary,
    summarySensitivity: row.summary_sensitivity,
    generatedByProcess: row.generated_by_process,
    ...(row.source_database ? { sourceDatabase: row.source_database } : {}),
    ...(row.baseline_import_batch_id ? { baselineImportBatchId: row.baseline_import_batch_id } : {}),
    ...(row.compared_import_batch_id ? { comparedImportBatchId: row.compared_import_batch_id } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(row.notes ? { notes: row.notes } : {})
  };
}

type ItemRow = {
  id: string;
  report_id: string;
  source_record_id: string | null;
  target_entity_type: string | null;
  target_entity_id: string | null;
  item_type: MigrationReconciliationReportItem["itemType"];
  severity: MigrationReconciliationReportItem["severity"];
  outcome: MigrationReconciliationReportItem["outcome"];
  source_value: Record<string, unknown> | null;
  target_value: Record<string, unknown> | null;
  expected_value: Record<string, unknown> | null;
  actual_value: Record<string, unknown> | null;
  evidence_sensitivity: MigrationReconciliationReportItem["evidenceSensitivity"];
  notes: string | null;
  resolved_at_utc: Date | string | null;
  resolved_by_actor_id: string | null;
};

function itemFromRow(row: ItemRow): MigrationReconciliationReportItem {
  const resolvedAt = iso(row.resolved_at_utc);
  return {
    id: row.id,
    reportId: row.report_id,
    itemType: row.item_type,
    severity: row.severity,
    outcome: row.outcome,
    evidenceSensitivity: row.evidence_sensitivity,
    ...(row.source_record_id ? { sourceRecordId: row.source_record_id } : {}),
    ...(row.target_entity_type ? { targetEntityType: row.target_entity_type } : {}),
    ...(row.target_entity_id ? { targetEntityId: row.target_entity_id } : {}),
    ...(row.source_value ? { sourceValue: row.source_value } : {}),
    ...(row.target_value ? { targetValue: row.target_value } : {}),
    ...(row.expected_value ? { expectedValue: row.expected_value } : {}),
    ...(row.actual_value ? { actualValue: row.actual_value } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(resolvedAt ? { resolvedAt } : {}),
    ...(row.resolved_by_actor_id ? { resolvedByActorId: row.resolved_by_actor_id } : {})
  };
}

export class PostgresMigrationReferenceRepository implements MigrationReferenceRepository {
  constructor(private readonly client: SqlClient) {}

  async createImportBatch(input: Parameters<MigrationReferenceRepository["createImportBatch"]>[0]) {
    const id = input.id ?? randomUUID();
    const result = await this.client.query<BatchRow>(
      `
        INSERT INTO migration_import_batches (
          id, batch_key, source_system, source_database, source_export_label, environment,
          batch_kind, status, started_at_utc, completed_at_utc, source_exported_at_utc,
          source_file_manifest, initiated_by_actor_id, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12::jsonb, $13, $14)
        ON CONFLICT (batch_key) DO UPDATE SET updated_at_utc = migration_import_batches.updated_at_utc
        RETURNING *
      `,
      [
        id,
        input.batchKey,
        input.sourceSystem,
        input.sourceDatabase,
        input.sourceExportLabel,
        input.environment,
        input.batchKind,
        input.status,
        input.startedAt ?? null,
        input.completedAt ?? null,
        input.sourceExportedAt ?? null,
        JSON.stringify(input.sourceFileManifest ?? []),
        input.initiatedByActorId ?? null,
        input.notes ?? null
      ]
    );
    return batchFromRow(result.rows[0]!);
  }

  async updateImportBatchStatus(input: Parameters<MigrationReferenceRepository["updateImportBatchStatus"]>[0]) {
    const result = await this.client.query<BatchRow>(
      `
        UPDATE migration_import_batches
        SET status = $2, completed_at_utc = COALESCE($3::timestamptz, completed_at_utc), updated_at_utc = now()
        WHERE id = $1
        RETURNING *
      `,
      [input.importBatchId, input.status, input.completedAt ?? null]
    );
    if (!result.rows[0]) throw new ApiError("dependency_missing", 404, "Migration import batch was not found.");
    return batchFromRow(result.rows[0]);
  }

  async registerSourceTable(input: Parameters<MigrationReferenceRepository["registerSourceTable"]>[0]) {
    const result = await this.client.query<CatalogRow>(
      `
        INSERT INTO migration_source_table_catalog (
          id, source_system, source_database, source_schema, source_table, source_group,
          business_owner, classification, primary_key_columns, natural_key_columns,
          retention_decision, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (source_system, source_database, source_schema, source_table)
        DO UPDATE SET updated_at_utc = now()
        RETURNING *
      `,
      [
        input.id ?? randomUUID(),
        input.sourceSystem,
        input.sourceDatabase,
        input.sourceSchema,
        input.sourceTable,
        input.sourceGroup,
        input.businessOwner ?? null,
        input.classification,
        input.primaryKeyColumns,
        input.naturalKeyColumns,
        input.retentionDecision,
        input.notes ?? null
      ]
    );
    return catalogFromRow(result.rows[0]!);
  }

  async registerBatchSourceTableManifest(input: Parameters<MigrationReferenceRepository["registerBatchSourceTableManifest"]>[0]) {
    const result = await this.client.query<ManifestRow>(
      `
        INSERT INTO migration_import_batch_source_tables (
          id, import_batch_id, catalog_id, source_system, source_database, source_schema,
          source_table, source_export_file, source_export_file_checksum, expected_row_count,
          expected_source_hash, actual_registered_row_count, actual_registered_source_hash,
          manifest_status, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (import_batch_id, catalog_id)
        DO UPDATE SET
          expected_row_count = EXCLUDED.expected_row_count,
          expected_source_hash = EXCLUDED.expected_source_hash,
          actual_registered_row_count = EXCLUDED.actual_registered_row_count,
          actual_registered_source_hash = EXCLUDED.actual_registered_source_hash,
          manifest_status = EXCLUDED.manifest_status,
          updated_at_utc = now()
        RETURNING *
      `,
      [
        input.id ?? randomUUID(),
        input.importBatchId,
        input.catalogId,
        input.sourceSystem,
        input.sourceDatabase,
        input.sourceSchema,
        input.sourceTable,
        input.sourceExportFile ?? null,
        input.sourceExportFileChecksum ?? null,
        input.expectedRowCount,
        input.expectedSourceHash ?? null,
        input.actualRegisteredRowCount ?? null,
        input.actualRegisteredSourceHash ?? null,
        input.manifestStatus,
        input.notes ?? null
      ]
    );
    return manifestFromRow(result.rows[0]!);
  }

  async registerTargetEntityType(input: Parameters<MigrationReferenceRepository["registerTargetEntityType"]>[0]) {
    const result = await this.client.query<TargetTypeRow>(
      `
        INSERT INTO migration_target_entity_types (
          code, label, target_table, id_column, validation_mode, active, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (code)
        DO UPDATE SET label = EXCLUDED.label, active = EXCLUDED.active, updated_at_utc = now()
        RETURNING *
      `,
      [
        input.code,
        input.label,
        input.targetTable,
        input.idColumn ?? "id",
        input.validationMode,
        input.active ?? true,
        input.notes ?? null
      ]
    );
    return targetTypeFromRow(result.rows[0]!);
  }

  async getSourceTableCatalog(id: string) {
    const result = await this.client.query<CatalogRow>("SELECT * FROM migration_source_table_catalog WHERE id = $1", [id]);
    return result.rows[0] ? catalogFromRow(result.rows[0]) : null;
  }

  async getSourceRecord(id: string) {
    const result = await this.client.query<SourceRecordRow>("SELECT * FROM migration_source_records WHERE id = $1", [id]);
    return result.rows[0] ? sourceRecordFromRow(result.rows[0]) : null;
  }

  async getTargetEntityType(code: string) {
    const result = await this.client.query<TargetTypeRow>("SELECT * FROM migration_target_entity_types WHERE code = $1", [code]);
    return result.rows[0] ? targetTypeFromRow(result.rows[0]) : null;
  }

  async targetExists(targetEntityType: string, targetEntityId: string) {
    if (targetEntityType === "external_archive_manifest") return true;
    const query = targetExistenceQueries.get(targetEntityType);
    if (!query) return false;
    const result = await this.client.query(query, [targetEntityId]);
    return result.rows.length > 0;
  }

  async registerMappingRule(input: Parameters<MigrationReferenceRepository["registerMappingRule"]>[0]) {
    const result = await this.client.query<RuleRow>(
      `
        INSERT INTO migration_mapping_rules (
          id, catalog_id, source_group, mapping_version, required_target_entity_types,
          optional_target_entity_types, archive_required, allow_unlinked_source,
          missing_target_severity, rule_status, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (catalog_id, mapping_version)
        DO UPDATE SET
          required_target_entity_types = EXCLUDED.required_target_entity_types,
          optional_target_entity_types = EXCLUDED.optional_target_entity_types,
          archive_required = EXCLUDED.archive_required,
          allow_unlinked_source = EXCLUDED.allow_unlinked_source,
          missing_target_severity = EXCLUDED.missing_target_severity,
          rule_status = EXCLUDED.rule_status,
          updated_at_utc = now()
        RETURNING *
      `,
      [
        input.id ?? randomUUID(),
        input.catalogId,
        input.sourceGroup,
        input.mappingVersion,
        input.requiredTargetEntityTypes,
        input.optionalTargetEntityTypes,
        input.archiveRequired,
        input.allowUnlinkedSource,
        input.missingTargetSeverity,
        input.ruleStatus,
        input.notes ?? null
      ]
    );
    return ruleFromRow(result.rows[0]!);
  }

  async registerSourceRecord(input: Parameters<MigrationReferenceRepository["registerSourceRecord"]>[0]) {
    const result = await this.client.query<SourceRecordRow>(
      `
        INSERT INTO migration_source_records (
          id, import_batch_id, catalog_id, batch_source_table_id, source_system,
          source_database, source_schema, source_table, source_primary_key,
          source_primary_key_json, source_natural_key, source_natural_key_json,
          source_row_checksum, source_row_hash_algorithm, source_row_fingerprint,
          fingerprint_sensitivity, import_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb, $13, $14, $15::jsonb, $16, $17)
        ON CONFLICT (import_batch_id, source_system, source_database, source_schema, source_table, source_primary_key)
        DO UPDATE SET updated_at_utc = migration_source_records.updated_at_utc
        RETURNING *
      `,
      [
        input.id ?? randomUUID(),
        input.importBatchId,
        input.catalogId,
        input.batchSourceTableId,
        input.sourceSystem,
        input.sourceDatabase,
        input.sourceSchema,
        input.sourceTable,
        input.sourcePrimaryKey,
        input.sourcePrimaryKeyJson ? json(input.sourcePrimaryKeyJson) : null,
        input.sourceNaturalKey ?? null,
        input.sourceNaturalKeyJson ? json(input.sourceNaturalKeyJson) : null,
        input.sourceRowChecksum,
        input.sourceRowHashAlgorithm ?? "sha256",
        json(input.sourceRowFingerprint),
        input.fingerprintSensitivity,
        input.importStatus ?? "registered"
      ]
    );
    return sourceRecordFromRow(result.rows[0]!);
  }

  async updateSourceRecordStatus(input: Parameters<MigrationReferenceRepository["updateSourceRecordStatus"]>[0]) {
    const result = await this.client.query<SourceRecordRow>(
      `
        UPDATE migration_source_records
        SET import_status = $2,
          duplicate_of_source_record_id = $3,
          error_code = $4,
          error_detail = $5,
          updated_at_utc = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        input.sourceRecordId,
        input.importStatus,
        input.duplicateOfSourceRecordId ?? null,
        input.errorCode ?? null,
        input.errorDetail ?? null
      ]
    );
    if (!result.rows[0]) throw new ApiError("dependency_missing", 404, "Migration source record was not found.");
    return sourceRecordFromRow(result.rows[0]);
  }

  async linkSourceRecordToEntity(input: Parameters<MigrationReferenceRepository["linkSourceRecordToEntity"]>[0]) {
    const result = await this.client.query<LinkRow>(
      `
        INSERT INTO migration_entity_links (
          id, source_record_id, import_batch_id, target_entity_type, target_entity_id,
          link_role, link_status, confidence, mapping_version, created_by_process, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (source_record_id, target_entity_type, target_entity_id, link_role, mapping_version)
        DO UPDATE SET link_status = EXCLUDED.link_status, confidence = EXCLUDED.confidence, updated_at_utc = now()
        RETURNING *
      `,
      [
        input.id ?? randomUUID(),
        input.sourceRecordId,
        input.importBatchId,
        input.targetEntityType,
        input.targetEntityId,
        input.linkRole,
        input.linkStatus,
        input.confidence,
        input.mappingVersion,
        input.createdByProcess,
        input.notes ?? null
      ]
    );
    return linkFromRow(result.rows[0]!);
  }

  async registerArchiveRecord(input: Parameters<MigrationReferenceRepository["registerArchiveRecord"]>[0]) {
    const result = await this.client.query<ArchiveRow>(
      `
        INSERT INTO migration_archive_records (
          id, source_record_id, import_batch_id, archive_kind, archive_location,
          archive_reference, archive_checksum, retention_category, sensitivity, access_notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (source_record_id, archive_kind, archive_reference)
        DO UPDATE SET updated_at_utc = now()
        RETURNING *
      `,
      [
        input.id ?? randomUUID(),
        input.sourceRecordId,
        input.importBatchId,
        input.archiveKind,
        input.archiveLocation,
        input.archiveReference,
        input.archiveChecksum ?? null,
        input.retentionCategory,
        input.sensitivity,
        input.accessNotes ?? null
      ]
    );
    return archiveFromRow(result.rows[0]!);
  }

  async traceTargetToSource(input: Parameters<MigrationReferenceRepository["traceTargetToSource"]>[0]) {
    const result = await this.client.query<SourceRecordRow>(
      `
        SELECT sr.*
        FROM migration_source_records sr
        JOIN migration_entity_links l ON l.source_record_id = sr.id
        WHERE l.target_entity_type = $1 AND l.target_entity_id = $2 AND l.link_status = 'confirmed'
        ORDER BY sr.source_table, sr.source_primary_key
      `,
      [input.targetEntityType, input.targetEntityId]
    );
    return result.rows.map(sourceRecordFromRow);
  }

  async traceSourceToTargets(sourceRecordId: string) {
    const result = await this.client.query<LinkRow>(
      "SELECT * FROM migration_entity_links WHERE source_record_id = $1 ORDER BY target_entity_type, target_entity_id",
      [sourceRecordId]
    );
    return result.rows.map(linkFromRow);
  }

  async listSourceRecordsForBatch(importBatchId: string) {
    const result = await this.client.query<SourceRecordRow>(
      "SELECT * FROM migration_source_records WHERE import_batch_id = $1 ORDER BY source_table, source_primary_key",
      [importBatchId]
    );
    return result.rows.map(sourceRecordFromRow);
  }

  async listLinksForBatch(importBatchId: string) {
    const result = await this.client.query<LinkRow>(
      "SELECT * FROM migration_entity_links WHERE import_batch_id = $1 ORDER BY source_record_id, target_entity_type",
      [importBatchId]
    );
    return result.rows.map(linkFromRow);
  }

  async listArchiveRecordsForBatch(importBatchId: string) {
    const result = await this.client.query<ArchiveRow>(
      "SELECT * FROM migration_archive_records WHERE import_batch_id = $1 ORDER BY source_record_id",
      [importBatchId]
    );
    return result.rows.map(archiveFromRow);
  }

  async listManifestsForBatch(importBatchId: string) {
    const result = await this.client.query<ManifestRow>(
      "SELECT * FROM migration_import_batch_source_tables WHERE import_batch_id = $1 ORDER BY source_table",
      [importBatchId]
    );
    return result.rows.map(manifestFromRow);
  }

  async listActiveMappingRules() {
    const result = await this.client.query<RuleRow>(
      "SELECT * FROM migration_mapping_rules WHERE rule_status = 'active' ORDER BY source_group"
    );
    return result.rows.map(ruleFromRow);
  }

  async listSourceRecordsForBatches(importBatchIds: string[]) {
    if (importBatchIds.length === 0) return [];
    const result = await this.client.query<SourceRecordRow>(
      "SELECT * FROM migration_source_records WHERE import_batch_id = ANY($1::uuid[]) ORDER BY import_batch_id, source_table, source_primary_key",
      [importBatchIds]
    );
    return result.rows.map(sourceRecordFromRow);
  }

  async createReconciliationReport(input: Parameters<MigrationReferenceRepository["createReconciliationReport"]>[0]): Promise<MigrationReportWithItems> {
    const reportId = input.id ?? randomUUID();
    const reportResult = await this.client.query<ReportRow>(
      `
        INSERT INTO migration_reconciliation_reports (
          id, import_batch_id, baseline_import_batch_id, compared_import_batch_id,
          report_key, report_type, scope, status, source_system, source_database,
          summary, summary_sensitivity, generated_by_process, completed_at_utc, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14::timestamptz, $15)
        ON CONFLICT (import_batch_id, report_key)
        DO UPDATE SET
          status = EXCLUDED.status,
          summary = EXCLUDED.summary,
          completed_at_utc = EXCLUDED.completed_at_utc,
          notes = EXCLUDED.notes
        RETURNING *
      `,
      [
        reportId,
        input.importBatchId,
        input.baselineImportBatchId ?? null,
        input.comparedImportBatchId ?? null,
        input.reportKey,
        input.reportType,
        input.scope,
        input.status,
        input.sourceSystem,
        input.sourceDatabase ?? null,
        json(input.summary),
        input.summarySensitivity ?? "low",
        input.generatedByProcess,
        input.completedAt ?? null,
        input.notes ?? null
      ]
    );
    const report = reportFromRow(reportResult.rows[0]!);
    const items: MigrationReconciliationReportItem[] = [];
    for (const item of input.items) {
      const itemResult = await this.client.query<ItemRow>(
        `
          INSERT INTO migration_reconciliation_report_items (
            id, report_id, source_record_id, target_entity_type, target_entity_id,
            item_type, severity, outcome, source_value, target_value, expected_value,
            actual_value, evidence_sensitivity, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14)
          RETURNING *
        `,
        [
          item.id ?? randomUUID(),
          report.id,
          item.sourceRecordId ?? null,
          item.targetEntityType ?? null,
          item.targetEntityId ?? null,
          item.itemType,
          item.severity,
          item.outcome ?? "open",
          item.sourceValue ? json(item.sourceValue) : null,
          item.targetValue ? json(item.targetValue) : null,
          item.expectedValue ? json(item.expectedValue) : null,
          item.actualValue ? json(item.actualValue) : null,
          item.evidenceSensitivity ?? "low",
          item.notes ?? null
        ]
      );
      items.push(itemFromRow(itemResult.rows[0]!));
    }
    return { report, items };
  }

  async resolveReconciliationItem(input: Parameters<MigrationReferenceRepository["resolveReconciliationItem"]>[0]) {
    const result = await this.client.query<ItemRow>(
      `
        UPDATE migration_reconciliation_report_items
        SET outcome = $2,
          resolved_by_actor_id = $3,
          resolved_at_utc = now(),
          notes = COALESCE($4, notes)
        WHERE id = $1
        RETURNING *
      `,
      [input.itemId, input.outcome, input.resolvedByActorId, input.notes ?? null]
    );
    if (!result.rows[0]) throw new ApiError("dependency_missing", 404, "Migration reconciliation item was not found.");
    return itemFromRow(result.rows[0]);
  }
}
