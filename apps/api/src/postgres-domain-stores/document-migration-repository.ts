import type { SqlClient, UnitOfWork } from "@green-flag/db";
import { ApiError } from "../auth.js";
import type {
  DocumentAssetOwnershipRecord,
  DocumentMigrationRepository,
  DocumentOwnerValidationStatus,
  DocumentSubtypeCatalogEntry,
  MigrationDocumentFileReference,
  MigrationEntityLinkReference,
  MigrationSourceRecordReference
} from "../document-migration-validation.js";
import { migrationDocumentFileReferencesEquivalent } from "../document-migration-validation.js";

const ownerExistenceQueries = new Map<string, string>([
  ["application", "SELECT 1 FROM applications WHERE id = $1 LIMIT 1"],
  ["assessment_episode", "SELECT 1 FROM assessment_episodes WHERE id = $1 LIMIT 1"],
  // Goal 3A's application_field owner type maps to application_field_values.id in the current schema.
  // It is not a field-definition owner, because no separate field definition table exists today.
  ["application_field", "SELECT 1 FROM application_field_values WHERE id = $1 LIMIT 1"],
  ["assessment_evidence", "SELECT 1 FROM assessment_evidence WHERE id = $1 LIMIT 1"],
  ["judge_assessment", "SELECT 1 FROM judge_assessments WHERE id = $1 LIMIT 1"],
  ["assessment_visit", "SELECT 1 FROM assessment_visits WHERE id = $1 LIMIT 1"],
  ["result_artifact", "SELECT 1 FROM result_artifacts WHERE id = $1 LIMIT 1"],
  ["export_job", "SELECT 1 FROM export_jobs WHERE id = $1 LIMIT 1"],
  ["archive_only_record", "SELECT 1 FROM migration_archive_records WHERE id = $1 LIMIT 1"]
]);

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

type SubtypeRow = {
  code: string;
  taxonomy_version: string;
  label: string;
  status: DocumentSubtypeCatalogEntry["status"];
  coarse_document_type: string;
  default_visibility: string;
  default_redaction_classification: string;
  default_retention_category: string;
  default_sensitivity_classification: string;
  storage_policy: string;
  allowed_owner_types: string[];
  allowed_mime_types: string[];
  max_byte_size: number | null;
  migration_required: boolean;
  notes: string | null;
};

function subtypeFromRow(row: SubtypeRow): DocumentSubtypeCatalogEntry {
  return {
    code: row.code,
    taxonomyVersion: row.taxonomy_version,
    label: row.label,
    status: row.status,
    coarseDocumentType: row.coarse_document_type,
    defaultVisibility: row.default_visibility,
    defaultRedactionClassification: row.default_redaction_classification,
    defaultRetentionCategory: row.default_retention_category,
    defaultSensitivityClassification: row.default_sensitivity_classification,
    storagePolicy: row.storage_policy,
    allowedOwnerTypes: row.allowed_owner_types,
    allowedMimeTypes: row.allowed_mime_types,
    ...(row.max_byte_size ? { maxByteSize: row.max_byte_size } : {}),
    migrationRequired: row.migration_required,
    ...(row.notes ? { notes: row.notes } : {})
  };
}

type OwnershipRow = {
  id: string;
  document_asset_id: string;
  owner_type: string;
  owner_id: string;
  owner_context_role: string;
  required_for_access: boolean;
  visibility_override: string | null;
  redaction_override: string | null;
  created_by_process: string;
  notes: string | null;
};

function ownershipFromRow(row: OwnershipRow): DocumentAssetOwnershipRecord {
  return {
    id: row.id,
    documentAssetId: row.document_asset_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    ownerContextRole: row.owner_context_role,
    requiredForAccess: row.required_for_access,
    ...(row.visibility_override ? { visibilityOverride: row.visibility_override } : {}),
    ...(row.redaction_override ? { redactionOverride: row.redaction_override } : {}),
    createdByProcess: row.created_by_process,
    ...(row.notes ? { notes: row.notes } : {})
  };
}

