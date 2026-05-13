import { createHash, randomUUID } from "node:crypto";
import { actorContextSchema } from "@green-flag/contracts";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile } from "./auth.js";

export const migrationSourceGroups = [
  "Park",
  "Organisation",
  "Contact",
  "ParksContact",
  "ParkAwardApplication",
  "Award",
  "ParkApplicationNote",
  "ParkDocument",
  "Judge",
  "JudgeApplication",
  "JudgeConflictOfInterest",
  "Fee",
  "Invoice",
  "InvoicingOrganisation",
  "InvoicingOrganisationTeam",
  "EmailLog",
  "Country",
  "Region",
  "County",
  "Authority",
  "CountrySeason",
  "UmbracoFormsBusiness",
  "UmbracoContentArchive",
  "UmbracoAuditConsent"
] as const;

export const migrationTargetEntityTypes = [
  "organisation",
  "park",
  "park_location",
  "award_cycle",
  "cycle_window",
  "assessment_episode",
  "application",
  "application_section",
  "application_field_value",
  "application_feedback_response",
  "document_asset",
  "application_submission",
  "invoice",
  "invoice_line",
  "payment_state",
  "payment_event",
  "fee_schedule",
  "fee_schedule_line",
  "finance_export_run",
  "internal_user",
  "role_assignment",
  "assessor_profile",
  "assessor_preference",
  "assessor_capacity_declaration",
  "allocation",
  "judge_assignment",
  "allocation_coi_flag",
  "assessment_visit",
  "judge_assessment",
  "assessment_score_entry",
  "assessment_evidence",
  "decision_result",
  "result_artifact",
  "park_award_cache",
  "public_map_update_event",
  "notification_queue",
  "notification_log",
  "message_thread",
  "message_entry",
  "archive_record",
  "external_archive_manifest"
] as const;

export type MigrationSourceGroup = (typeof migrationSourceGroups)[number];
export type MigrationTargetEntityType = (typeof migrationTargetEntityTypes)[number];

export type MigrationClassification =
  | "core_business"
  | "reference"
  | "finance"
  | "document"
  | "communications"
  | "identity"
  | "cms_business"
  | "cms_archive"
  | "archive_only"
  | "excluded_noise"
  | "unclassified_pending_review";

export type MigrationRetentionDecision = "migrate" | "link_only" | "archive_only" | "exclude_pending_signoff";
export type MigrationBatchEnvironment = "local" | "ci" | "uat" | "staging" | "production";
export type MigrationBatchKind = "dry_run" | "test_import" | "uat_rehearsal" | "cutover" | "rollback_rehearsal";
export type MigrationBatchStatus = "created" | "running" | "completed" | "completed_with_warnings" | "failed" | "superseded" | "voided";
export type MigrationSourceRecordStatus = "registered" | "linked" | "partially_linked" | "duplicate_source" | "orphan_source" | "missing_target" | "ignored_archive_only" | "failed";
export type MigrationLinkStatus = "proposed" | "confirmed" | "superseded" | "rejected" | "requires_review";
export type MigrationConfidence = "exact" | "strong" | "inferred" | "manual_review" | "unknown";
export type MigrationManifestStatus = "expected" | "registered" | "matched" | "mismatched" | "missing_export" | "voided";
export type MigrationRuleStatus = "draft" | "active" | "superseded" | "voided";
export type MigrationSeverity = "info" | "warning" | "error" | "blocker";
export type MigrationReportStatus = "running" | "passed" | "passed_with_warnings" | "failed" | "requires_review";
export type MigrationReportType = "count" | "hash" | "duplicate" | "missing_target" | "orphan_source" | "finance_totals" | "document_assets" | "cross_entity" | "full_batch";
export type MigrationItemType =
  | "duplicate_source"
  | "missing_target"
  | "orphan_source"
  | "count_mismatch"
  | "checksum_mismatch"
  | "hash_mismatch"
  | "finance_total_mismatch"
  | "invalid_mapping"
  | "manual_review_required"
  | "archive_only_confirmed";
