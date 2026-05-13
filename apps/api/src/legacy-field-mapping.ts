import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const classificationSchema = z.enum([
  "canonical_park_field",
  "park_location_field",
  "park_profile_public_content",
  "application_field_value",
  "document_asset",
  "invoice_billing_field",
  "assessment_scoring_result_field",
  "migration_archive_only",
  "intentionally_not_needed"
]);

const manifestEntrySchema = z.object({
  sourceTable: z.string().min(1),
  sourceColumn: z.string().min(1),
  classification: classificationSchema,
  target: z.string().min(1),
  requiresClassification: z.boolean().optional()
});

const legacyFieldMappingManifestSchema = z.object({
  version: z.string().min(1),
  status: z.enum(["draft", "active", "superseded"]),
  notes: z.string().optional(),
  classifications: z.array(classificationSchema),
  additionalFieldPolicy: z.object({
    sourceTables: z.array(z.string().min(1)),
    unknownDefinitionsBlockPassedReconciliation: z.literal(true)
  }),
  entries: z.array(manifestEntrySchema).min(1)
});

export type LegacyFieldMappingManifest = z.infer<typeof legacyFieldMappingManifestSchema>;

export const legacyFieldMappingManifestPath = resolve(
  process.cwd(),
  "packages/db/config/legacy-field-mapping.v1.json"
);

export function loadLegacyFieldMappingManifest(path = legacyFieldMappingManifestPath) {
  const resolvedPath = existsSync(path)
    ? path
    : resolve(process.cwd(), "../../packages/db/config/legacy-field-mapping.v1.json");
  return legacyFieldMappingManifestSchema.parse(JSON.parse(readFileSync(resolvedPath, "utf8")));
}

export function validateLegacyFieldMappingManifest(
  manifest: LegacyFieldMappingManifest,
  options: { observedAdditionalFieldDefinitions?: string[] } = {}
) {
  const parsed = legacyFieldMappingManifestSchema.parse(manifest);
  const keys = new Set(parsed.entries.map((entry) => `${entry.sourceTable}.${entry.sourceColumn}`));
  const requiredKeys = [
    "Park.ParkTitle",
    "Park.ParkAlternateTitle",
    "Park.ParkSize",
    "ParkAwardApplication.ParkSize",
    "ParkAwardApplication.SeasonYear",
    "ParkApplicationNote.FormsValue",
    "ParkApplicationNote.FormType",
    "AdditionalField.*",
    "AdditionalFieldData.*",
    "ContactTypeAdditionalField.*",
    "ResetLog.*",
    "Votes.*",
    "ParksVote.*",
    "Settings.ActiveKeys",
    "InvoicingOrganisation.*",
    "InvoicingOrganisationTeam.*"
  ];
  const missing = requiredKeys.filter((key) => !keys.has(key));
  if (missing.length > 0) {
    throw new Error(`Legacy field mapping manifest is missing required coverage: ${missing.join(", ")}`);
  }

  const additionalFieldEntries = parsed.entries.filter((entry) =>
    parsed.additionalFieldPolicy.sourceTables.includes(entry.sourceTable)
  );
  if (!additionalFieldEntries.every((entry) => entry.requiresClassification)) {
    throw new Error("AdditionalField manifest entries must require explicit classification before passed reconciliation.");
  }

  const unknownAdditionalFields = (options.observedAdditionalFieldDefinitions ?? []).filter((definition) => {
    const [sourceTable, sourceColumn] = definition.split(".");
    return Boolean(sourceTable && sourceColumn && !keys.has(`${sourceTable}.${sourceColumn}`));
  });
  if (unknownAdditionalFields.length > 0) {
    throw new Error(
      `Unknown AdditionalField definitions block passed reconciliation: ${unknownAdditionalFields.join(", ")}`
    );
  }

  return parsed;
}

export function planLegacyScoreFormImport(input: {
  formType?: string | number | null;
  formsValue?: string | null;
  approvedTemplateMappingKey?: string | null;
}) {
  const rawFormsValue = input.formsValue ?? "";
  const formsValueChecksum = rawFormsValue
    ? createHash("sha256").update(rawFormsValue).digest("hex")
    : null;
  if (!input.approvedTemplateMappingKey) {
    return {
      action: "archive_only" as const,
      structuredImportAllowed: false,
      archiveRequired: Boolean(rawFormsValue || input.formType !== undefined),
      formType: input.formType ?? null,
      formsValueChecksum
    };
  }
  return {
    action: "structured_import_with_approved_mapping" as const,
    structuredImportAllowed: true,
    archiveRequired: Boolean(rawFormsValue),
    approvedTemplateMappingKey: input.approvedTemplateMappingKey,
    formType: input.formType ?? null,
    formsValueChecksum
  };
}
