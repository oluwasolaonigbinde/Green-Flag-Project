import { describe, expect, it } from "vitest";
import {
  applicantDashboardFixture,
  applicationDraftFixture,
  judgeAssessmentFixture
} from "@green-flag/contracts";
import type {
  MigrationArchiveRecord,
  MigrationBatchSourceTableManifest,
  MigrationEntityLink,
  MigrationImportBatch,
  MigrationMappingRule,
  MigrationReferenceRepository,
  MigrationReportWithItems,
  MigrationSourceRecord,
  MigrationSourceTableCatalogEntry,
  MigrationTargetEntityTypeEntry
} from "./migration-reference.js";
import {
  createSourceRowChecksum,
  MigrationReferenceService
} from "./migration-reference.js";
import type { AuditEvent, AuditLedger } from "./auth.js";

class RecordingAuditLedger implements AuditLedger {
  events: AuditEvent[] = [];
  async append(event: AuditEvent) {
    this.events.push(event);
  }
}

class InMemoryMigrationReferenceRepository implements MigrationReferenceRepository {
  batches = new Map<string, MigrationImportBatch>();
  catalogs = new Map<string, MigrationSourceTableCatalogEntry>();
  manifests = new Map<string, MigrationBatchSourceTableManifest>();
  targetTypes = new Map<string, MigrationTargetEntityTypeEntry>();
  rules = new Map<string, MigrationMappingRule>();
  records = new Map<string, MigrationSourceRecord>();
  links = new Map<string, MigrationEntityLink>();
  archives = new Map<string, MigrationArchiveRecord>();
  reports = new Map<string, MigrationReportWithItems>();
  targetRows = new Set<string>();
  private sequence = 1;

  addTarget(targetEntityType: string, targetEntityId: string) {
    this.targetRows.add(`${targetEntityType}:${targetEntityId}`);
  }

  private nextId() {
    const suffix = String(this.sequence++).padStart(12, "0");
    return `00000000-0000-4000-8000-${suffix}`;
  }

  async createImportBatch(input: Parameters<MigrationReferenceRepository["createImportBatch"]>[0]) {
    const existing = [...this.batches.values()].find((batch) => batch.batchKey === input.batchKey);
    if (existing) return existing;
    const batch: MigrationImportBatch = {
      id: input.id ?? this.nextId(),
      batchKey: input.batchKey,
      sourceSystem: input.sourceSystem,
      sourceDatabase: input.sourceDatabase,
      sourceExportLabel: input.sourceExportLabel,
      environment: input.environment,
      batchKind: input.batchKind,
      status: input.status,
      sourceFileManifest: input.sourceFileManifest ?? [],
      ...(input.initiatedByActorId ? { initiatedByActorId: input.initiatedByActorId } : {}),
      ...(input.sourceExportedAt ? { sourceExportedAt: input.sourceExportedAt } : {}),
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
      ...(input.notes ? { notes: input.notes } : {})
    };
    this.batches.set(batch.id, batch);
    return batch;
  }

  async updateImportBatchStatus(input: Parameters<MigrationReferenceRepository["updateImportBatchStatus"]>[0]) {
    const batch = this.batches.get(input.importBatchId);
    if (!batch) throw new Error("batch not found");
    const updated: MigrationImportBatch = {
      ...batch,
      status: input.status,
      ...(input.completedAt ? { completedAt: input.completedAt } : {})
    };
    this.batches.set(updated.id, updated);
    return updated;
  }

  async registerSourceTable(input: Parameters<MigrationReferenceRepository["registerSourceTable"]>[0]) {
    const existing = [...this.catalogs.values()].find((catalog) =>
      catalog.sourceSystem === input.sourceSystem &&
      catalog.sourceDatabase === input.sourceDatabase &&
      catalog.sourceSchema === input.sourceSchema &&
      catalog.sourceTable === input.sourceTable
    );
    if (existing) return existing;
    const catalog: MigrationSourceTableCatalogEntry = {
      id: input.id ?? this.nextId(),
      sourceSystem: input.sourceSystem,
      sourceDatabase: input.sourceDatabase,
      sourceSchema: input.sourceSchema,
      sourceTable: input.sourceTable,
      sourceGroup: input.sourceGroup,
      classification: input.classification,
      primaryKeyColumns: input.primaryKeyColumns,
      naturalKeyColumns: input.naturalKeyColumns,
      retentionDecision: input.retentionDecision,
      ...(input.businessOwner ? { businessOwner: input.businessOwner } : {}),
      ...(input.notes ? { notes: input.notes } : {})
    };
    this.catalogs.set(catalog.id, catalog);
    return catalog;
  }

  async registerBatchSourceTableManifest(input: Parameters<MigrationReferenceRepository["registerBatchSourceTableManifest"]>[0]) {
    const existing = [...this.manifests.values()].find((manifest) =>
      manifest.importBatchId === input.importBatchId && manifest.catalogId === input.catalogId
    );
    if (existing) return existing;
    const manifest: MigrationBatchSourceTableManifest = {
      id: input.id ?? this.nextId(),
      importBatchId: input.importBatchId,
      catalogId: input.catalogId,
      sourceSystem: input.sourceSystem,
      sourceDatabase: input.sourceDatabase,
      sourceSchema: input.sourceSchema,
      sourceTable: input.sourceTable,
      expectedRowCount: input.expectedRowCount,
      manifestStatus: input.manifestStatus,
      ...(input.sourceExportFile ? { sourceExportFile: input.sourceExportFile } : {}),
      ...(input.sourceExportFileChecksum ? { sourceExportFileChecksum: input.sourceExportFileChecksum } : {}),
      ...(input.expectedSourceHash ? { expectedSourceHash: input.expectedSourceHash } : {}),
      ...(input.actualRegisteredRowCount !== undefined ? { actualRegisteredRowCount: input.actualRegisteredRowCount } : {}),
      ...(input.actualRegisteredSourceHash ? { actualRegisteredSourceHash: input.actualRegisteredSourceHash } : {}),
      ...(input.notes ? { notes: input.notes } : {})
    };
    this.manifests.set(manifest.id, manifest);
    return manifest;
  }