export type MigrationItemOutcome = "open" | "accepted" | "resolved" | "false_positive" | "deferred";
export type MigrationSensitivity = "none" | "low" | "personal_data" | "special_category" | "secret_or_credential";
export type MigrationArchiveKind = "internal_archive_record" | "external_archive_manifest";
export type TargetValidationMode = "uuid_table_lookup" | "external_archive_manifest" | "not_linkable";

export interface MigrationSourceTableCatalogEntry {
  id: string;
  sourceSystem: string;
  sourceDatabase: string;
  sourceSchema: string;
  sourceTable: string;
  sourceGroup: MigrationSourceGroup | string;
  classification: MigrationClassification;
  primaryKeyColumns: string[];
  naturalKeyColumns: string[];
  retentionDecision: MigrationRetentionDecision;
  businessOwner?: string;
  notes?: string;
}

export interface MigrationImportBatch {
  id: string;
  batchKey: string;
  sourceSystem: string;
  sourceDatabase: string;
  sourceExportLabel: string;
  environment: MigrationBatchEnvironment;
  batchKind: MigrationBatchKind;
  status: MigrationBatchStatus;
  sourceFileManifest: unknown[];
  initiatedByActorId?: string;
  sourceExportedAt?: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}

export interface MigrationBatchSourceTableManifest {
  id: string;
  importBatchId: string;
  catalogId: string;
  sourceSystem: string;
  sourceDatabase: string;
  sourceSchema: string;
  sourceTable: string;
  expectedRowCount: number;
  manifestStatus: MigrationManifestStatus;
  sourceExportFile?: string;
  sourceExportFileChecksum?: string;
  expectedSourceHash?: string;
  actualRegisteredRowCount?: number;
  actualRegisteredSourceHash?: string;
  notes?: string;
}

export interface MigrationTargetEntityTypeEntry {
  code: MigrationTargetEntityType | string;
  label: string;
  targetTable: string;
  idColumn: string;
  validationMode: TargetValidationMode;
  active: boolean;
  notes?: string;
}

export interface MigrationMappingRule {
  id: string;
  catalogId: string;
  sourceGroup: MigrationSourceGroup | string;
  mappingVersion: string;
  requiredTargetEntityTypes: string[];
  optionalTargetEntityTypes: string[];
  archiveRequired: boolean;
  allowUnlinkedSource: boolean;
  missingTargetSeverity: MigrationSeverity;
  ruleStatus: MigrationRuleStatus;
  notes?: string;
}

export interface MigrationSourceRecord {
  id: string;
  importBatchId: string;
  catalogId: string;
  batchSourceTableId: string;
  sourceSystem: string;
  sourceDatabase: string;
  sourceSchema: string;
  sourceTable: string;
  sourcePrimaryKey: string;
  sourceRowChecksum: string;
  sourceRowHashAlgorithm: string;
  sourceRowFingerprint: Record<string, unknown>;
  fingerprintSensitivity: MigrationSensitivity;
  importStatus: MigrationSourceRecordStatus;
  sourcePrimaryKeyJson?: Record<string, unknown>;
  sourceNaturalKey?: string;
  sourceNaturalKeyJson?: Record<string, unknown>;
  duplicateOfSourceRecordId?: string;
  errorCode?: string;
  errorDetail?: string;
}

export interface MigrationEntityLink {
  id: string;
  sourceRecordId: string;
  importBatchId: string;
  targetEntityType: string;
  targetEntityId: string;
  linkRole: string;
  linkStatus: MigrationLinkStatus;
  confidence: MigrationConfidence;
  mappingVersion: string;
  createdByProcess: string;
  notes?: string;
}

