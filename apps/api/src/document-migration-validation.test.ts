import { describe, expect, it } from "vitest";
import type {
  DocumentAssetOwnershipRecord,
  DocumentMigrationRepository,
  DocumentOwnerValidationStatus,
  DocumentSubtypeCatalogEntry,
  MigrationDocumentFileReference,
  MigrationEntityLinkReference,
  MigrationSourceRecordReference
} from "./document-migration-validation.js";
import { DocumentMigrationValidationService } from "./document-migration-validation.js";
import type { AuditEvent, AuditLedger } from "./auth.js";

class RecordingAuditLedger implements AuditLedger {
  events: AuditEvent[] = [];
  async append(event: AuditEvent) {
    this.events.push(event);
  }
}

class InMemoryDocumentMigrationRepository implements DocumentMigrationRepository {
  subtypes = new Map<string, DocumentSubtypeCatalogEntry>();
  documentAssets = new Set<string>();
  owners = new Set<string>();
  unsupportedOwners = new Set<string>();
  ownerships = new Map<string, DocumentAssetOwnershipRecord>();
  references = new Map<string, MigrationDocumentFileReference>();
  sourceRecords = new Map<string, MigrationSourceRecordReference>();
  entityLinks = new Map<string, MigrationEntityLinkReference>();
  metadataUpdates: unknown[] = [];

  async getDocumentSubtype(code: string) {
    return this.subtypes.get(code) ?? null;
  }

  async documentAssetExists(documentAssetId: string) {
    return this.documentAssets.has(documentAssetId);
  }

  async validateOwner(ownerType: string, ownerId: string): Promise<DocumentOwnerValidationStatus> {
    if (this.unsupportedOwners.has(ownerType)) return "unsupported";
    return this.owners.has(`${ownerType}:${ownerId}`) ? "exists" : "missing";
  }

  async getSourceRecordReference(sourceRecordId: string) {
    return this.sourceRecords.get(sourceRecordId) ?? null;
  }

  async getMigrationEntityLinkReference(migrationEntityLinkId: string) {
    return this.entityLinks.get(migrationEntityLinkId) ?? null;
  }

  async registerDocumentAssetOwnership(input: DocumentAssetOwnershipRecord) {
    const key = `${input.documentAssetId}:${input.ownerType}:${input.ownerId}:${input.ownerContextRole}`;
    const existing = this.ownerships.get(key);
    if (existing) return existing;
    this.ownerships.set(key, input);
    return input;
  }

  async updateDocumentAssetMetadata(input: Parameters<DocumentMigrationRepository["updateDocumentAssetMetadata"]>[0]) {
    this.metadataUpdates.push(input);
  }

  async registerMigrationDocumentFileReference(input: MigrationDocumentFileReference) {
    const key = `${input.importBatchId}:${input.sourceTable}:${input.sourceColumn}:${input.sourcePrimaryKey}:${input.sourceReferenceKey}`;
    const existing = this.references.get(key);
    if (existing) {
      const comparable = (value: MigrationDocumentFileReference) => JSON.stringify({
        ...value,
        id: undefined
      });
      if (comparable(existing) === comparable(input)) return existing;
      throw Object.assign(new Error("Migration document file reference already exists with different internal metadata."), {
        code: "idempotency_conflict",
        statusCode: 409
      });
    }
    this.references.set(key, input);
    return input;
  }
}

function subtype(overrides: Partial<DocumentSubtypeCatalogEntry> = {}): DocumentSubtypeCatalogEntry {
  return {
    code: "management_plan",
    taxonomyVersion: "document-subtypes.v1",
    label: "Management plan",
    status: "active",
    coarseDocumentType: "application_document",
    defaultVisibility: "APPLICANT_AND_ADMIN",
    defaultRedactionClassification: "standard",
    defaultRetentionCategory: "assessment_record_min_7_years",
    defaultSensitivityClassification: "low",
    storagePolicy: "private_signed_download",
    allowedOwnerTypes: ["application", "assessment_episode"],
    allowedMimeTypes: ["application/pdf"],
    maxByteSize: 52_428_800,
    migrationRequired: true,
    ...overrides
  };
}

