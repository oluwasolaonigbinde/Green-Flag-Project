import { createHash, randomUUID } from "node:crypto";
import { actorContextSchema, documentVisibilities } from "@green-flag/contracts";
import type { UnitOfWork } from "@green-flag/db";
import { ApiError, appendAuditEvent, type AuditEvent, type AuditLedger, type SessionProfile } from "./auth.js";

export type DocumentSubtypeStatus = "active" | "planned" | "external_approval_required" | "superseded" | "voided";
export type DocumentOwnerValidationStatus = "exists" | "missing" | "unsupported";
export type DocumentMigrationImportStatus =
  | "pending_manifest"
  | "metadata_only"
  | "imported"
  | "linked_existing_asset"
  | "external_archive_only"
  | "missing_file"
  | "owner_unresolved"
  | "subtype_unresolved"
  | "visibility_unresolved"
  | "retention_unresolved"
  | "rejected_sensitive"
  | "intentionally_not_needed";

export interface DocumentSubtypeCatalogEntry {
  code: string;
  taxonomyVersion: string;
  label: string;
  status: DocumentSubtypeStatus;
  coarseDocumentType: string;
  defaultVisibility: string;
  defaultRedactionClassification: string;
  defaultRetentionCategory: string;
  defaultSensitivityClassification: string;
  storagePolicy: string;
  allowedOwnerTypes: string[];
  allowedMimeTypes: string[];
  maxByteSize?: number;
  migrationRequired: boolean;
  notes?: string;
}

export interface DocumentSubtypeDefaults {
  documentSubtype: string;
  visibilityClassification: string;
  redactionClassification: string;
  retentionCategory: string;
  sensitivityClassification: string;
  storagePolicy: string;
}

export interface DocumentAssetOwnershipRecord {
  id: string;
  documentAssetId: string;
  ownerType: string;
  ownerId: string;
  ownerContextRole: string;
  requiredForAccess: boolean;
  visibilityOverride?: string;
  redactionOverride?: string;
  createdByProcess: string;
  notes?: string;
}

export interface MigrationSourceRecordReference {
  id: string;
  importBatchId: string;
}

export interface MigrationEntityLinkReference {
  id: string;
  importBatchId: string;
  sourceRecordId: string;
}

export interface MigrationDocumentFileReference {
  id: string;
  importBatchId: string;
  sourceRecordId?: string;
  migrationEntityLinkId?: string;
  sourceTable: string;
  sourceColumn: string;
  sourcePrimaryKey: string;
  sourceReferenceKey: string;
  legacyFilename?: string;
  legacyFilenameHash?: string;
  originalRelativePath?: string;
  originalRelativePathHash?: string;
  resolvedStorageKey?: string;
  externalArchiveLocation?: string;
  sha256?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  importStatus: DocumentMigrationImportStatus;
  missingFileReason?: string;
  ownerEntityType?: string;
  ownerEntityId?: string;
  documentSubtype?: string;
  visibilityClassification?: string;
  redactionClassification?: string;
  retentionCategory?: string;
  sensitivityClassification?: string;
  archiveRecordId?: string;
  notes?: string;
}

export interface RegisterDocumentAssetOwnershipInput {
  documentAssetId: string;
  documentSubtype: string;
  ownerType: string;
  ownerId: string;
  ownerContextRole: string;
  sourceOrigin?: string;
  importStatus?: string;
  requiredForAccess?: boolean;
  visibilityOverride?: string;
  redactionOverride?: string;
  createdByProcess?: string;
  notes?: string;
  applyDocumentAssetMetadata?: boolean;
}

export interface RegisterMigrationDocumentFileReferenceInput {
  id?: string;
  importBatchId: string;
  sourceRecordId?: string;
  migrationEntityLinkId?: string;
  sourceTable: string;
  sourceColumn: string;
  sourcePrimaryKey: string;
  sourceReferenceKey?: string;
  legacyFilename?: string;
  legacyFilenameHash?: string;
  originalRelativePath?: string;
  originalRelativePathHash?: string;
  resolvedStorageKey?: string;
  externalArchiveLocation?: string;
  sha256?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  importStatus: DocumentMigrationImportStatus;
  missingFileReason?: string;
  ownerEntityType?: string;
  ownerEntityId?: string;
  documentSubtype?: string;
  visibilityClassification?: string;
  redactionClassification?: string;
  retentionCategory?: string;
  sensitivityClassification?: string;
  archiveRecordId?: string;
  notes?: string;
}

