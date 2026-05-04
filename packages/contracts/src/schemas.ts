import { z } from "zod";
import {
  applicationStatuses,
  documentVisibilities,
  episodeStatuses,
  episodeTypes,
  errorCodes,
  redactionProfiles,
  roleScopeTypes,
  roleTypes,
  safeDisplayStatuses
} from "./enums.js";

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const roleTypeSchema = z.enum(roleTypes);
export const roleScopeTypeSchema = z.enum(roleScopeTypes);
export const episodeTypeSchema = z.enum(episodeTypes);
export const redactionProfileSchema = z.enum(redactionProfiles);
export const documentVisibilitySchema = z.enum(documentVisibilities);
export const applicationStatusSchema = z.enum(applicationStatuses);
export const episodeStatusSchema = z.enum(episodeStatuses);
export const safeDisplayStatusSchema = z.enum(safeDisplayStatuses);
export const errorCodeSchema = z.enum(errorCodes);

export const scopeRefSchema = z.object({
  type: roleScopeTypeSchema,
  id: uuidSchema.optional()
});

export const actorContextSchema = z.object({
  actorId: uuidSchema,
  cognitoSubject: z.string().min(1),
  role: roleTypeSchema,
  scopes: z.array(scopeRefSchema),
  redactionProfile: redactionProfileSchema
});

export const commandEnvelopeSchema = z.object({
  actor: actorContextSchema,
  idempotencyKey: z.string().min(16).max(160).optional(),
  reason: z.string().min(3).max(500).optional(),
  request: z.object({
    requestId: z.string().min(1),
    ipAddress: z.string().min(1).optional(),
    userAgent: z.string().min(1).optional()
  })
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.unknown().optional()
  })
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("green-flag-api"),
  version: z.string().min(1)
});

export const invoiceSummarySchema = z.object({
  status: z.enum(["not_applicable", "pending", "paid", "blocked"]),
  amount: z.literal("external_value_unavailable").optional()
});

export const resultSummarySchema = z.object({
  status: z.enum(["not_available", "held", "published"]),
  displayLabel: z.string().min(1).optional()
});

export const applicantDashboardItemSchema = z.object({
  applicationId: uuidSchema.optional(),
  episodeId: uuidSchema,
  parkId: uuidSchema,
  parkName: z.string().min(1),
  cycleYear: z.number().int().min(2000),
  category: z.literal("STANDARD_GREEN_FLAG"),
  displayStatus: safeDisplayStatusSchema,
  applicationStatus: applicationStatusSchema.optional(),
  episodeStatus: episodeStatusSchema.optional(),
  completionPercent: z.number().int().min(0).max(100),
  invoice: invoiceSummarySchema,
  result: resultSummarySchema,
  allowedActions: z.array(z.string().min(1))
});

export const contractMetadataResponseSchema = z.object({
  slice: z.literal("S00-operating-layer-and-contract-build-baseline"),
  episodeFirst: z.literal(true),
  safeDisplayStatuses: z.array(safeDisplayStatusSchema),
  forbiddenProductionValues: z.array(z.string().min(1))
});
