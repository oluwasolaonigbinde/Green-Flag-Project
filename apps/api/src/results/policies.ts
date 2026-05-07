
import type { ApplicantStore } from "../applicant.js";
import { requireApplicantResourceAccess, requireOperationalResourceAccess } from "../authorization.js";
import { ApiError, type SessionProfile } from "../auth.js";

export function applicationForEpisode(applicantStore: ApplicantStore, episodeId: string) {
  const application = [...applicantStore.applications.values()].find((candidate) => candidate.episodeId === episodeId);
  if (!application) throw new ApiError("dependency_missing", 404, "Episode application was not found.");
  const ownership = applicantStore.parkOwnerships.get(application.parkId);
  if (!ownership) throw new ApiError("dependency_missing", 404, "Park ownership metadata was not found.");
  return { application, ownership };
}

export function requireAdminForEpisode(session: SessionProfile, applicantStore: ApplicantStore, episodeId: string) {
  const resolved = applicationForEpisode(applicantStore, episodeId);
  requireOperationalResourceAccess(session, resolved.ownership);
  return resolved;
}

export function requireApplicantForEpisode(session: SessionProfile, applicantStore: ApplicantStore, episodeId: string) {
  const resolved = applicationForEpisode(applicantStore, episodeId);
  requireApplicantResourceAccess(session, resolved.ownership);
  return resolved;
}