function buildRepository() {
  const repository = new InMemoryDocumentMigrationRepository();
  repository.subtypes.set("management_plan", subtype());
  repository.subtypes.set("result_report", subtype({
    code: "result_report",
    status: "planned",
    defaultVisibility: "ADMIN_ONLY",
    defaultRedactionClassification: "score_safe_summary_only",
    defaultSensitivityClassification: "personal_data",
    allowedOwnerTypes: ["result_artifact", "assessment_episode"]
  }));
  repository.subtypes.set("archive_only_file", subtype({
    code: "archive_only_file",
    status: "planned",
    defaultVisibility: "ADMIN_ONLY",
    defaultRedactionClassification: "internal_archive_only",
    defaultRetentionCategory: "archive_retention_pending",
    defaultSensitivityClassification: "personal_data",
    storagePolicy: "external_archive_or_metadata_only",
    allowedOwnerTypes: ["archive_only_record"]
  }));
  repository.subtypes.set("voice_note", subtype({
    code: "voice_note",
    status: "external_approval_required",
    defaultVisibility: "ADMIN_ONLY",
    allowedOwnerTypes: ["assessment_evidence", "judge_assessment"]
  }));
  repository.subtypes.set("financial_statement", subtype({
    code: "financial_statement",
    status: "planned",
    defaultVisibility: "ADMIN_ONLY",
    defaultSensitivityClassification: "personal_data",
    allowedOwnerTypes: ["application_field"]
  }));
  repository.documentAssets.add("asset-1");
  repository.owners.add("application:application-1");
  repository.owners.add("assessment_episode:episode-1");
  repository.owners.add("result_artifact:result-artifact-1");
  repository.owners.add("archive_only_record:archive-record-1");
  repository.owners.add("application_field:application-field-value-1");
  repository.unsupportedOwners.add("public_resource");
  return repository;
}