  async registerTargetEntityType(input: Parameters<MigrationReferenceRepository["registerTargetEntityType"]>[0]) {
    const target: MigrationTargetEntityTypeEntry = {
      code: input.code,
      label: input.label,
      targetTable: input.targetTable,
      idColumn: input.idColumn ?? "id",
      validationMode: input.validationMode,
      active: input.active ?? true,
      ...(input.notes ? { notes: input.notes } : {})
    };
    this.targetTypes.set(target.code, target);
    return target;
  }

  async getSourceTableCatalog(id: string) {
    return this.catalogs.get(id) ?? null;
  }

  async getSourceRecord(id: string) {
    return this.records.get(id) ?? null;
  }

  async getTargetEntityType(code: string) {
    return this.targetTypes.get(code) ?? null;
  }

  async targetExists(targetEntityType: string, targetEntityId: string) {
    return targetEntityType === "external_archive_manifest" || this.targetRows.has(`${targetEntityType}:${targetEntityId}`);
  }

  async registerMappingRule(input: Parameters<MigrationReferenceRepository["registerMappingRule"]>[0]) {
    const existing = [...this.rules.values()].find((rule) => rule.catalogId === input.catalogId && rule.mappingVersion === input.mappingVersion);
    if (existing) return existing;
    const rule: MigrationMappingRule = {
      id: input.id ?? this.nextId(),
      catalogId: input.catalogId,
      sourceGroup: input.sourceGroup,
      mappingVersion: input.mappingVersion,
      requiredTargetEntityTypes: input.requiredTargetEntityTypes,
      optionalTargetEntityTypes: input.optionalTargetEntityTypes,
      archiveRequired: input.archiveRequired,
      allowUnlinkedSource: input.allowUnlinkedSource,
      missingTargetSeverity: input.missingTargetSeverity,
      ruleStatus: input.ruleStatus,
      ...(input.notes ? { notes: input.notes } : {})
    };
    this.rules.set(rule.id, rule);
    return rule;
  }

  async registerSourceRecord(input: Parameters<MigrationReferenceRepository["registerSourceRecord"]>[0]) {
    const existing = [...this.records.values()].find((record) =>
      record.importBatchId === input.importBatchId &&
      record.sourceSystem === input.sourceSystem &&
      record.sourceDatabase === input.sourceDatabase &&
      record.sourceSchema === input.sourceSchema &&
      record.sourceTable === input.sourceTable &&
      record.sourcePrimaryKey === input.sourcePrimaryKey
    );
    if (existing) return existing;
    const record: MigrationSourceRecord = {
      id: input.id ?? this.nextId(),
      importBatchId: input.importBatchId,
      catalogId: input.catalogId,
      batchSourceTableId: input.batchSourceTableId,
      sourceSystem: input.sourceSystem,
      sourceDatabase: input.sourceDatabase,
      sourceSchema: input.sourceSchema,
      sourceTable: input.sourceTable,
      sourcePrimaryKey: input.sourcePrimaryKey,
      sourceRowChecksum: input.sourceRowChecksum,
      sourceRowHashAlgorithm: input.sourceRowHashAlgorithm ?? "sha256",
      sourceRowFingerprint: input.sourceRowFingerprint,
      fingerprintSensitivity: input.fingerprintSensitivity,
      importStatus: input.importStatus ?? "registered",
      ...(input.sourcePrimaryKeyJson ? { sourcePrimaryKeyJson: input.sourcePrimaryKeyJson } : {}),
      ...(input.sourceNaturalKey ? { sourceNaturalKey: input.sourceNaturalKey } : {}),
      ...(input.sourceNaturalKeyJson ? { sourceNaturalKeyJson: input.sourceNaturalKeyJson } : {})
    };
    this.records.set(record.id, record);
    return record;
  }

  async updateSourceRecordStatus(input: Parameters<MigrationReferenceRepository["updateSourceRecordStatus"]>[0]) {
    const record = this.records.get(input.sourceRecordId);
    if (!record) throw new Error("record not found");
    const updated: MigrationSourceRecord = {
      ...record,
      importStatus: input.importStatus,
      ...(input.duplicateOfSourceRecordId ? { duplicateOfSourceRecordId: input.duplicateOfSourceRecordId } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.errorDetail ? { errorDetail: input.errorDetail } : {})
    };
    this.records.set(updated.id, updated);
    return updated;
  }

  async linkSourceRecordToEntity(input: Parameters<MigrationReferenceRepository["linkSourceRecordToEntity"]>[0]) {
    const existing = [...this.links.values()].find((link) =>
      link.sourceRecordId === input.sourceRecordId &&
      link.targetEntityType === input.targetEntityType &&
      link.targetEntityId === input.targetEntityId &&
      link.linkRole === input.linkRole &&
      link.mappingVersion === input.mappingVersion
    );
    if (existing) return existing;
    const link: MigrationEntityLink = {
      id: input.id ?? this.nextId(),
      sourceRecordId: input.sourceRecordId,
      importBatchId: input.importBatchId,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      linkRole: input.linkRole,
      linkStatus: input.linkStatus,
      confidence: input.confidence,
      mappingVersion: input.mappingVersion,
      createdByProcess: input.createdByProcess,
      ...(input.notes ? { notes: input.notes } : {})
    };
    this.links.set(link.id, link);
    return link;
  }

