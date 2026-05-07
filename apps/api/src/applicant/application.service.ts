
import { type ApplicationStatus } from "@green-flag/contracts";
import { ApiError } from "../auth.js";
import type { ApplicantStore, ApplicationRecord } from "./store.js";

export function sectionCompletion(fields: Record<string, unknown>) {
  return Object.values(fields).filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }).length > 0
    ? 100
    : 0;
}

export function recalculate(application: ApplicationRecord) {
  const total = application.sections.reduce((sum, section) => sum + section.completionPercent, 0);
  const completionPercent = Math.round(total / application.sections.length);
  const status: ApplicationStatus =
    completionPercent >= 100 ? "READY_TO_SUBMIT" : completionPercent > 0 ? "IN_PROGRESS" : "DRAFT";
  application.completionPercent = completionPercent;
  application.status = status;
  application.displayStatus =
    status === "READY_TO_SUBMIT" ? "IN_PROGRESS" : status === "DRAFT" ? "DRAFT" : "IN_PROGRESS";
  application.version += 1;
  application.updatedAt = new Date().toISOString();
}

export function requireApplication(store: ApplicantStore, applicationId: string) {
  const application = store.applications.get(applicationId);
  if (!application) {
    throw new ApiError("dependency_missing", 404, "Application draft was not found.");
  }
  return application;
}