export interface DocumentMigrationRepository {
  getDocumentSubtype(code: string): Promise<DocumentSubtypeCatalogEntry | null>;
  documentAssetExists(documentAssetId: string): Promise<boolean>;
  validateOwner(ownerType: string, ownerId: string): Promise<DocumentOwnerValidationStatus>;
  getSourceRecordReference(sourceRecordId: string): Promise<MigrationSourceRecordReference | null>;
  getMigrationEntityLinkReference(migrationEntityLinkId: string): Promise<MigrationEntityLinkReference | null>;
  registerDocumentAssetOwnership(input: DocumentAssetOwnershipRecord): Promise<DocumentAssetOwnershipRecord>;
  updateDocumentAssetMetadata(input: {
    documentAssetId: string;
    documentSubtype: string;
    sourceOrigin: string;
    visibilityClassification: string;
    redactionClassification: string;
    retentionCategory: string;
    sensitivityClassification: string;
    importStatus: string;
  }): Promise<void>;
  registerMigrationDocumentFileReference(input: MigrationDocumentFileReference): Promise<MigrationDocumentFileReference>;
}

export interface MigrationAuditContext {
  actor?: SessionProfile["actor"];
  requestId?: string;
  idempotencyKey?: string;
  reason?: string;
}

const documentMigrationSystemActor = actorContextSchema.parse({
  actorId: "00000000-0000-4000-8000-000000000024",
  cognitoSubject: "document-migration-validation-system",
  role: "SYSTEM",
  scopes: [{ type: "GLOBAL" }],
  redactionProfile: "super_admin_full_access"
});

const documentVisibilityValues = new Set<string>(documentVisibilities);
const runtimeOwnerSubtypeStatuses = new Set<DocumentSubtypeStatus>(["active"]);
const archiveOnlyStatuses = new Set<DocumentMigrationImportStatus>([
  "external_archive_only",
  "missing_file",
  "owner_unresolved",
  "subtype_unresolved",
  "intentionally_not_needed"
]);