  async registerArchiveRecord(input: Parameters<MigrationReferenceRepository["registerArchiveRecord"]>[0]) {
    const existing = [...this.archives.values()].find((archive) =>
      archive.sourceRecordId === input.sourceRecordId &&
      archive.archiveKind === input.archiveKind &&
      archive.archiveReference === input.archiveReference
    );
    if (existing) return existing;
    const archive: MigrationArchiveRecord = {
      id: input.id ?? this.nextId(),
      sourceRecordId: input.sourceRecordId,
      importBatchId: input.importBatchId,
      archiveKind: input.archiveKind,
      archiveLocation: input.archiveLocation,
      archiveReference: input.archiveReference,
      retentionCategory: input.retentionCategory,
      sensitivity: input.sensitivity,
      ...(input.archiveChecksum ? { archiveChecksum: input.archiveChecksum } : {}),
      ...(input.accessNotes ? { accessNotes: input.accessNotes } : {})
    };
    this.archives.set(archive.id, archive);
    return archive;
  }

  async traceTargetToSource(input: Parameters<MigrationReferenceRepository["traceTargetToSource"]>[0]) {
    const sourceIds = [...this.links.values()]
      .filter((link) => link.targetEntityType === input.targetEntityType && link.targetEntityId === input.targetEntityId && link.linkStatus === "confirmed")
      .map((link) => link.sourceRecordId);
    return sourceIds.map((id) => this.records.get(id)).filter((record): record is MigrationSourceRecord => Boolean(record));
  }

  async traceSourceToTargets(sourceRecordId: string) {
    return [...this.links.values()].filter((link) => link.sourceRecordId === sourceRecordId);
  }

  async listSourceRecordsForBatch(importBatchId: string) {
    return [...this.records.values()].filter((record) => record.importBatchId === importBatchId);
  }

  async listLinksForBatch(importBatchId: string) {
    return [...this.links.values()].filter((link) => link.importBatchId === importBatchId);
  }

  async listArchiveRecordsForBatch(importBatchId: string) {
    return [...this.archives.values()].filter((archive) => archive.importBatchId === importBatchId);
  }

  async listManifestsForBatch(importBatchId: string) {
    return [...this.manifests.values()].filter((manifest) => manifest.importBatchId === importBatchId);
  }

  async listActiveMappingRules() {
    return [...this.rules.values()].filter((rule) => rule.ruleStatus === "active");
  }

  async listSourceRecordsForBatches(importBatchIds: string[]) {
    return [...this.records.values()].filter((record) => importBatchIds.includes(record.importBatchId));
  }

  async createReconciliationReport(input: Parameters<MigrationReferenceRepository["createReconciliationReport"]>[0]) {
    const report = {
      id: input.id ?? this.nextId(),
      importBatchId: input.importBatchId,
      reportKey: input.reportKey,
      reportType: input.reportType,
      scope: input.scope,
      status: input.status,
      sourceSystem: input.sourceSystem,
      summary: input.summary,
      summarySensitivity: input.summarySensitivity ?? "low",
      generatedByProcess: input.generatedByProcess,
      ...(input.sourceDatabase ? { sourceDatabase: input.sourceDatabase } : {}),
      ...(input.baselineImportBatchId ? { baselineImportBatchId: input.baselineImportBatchId } : {}),
      ...(input.comparedImportBatchId ? { comparedImportBatchId: input.comparedImportBatchId } : {}),
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
      ...(input.notes ? { notes: input.notes } : {})
    };
    const items = input.items.map((item) => ({
        id: item.id ?? this.nextId(),
      reportId: report.id,
      itemType: item.itemType,
      severity: item.severity,
      outcome: item.outcome ?? "open",
      evidenceSensitivity: item.evidenceSensitivity ?? "low",
      ...(item.sourceRecordId ? { sourceRecordId: item.sourceRecordId } : {}),
      ...(item.targetEntityType ? { targetEntityType: item.targetEntityType } : {}),
      ...(item.targetEntityId ? { targetEntityId: item.targetEntityId } : {}),
      ...(item.sourceValue ? { sourceValue: item.sourceValue } : {}),
      ...(item.targetValue ? { targetValue: item.targetValue } : {}),
      ...(item.expectedValue ? { expectedValue: item.expectedValue } : {}),
      ...(item.actualValue ? { actualValue: item.actualValue } : {}),
      ...(item.notes ? { notes: item.notes } : {})
    }));
    const withItems = { report, items };
    this.reports.set(report.id, withItems);
    return withItems;
  }

  async resolveReconciliationItem(input: Parameters<MigrationReferenceRepository["resolveReconciliationItem"]>[0]) {
    for (const report of this.reports.values()) {
      const item = report.items.find((candidate) => candidate.id === input.itemId);
      if (item) {
        item.outcome = input.outcome;
        item.resolvedByActorId = input.resolvedByActorId;
        item.resolvedAt = new Date().toISOString();
        if (input.notes) item.notes = input.notes;
        return item;
      }
    }
    throw new Error("item not found");
  }
}