export interface MigrationArchiveRecord {
  id: string;
  sourceRecordId: string;
  importBatchId: string;
  archiveKind: MigrationArchiveKind;
  archiveLocation: string;
  archiveReference: string;
  retentionCategory: string;
  sensitivity: MigrationSensitivity;
  archiveChecksum?: string;
  accessNotes?: string;
}

export interface MigrationReconciliationReport {
  id: string;
  importBatchId: string;
  reportKey: string;
  reportType: MigrationReportType;
  scope: string;
  status: MigrationReportStatus;
  sourceSystem: string;
  summary: Record<string, unknown>;
  summarySensitivity: MigrationSensitivity;
  generatedByProcess: string;
  sourceDatabase?: string;
  baselineImportBatchId?: string;
  comparedImportBatchId?: string;
  completedAt?: string;
  notes?: string;
}

export interface MigrationReconciliationReportItem {
  id: string;
  reportId: string;
  itemType: MigrationItemType;
  severity: MigrationSeverity;
  outcome: MigrationItemOutcome;
  evidenceSensitivity: MigrationSensitivity;
  sourceRecordId?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  sourceValue?: Record<string, unknown>;
  targetValue?: Record<string, unknown>;
  expectedValue?: Record<string, unknown>;
  actualValue?: Record<string, unknown>;
  notes?: string;
  resolvedAt?: string;
  resolvedByActorId?: string;
}

export interface MigrationReportWithItems {
  report: MigrationReconciliationReport;
  items: MigrationReconciliationReportItem[];
}

export interface MigrationAuditContext {
  actor?: SessionProfile["actor"];
  requestId: string;
  idempotencyKey?: string;
  reason?: string;
}

export interface MigrationReferenceRepository {
  createImportBatch(input: Omit<MigrationImportBatch, "id" | "sourceFileManifest"> & { id?: string; sourceFileManifest?: unknown[] }): Promise<MigrationImportBatch>;
  updateImportBatchStatus(input: { importBatchId: string; status: MigrationBatchStatus; completedAt?: string }): Promise<MigrationImportBatch>;
  registerSourceTable(input: Omit<MigrationSourceTableCatalogEntry, "id"> & { id?: string }): Promise<MigrationSourceTableCatalogEntry>;
  registerBatchSourceTableManifest(input: Omit<MigrationBatchSourceTableManifest, "id"> & { id?: string }): Promise<MigrationBatchSourceTableManifest>;
  registerTargetEntityType(input: Omit<MigrationTargetEntityTypeEntry, "active" | "idColumn"> & { idColumn?: string; active?: boolean }): Promise<MigrationTargetEntityTypeEntry>;
  getSourceTableCatalog(id: string): Promise<MigrationSourceTableCatalogEntry | null>;
  getSourceRecord(id: string): Promise<MigrationSourceRecord | null>;
  getTargetEntityType(code: string): Promise<MigrationTargetEntityTypeEntry | null>;
  targetExists(targetEntityType: string, targetEntityId: string): Promise<boolean>;
  registerMappingRule(input: Omit<MigrationMappingRule, "id"> & { id?: string }): Promise<MigrationMappingRule>;
  registerSourceRecord(input: Omit<MigrationSourceRecord, "id" | "sourceRowHashAlgorithm" | "importStatus"> & { id?: string; sourceRowHashAlgorithm?: string; importStatus?: MigrationSourceRecordStatus }): Promise<MigrationSourceRecord>;
  updateSourceRecordStatus(input: { sourceRecordId: string; importStatus: MigrationSourceRecordStatus; duplicateOfSourceRecordId?: string; errorCode?: string; errorDetail?: string }): Promise<MigrationSourceRecord>;
  linkSourceRecordToEntity(input: Omit<MigrationEntityLink, "id"> & { id?: string }): Promise<MigrationEntityLink>;
  registerArchiveRecord(input: Omit<MigrationArchiveRecord, "id"> & { id?: string }): Promise<MigrationArchiveRecord>;
  traceTargetToSource(input: { targetEntityType: string; targetEntityId: string }): Promise<MigrationSourceRecord[]>;
  traceSourceToTargets(sourceRecordId: string): Promise<MigrationEntityLink[]>;
  listSourceRecordsForBatch(importBatchId: string): Promise<MigrationSourceRecord[]>;
  listLinksForBatch(importBatchId: string): Promise<MigrationEntityLink[]>;
  listArchiveRecordsForBatch(importBatchId: string): Promise<MigrationArchiveRecord[]>;
  listManifestsForBatch(importBatchId: string): Promise<MigrationBatchSourceTableManifest[]>;
  listActiveMappingRules(): Promise<MigrationMappingRule[]>;
  listSourceRecordsForBatches(importBatchIds: string[]): Promise<MigrationSourceRecord[]>;
  createReconciliationReport(input: Omit<MigrationReconciliationReport, "id" | "summarySensitivity"> & { id?: string; summarySensitivity?: MigrationSensitivity; items: Array<Omit<MigrationReconciliationReportItem, "id" | "reportId" | "outcome" | "evidenceSensitivity"> & { id?: string; outcome?: MigrationItemOutcome; evidenceSensitivity?: MigrationSensitivity }> }): Promise<MigrationReportWithItems>;
  resolveReconciliationItem(input: { itemId: string; outcome: Exclude<MigrationItemOutcome, "open">; resolvedByActorId: string; notes?: string }): Promise<MigrationReconciliationReportItem>;
}