function hashEvidence(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requestFor(context?: MigrationAuditContext) {
  return {
    requestId: context?.requestId ?? "document-migration-validation-service",
    ...(context?.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : {})
  };
}

function buildAuditEvent({
  action,
  entityType,
  entityId,
  context,
  afterState,
  reason
}: {
  action: string;
  entityType: string;
  entityId?: string;
  context?: MigrationAuditContext;
  afterState?: unknown;
  reason?: string;
}): AuditEvent {
  return {
    id: randomUUID(),
    actor: context?.actor ?? documentMigrationSystemActor,
    action,
    entityType,
    ...(entityId ? { entityId } : {}),
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

function assertNonEmpty(value: string | undefined, message: string) {
  if (!value || value.trim() === "") {
    throw new ApiError("validation_failed", 400, message);
  }
}

function assertSafeVisibility(value: string) {
  if (!documentVisibilityValues.has(value)) {
    throw new ApiError("validation_failed", 400, "Document subtype default visibility is not supported by the current document contract.");
  }
}

function assertSubtypeAllowsOwner(subtype: DocumentSubtypeCatalogEntry, ownerType: string) {
  if (!subtype.allowedOwnerTypes.includes(ownerType)) {
    throw new ApiError("validation_failed", 400, "Document subtype does not allow the requested owner type.");
  }
}

function assertConfirmedRuntimeSubtypeAllowed(subtype: DocumentSubtypeCatalogEntry) {
  if (!runtimeOwnerSubtypeStatuses.has(subtype.status)) {
    throw new ApiError("validation_failed", 400, "Document subtype is not approved for confirmed runtime ownership in Goal 3B.");
  }
}

function safeOwnershipAuditState(input: RegisterDocumentAssetOwnershipInput, defaults: DocumentSubtypeDefaults) {
  return {
    documentAssetId: input.documentAssetId,
    documentSubtype: input.documentSubtype,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    ownerContextRole: input.ownerContextRole,
    sourceOrigin: input.sourceOrigin,
    importStatus: input.importStatus,
    requiredForAccess: input.requiredForAccess ?? true,
    appliedDocumentAssetMetadata: input.applyDocumentAssetMetadata === true,
    visibilityClassification: defaults.visibilityClassification,
    redactionClassification: defaults.redactionClassification,
    retentionCategory: defaults.retentionCategory,
    sensitivityClassification: defaults.sensitivityClassification
  };
}

function safeReferenceAuditState(input: MigrationDocumentFileReference) {
  return {
    importBatchId: input.importBatchId,
    sourceTable: input.sourceTable,
    sourceColumn: input.sourceColumn,
    sourceReferenceKey: input.sourceReferenceKey,
    importStatus: input.importStatus,
    documentSubtype: input.documentSubtype,
    ownerEntityType: input.ownerEntityType,
    ownerEntityId: input.ownerEntityId,
    archiveRecordId: input.archiveRecordId,
    hasLegacyFilename: Boolean(input.legacyFilename),
    legacyFilenameHash: input.legacyFilenameHash,
    hasOriginalRelativePath: Boolean(input.originalRelativePath),
    originalRelativePathHash: input.originalRelativePathHash,
    hasResolvedStorageKey: Boolean(input.resolvedStorageKey),
    hasExternalArchiveLocation: Boolean(input.externalArchiveLocation),
    sha256: input.sha256,
    hasMissingFileReason: Boolean(input.missingFileReason),
    hasNotes: Boolean(input.notes)
  };
}

function comparableReference(value: MigrationDocumentFileReference) {
  return {
    importBatchId: value.importBatchId,
    sourceRecordId: value.sourceRecordId,
    migrationEntityLinkId: value.migrationEntityLinkId,
    sourceTable: value.sourceTable,
    sourceColumn: value.sourceColumn,
    sourcePrimaryKey: value.sourcePrimaryKey,
    sourceReferenceKey: value.sourceReferenceKey,
    legacyFilename: value.legacyFilename,
    legacyFilenameHash: value.legacyFilenameHash,
    originalRelativePath: value.originalRelativePath,
    originalRelativePathHash: value.originalRelativePathHash,
    resolvedStorageKey: value.resolvedStorageKey,
    externalArchiveLocation: value.externalArchiveLocation,
    sha256: value.sha256,
    fileSizeBytes: value.fileSizeBytes,
    mimeType: value.mimeType,
    importStatus: value.importStatus,
    missingFileReason: value.missingFileReason,
    ownerEntityType: value.ownerEntityType,
    ownerEntityId: value.ownerEntityId,
    documentSubtype: value.documentSubtype,
    visibilityClassification: value.visibilityClassification,
    redactionClassification: value.redactionClassification,
    retentionCategory: value.retentionCategory,
    sensitivityClassification: value.sensitivityClassification,
    archiveRecordId: value.archiveRecordId,
    notes: value.notes
  };
}

export function migrationDocumentFileReferencesEquivalent(
  existing: MigrationDocumentFileReference,
  requested: MigrationDocumentFileReference
) {
  return JSON.stringify(comparableReference(existing)) === JSON.stringify(comparableReference(requested));
}

export class DocumentMigrationValidationService {
  constructor(
    private readonly repository: DocumentMigrationRepository,
    private readonly options: { unitOfWork?: UnitOfWork; auditLedger?: AuditLedger } = {}
  ) {}

  async resolveSubtypeDefaults(
    documentSubtype: string,
    ownerType: string,
    options: { confirmedRuntimeOwnership?: boolean } = {}
  ): Promise<DocumentSubtypeDefaults> {
    const subtype = await this.loadSubtype(documentSubtype);
    assertSubtypeAllowsOwner(subtype, ownerType);
    if (options.confirmedRuntimeOwnership) {
      assertConfirmedRuntimeSubtypeAllowed(subtype);
    }
    assertSafeVisibility(subtype.defaultVisibility);
    return {
      documentSubtype: subtype.code,
      visibilityClassification: subtype.defaultVisibility,
      redactionClassification: subtype.defaultRedactionClassification,
      retentionCategory: subtype.defaultRetentionCategory,
      sensitivityClassification: subtype.defaultSensitivityClassification,
      storagePolicy: subtype.storagePolicy
    };
  }

  async registerDocumentAssetOwnership(input: RegisterDocumentAssetOwnershipInput, context?: MigrationAuditContext) {
    return this.runWrite(async () => {
      const defaults = await this.resolveSubtypeDefaults(input.documentSubtype, input.ownerType, {
        confirmedRuntimeOwnership: true
      });
      const assetExists = await this.repository.documentAssetExists(input.documentAssetId);
      if (!assetExists) {
        throw new ApiError("dependency_missing", 404, "Document asset was not found.");
      }
      await this.assertOwnerExists(input.ownerType, input.ownerId);
      if (input.applyDocumentAssetMetadata) {
        await this.repository.updateDocumentAssetMetadata({
          documentAssetId: input.documentAssetId,
          documentSubtype: input.documentSubtype,
          sourceOrigin: input.sourceOrigin ?? "goal_3b_internal_validation",
          visibilityClassification: defaults.visibilityClassification,
          redactionClassification: defaults.redactionClassification,
          retentionCategory: defaults.retentionCategory,
          sensitivityClassification: defaults.sensitivityClassification,
          importStatus: input.importStatus ?? "validated_internal"
        });
      }
      const ownership = await this.repository.registerDocumentAssetOwnership({
        id: randomUUID(),
        documentAssetId: input.documentAssetId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        ownerContextRole: input.ownerContextRole,
        requiredForAccess: input.requiredForAccess ?? true,
        ...(input.visibilityOverride ? { visibilityOverride: input.visibilityOverride } : {}),
        ...(input.redactionOverride ? { redactionOverride: input.redactionOverride } : {}),
        createdByProcess: input.createdByProcess ?? "goal_3b_document_migration_validation",
        ...(input.notes ? { notes: input.notes } : {})
      });
      await audit(this.options.auditLedger, buildAuditEvent({
        action: "REGISTER_DOCUMENT_ASSET_OWNERSHIP",
        entityType: "document_asset_ownership",
        entityId: ownership.id,
        ...(context ? { context } : {}),
        afterState: safeOwnershipAuditState(input, defaults)
      }));
      return ownership;
    });
  }

  async registerMigrationFileReference(input: RegisterMigrationDocumentFileReferenceInput, context?: MigrationAuditContext) {
    return this.runWrite(async () => {
      const resolved = await this.prepareMigrationFileReference(input);
      const reference = await this.repository.registerMigrationDocumentFileReference(resolved);
      await audit(this.options.auditLedger, buildAuditEvent({
        action: "REGISTER_DOCUMENT_MIGRATION_FILE_REFERENCE",
        entityType: "migration_document_file_reference",
        entityId: reference.id,
        ...(context ? { context } : {}),
        afterState: safeReferenceAuditState(resolved)
      }));
      return reference;
    });
  }

  async registerArchiveOnlyFileReference(input: RegisterMigrationDocumentFileReferenceInput, context?: MigrationAuditContext) {
    if (!archiveOnlyStatuses.has(input.importStatus)) {
      throw new ApiError("validation_failed", 400, "Archive-only document references require an archive-only import status.");
    }
    return this.registerMigrationFileReference(input, context);
  }

  private async prepareMigrationFileReference(input: RegisterMigrationDocumentFileReferenceInput): Promise<MigrationDocumentFileReference> {
    assertNonEmpty(input.sourceTable, "Document migration source table is required.");
    assertNonEmpty(input.sourceColumn, "Document migration source column is required.");
    assertNonEmpty(input.sourcePrimaryKey, "Document migration source primary key is required.");
    if (input.importStatus === "missing_file" && !input.missingFileReason) {
      throw new ApiError("validation_failed", 400, "Missing file document references require a safe missing-file reason.");
    }
    if (input.importStatus === "intentionally_not_needed" && !input.notes) {
      throw new ApiError("validation_failed", 400, "Intentionally-not-needed document references require a safe explanatory note.");
    }
    if (input.importStatus === "external_archive_only" && !input.archiveRecordId && !input.externalArchiveLocation) {
      throw new ApiError("validation_failed", 400, "External archive-only document references require archive evidence.");
    }
    if (input.importStatus === "subtype_unresolved" && input.documentSubtype) {
      throw new ApiError("validation_failed", 400, "Subtype-unresolved document references must not claim a document subtype.");
    }
    await this.assertMigrationLinks(input);

    let defaults: DocumentSubtypeDefaults | undefined;
    const effectiveOwnerType = input.ownerEntityType ?? (input.archiveRecordId ? "archive_only_record" : undefined);
    if (input.documentSubtype) {
      const subtype = await this.loadSubtype(input.documentSubtype);
      assertSafeVisibility(subtype.defaultVisibility);
      if (effectiveOwnerType) {
        assertSubtypeAllowsOwner(subtype, effectiveOwnerType);
      }
      defaults = {
        documentSubtype: subtype.code,
        visibilityClassification: subtype.defaultVisibility,
        redactionClassification: subtype.defaultRedactionClassification,
        retentionCategory: subtype.defaultRetentionCategory,
        sensitivityClassification: subtype.defaultSensitivityClassification,
        storagePolicy: subtype.storagePolicy
      };
    }
    if (input.archiveRecordId) {
      await this.assertOwnerExists("archive_only_record", input.archiveRecordId);
    }
    if (input.ownerEntityType && input.ownerEntityId) {
      await this.assertOwnerExists(input.ownerEntityType, input.ownerEntityId);
    } else if (input.importStatus === "owner_unresolved") {
      // Explicit unresolved-owner provenance is allowed for reconciliation.
    } else if (input.importStatus === "subtype_unresolved") {
      // Subtype-first triage can be recorded before owner resolution.
    }

    return {
      id: input.id ?? randomUUID(),
      importBatchId: input.importBatchId,
      ...(input.sourceRecordId ? { sourceRecordId: input.sourceRecordId } : {}),
      ...(input.migrationEntityLinkId ? { migrationEntityLinkId: input.migrationEntityLinkId } : {}),
      sourceTable: input.sourceTable,
      sourceColumn: input.sourceColumn,
      sourcePrimaryKey: input.sourcePrimaryKey,
      sourceReferenceKey: input.sourceReferenceKey ?? "default",
      ...(input.legacyFilename ? { legacyFilename: input.legacyFilename } : {}),
      ...(input.legacyFilename || input.legacyFilenameHash
        ? { legacyFilenameHash: input.legacyFilenameHash ?? hashEvidence(input.legacyFilename!) }
        : {}),
      ...(input.originalRelativePath ? { originalRelativePath: input.originalRelativePath } : {}),
      ...(input.originalRelativePath || input.originalRelativePathHash
        ? { originalRelativePathHash: input.originalRelativePathHash ?? hashEvidence(input.originalRelativePath!) }
        : {}),
      ...(input.resolvedStorageKey ? { resolvedStorageKey: input.resolvedStorageKey } : {}),
      ...(input.externalArchiveLocation ? { externalArchiveLocation: input.externalArchiveLocation } : {}),
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
      ...(input.fileSizeBytes ? { fileSizeBytes: input.fileSizeBytes } : {}),
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      importStatus: input.importStatus,
      ...(input.missingFileReason ? { missingFileReason: input.missingFileReason } : {}),
      ...(input.ownerEntityType ? { ownerEntityType: input.ownerEntityType } : {}),
      ...(input.ownerEntityId ? { ownerEntityId: input.ownerEntityId } : {}),
      ...(input.documentSubtype ? { documentSubtype: input.documentSubtype } : {}),
      ...(input.visibilityClassification ?? defaults?.visibilityClassification
        ? { visibilityClassification: input.visibilityClassification ?? defaults!.visibilityClassification }
        : {}),
      ...(input.redactionClassification ?? defaults?.redactionClassification
        ? { redactionClassification: input.redactionClassification ?? defaults!.redactionClassification }
        : {}),
      ...(input.retentionCategory ?? defaults?.retentionCategory
        ? { retentionCategory: input.retentionCategory ?? defaults!.retentionCategory }
        : {}),
      ...(input.sensitivityClassification ?? defaults?.sensitivityClassification
        ? { sensitivityClassification: input.sensitivityClassification ?? defaults!.sensitivityClassification }
        : {}),
      ...(input.archiveRecordId ? { archiveRecordId: input.archiveRecordId } : {}),
      ...(input.notes ? { notes: input.notes } : {})
    };
  }

  private async assertMigrationLinks(input: RegisterMigrationDocumentFileReferenceInput) {
    if (input.sourceRecordId) {
      const source = await this.repository.getSourceRecordReference(input.sourceRecordId);
      if (!source) {
        throw new ApiError("dependency_missing", 404, "Migration source record was not found.");
      }
      if (source.importBatchId !== input.importBatchId) {
        throw new ApiError("validation_failed", 400, "Migration source record does not belong to the requested import batch.");
      }
    }
    if (input.migrationEntityLinkId) {
      const link = await this.repository.getMigrationEntityLinkReference(input.migrationEntityLinkId);
      if (!link) {
        throw new ApiError("dependency_missing", 404, "Migration entity link was not found.");
      }
      if (link.importBatchId !== input.importBatchId) {
        throw new ApiError("validation_failed", 400, "Migration entity link does not belong to the requested import batch.");
      }
      if (input.sourceRecordId && link.sourceRecordId !== input.sourceRecordId) {
        throw new ApiError("validation_failed", 400, "Migration entity link does not belong to the requested source record.");
      }
    }
  }

  private async loadSubtype(documentSubtype: string) {
    const subtype = await this.repository.getDocumentSubtype(documentSubtype);
    if (!subtype) {
      throw new ApiError("validation_failed", 400, "Unknown document subtype.");
    }
    return subtype;
  }

  private async assertOwnerExists(ownerType: string, ownerId: string) {
    const result = await this.repository.validateOwner(ownerType, ownerId);
    if (result === "unsupported") {
      throw new ApiError("validation_failed", 400, "Document owner type is unsupported for Goal 3B.");
    }
    if (result === "missing") {
      throw new ApiError("dependency_missing", 404, "Document owner was not found.");
    }
  }

  private async runWrite<T>(work: () => Promise<T>) {
    if (!this.options.unitOfWork) {
      return work();
    }
    return this.options.unitOfWork.run(async () => work());
  }
}