describe("DocumentMigrationValidationService", () => {
  it("resolves subtype defaults and registers valid internal ownership", async () => {
    const repository = buildRepository();
    const ledger = new RecordingAuditLedger();
    const service = new DocumentMigrationValidationService(repository, { auditLedger: ledger });

    const ownership = await service.registerDocumentAssetOwnership({
      documentAssetId: "asset-1",
      documentSubtype: "management_plan",
      ownerType: "application",
      ownerId: "application-1",
      ownerContextRole: "application_package",
      applyDocumentAssetMetadata: true
    });

    expect(ownership).toMatchObject({
      documentAssetId: "asset-1",
      ownerType: "application",
      ownerId: "application-1",
      requiredForAccess: true
    });
    expect(repository.metadataUpdates).toEqual([
      expect.objectContaining({
        documentSubtype: "management_plan",
        visibilityClassification: "APPLICANT_AND_ADMIN",
        redactionClassification: "standard",
        retentionCategory: "assessment_record_min_7_years",
        sensitivityClassification: "low"
      })
    ]);
    expect(ledger.events[0]?.action).toBe("REGISTER_DOCUMENT_ASSET_OWNERSHIP");
  });

  it("fails closed for unknown, unsupported, disallowed, missing, and future runtime owners", async () => {
    const repository = buildRepository();
    const service = new DocumentMigrationValidationService(repository);

    await expect(service.resolveSubtypeDefaults("missing_subtype", "application"))
      .rejects.toMatchObject({ code: "validation_failed" });
    await expect(service.registerDocumentAssetOwnership({
      documentAssetId: "asset-1",
      documentSubtype: "management_plan",
      ownerType: "public_resource",
      ownerId: "resource-1",
      ownerContextRole: "public_resource"
    })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(service.registerDocumentAssetOwnership({
      documentAssetId: "asset-1",
      documentSubtype: "management_plan",
      ownerType: "result_artifact",
      ownerId: "result-artifact-1",
      ownerContextRole: "result"
    })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(service.registerDocumentAssetOwnership({
      documentAssetId: "asset-1",
      documentSubtype: "management_plan",
      ownerType: "application",
      ownerId: "missing-application",
      ownerContextRole: "application_package"
    })).rejects.toMatchObject({ code: "dependency_missing" });
    await expect(service.registerDocumentAssetOwnership({
      documentAssetId: "asset-1",
      documentSubtype: "result_report",
      ownerType: "result_artifact",
      ownerId: "result-artifact-1",
      ownerContextRole: "result"
    })).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("allows planned and external-approval subtypes only as internal migration classifications", async () => {
    const repository = buildRepository();
    const service = new DocumentMigrationValidationService(repository);

    const resultReport = await service.registerMigrationFileReference({
      importBatchId: "batch-1",
      sourceTable: "ParkApplicationNote",
      sourceColumn: "FeedbackFile",
      sourcePrimaryKey: "note-1",
      importStatus: "metadata_only",
      ownerEntityType: "result_artifact",
      ownerEntityId: "result-artifact-1",
      documentSubtype: "result_report"
    });
    const voiceNote = await service.registerMigrationFileReference({
      importBatchId: "batch-1",
      sourceTable: "ParkApplicationNote",
      sourceColumn: "VoiceNote",
      sourcePrimaryKey: "note-2",
      importStatus: "owner_unresolved",
      documentSubtype: "voice_note"
    });

    expect(resultReport).toMatchObject({
      visibilityClassification: "ADMIN_ONLY",
      redactionClassification: "score_safe_summary_only",
      sensitivityClassification: "personal_data"
    });
    expect(voiceNote).toMatchObject({
      documentSubtype: "voice_note",
      importStatus: "owner_unresolved"
    });
  });

  it("treats application_field as application_field_values.id, not a field-definition owner", async () => {
    const repository = buildRepository();
    const service = new DocumentMigrationValidationService(repository);

    const reference = await service.registerMigrationFileReference({
      importBatchId: "batch-1",
      sourceTable: "ParkAwardApplication",
      sourceColumn: "FinancialStatementFile",
      sourcePrimaryKey: "application-1",
      importStatus: "metadata_only",
      ownerEntityType: "application_field",
      ownerEntityId: "application-field-value-1",
      documentSubtype: "financial_statement"
    });

    expect(reference.ownerEntityType).toBe("application_field");
    expect(reference.ownerEntityId).toBe("application-field-value-1");
  });

  it("enforces archive-only status rules without creating document assets", async () => {
    const repository = buildRepository();
    const service = new DocumentMigrationValidationService(repository);

    await expect(service.registerArchiveOnlyFileReference({
      importBatchId: "batch-1",
      sourceTable: "ParkDocument",
      sourceColumn: "Filename",
      sourcePrimaryKey: "1",
      importStatus: "missing_file",
      documentSubtype: "archive_only_file"
    })).rejects.toMatchObject({ code: "validation_failed" });

    await expect(service.registerArchiveOnlyFileReference({
      importBatchId: "batch-1",
      sourceTable: "ParkDocument",
      sourceColumn: "Filename",
      sourcePrimaryKey: "2",
      importStatus: "intentionally_not_needed",
      documentSubtype: "archive_only_file"
    })).rejects.toMatchObject({ code: "validation_failed" });

    await expect(service.registerArchiveOnlyFileReference({
      importBatchId: "batch-1",
      sourceTable: "ParkDocument",
      sourceColumn: "Filename",
      sourcePrimaryKey: "3",
      importStatus: "external_archive_only",
      documentSubtype: "archive_only_file"
    })).rejects.toMatchObject({ code: "validation_failed" });

    const reference = await service.registerArchiveOnlyFileReference({
      importBatchId: "batch-1",
      sourceTable: "ParkDocument",
      sourceColumn: "Filename",
      sourcePrimaryKey: "4",
      importStatus: "external_archive_only",
      documentSubtype: "archive_only_file",
      archiveRecordId: "archive-record-1"
    });
    expect(reference).toMatchObject({
      importStatus: "external_archive_only",
      documentSubtype: "archive_only_file"
    });
    expect(repository.documentAssets).toEqual(new Set(["asset-1"]));
  });

  it("returns equivalent migration file-reference replay and fails conflicting replay without raw values", async () => {
    const repository = buildRepository();
    const service = new DocumentMigrationValidationService(repository);
    const input = {
      importBatchId: "batch-1",
      sourceTable: "ParkDocument",
      sourceColumn: "Filename",
      sourcePrimaryKey: "1",
      legacyFilename: "secret-mystery-visit-plan.pdf",
      originalRelativePath: "legacy/private/secret-mystery-visit-plan.pdf",
      resolvedStorageKey: "lower-env/private/secret-mystery-visit-plan.pdf",
      externalArchiveLocation: "archive://private/secret-mystery-visit-plan.pdf",
      importStatus: "metadata_only" as const,
      ownerEntityType: "application",
      ownerEntityId: "application-1",
      documentSubtype: "management_plan"
    };
    const first = await service.registerMigrationFileReference(input);
    const replay = await service.registerMigrationFileReference(input);
    expect(replay.id).toBe(first.id);

    await expect(service.registerMigrationFileReference({
      ...input,
      sha256: "a".repeat(64)
    })).rejects.toMatchObject({
      code: "idempotency_conflict",
      message: expect.not.stringContaining("secret-mystery-visit-plan.pdf")
    });
  });

  it("keeps raw legacy evidence out of audit payloads", async () => {
    const repository = buildRepository();
    const ledger = new RecordingAuditLedger();
    const service = new DocumentMigrationValidationService(repository, { auditLedger: ledger });
    await service.registerMigrationFileReference({
      importBatchId: "batch-1",
      sourceTable: "ParkDocument",
      sourceColumn: "Filename",
      sourcePrimaryKey: "1",
      legacyFilename: "secret-mystery-visit-plan.pdf",
      originalRelativePath: "legacy/private/secret-mystery-visit-plan.pdf",
      resolvedStorageKey: "lower-env/private/secret-mystery-visit-plan.pdf",
      externalArchiveLocation: "archive://private/secret-mystery-visit-plan.pdf",
      importStatus: "metadata_only",
      ownerEntityType: "application",
      ownerEntityId: "application-1",
      documentSubtype: "management_plan"
    });

    const serializedAudit = JSON.stringify(ledger.events);
    expect(serializedAudit).not.toContain("secret-mystery-visit-plan.pdf");
    expect(serializedAudit).not.toContain("legacy/private");
    expect(serializedAudit).not.toContain("lower-env/private");
    expect(serializedAudit).not.toContain("archive://private");
    expect(serializedAudit).toContain("hasLegacyFilename");
    expect(serializedAudit).toContain("legacyFilenameHash");
  });
});
