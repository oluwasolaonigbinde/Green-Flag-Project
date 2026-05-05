import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { ErrorCode } from "@green-flag/contracts";
import {
  auditEventSchema,
  actorContextSchema,
  internalUserSummarySchema,
  roleAssignmentSchema,
  sessionProfileSchema
} from "@green-flag/contracts";

const cognitoClaimsSchema = z
  .object({
    sub: z.string().min(1),
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    given_name: z.string().min(1).optional(),
    family_name: z.string().min(1).optional(),
    amr: z.array(z.string().min(1)).optional()
  })
  .passthrough();

export class ApiError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: unknown;

  constructor(code: ErrorCode, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type CognitoClaims = z.infer<typeof cognitoClaimsSchema>;
export type InternalUserSummary = z.infer<typeof internalUserSummarySchema>;
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;
export type SessionProfile = z.infer<typeof sessionProfileSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;

export interface IdentityReadRepository {
  findInternalUserByCognitoSubject(subject: string): Promise<InternalUserSummary | null>;
  listRoleAssignmentsByUserId(userId: string): Promise<RoleAssignment[]>;
}

export interface AuditLedger {
  append(event: AuditEvent): Promise<void>;
}

export interface SessionResolverDependencies {
  identityRepository: IdentityReadRepository;
  verifyBearerToken: (bearerToken: string) => Promise<CognitoClaims>;
}

export type SessionResolver = (request: FastifyRequest) => Promise<SessionProfile>;

const adminRolePattern = /ADMIN$/;
const scopePriority = ["GLOBAL", "COUNTRY", "ORGANISATION", "PARK", "AWARD_CYCLE", "AWARD_CATEGORY", "ASSIGNMENT"];

function pickPrimaryRoleAssignment(assignments: RoleAssignment[]) {
  return [...assignments]
    .filter((assignment) => assignment.status === "ACTIVE")
    .sort((left, right) => {
      const leftRank = scopePriority.indexOf(left.scope.type);
      const rightRank = scopePriority.indexOf(right.scope.type);
      return leftRank - rightRank;
    })[0];
}

function isAdminRole(role: string) {
  return adminRolePattern.test(role) || role === "SUPER_ADMIN";
}

export function createDependencyMissingResolver(): SessionResolver {
  return async () => {
    throw new ApiError(
      "dependency_missing",
      503,
      "Cognito session resolution is not configured for this environment."
    );
  };
}

export function createCognitoJwtVerifier({
  jwksUrl,
  issuer,
  audience
}: {
  jwksUrl: string;
  issuer: string;
  audience: string;
}) {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));

  return async function verifyBearerToken(bearerToken: string): Promise<CognitoClaims> {
    const token = bearerToken.startsWith("Bearer ") ? bearerToken.slice("Bearer ".length) : bearerToken;
    if (!token) {
      throw new ApiError("unauthorized", 401, "Missing Cognito bearer token.");
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience
    });

    return cognitoClaimsSchema.parse(payload);
  };
}

export function createSessionResolver({
  identityRepository,
  verifyBearerToken
}: SessionResolverDependencies) {
  return async (request: FastifyRequest): Promise<SessionProfile> => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new ApiError("unauthorized", 401, "Missing Authorization header.");
    }

    const claims = await verifyBearerToken(authHeader);
    const internalUser = await identityRepository.findInternalUserByCognitoSubject(claims.sub);
    if (!internalUser) {
      throw new ApiError("dependency_missing", 503, "No internal user is mapped to this Cognito subject.");
    }

    const roleAssignments = await identityRepository.listRoleAssignmentsByUserId(internalUser.id);
    const primaryAssignment = pickPrimaryRoleAssignment(roleAssignments);
    if (!primaryAssignment) {
      throw new ApiError("forbidden", 403, "The authenticated user has no active role assignment.");
    }

    const mfaSatisfied = claims.amr?.includes("mfa") ?? false;
    if (isAdminRole(primaryAssignment.role) && !mfaSatisfied) {
      throw new ApiError("forbidden", 403, "Admin sessions require MFA.");
    }

    const activeScopes = roleAssignments
      .filter((assignment) => assignment.status === "ACTIVE")
      .map((assignment) => assignment.scope);

    return sessionProfileSchema.parse({
      actor: actorContextSchema.parse({
        actorId: internalUser.id,
        cognitoSubject: claims.sub,
        role: primaryAssignment.role,
        scopes: activeScopes,
        redactionProfile: primaryAssignment.redactionProfile
      }),
      internalUser: internalUserSummarySchema.parse({
        ...internalUser,
        cognitoSubject: claims.sub,
        mfaSatisfied
      }),
      roleAssignments,
      mfaSatisfied,
      authenticationSource: "cognito"
    });
  };
}

export async function appendAuditEvent(
  ledger: AuditLedger,
  event: AuditEvent
): Promise<AuditEvent> {
  const parsedEvent = auditEventSchema.parse(event);
  await ledger.append(parsedEvent);
  return parsedEvent;
}