type SourceRecordRow = {
  id: string;
  import_batch_id: string;
};

function sourceRecordFromRow(row: SourceRecordRow): MigrationSourceRecordReference {
  return {
    id: row.id,
    importBatchId: row.import_batch_id
  };
}

type EntityLinkRow = {
  id: string;
  import_batch_id: string;
  source_record_id: string;
};

function entityLinkFromRow(row: EntityLinkRow): MigrationEntityLinkReference {
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    sourceRecordId: row.source_record_id
  };
}

type FileReferenceRow = {
  id: string;
  import_batch_id: string;
  source_record_id: string | null;
  migration_entity_link_id: string | null;
  source_table: string;
  source_column: string;
  source_primary_key: string;
  source_reference_key: string;
  legacy_filename: string | null;
  legacy_filename_hash: string | null;
  original_relative_path: string | null;
  original_relative_path_hash: string | null;
  resolved_storage_key: string | null;
  external_archive_location: string | null;
  sha256: string | null;
  file_size_bytes: string | number | null;
  mime_type: string | null;
  import_status: MigrationDocumentFileReference["importStatus"];
  missing_file_reason: string | null;
  owner_entity_type: string | null;
  owner_entity_id: string | null;
  document_subtype: string | null;
  visibility_classification: string | null;
  redaction_classification: string | null;
  retention_category: string | null;
  sensitivity_classification: string | null;
  archive_record_id: string | null;
  created_at_utc: Date | string | null;
  updated_at_utc: Date | string | null;
  notes: string | null;
};

function fileReferenceFromRow(row: FileReferenceRow): MigrationDocumentFileReference {
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    ...(row.source_record_id ? { sourceRecordId: row.source_record_id } : {}),
    ...(row.migration_entity_link_id ? { migrationEntityLinkId: row.migration_entity_link_id } : {}),
    sourceTable: row.source_table,
    sourceColumn: row.source_column,
    sourcePrimaryKey: row.source_primary_key,
    sourceReferenceKey: row.source_reference_key,
    ...(row.legacy_filename ? { legacyFilename: row.legacy_filename } : {}),
    ...(row.legacy_filename_hash ? { legacyFilenameHash: row.legacy_filename_hash } : {}),
    ...(row.original_relative_path ? { originalRelativePath: row.original_relative_path } : {}),
    ...(row.original_relative_path_hash ? { originalRelativePathHash: row.original_relative_path_hash } : {}),
    ...(row.resolved_storage_key ? { resolvedStorageKey: row.resolved_storage_key } : {}),
    ...(row.external_archive_location ? { externalArchiveLocation: row.external_archive_location } : {}),
    ...(row.sha256 ? { sha256: row.sha256 } : {}),
    ...(row.file_size_bytes !== null ? { fileSizeBytes: Number(row.file_size_bytes) } : {}),
    ...(row.mime_type ? { mimeType: row.mime_type } : {}),
    importStatus: row.import_status,
    ...(row.missing_file_reason ? { missingFileReason: row.missing_file_reason } : {}),
    ...(row.owner_entity_type ? { ownerEntityType: row.owner_entity_type } : {}),
    ...(row.owner_entity_id ? { ownerEntityId: row.owner_entity_id } : {}),
    ...(row.document_subtype ? { documentSubtype: row.document_subtype } : {}),
    ...(row.visibility_classification ? { visibilityClassification: row.visibility_classification } : {}),
    ...(row.redaction_classification ? { redactionClassification: row.redaction_classification } : {}),
    ...(row.retention_category ? { retentionCategory: row.retention_category } : {}),
    ...(row.sensitivity_classification ? { sensitivityClassification: row.sensitivity_classification } : {}),
    ...(row.archive_record_id ? { archiveRecordId: row.archive_record_id } : {}),
    ...(row.notes ? { notes: row.notes } : {})
  };
}

