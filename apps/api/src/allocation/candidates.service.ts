
import { lowerEnvironmentAwardCycle2026Fixture } from "@green-flag/contracts";
import type { AssessorStore, AssessorProfileRecord } from "../assessor.js";
import type { AllocationCandidate, AllocationStore, CoiFlag } from "./store.js";

export function capacityFor(profile: AssessorProfileRecord) {
  return profile.capacity.find((candidate) => candidate.cycleYear === lowerEnvironmentAwardCycle2026Fixture.cycleYear)
    ?? profile.capacity[0];
}

export function flagsFor(store: AllocationStore, profile: AssessorProfileRecord): CoiFlag[] {
  const flags: CoiFlag[] = [];
  if (store.softFlagAssessorIds.has(profile.assessorId)) {
    flags.push({
      type: "soft",
      severity: "soft",
      reason: "Adjacent authority soft COI flag.",
      requiresAcknowledgement: true
    });
  }
  if (store.rotationFlagAssessorIds.has(profile.assessorId)) {
    flags.push({
      type: "rotation",
      severity: "deprioritise",
      reason: "Previous Full Assessment same-park judge.",
      requiresAcknowledgement: true
    });
  }
  return flags;
}

export function candidatesFor(store: AllocationStore, assessorStore: AssessorStore) {
  const candidates: AllocationCandidate[] = [];
  let excludedCandidateCount = 0;
  for (const profile of assessorStore.profiles.values()) {
    const capacity = capacityFor(profile);
    const hasCapacity = capacity && capacity.currentAssignedCount < capacity.maxAssignments && capacity.capacityStatus === "available";
    const isAccredited = profile.profileStatus === "ACTIVE" && profile.accreditationStatus === "CURRENT_LOWER_ENV";
    if (store.hardExcludedAssessorIds.has(profile.assessorId)) {
      excludedCandidateCount += 1;
      continue;
    }
    if (!hasCapacity || !isAccredited) {
      continue;
    }
    const flags = flagsFor(store, profile);
    const rotationPenalty = flags.some((flag) => flag.type === "rotation") ? store.policy.rotationPenalty : 0;
    candidates.push({
      assessorId: profile.assessorId,
      displayName: profile.displayName,
      primaryRegion: profile.primaryRegion,
      accreditationStatus: profile.accreditationStatus,
      capacityStatus: capacity.capacityStatus,
      currentAssignedCount: capacity.currentAssignedCount,
      maxAssignments: capacity.maxAssignments,
      distanceKm: 24,
      score: Math.max(0, 90 - rotationPenalty),
      hardExcluded: false,
      flags,
      contactPreviewAvailable: false
    });
  }
  return {
    candidates: candidates.sort((left, right) => right.score - left.score),
    excludedCandidateCount
  };
}