const migrationSystemActor = actorContextSchema.parse({
  actorId: "00000000-0000-4000-8000-000000000021",
  cognitoSubject: "migration-reference-system",
  role: "SYSTEM",
  scopes: [{ type: "GLOBAL" }],
  redactionProfile: "super_admin_full_access"
});

const sensitiveJsonKeyPattern = /(password|credential|secret|token|raw|body|documentpath|storagekey|storagepath|sourcepath|filepath)/i;

export function createSourceRowChecksum(value: unknown, algorithm = "sha256") {
  return createHash(algorithm).update(stableJsonStringify(value)).digest("hex");
}

export function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify(object[key])}`).join(",")}}`;
}

export function assertMigrationSafeJson(value: unknown, sensitivity: MigrationSensitivity, path = "value") {
  if (sensitivity === "secret_or_credential") {
    throw new ApiError("validation_failed", 400, `Migration evidence ${path} cannot be classified as secret_or_credential.`);
  }
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertMigrationSafeJson(entry, sensitivity, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveJsonKeyPattern.test(key)) {
      throw new ApiError("validation_failed", 400, `Migration evidence field ${path}.${key} is not allowed.`);
    }
    assertMigrationSafeJson(nested, sensitivity, `${path}.${key}`);
  }
}

function requestFor(context?: MigrationAuditContext) {
  return {
    requestId: context?.requestId ?? "migration-reference-service",
    ...(context?.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : {})
  };
}

function buildAuditEvent({
  action,
  entityType,
  entityId,
  context,
  beforeState,
  afterState,
  reason
}: {
  action: string;
  entityType: string;
  entityId?: string | undefined;
  context?: MigrationAuditContext | undefined;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | undefined;
}): AuditEvent {
  return {
    id: randomUUID(),
    actor: context?.actor ?? migrationSystemActor,
    action,
    entityType,
    ...(entityId ? { entityId } : {}),
    ...(beforeState === undefined ? {} : { beforeState }),
    ...(afterState === undefined ? {} : { afterState }),
    request: requestFor(context),
    ...(reason ?? context?.reason ? { reason: reason ?? context?.reason } : {}),
    createdAt: new Date().toISOString()
  };
}

async function audit(ledger: AuditLedger | undefined, event: AuditEvent) {
  if (!ledger) return;
  await appendAuditEvent(ledger, event);
}

export class MigrationReferenceService {
  constructor(
    private readonly repository: MigrationReferenceRepository,
    private readonly auditLedger?: AuditLedger
  ) {}