export class PostgresDocumentMigrationRepository implements DocumentMigrationRepository {
  constructor(
    private readonly client: SqlClient,
    private readonly unitOfWork?: UnitOfWork
  ) {}

  private currentClient() {
    return this.unitOfWork?.currentClient() ?? this.client;
  }

  async getDocumentSubtype(code: string) {
    const result = await this.currentClient().query<SubtypeRow>("SELECT * FROM document_subtypes WHERE code = $1", [code]);
    return result.rows[0] ? subtypeFromRow(result.rows[0]) : null;
  }

  async documentAssetExists(documentAssetId: string) {
    const result = await this.currentClient().query("SELECT 1 FROM document_assets WHERE id = $1 LIMIT 1", [documentAssetId]);
    return result.rows.length > 0;
  }

  async validateOwner(ownerType: string, ownerId: string): Promise<DocumentOwnerValidationStatus> {
    const query = ownerExistenceQueries.get(ownerType);
    if (!query) return "unsupported";
    const result = await this.currentClient().query(query, [ownerId]);
    return result.rows.length > 0 ? "exists" : "missing";
  }

  async getSourceRecordReference(sourceRecordId: string) {
    const result = await this.currentClient().query<SourceRecordRow>(
      "SELECT id, import_batch_id FROM migration_source_records WHERE id = $1",
      [sourceRecordId]
    );
    return result.rows[0] ? sourceRecordFromRow(result.rows[0]) : null;
  }

  async getMigrationEntityLinkReference(migrationEntityLinkId: string) {
    const result = await this.currentClient().query<EntityLinkRow>(
      "SELECT id, import_batch_id, source_record_id FROM migration_entity_links WHERE id = $1",
      [migrationEntityLinkId]
    );
    return result.rows[0] ? entityLinkFromRow(result.rows[0]) : null;
  }

