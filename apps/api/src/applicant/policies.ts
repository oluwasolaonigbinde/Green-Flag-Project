
import { requireApplicantResourceAccess } from "../authorization.js";
import { ApiError, type SessionProfile } from "../auth.js";
import type { ApplicantStore } from "./store.js";

export function ownershipForPark(store: ApplicantStore, parkId: string) {
  const ownership = store.parkOwnerships.get(parkId);
  if (!ownership) {
    throw new ApiError("dependency_missing", 404, "Park ownership metadata was not found.");
  }
  return ownership;
}

export function requireApplicantScope(store: ApplicantStore, session: SessionProfile, parkId: string) {
  requireApplicantResourceAccess(session, ownershipForPark(store, parkId));
}
