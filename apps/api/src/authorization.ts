import type { SessionProfile } from "./auth.js";
import { ApiError } from "./auth.js";

export interface ResourceOwnership {
  parkId: string;
  organisationId: string;
  countryCode: string;
  countryScopeId?: string;
  actorUserId?: string;
}

export function canAccessResource(session: SessionProfile, ownership: ResourceOwnership) {
  return session.actor.scopes.some((scope) => {
    if (scope.type === "GLOBAL") return true;
    if (scope.type === "PARK") return scope.id === ownership.parkId;
    if (scope.type === "ORGANISATION") return scope.id === ownership.organisationId;
    if (scope.type === "COUNTRY") {
      return scope.id === ownership.countryCode || scope.id === ownership.countryScopeId;
    }
    return false;
  });
}

export function requireApplicantResourceAccess(session: SessionProfile, ownership: ResourceOwnership) {
  if (!["PARK_MANAGER", "ORG_ADMIN", "SUPER_ADMIN"].includes(session.actor.role)) {
    throw new ApiError("forbidden", 403, "Applicant access requires park, organisation, or global scope.");
  }
  if (!canAccessResource(session, ownership)) {
    throw new ApiError("forbidden", 403, "The authenticated actor is not scoped to this resource.");
  }
}

export function requireOperationalResourceAccess(session: SessionProfile, ownership: ResourceOwnership) {
  if (!["SUPER_ADMIN", "KBT_ADMIN"].includes(session.actor.role)) {
    throw new ApiError("forbidden", 403, "Admin operational access requires an admin role.");
  }
  if (!canAccessResource(session, ownership)) {
    throw new ApiError("forbidden", 403, "The authenticated admin is not scoped to this resource.");
  }
}

export function requirePaymentResourceAccess(session: SessionProfile, ownership: ResourceOwnership) {
  if (!["SUPER_ADMIN", "KBT_ADMIN", "FINANCE_ADMIN"].includes(session.actor.role)) {
    throw new ApiError("forbidden", 403, "Payment access requires finance or admin scope.");
  }
  if (!canAccessResource(session, ownership)) {
    throw new ApiError("forbidden", 403, "The authenticated payment actor is not scoped to this resource.");
  }
}

