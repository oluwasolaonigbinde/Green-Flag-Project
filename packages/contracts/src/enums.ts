export const roleTypes = [
  "PARK_MANAGER",
  "ORG_ADMIN",
  "JUDGE",
  "KBT_ADMIN",
  "SUPER_ADMIN",
  "READ_ONLY_VIEWER",
  "FINANCE_ADMIN",
  "SYSTEM"
] as const;

export const roleScopeTypes = [
  "GLOBAL",
  "COUNTRY",
  "ORGANISATION",
  "PARK",
  "AWARD_CYCLE",
  "AWARD_CATEGORY",
  "ASSIGNMENT"
] as const;

export const episodeTypes = ["FULL_ASSESSMENT", "MYSTERY_SHOP"] as const;

export const parkStatuses = [
  "PENDING_VERIFICATION",
  "PENDING_ADMIN_REVIEW",
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE"
] as const;

export const awardTrackOperationalStatuses = [
  "OPERATIONAL",
  "DRAFT",
  "BLOCKED_PENDING_CRITERIA"
] as const;

export const redactionProfiles = [
  "applicant_full",
  "applicant_mystery",
  "org_admin_full",
  "org_admin_mystery",
  "judge_assigned_full",
  "judge_assigned_mystery",
  "kbt_admin_full_access",
  "super_admin_full_access",
  "public_result",
  "public_certificate_verify"
] as const;

export const documentVisibilities = [
  "APPLICANT_PRIVATE",
  "APPLICANT_AND_ADMIN",
  "ASSIGNED_JUDGES",
  "ADMIN_ONLY",
  "PUBLIC_AFTER_RELEASE",
  "MYSTERY_RESTRICTED"
] as const;

export const registrationStatuses = [
  "STARTED",
  "ELIGIBILITY_FAILED",
  "PENDING_VERIFICATION",
  "VERIFIED_PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "PURGED"
] as const;

export const applicationStatuses = [
  "DRAFT",
  "IN_PROGRESS",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "SUBMITTED_WITH_MISSING_PLAN",
  "LOCKED_FOR_ALLOCATION",
  "WITHDRAWN",
  "ARCHIVED"
] as const;

export const episodeStatuses = [
  "APPLICATION_DRAFT",
  "APPLICATION_SUBMITTED",
  "PAYMENT_PENDING",
  "PAYMENT_OVERDUE_BLOCKED",
  "READY_FOR_ALLOCATION",
  "ALLOCATED_HELD",
  "ALLOCATED_RELEASED",
  "ASSESSMENT_IN_PROGRESS",
  "ASSESSMENT_SUBMITTED",
  "DECISION_PENDING",
  "RESULT_CONFIRMED_HELD",
  "PUBLISHED",
  "WITHDRAWN",
  "CANCELLED",
  "ARCHIVED"
] as const;

export const assignmentStatuses = [
  "CANDIDATE",
  "HELD",
  "RELEASED",
  "ACCEPTED",
  "DECLINED",
  "WITHDRAWN"
] as const;

export const assessmentStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "RETURNED_FOR_CLARIFICATION",
  "ACCEPTED"
] as const;

export const resultStatuses = [
  "NOT_READY",
  "PENDING_REVIEW",
  "CONFIRMED_HELD",
  "PUBLISHED",
  "WITHDRAWN"
] as const;

export const paymentStatuses = [
  "NOT_REQUIRED",
  "PENDING",
  "OVERDUE_BLOCKED",
  "PAID",
  "WAIVED",
  "REFUNDED"
] as const;

export const safeDisplayStatuses = [
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED",
  "PAYMENT_PENDING",
  "APPLICATION_UNDER_REVIEW",
  "RESULT_PUBLISHED",
  "WITHDRAWN",
  "ARCHIVED"
] as const;

export const errorCodes = [
  "unauthorized",
  "forbidden",
  "invalid_state",
  "validation_failed",
  "redaction_blocked",
  "dependency_missing",
  "conflict",
  "idempotency_conflict"
] as const;

export type RoleType = (typeof roleTypes)[number];
export type RoleScopeType = (typeof roleScopeTypes)[number];
export type EpisodeType = (typeof episodeTypes)[number];
export type ParkStatus = (typeof parkStatuses)[number];
export type AwardTrackOperationalStatus = (typeof awardTrackOperationalStatuses)[number];
export type RedactionProfile = (typeof redactionProfiles)[number];
export type DocumentVisibility = (typeof documentVisibilities)[number];
export type RegistrationStatus = (typeof registrationStatuses)[number];
export type ApplicationStatus = (typeof applicationStatuses)[number];
export type EpisodeStatus = (typeof episodeStatuses)[number];
export type SafeDisplayStatus = (typeof safeDisplayStatuses)[number];
export type ErrorCode = (typeof errorCodes)[number];