  async registerDocumentAssetOwnership(input: DocumentAssetOwnershipRecord) {
    const client = this.currentClient();
    const existing = await client.query<OwnershipRow>(
      `
        SELECT *
        FROM document_asset_ownerships
        WHERE document_asset_id = $1 AND owner_type = $2 AND owner_id = $3 AND owner_context_role = $4
        FOR UPDATE
      `,
      [input.documentAssetId, input.ownerType, input.ownerId, input.ownerContextRole]
    );
    if (existing.rows[0]) {
      const ownership = ownershipFromRow(existing.rows[0]);
      if (
        ownership.requiredForAccess === input.requiredForAccess &&
        ownership.visibilityOverride === input.visibilityOverride &&
        ownership.redactionOverride === input.redactionOverride
      ) {
        return ownership;
      }
      throw new ApiError("idempotency_conflict", 409, "Document ownership already exists with different internal metadata.");
    }
    try {
      const result = await client.query<OwnershipRow>(
        `
          INSERT INTO document_asset_ownerships (
            id, document_asset_id, owner_type, owner_id, owner_context_role,
            required_for_access, visibility_override, redaction_override, created_by_process, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          input.id,
          input.documentAssetId,
          input.ownerType,
          input.ownerId,
          input.ownerContextRole,
          input.requiredForAccess,
          input.visibilityOverride ?? null,
          input.redactionOverride ?? null,
          input.createdByProcess,
          input.notes ?? null
        ]
      );
      return ownershipFromRow(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await client.query<OwnershipRow>(
          `
            SELECT *
            FROM document_asset_ownerships
            WHERE document_asset_id = $1 AND owner_type = $2 AND owner_id = $3 AND owner_context_role = $4
          `,
          [input.documentAssetId, input.ownerType, input.ownerId, input.ownerContextRole]
        );
        if (replay.rows[0]) return ownershipFromRow(replay.rows[0]);
      }
      throw error;
    }
  }

  async updateDocumentAssetMetadata(input: Parameters<DocumentMigrationRepository["updateDocumentAssetMetadata"]>[0]) {
    const result = await this.currentClient().query(
      `
        UPDATE document_assets
        SET document_subtype = $2,
          source_origin = $3,
          redaction_classification = $4,
          retention_category = $5,
          sensitivity_classification = $6,
          import_status = $7
        WHERE id = $1
      `,
      [
        input.documentAssetId,
        input.documentSubtype,
        input.sourceOrigin,
        input.redactionClassification,
        input.retentionCategory,
        input.sensitivityClassification,
        input.importStatus
      ]
    );
    if (result.rowCount === 0) {
      throw new ApiError("dependency_missing", 404, "Document asset was not found.");
    }
  }

  async registerMigrationDocumentFileReference(input: MigrationDocumentFileReference) {
    const client = this.currentClient();
    const existing = await this.loadExistingFileReference(input, true);
    if (existing) {
      if (migrationDocumentFileReferencesEquivalent(existing, input)) {
        return existing;
      }
      throw new ApiError("idempotency_conflict", 409, "Migration document file reference already exists with different internal metadata.");
    }
    try {
      const result = await client.query<FileReferenceRow>(
        `
          INSERT INTO migration_document_file_references (
            id, import_batch_id, source_record_id, migration_entity_link_id,
            source_table, source_column, source_primary_key, source_reference_key,
            legacy_filename, legacy_filename_hash, original_relative_path, original_relative_path_hash,
            resolved_storage_key, external_archive_location, sha256, file_size_bytes, mime_type,
            import_status, missing_file_reason, owner_entity_type, owner_entity_id, document_subtype,
            visibility_classification, redaction_classification, retention_category, sensitivity_classification,
            archive_record_id, notes
          )
          VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22,
            $23, $24, $25, $26,
            $27, $28
          )
          RETURNING *
        `,
        [
          input.id,
          input.importBatchId,
          input.sourceRecordId ?? null,
          input.migrationEntityLinkId ?? null,
          input.sourceTable,
          input.sourceColumn,
          input.sourcePrimaryKey,
          input.sourceReferenceKey,
          input.legacyFilename ?? null,
          input.legacyFilenameHash ?? null,
          input.originalRelativePath ?? null,
          input.originalRelativePathHash ?? null,
          input.resolvedStorageKey ?? null,
          input.externalArchiveLocation ?? null,
          input.sha256 ?? null,
          input.fileSizeBytes ?? null,
          input.mimeType ?? null,
          input.importStatus,
          input.missingFileReason ?? null,
          input.ownerEntityType ?? null,
          input.ownerEntityId ?? null,
          input.documentSubtype ?? null,
          input.visibilityClassification ?? null,
          input.redactionClassification ?? null,
          input.retentionCategory ?? null,
          input.sensitivityClassification ?? null,
          input.archiveRecordId ?? null,
          input.notes ?? null
        ]
      );
      return fileReferenceFromRow(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.loadExistingFileReference(input, false);
        if (replay && migrationDocumentFileReferencesEquivalent(replay, input)) {
          return replay;
        }
        throw new ApiError("idempotency_conflict", 409, "Migration document file reference already exists with different internal metadata.");
      }
      throw error;
    }
  }

  private async loadExistingFileReference(input: MigrationDocumentFileReference, lock: boolean) {
    const result = await this.currentClient().query<FileReferenceRow>(
      `
        SELECT *
        FROM migration_document_file_references
        WHERE import_batch_id = $1
          AND source_table = $2
          AND source_column = $3
          AND source_primary_key = $4
          AND source_reference_key = $5
        ${lock ? "FOR UPDATE" : ""}
      `,
      [input.importBatchId, input.sourceTable, input.sourceColumn, input.sourcePrimaryKey, input.sourceReferenceKey]
    );
    return result.rows[0] ? fileReferenceFromRow(result.rows[0]) : null;
  }
}
