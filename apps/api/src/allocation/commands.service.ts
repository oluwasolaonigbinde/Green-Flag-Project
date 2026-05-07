
import type { AllocationCommand, AllocationStore } from "./store.js";

export function existingAllocationForEpisode(store: AllocationStore, episodeId: string) {
  return [...store.allocations.values()].find((allocation) => allocation.episodeId === episodeId);
}

export function matchingAuditByIdempotency(
  store: AllocationStore,
  action: string,
  entityId: string,
  idempotencyKey?: string
) {
  return Boolean(idempotencyKey && store.audits.some((event) =>
    event.action === action &&
    event.entityId === entityId &&
    event.request.idempotencyKey === idempotencyKey
  ));
}

export function contactRevealAvailable(allocation: AllocationCommand, episodeType: "FULL_ASSESSMENT" | "MYSTERY_SHOP") {
  return episodeType === "FULL_ASSESSMENT" && allocation.assignments.every((assignment) => assignment.status === "ACCEPTED");
}