  async createImportBatch(input: Parameters<MigrationReferenceRepository["createImportBatch"]>[0], context?: MigrationAuditContext) {
    const batch = await this.repository.createImportBatch(input);
    await audit(this.auditLedger, buildAuditEvent({
      action: "CREATE_MIGRATION_IMPORT_BATCH",
      entityType: "migration_import_batch",
      entityId: batch.id,
      context,
      afterState: { status: batch.status, environment: batch.environment, batchKind: batch.batchKind }
    }));
    return batch;
  }

  async updateImportBatchStatus(input: { importBatchId: string; status: MigrationBatchStatus; completedAt?: string }, context?: MigrationAuditContext) {
    const batch = await this.repository.updateImportBatchStatus(input);
    await audit(this.auditLedger, buildAuditEvent({
      action: "UPDATE_MIGRATION_IMPORT_BATCH_STATUS",
      entityType: "migration_import_batch",
      entityId: batch.id,
      context,
      afterState: { status: batch.status, completedAt: batch.completedAt }
    }));
    return batch;
  }

  registerSourceTable(input: Parameters<MigrationReferenceRepository["registerSourceTable"]>[0]) {
    return this.repository.registerSourceTable(input);
  }

  registerBatchSourceTableManifest(input: Parameters<MigrationReferenceRepository["registerBatchSourceTableManifest"]>[0]) {
    return this.repository.registerBatchSourceTableManifest(input);
  }

  registerTargetEntityType(input: Parameters<MigrationReferenceRepository["registerTargetEntityType"]>[0]) {
    return this.repository.registerTargetEntityType(input);
  }

  async registerMappingRule(input: Parameters<MigrationReferenceRepository["registerMappingRule"]>[0]) {
    const catalog = await this.repository.getSourceTableCatalog(input.catalogId);
    if (!catalog) {
      throw new ApiError("dependency_missing", 404, "Migration source table catalog entry was not found.");
    }
    if (catalog.classification === "unclassified_pending_review") {
      throw new ApiError("validation_failed", 400, "Unclassified migration source tables require review before deterministic mapping rules can be registered.");
    }
    return this.repository.registerMappingRule(input);
  }

  async registerSourceRecord(input: Parameters<MigrationReferenceRepository["registerSourceRecord"]>[0]) {
    assertMigrationSafeJson(input.sourceRowFingerprint, input.fingerprintSensitivity, "sourceRowFingerprint");
    return this.repository.registerSourceRecord(input);
  }

  async linkSourceRecordToEntity(input: Parameters<MigrationReferenceRepository["linkSourceRecordToEntity"]>[0], context?: MigrationAuditContext) {
    const sourceRecord = await this.repository.getSourceRecord(input.sourceRecordId);
    if (!sourceRecord) {
      throw new ApiError("dependency_missing", 404, "Migration source record was not found.");
    }
    if (sourceRecord.importBatchId !== input.importBatchId) {
      throw new ApiError("validation_failed", 400, "Migration link import batch must match the source record import batch.");
    }
    const targetType = await this.repository.getTargetEntityType(input.targetEntityType);
    if (!targetType || !targetType.active) {
      throw new ApiError("validation_failed", 400, "Unknown or inactive migration target entity type.");
    }
    if (input.linkStatus === "confirmed") {
      const catalog = await this.repository.getSourceTableCatalog(sourceRecord.catalogId);
      if (!catalog) {
        throw new ApiError("dependency_missing", 404, "Migration source table catalog entry was not found.");
      }
      if (catalog.classification === "unclassified_pending_review") {
        throw new ApiError("validation_failed", 400, "Unclassified migration source tables cannot be promoted to confirmed entity links.");
      }
      const exists = await this.repository.targetExists(input.targetEntityType, input.targetEntityId);
      if (!exists) {
        throw new ApiError("dependency_missing", 404, "Cannot confirm a migration link to a missing target row.");
      }
    }
    const link = await this.repository.linkSourceRecordToEntity(input);
    if (link.linkStatus === "confirmed") {
      await audit(this.auditLedger, buildAuditEvent({
        action: "CONFIRM_MIGRATION_ENTITY_LINK",
        entityType: "migration_entity_link",
        entityId: link.id,
        context,
        afterState: { targetEntityType: link.targetEntityType, targetEntityId: link.targetEntityId }
      }));
    }
    return link;
  }

