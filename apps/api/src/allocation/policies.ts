
import type { ApplicantStore } from "../applicant.js";
import { requireOperationalResourceAccess } from "../authorization.js";
import { ApiError, type SessionProfile } from "../auth.js";
import type { AllocationStore } from "./store.js";

export function requireAdminForEpisode(session: SessionProfile, applicantStore: ApplicantStore, episodeId: string) {
  const application = [...applicantStore.applications.values()].find((candidate) => candidate.episodeId === episodeId);
  if (!application) {
    throw new ApiError("dependency_missing", 404, "Allocation episode application was not found.");
  }
  const ownership = applicantStore.parkOwnerships.get(application.parkId);
  if (!ownership) {
    throw new ApiError("dependency_missing", 404, "Park ownership metadata was not found.");
  }
  requireOperationalResourceAccess(session, ownership);
  return { application, ownership };
}

export function requireAllocationAdmin(session: SessionProfile) {
  if (!["SUPER_ADMIN", "KBT_ADMIN"].includes(session.actor.role)) {
    throw new ApiError("forbidden", 403, "Allocation administration requires admin access.");
  }
}

export function requireAllocation(store: AllocationStore, allocationId: string) {
  const allocation = store.allocations.get(allocationId);
  if (!allocation) {
    throw new ApiError("dependency_missing", 404, "Allocation was not found.");
  }
  return allocation;
}