async function seedBasics(
  repository: InMemoryMigrationReferenceRepository,
  service: MigrationReferenceService,
  sourceTable = "ParkAwardApplication",
  classification: MigrationSourceTableCatalogEntry["classification"] = "core_business"
) {
  await service.registerTargetEntityType({
    code: "application",
    label: "Application",
    targetTable: "applications",
    validationMode: "uuid_table_lookup"
  });
  await service.registerTargetEntityType({
    code: "assessment_episode",
    label: "Assessment episode",
    targetTable: "assessment_episodes",
    validationMode: "uuid_table_lookup"
  });
  await service.registerTargetEntityType({
    code: "archive_record",
    label: "Archive record",
    targetTable: "migration_archive_records",
    validationMode: "uuid_table_lookup"
  });
  const batch = await service.createImportBatch({
    batchKey: `batch-${sourceTable}-${repository.batches.size + 1}`,
    sourceSystem: "legacy_greenflag_live",
    sourceDatabase: "GreenFlag_Live",
    sourceExportLabel: "unit-test",
    environment: "local",
    batchKind: "dry_run",
    status: "created"
  });
  const catalog = await service.registerSourceTable({
    sourceSystem: "legacy_greenflag_live",
    sourceDatabase: "GreenFlag_Live",
    sourceSchema: "dbo",
    sourceTable,
    sourceGroup: sourceTable,
    classification,
    primaryKeyColumns: ["ID"],
    naturalKeyColumns: ["NaturalKey"],
    retentionDecision: "migrate"
  });
  const manifest = await service.registerBatchSourceTableManifest({
    importBatchId: batch.id,
    catalogId: catalog.id,
    sourceSystem: catalog.sourceSystem,
    sourceDatabase: catalog.sourceDatabase,
    sourceSchema: catalog.sourceSchema,
    sourceTable: catalog.sourceTable,
    expectedRowCount: 1,
    manifestStatus: "expected"
  });
  return { batch, catalog, manifest };
}

function migrationMetadataWords() {
  return [
    "migration_import_batches",
    "migration_source_records",
    "migration_entity_links",
    "migration_reconciliation_reports",
    "sourceRowChecksum",
    "sourcePrimaryKey",
    "legacy_greenflag_live",
    "importBatchId"
  ];
}