  async registerArchiveRecord(input: Parameters<MigrationReferenceRepository["registerArchiveRecord"]>[0]) {
    if (input.sensitivity === "secret_or_credential") {
      throw new ApiError("validation_failed", 400, "Archive records cannot store secret or credential material.");
    }
    return this.repository.registerArchiveRecord(input);
  }

  traceTargetToSource(input: { targetEntityType: string; targetEntityId: string }) {
    return this.repository.traceTargetToSource(input);
  }

  traceSourceToTargets(sourceRecordId: string) {
    return this.repository.traceSourceToTargets(sourceRecordId);
  }

  async generateReconciliationReport(input: {
    importBatchId: string;
    reportKey: string;
    reportType: MigrationReportType;
    scope: string;
    sourceSystem: string;
    generatedByProcess: string;
    sourceDatabase?: string;
    baselineImportBatchId?: string;
    comparedImportBatchId?: string;
    financeTotals?: Record<string, unknown>;
    notes?: string;
  }, context?: MigrationAuditContext): Promise<MigrationReportWithItems> {
    assertMigrationSafeJson(input.financeTotals ?? {}, "low", "financeTotals");
    const [records, links, archives, manifests, rules] = await Promise.all([
      this.repository.listSourceRecordsForBatch(input.importBatchId),
      this.repository.listLinksForBatch(input.importBatchId),
      this.repository.listArchiveRecordsForBatch(input.importBatchId),
      this.repository.listManifestsForBatch(input.importBatchId),
      this.repository.listActiveMappingRules()
    ]);

    const items: Array<Omit<MigrationReconciliationReportItem, "id" | "reportId" | "outcome" | "evidenceSensitivity"> & { outcome?: MigrationItemOutcome; evidenceSensitivity?: MigrationSensitivity }> = [];
    const linksBySource = groupBy(links, (link) => link.sourceRecordId);
    const archivesBySource = groupBy(archives, (archive) => archive.sourceRecordId);
    const rulesByCatalog = new Map(rules.filter((rule) => rule.ruleStatus === "active").map((rule) => [rule.catalogId, rule]));

    for (const manifest of manifests) {
      const count = records.filter((record) => record.batchSourceTableId === manifest.id).length;
      if (count !== manifest.expectedRowCount) {
        items.push({
          itemType: "count_mismatch",
          severity: "error",
          expectedValue: { expectedRowCount: manifest.expectedRowCount },
          actualValue: { actualRegisteredRowCount: count },
          notes: `${manifest.sourceTable} registered row count does not match manifest.`
        });
      }
      if (manifest.expectedSourceHash && manifest.actualRegisteredSourceHash && manifest.expectedSourceHash !== manifest.actualRegisteredSourceHash) {
        items.push({
          itemType: "hash_mismatch",
          severity: "error",
          expectedValue: { expectedSourceHash: manifest.expectedSourceHash },
          actualValue: { actualRegisteredSourceHash: manifest.actualRegisteredSourceHash },
          notes: `${manifest.sourceTable} registered source hash does not match manifest.`
        });
      }
    }

    const duplicateKeys = new Map<string, MigrationSourceRecord>();
    for (const record of records) {
      for (const key of duplicateDetectionKeys(record)) {
        const duplicateOf = duplicateKeys.get(key);
        if (duplicateOf && duplicateOf.id !== record.id) {
          items.push({
            sourceRecordId: record.id,
            itemType: "duplicate_source",
            severity: "warning",
            sourceValue: { duplicateKey: key, duplicateOfSourceRecordId: duplicateOf.id },
            notes: "Source row duplicates another registered source row by configured identity."
          });
          break;
        }
        duplicateKeys.set(key, record);
      }
    }

    for (const record of records) {
      const sourceLinks = linksBySource.get(record.id) ?? [];
      const sourceArchives = archivesBySource.get(record.id) ?? [];
      const rule = rulesByCatalog.get(record.catalogId);
      if (!rule) {
        items.push({
          sourceRecordId: record.id,
          itemType: "manual_review_required",
          severity: "blocker",
          sourceValue: { catalogId: record.catalogId },
          notes: "No active migration mapping rule exists for this source record."
        });
        continue;
      }
      if (rule.archiveRequired && sourceArchives.length === 0) {
        items.push({
          sourceRecordId: record.id,
          targetEntityType: "archive_record",
          itemType: "missing_target",
          severity: rule.missingTargetSeverity,
          expectedValue: { archiveRequired: true },
          notes: "Required archive provenance is missing."
        });
      }
      for (const targetType of rule.requiredTargetEntityTypes) {
        const hasTarget = sourceLinks.some((link) =>
          link.linkStatus === "confirmed" &&
          link.targetEntityType === targetType &&
          link.mappingVersion === rule.mappingVersion
        );
        if (!hasTarget) {
          items.push({
            sourceRecordId: record.id,
            targetEntityType: targetType,
            itemType: "missing_target",
            severity: rule.missingTargetSeverity,
            expectedValue: { targetEntityType: targetType, mappingVersion: rule.mappingVersion },
            notes: "Required migration target is missing."
          });
        }
      }
      const hasConfirmedLink = sourceLinks.some((link) => link.linkStatus === "confirmed");
      if (!rule.allowUnlinkedSource && !hasConfirmedLink && sourceArchives.length === 0) {
        items.push({
          sourceRecordId: record.id,
          itemType: "orphan_source",
          severity: rule.missingTargetSeverity,
          sourceValue: { sourceTable: record.sourceTable, sourcePrimaryKey: record.sourcePrimaryKey },
          notes: "Source row is not linked to any confirmed target or archive record."
        });
      }
    }

    if (input.baselineImportBatchId && input.comparedImportBatchId) {
      const comparedRecords = await this.repository.listSourceRecordsForBatches([
        input.baselineImportBatchId,
        input.comparedImportBatchId
      ]);
      const baseline = comparedRecords.filter((record) => record.importBatchId === input.baselineImportBatchId);
      const compared = new Map(
        comparedRecords
          .filter((record) => record.importBatchId === input.comparedImportBatchId)
          .map((record) => [sourceIdentity(record), record])
      );
      for (const baselineRecord of baseline) {
        const comparedRecord = compared.get(sourceIdentity(baselineRecord));
        if (comparedRecord && comparedRecord.sourceRowChecksum !== baselineRecord.sourceRowChecksum) {
          items.push({
            sourceRecordId: comparedRecord.id,
            itemType: "checksum_mismatch",
            severity: "warning",
            expectedValue: { baselineChecksum: baselineRecord.sourceRowChecksum },
            actualValue: { comparedChecksum: comparedRecord.sourceRowChecksum },
            notes: "Source row checksum changed across baseline and compared batches."
          });
        }
      }
    }

    for (const item of items) {
      assertMigrationSafeJson(item.sourceValue, item.evidenceSensitivity ?? "low", "reportItem.sourceValue");
      assertMigrationSafeJson(item.targetValue, item.evidenceSensitivity ?? "low", "reportItem.targetValue");
      assertMigrationSafeJson(item.expectedValue, item.evidenceSensitivity ?? "low", "reportItem.expectedValue");
      assertMigrationSafeJson(item.actualValue, item.evidenceSensitivity ?? "low", "reportItem.actualValue");
    }

    const summary = {
      sourceRowCount: records.length,
      registeredSourceRecordCount: records.length,
      linkedSourceRecordCount: new Set(links.filter((link) => link.linkStatus === "confirmed").map((link) => link.sourceRecordId)).size,
      targetEntityCount: new Set(links.filter((link) => link.linkStatus === "confirmed").map((link) => `${link.targetEntityType}:${link.targetEntityId}`)).size,
      duplicateSourceCount: items.filter((item) => item.itemType === "duplicate_source").length,
      missingTargetCount: items.filter((item) => item.itemType === "missing_target").length,
      orphanSourceCount: items.filter((item) => item.itemType === "orphan_source").length,
      checksumMismatchCount: items.filter((item) => item.itemType === "checksum_mismatch" || item.itemType === "hash_mismatch").length,
      ...(input.baselineImportBatchId ? { baselineImportBatchId: input.baselineImportBatchId } : {}),
      ...(input.comparedImportBatchId ? { comparedImportBatchId: input.comparedImportBatchId } : {}),
      ...(input.financeTotals ? { financeTotals: input.financeTotals } : {})
    };
    const status = reportStatus(items);
    const reportInput: Parameters<MigrationReferenceRepository["createReconciliationReport"]>[0] = {
      importBatchId: input.importBatchId,
      reportKey: input.reportKey,
      reportType: input.reportType,
      scope: input.scope,
      status,
      sourceSystem: input.sourceSystem,
      summary,
      generatedByProcess: input.generatedByProcess,
      summarySensitivity: "low",
      items,
      completedAt: new Date().toISOString()
    };
    if (input.sourceDatabase) reportInput.sourceDatabase = input.sourceDatabase;
    if (input.baselineImportBatchId) reportInput.baselineImportBatchId = input.baselineImportBatchId;
    if (input.comparedImportBatchId) reportInput.comparedImportBatchId = input.comparedImportBatchId;
    if (input.notes) reportInput.notes = input.notes;
    const report = await this.repository.createReconciliationReport(reportInput);
    await audit(this.auditLedger, buildAuditEvent({
      action: "COMPLETE_MIGRATION_RECONCILIATION_REPORT",
      entityType: "migration_reconciliation_report",
      entityId: report.report.id,
      context,
      afterState: { status: report.report.status, summary: report.report.summary }
    }));
    return report;
  }

