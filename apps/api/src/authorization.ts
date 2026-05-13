import type { SessionProfile } from "./auth.js";
import { ApiError } from "./auth.js";
import type { RoleType } from "@green-flag/contracts";

export interface ResourceOwnership {
  parkId: string;
  organisationId: string;
  countryCode: string;
  countryScopeId?: string;
  actorUserId?: string;
}

const readOnlyRole: RoleType = "READ_ONLY_VIEWER";

function activeAssignments(session: SessionProfile) {
  if (Array.isArray(session.roleAssignments)) {
    return session.roleAssignments.filter((assignment) => assignment.status === "ACTIVE");
  }
  return session.actor.scopes.map((scope, index) => ({
    id: `${session.actor.actorId}-${index}`,
    internalUserId: session.actor.actorId,
    role: session.actor.role,
    scope,
    status: "ACTIVE" as const,
    redactionProfile: session.actor.redactionProfile
  }));
}

function scopeMatchesResource(scope: SessionProfile["roleAssignments"][number]["scope"], ownership: ResourceOwnership) {
  if (scope.type === "GLOBAL") return true;
  if (scope.type === "PARK") return scope.id === ownership.parkId;
  if (scope.type === "ORGANISATION") return scope.id === ownership.organisationId;
  if (scope.type === "COUNTRY") {
    return scope.id === ownership.countryCode || scope.id === ownership.countryScopeId;
  }
  return false;
}

export function hasSuperAdminGlobalAccess(session: SessionProfile) {
  return activeAssignments(session).some((assignment) =>
    assignment.role === "SUPER_ADMIN" && assignment.scope.type === "GLOBAL"
  );
}

export function hasRoleAssignmentForResource(
  session: SessionProfile,
  ownership: ResourceOwnership,
  roles: RoleType[]
) {
  if (hasSuperAdminGlobalAccess(session) && roles.includes("SUPER_ADMIN")) return true;
  return activeAssignments(session).some((assignment) =>
    roles.includes(assignment.role) &&
    assignment.role !== readOnlyRole &&
    scopeMatchesResource(assignment.scope, ownership)
  );
}

export function canAccessResource(session: SessionProfile, ownership: ResourceOwnership) {
  return activeAssignments(session).some((assignment) => scopeMatchesResource(assignment.scope, ownership));
}

export function canReadResource(session: SessionProfile, ownership: ResourceOwnership) {
  return hasSuperAdminGlobalAccess(session) ||
    activeAssignments(session).some((assignment) => scopeMatchesResource(assignment.scope, ownership));
}

export function requireApplicantResourceAccess(session: SessionProfile, ownership: ResourceOwnership) {
  if (!hasRoleAssignmentForResource(session, ownership, ["PARK_MANAGER", "ORG_ADMIN", "SUPER_ADMIN"])) {
    throw new ApiError("forbidden", 403, "Applicant access requires park, organisation, or global scope.");
  }
}

export function requireOperationalResourceAccess(session: SessionProfile, ownership: ResourceOwnership) {
  if (!hasRoleAssignmentForResource(session, ownership, ["SUPER_ADMIN", "KBT_ADMIN"])) {
    throw new ApiError("forbidden", 403, "Admin operational access requires an admin role.");
  }
}

export function requirePaymentResourceAccess(session: SessionProfile, ownership: ResourceOwnership) {
  if (!hasRoleAssignmentForResource(session, ownership, ["SUPER_ADMIN", "KBT_ADMIN", "FINANCE_ADMIN"])) {
    throw new ApiError("forbidden", 403, "Payment access requires finance or admin scope.");
  }
}

export function requireReadOnlyResourceAccess(session: SessionProfile, ownership: ResourceOwnership) {
  if (!hasSuperAdminGlobalAccess(session) && !canReadResource(session, ownership)) {
    throw new ApiError("forbidden", 403, "Read access requires a scoped role assignment.");
  }
}

export function requireMutationAllowed(session: SessionProfile) {
  if (session.actor.role === readOnlyRole) {
    throw new ApiError("forbidden", 403, "Read-only viewers cannot perform mutations.");
  }
}