describe("Migration reference and reconciliation service", () => {
  it("maps one source row to multiple modern entities and keeps link creation idempotent", async () => {
    const repository = new InMemoryMigrationReferenceRepository();
    const service = new MigrationReferenceService(repository);
    const { batch, catalog, manifest } = await seedBasics(repository, service);
    const applicationId = "11111111-1111-4111-8111-111111111111";
    const episodeId = "22222222-2222-4222-8222-222222222222";
    repository.addTarget("application", applicationId);
    repository.addTarget("assessment_episode", episodeId);

    const source = await service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: catalog.id,
      batchSourceTableId: manifest.id,
      sourceSystem: catalog.sourceSystem,
      sourceDatabase: catalog.sourceDatabase,
      sourceSchema: catalog.sourceSchema,
      sourceTable: catalog.sourceTable,
      sourcePrimaryKey: "123",
      sourceNaturalKey: "park-1-2026",
      sourceRowChecksum: createSourceRowChecksum({ id: 123, natural: "park-1-2026" }),
      sourceRowFingerprint: { normalizedName: "park 1", year: 2026 },
      fingerprintSensitivity: "low"
    });
    const sameSource = await service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: catalog.id,
      batchSourceTableId: manifest.id,
      sourceSystem: catalog.sourceSystem,
      sourceDatabase: catalog.sourceDatabase,
      sourceSchema: catalog.sourceSchema,
      sourceTable: catalog.sourceTable,
      sourcePrimaryKey: "123",
      sourceNaturalKey: "park-1-2026",
      sourceRowChecksum: source.sourceRowChecksum,
      sourceRowFingerprint: { normalizedName: "park 1", year: 2026 },
      fingerprintSensitivity: "low"
    });
    expect(sameSource.id).toBe(source.id);

    const applicationLink = await service.linkSourceRecordToEntity({
      sourceRecordId: source.id,
      importBatchId: batch.id,
      targetEntityType: "application",
      targetEntityId: applicationId,
      linkRole: "application_package",
      linkStatus: "confirmed",
      confidence: "exact",
      mappingVersion: "v1",
      createdByProcess: "unit-test"
    });
    await service.linkSourceRecordToEntity({
      sourceRecordId: source.id,
      importBatchId: batch.id,
      targetEntityType: "assessment_episode",
      targetEntityId: episodeId,
      linkRole: "derived_episode",
      linkStatus: "confirmed",
      confidence: "exact",
      mappingVersion: "v1",
      createdByProcess: "unit-test"
    });
    const replayed = await service.linkSourceRecordToEntity({
      sourceRecordId: source.id,
      importBatchId: batch.id,
      targetEntityType: "application",
      targetEntityId: applicationId,
      linkRole: "application_package",
      linkStatus: "confirmed",
      confidence: "exact",
      mappingVersion: "v1",
      createdByProcess: "unit-test"
    });

    expect(replayed.id).toBe(applicationLink.id);
    await expect(service.traceSourceToTargets(source.id)).resolves.toHaveLength(2);
  });

  it("traces one modern target back to multiple source records", async () => {
    const repository = new InMemoryMigrationReferenceRepository();
    const service = new MigrationReferenceService(repository);
    const { batch, catalog, manifest } = await seedBasics(repository, service, "Award");
    const episodeId = "33333333-3333-4333-8333-333333333333";
    repository.addTarget("assessment_episode", episodeId);

    for (const primaryKey of ["award-1", "note-1"]) {
      const source = await service.registerSourceRecord({
        importBatchId: batch.id,
        catalogId: catalog.id,
        batchSourceTableId: manifest.id,
        sourceSystem: catalog.sourceSystem,
        sourceDatabase: catalog.sourceDatabase,
        sourceSchema: catalog.sourceSchema,
        sourceTable: catalog.sourceTable,
        sourcePrimaryKey: primaryKey,
        sourceRowChecksum: createSourceRowChecksum({ primaryKey }),
        sourceRowFingerprint: { primaryKey },
        fingerprintSensitivity: "low"
      });
      await service.linkSourceRecordToEntity({
        sourceRecordId: source.id,
        importBatchId: batch.id,
        targetEntityType: "assessment_episode",
        targetEntityId: episodeId,
        linkRole: "derived_episode",
        linkStatus: "confirmed",
        confidence: "strong",
        mappingVersion: "v1",
        createdByProcess: "unit-test"
      });
    }

    const traced = await service.traceTargetToSource({ targetEntityType: "assessment_episode", targetEntityId: episodeId });
    expect(traced.map((record) => record.sourcePrimaryKey).sort()).toEqual(["award-1", "note-1"]);
  });

  it("reports duplicates, orphans, missing required targets, counts, and outcomes", async () => {
    const repository = new InMemoryMigrationReferenceRepository();
    const service = new MigrationReferenceService(repository);
    const { batch, catalog, manifest } = await seedBasics(repository, service);
    await service.registerMappingRule({
      catalogId: catalog.id,
      sourceGroup: catalog.sourceGroup,
      mappingVersion: "v1",
      requiredTargetEntityTypes: ["application", "assessment_episode"],
      optionalTargetEntityTypes: [],
      archiveRequired: false,
      allowUnlinkedSource: false,
      missingTargetSeverity: "error",
      ruleStatus: "active"
    });

    for (const primaryKey of ["1", "2"]) {
      await service.registerSourceRecord({
        importBatchId: batch.id,
        catalogId: catalog.id,
        batchSourceTableId: manifest.id,
        sourceSystem: catalog.sourceSystem,
        sourceDatabase: catalog.sourceDatabase,
        sourceSchema: catalog.sourceSchema,
        sourceTable: catalog.sourceTable,
        sourcePrimaryKey: primaryKey,
        sourceNaturalKey: "duplicate-natural-key",
        sourceRowChecksum: createSourceRowChecksum({ same: true }),
        sourceRowFingerprint: { normalizedName: "duplicate park" },
        fingerprintSensitivity: "low"
      });
    }

    const report = await service.generateReconciliationReport({
      importBatchId: batch.id,
      reportKey: "full-batch",
      reportType: "full_batch",
      scope: "ParkAwardApplication",
      sourceSystem: "legacy_greenflag_live",
      generatedByProcess: "unit-test",
      financeTotals: { invoiceSourceTotal: "0.00", invoiceTargetTotal: null }
    });

    expect(report.report.status).toBe("failed");
    expect(report.report.summary).toMatchObject({
      sourceRowCount: 2,
      registeredSourceRecordCount: 2,
      linkedSourceRecordCount: 0,
      duplicateSourceCount: 1,
      missingTargetCount: 4,
      orphanSourceCount: 2
    });
    expect(report.items.map((item) => item.itemType)).toEqual(expect.arrayContaining([
      "duplicate_source",
      "missing_target",
      "orphan_source",
      "count_mismatch"
    ]));
  });

  it("reconciles finance targets through Goal 1 provenance without exposing raw finance internals", async () => {
    const repository = new InMemoryMigrationReferenceRepository();
    const service = new MigrationReferenceService(repository);
    const { batch, catalog: feeCatalog, manifest: feeManifest } = await seedBasics(repository, service, "Fee", "finance");
    for (const target of [
      { code: "fee_schedule", label: "Fee schedule", targetTable: "fee_schedules" },
      { code: "fee_schedule_line", label: "Fee schedule line", targetTable: "fee_schedule_lines" },
      { code: "invoice", label: "Invoice", targetTable: "invoices" },
      { code: "invoice_line", label: "Invoice line", targetTable: "invoice_lines" },
      { code: "payment_state", label: "Payment state", targetTable: "payment_states", idColumn: "invoice_id" },
      { code: "payment_event", label: "Payment event", targetTable: "payment_events" },
      { code: "finance_export_run", label: "Finance export run", targetTable: "finance_export_runs" },
      { code: "application_area_snapshot", label: "Application area snapshot", targetTable: "application_area_snapshots" }
    ]) {
      await service.registerTargetEntityType({
        ...target,
        validationMode: "uuid_table_lookup"
      });
    }

    const invoiceCatalog = await service.registerSourceTable({
      sourceSystem: "legacy_greenflag_live",
      sourceDatabase: "GreenFlag_Live",
      sourceSchema: "dbo",
      sourceTable: "Invoice",
      sourceGroup: "Invoice",
      classification: "finance",
      primaryKeyColumns: ["ID"],
      naturalKeyColumns: ["ParkAwardApplicationID"],
      retentionDecision: "migrate"
    });
    const invoiceManifest = await service.registerBatchSourceTableManifest({
      importBatchId: batch.id,
      catalogId: invoiceCatalog.id,
      sourceSystem: invoiceCatalog.sourceSystem,
      sourceDatabase: invoiceCatalog.sourceDatabase,
      sourceSchema: invoiceCatalog.sourceSchema,
      sourceTable: invoiceCatalog.sourceTable,
      expectedRowCount: 1,
      manifestStatus: "expected"
    });

    await service.registerMappingRule({
      catalogId: feeCatalog.id,
      sourceGroup: "Fee",
      mappingVersion: "goal-2-finance-migration.v1",
      requiredTargetEntityTypes: ["fee_schedule", "fee_schedule_line"],
      optionalTargetEntityTypes: [],
      archiveRequired: false,
      allowUnlinkedSource: false,
      missingTargetSeverity: "error",
      ruleStatus: "active"
    });
    await service.registerMappingRule({
      catalogId: invoiceCatalog.id,
      sourceGroup: "Invoice",
      mappingVersion: "goal-2-finance-migration.v1",
      requiredTargetEntityTypes: ["invoice", "invoice_line"],
      optionalTargetEntityTypes: ["payment_state", "payment_event"],
      archiveRequired: false,
      allowUnlinkedSource: false,
      missingTargetSeverity: "error",
      ruleStatus: "active"
    });

    const feeRecord = await service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: feeCatalog.id,
      batchSourceTableId: feeManifest.id,
      sourceSystem: feeCatalog.sourceSystem,
      sourceDatabase: feeCatalog.sourceDatabase,
      sourceSchema: feeCatalog.sourceSchema,
      sourceTable: feeCatalog.sourceTable,
      sourcePrimaryKey: "fee-1",
      sourceNaturalKey: "GB-2026-12.50",
      sourceRowChecksum: createSourceRowChecksum({ id: "fee-1", currency: "GBP", country: "GB" }),
      sourceRowFingerprint: { country: "GB", currency: "GBP", season: 2026 },
      fingerprintSensitivity: "low"
    });
    const invoiceRecord = await service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: invoiceCatalog.id,
      batchSourceTableId: invoiceManifest.id,
      sourceSystem: invoiceCatalog.sourceSystem,
      sourceDatabase: invoiceCatalog.sourceDatabase,
      sourceSchema: invoiceCatalog.sourceSchema,
      sourceTable: invoiceCatalog.sourceTable,
      sourcePrimaryKey: "invoice-1",
      sourceNaturalKey: "application-1",
      sourceRowChecksum: createSourceRowChecksum({ id: "invoice-1", total: "10.00", currency: "GBP" }),
      sourceRowFingerprint: { currency: "GBP", total: "10.00", country: "GB", season: 2026 },
      fingerprintSensitivity: "low"
    });

    const ids = {
      feeSchedule: "44444444-4444-4444-8444-444444444444",
      invoice: "55555555-5555-4555-8555-555555555555",
      invoiceLine: "66666666-6666-4666-8666-666666666666",
      paymentState: "55555555-5555-4555-8555-555555555555",
      paymentEvent: "77777777-7777-4777-8777-777777777777"
    };
    repository.addTarget("fee_schedule", ids.feeSchedule);
    repository.addTarget("invoice", ids.invoice);
    repository.addTarget("invoice_line", ids.invoiceLine);
    repository.addTarget("payment_state", ids.paymentState);
    repository.addTarget("payment_event", ids.paymentEvent);

    await service.linkSourceRecordToEntity({
      sourceRecordId: feeRecord.id,
      importBatchId: batch.id,
      targetEntityType: "fee_schedule",
      targetEntityId: ids.feeSchedule,
      linkRole: "derived_fee_schedule",
      linkStatus: "confirmed",
      confidence: "inferred",
      mappingVersion: "goal-2-finance-migration.v1",
      createdByProcess: "unit-test"
    });
    for (const [targetEntityType, targetEntityId, linkRole] of [
      ["invoice", ids.invoice, "imported_invoice"],
      ["invoice_line", ids.invoiceLine, "reconstructed_invoice_line"],
      ["payment_state", ids.paymentState, "payment_projection"],
      ["payment_event", ids.paymentEvent, "legacy_payment_event"]
    ] as const) {
      await service.linkSourceRecordToEntity({
        sourceRecordId: invoiceRecord.id,
        importBatchId: batch.id,
        targetEntityType,
        targetEntityId,
        linkRole,
        linkStatus: "confirmed",
        confidence: "strong",
        mappingVersion: "goal-2-finance-migration.v1",
        createdByProcess: "unit-test"
      });
    }

    const report = await service.generateReconciliationReport({
      importBatchId: batch.id,
      reportKey: "goal-2-finance",
      reportType: "finance_totals",
      scope: "Fee+Invoice",
      sourceSystem: "legacy_greenflag_live",
      generatedByProcess: "unit-test",
      financeTotals: {
        source: { feeRows: 1, invoiceRows: 1, invoiceTotalByCurrency: { GBP: "10.00" } },
        target: { invoiceRows: 1, invoiceTotalByCurrency: { GBP: "10.00" } },
        groupings: { country: "GB", operationalYear: 2026 }
      }
    });

    expect(report.report.summary).toMatchObject({
      sourceRowCount: 2,
      linkedSourceRecordCount: 2,
      financeTotals: {
        source: { feeRows: 1, invoiceRows: 1, invoiceTotalByCurrency: { GBP: "10.00" } },
        target: { invoiceRows: 1, invoiceTotalByCurrency: { GBP: "10.00" } }
      }
    });
    expect(report.items).toEqual([
      expect.objectContaining({
        sourceRecordId: feeRecord.id,
        targetEntityType: "fee_schedule_line",
        itemType: "missing_target"
      })
    ]);
    await expect(service.traceTargetToSource({ targetEntityType: "invoice_line", targetEntityId: ids.invoiceLine }))
      .resolves.toEqual([expect.objectContaining({ sourcePrimaryKey: "invoice-1" })]);
    expect(JSON.stringify(report)).not.toContain("source_table_name_leak");
  });

  it("reports checksum changes across baseline and compared batches", async () => {
    const repository = new InMemoryMigrationReferenceRepository();
    const service = new MigrationReferenceService(repository);
    const baseline = await seedBasics(repository, service, "Park");
    const compared = await seedBasics(repository, service, "Park");
    await service.registerMappingRule({
      catalogId: baseline.catalog.id,
      sourceGroup: "Park",
      mappingVersion: "v1",
      requiredTargetEntityTypes: [],
      optionalTargetEntityTypes: [],
      archiveRequired: false,
      allowUnlinkedSource: true,
      missingTargetSeverity: "warning",
      ruleStatus: "active"
    });
    for (const [batch, checksum] of [
      [baseline, createSourceRowChecksum({ id: 1, name: "Old" })],
      [compared, createSourceRowChecksum({ id: 1, name: "Changed" })]
    ] as const) {
      await service.registerSourceRecord({
        importBatchId: batch.batch.id,
        catalogId: batch.catalog.id,
        batchSourceTableId: batch.manifest.id,
        sourceSystem: batch.catalog.sourceSystem,
        sourceDatabase: batch.catalog.sourceDatabase,
        sourceSchema: batch.catalog.sourceSchema,
        sourceTable: batch.catalog.sourceTable,
        sourcePrimaryKey: "1",
        sourceRowChecksum: checksum,
        sourceRowFingerprint: { normalizedName: "park" },
        fingerprintSensitivity: "low"
      });
    }

    const report = await service.generateReconciliationReport({
      importBatchId: compared.batch.id,
      baselineImportBatchId: baseline.batch.id,
      comparedImportBatchId: compared.batch.id,
      reportKey: "cross-batch",
      reportType: "hash",
      scope: "Park",
      sourceSystem: "legacy_greenflag_live",
      generatedByProcess: "unit-test"
    });

    expect(report.items.some((item) => item.itemType === "checksum_mismatch")).toBe(true);
    expect(report.report.summary).toMatchObject({
      checksumMismatchCount: 1,
      baselineImportBatchId: baseline.batch.id,
      comparedImportBatchId: compared.batch.id
    });
  });

  it("does not report explicit archive-only rows as unresolved orphan rows", async () => {
    const repository = new InMemoryMigrationReferenceRepository();
    const service = new MigrationReferenceService(repository);
    const { batch, catalog, manifest } = await seedBasics(repository, service, "EmailLog");
    await service.registerMappingRule({
      catalogId: catalog.id,
      sourceGroup: "EmailLog",
      mappingVersion: "v1",
      requiredTargetEntityTypes: [],
      optionalTargetEntityTypes: [],
      archiveRequired: true,
      allowUnlinkedSource: false,
      missingTargetSeverity: "warning",
      ruleStatus: "active"
    });
    const source = await service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: catalog.id,
      batchSourceTableId: manifest.id,
      sourceSystem: catalog.sourceSystem,
      sourceDatabase: catalog.sourceDatabase,
      sourceSchema: catalog.sourceSchema,
      sourceTable: catalog.sourceTable,
      sourcePrimaryKey: "email-1",
      sourceRowChecksum: createSourceRowChecksum({ id: "email-1", status: "sent" }),
      sourceRowFingerprint: { status: "sent" },
      fingerprintSensitivity: "low"
    });
    await service.registerArchiveRecord({
      sourceRecordId: source.id,
      importBatchId: batch.id,
      archiveKind: "external_archive_manifest",
      archiveLocation: "archive://legacy-email-log",
      archiveReference: "email-1",
      retentionCategory: "communications_history",
      sensitivity: "personal_data"
    });

    const report = await service.generateReconciliationReport({
      importBatchId: batch.id,
      reportKey: "archive-only",
      reportType: "full_batch",
      scope: "EmailLog",
      sourceSystem: "legacy_greenflag_live",
      generatedByProcess: "unit-test"
    });

    expect(report.items.find((item) => item.itemType === "orphan_source")).toBeUndefined();
    expect(report.items.find((item) => item.itemType === "missing_target")).toBeUndefined();
  });

  it("rejects unsafe migration metadata and confirmed links to missing targets", async () => {
    const repository = new InMemoryMigrationReferenceRepository();
    const service = new MigrationReferenceService(repository);
    const { batch, catalog, manifest } = await seedBasics(repository, service);

    await expect(service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: catalog.id,
      batchSourceTableId: manifest.id,
      sourceSystem: catalog.sourceSystem,
      sourceDatabase: catalog.sourceDatabase,
      sourceSchema: catalog.sourceSchema,
      sourceTable: catalog.sourceTable,
      sourcePrimaryKey: "unsafe",
      sourceRowChecksum: createSourceRowChecksum({ id: "unsafe" }),
      sourceRowFingerprint: { rawEmailBody: "do not store" },
      fingerprintSensitivity: "low"
    })).rejects.toThrow("not allowed");

    const safe = await service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: catalog.id,
      batchSourceTableId: manifest.id,
      sourceSystem: catalog.sourceSystem,
      sourceDatabase: catalog.sourceDatabase,
      sourceSchema: catalog.sourceSchema,
      sourceTable: catalog.sourceTable,
      sourcePrimaryKey: "safe",
      sourceRowChecksum: createSourceRowChecksum({ id: "safe" }),
      sourceRowFingerprint: { normalizedName: "safe" },
      fingerprintSensitivity: "low"
    });

    await expect(service.linkSourceRecordToEntity({
      sourceRecordId: safe.id,
      importBatchId: batch.id,
      targetEntityType: "application",
      targetEntityId: "99999999-9999-4999-8999-999999999999",
      linkRole: "application_package",
      linkStatus: "confirmed",
      confidence: "exact",
      mappingVersion: "v1",
      createdByProcess: "unit-test"
    })).rejects.toThrow("missing target");
  });

  it("keeps unclassified source tables out of passed reconciliation and confirmed links", async () => {
    const repository = new InMemoryMigrationReferenceRepository();
    const service = new MigrationReferenceService(repository);
    const { batch, catalog, manifest } = await seedBasics(
      repository,
      service,
      "UFRecords",
      "unclassified_pending_review"
    );
    const applicationId = "77777777-7777-4777-8777-777777777777";
    repository.addTarget("application", applicationId);

    const source = await service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: catalog.id,
      batchSourceTableId: manifest.id,
      sourceSystem: catalog.sourceSystem,
      sourceDatabase: catalog.sourceDatabase,
      sourceSchema: catalog.sourceSchema,
      sourceTable: catalog.sourceTable,
      sourcePrimaryKey: "form-1",
      sourceRowChecksum: createSourceRowChecksum({ id: "form-1" }),
      sourceRowFingerprint: { form: "unknown" },
      fingerprintSensitivity: "low"
    });

    await expect(service.registerMappingRule({
      catalogId: catalog.id,
      sourceGroup: catalog.sourceGroup,
      mappingVersion: "v1",
      requiredTargetEntityTypes: ["application"],
      optionalTargetEntityTypes: [],
      archiveRequired: false,
      allowUnlinkedSource: false,
      missingTargetSeverity: "error",
      ruleStatus: "active"
    })).rejects.toThrow("Unclassified");

    await expect(service.linkSourceRecordToEntity({
      sourceRecordId: source.id,
      importBatchId: batch.id,
      targetEntityType: "application",
      targetEntityId: applicationId,
      linkRole: "application_package",
      linkStatus: "confirmed",
      confidence: "exact",
      mappingVersion: "v1",
      createdByProcess: "unit-test"
    })).rejects.toThrow("Unclassified");

    const report = await service.generateReconciliationReport({
      importBatchId: batch.id,
      reportKey: "unclassified",
      reportType: "full_batch",
      scope: "UFRecords",
      sourceSystem: "legacy_kbt_gfa",
      generatedByProcess: "unit-test"
    });

    expect(report.report.status).toBe("failed");
    expect(report.items.map((item) => item.itemType)).toContain("manual_review_required");
  });

  it("emits audit events for batch status changes, report completion, item resolution, and confirmed links", async () => {
    const repository = new InMemoryMigrationReferenceRepository();
    const ledger = new RecordingAuditLedger();
    const service = new MigrationReferenceService(repository, ledger);
    const { batch, catalog, manifest } = await seedBasics(repository, service);
    await service.registerMappingRule({
      catalogId: catalog.id,
      sourceGroup: catalog.sourceGroup,
      mappingVersion: "v1",
      requiredTargetEntityTypes: [],
      optionalTargetEntityTypes: [],
      archiveRequired: false,
      allowUnlinkedSource: true,
      missingTargetSeverity: "warning",
      ruleStatus: "active"
    });
    const applicationId = "44444444-4444-4444-8444-444444444444";
    repository.addTarget("application", applicationId);
    const source = await service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: catalog.id,
      batchSourceTableId: manifest.id,
      sourceSystem: catalog.sourceSystem,
      sourceDatabase: catalog.sourceDatabase,
      sourceSchema: catalog.sourceSchema,
      sourceTable: catalog.sourceTable,
      sourcePrimaryKey: "1",
      sourceRowChecksum: createSourceRowChecksum({ id: 1 }),
      sourceRowFingerprint: { id: 1 },
      fingerprintSensitivity: "low"
    });
    await service.registerSourceRecord({
      importBatchId: batch.id,
      catalogId: catalog.id,
      batchSourceTableId: manifest.id,
      sourceSystem: catalog.sourceSystem,
      sourceDatabase: catalog.sourceDatabase,
      sourceSchema: catalog.sourceSchema,
      sourceTable: catalog.sourceTable,
      sourcePrimaryKey: "2",
      sourceRowChecksum: createSourceRowChecksum({ id: 2 }),
      sourceRowFingerprint: { id: 2 },
      fingerprintSensitivity: "low"
    });
    await service.updateImportBatchStatus({ importBatchId: batch.id, status: "running" }, { requestId: "audit-test" });
    await service.linkSourceRecordToEntity({
      sourceRecordId: source.id,
      importBatchId: batch.id,
      targetEntityType: "application",
      targetEntityId: applicationId,
      linkRole: "application_package",
      linkStatus: "confirmed",
      confidence: "exact",
      mappingVersion: "v1",
      createdByProcess: "unit-test"
    }, { requestId: "audit-test" });
    const report = await service.generateReconciliationReport({
      importBatchId: batch.id,
      reportKey: "audit-report",
      reportType: "full_batch",
      scope: "audit",
      sourceSystem: "legacy_greenflag_live",
      generatedByProcess: "unit-test"
    }, { requestId: "audit-test" });
    expect(report.items[0]).toBeDefined();
    const item = await service.resolveReconciliationItem({
      itemId: report.items[0]!.id,
      outcome: "resolved",
      resolvedByActorId: "00000000-0000-4000-8000-000000000001",
      notes: "Resolved in test."
    }, { requestId: "audit-test" });

    expect(item.outcome).toBe("resolved");
    expect(ledger.events.map((event) => event.action)).toEqual(expect.arrayContaining([
      "CREATE_MIGRATION_IMPORT_BATCH",
      "UPDATE_MIGRATION_IMPORT_BATCH_STATUS",
      "CONFIRM_MIGRATION_ENTITY_LINK",
      "COMPLETE_MIGRATION_RECONCILIATION_REPORT",
      "RESOLVE_MIGRATION_RECONCILIATION_ITEM"
    ]));
  });

  it("keeps migration metadata out of applicant and judge-facing fixtures", () => {
    const applicantJson = JSON.stringify([applicantDashboardFixture, applicationDraftFixture]);
    const judgeJson = JSON.stringify(judgeAssessmentFixture);
    for (const word of migrationMetadataWords()) {
      expect(applicantJson).not.toContain(word);
      expect(judgeJson).not.toContain(word);
    }
  });
});