  async resolveReconciliationItem(input: Parameters<MigrationReferenceRepository["resolveReconciliationItem"]>[0], context?: MigrationAuditContext) {
    const item = await this.repository.resolveReconciliationItem(input);
    await audit(this.auditLedger, buildAuditEvent({
      action: "RESOLVE_MIGRATION_RECONCILIATION_ITEM",
      entityType: "migration_reconciliation_report_item",
      entityId: item.id,
      context,
      afterState: { outcome: item.outcome },
      reason: input.notes
    }));
    return item;
  }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }
  return grouped;
}

function duplicateDetectionKeys(record: MigrationSourceRecord) {
  const keys = [`checksum:${record.sourceRowChecksum}`];
  if (record.sourceNaturalKey) keys.push(`natural:${record.sourceSystem}:${record.sourceDatabase}:${record.sourceSchema}:${record.sourceTable}:${record.sourceNaturalKey}`);
  return keys;
}

function sourceIdentity(record: MigrationSourceRecord) {
  return `${record.sourceSystem}:${record.sourceDatabase}:${record.sourceSchema}:${record.sourceTable}:${record.sourcePrimaryKey}`;
}

function reportStatus(items: Array<Pick<MigrationReconciliationReportItem, "severity">>): MigrationReportStatus {
  if (items.some((item) => item.severity === "blocker" || item.severity === "error")) return "failed";
  if (items.some((item) => item.severity === "warning")) return "passed_with_warnings";
  return "passed";
}
