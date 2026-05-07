
import type { z } from "zod";
import {
  allocationCandidatesResponseSchema,
  allocationCommandResponseSchema,
  allocationPolicyFixture
} from "@green-flag/contracts";
import type { AuditEvent } from "../auth.js";
import type { AdminOverrideEvent } from "../overrides.js";

export type AllocationPolicy = typeof allocationPolicyFixture;
export type AllocationCommand = z.infer<typeof allocationCommandResponseSchema>;
export type AllocationAssignment = z.infer<typeof allocationCommandResponseSchema>["assignments"][number];
export type AllocationCandidate = z.infer<typeof allocationCandidatesResponseSchema>["candidates"][number];
export type CoiFlag = AllocationCandidate["flags"][number];

export interface AllocationStore {
  allocations: Map<string, AllocationCommand>;
  audits: AuditEvent[];
  overrideEvents: AdminOverrideEvent[];
  policy: AllocationPolicy;
  hardExcludedAssessorIds: Set<string>;
  softFlagAssessorIds: Set<string>;
  rotationFlagAssessorIds: Set<string>;
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export function createAllocationStore(): AllocationStore {
  const store: AllocationStore = {
    allocations: new Map(),
    audits: [],
    overrideEvents: [],
    policy: allocationPolicyFixture,
    hardExcludedAssessorIds: new Set(),
    softFlagAssessorIds: new Set(),
    rotationFlagAssessorIds: new Set(),
    async withTransaction(work) {
      const snapshot = {
        allocations: structuredClone([...store.allocations.entries()]),
        audits: structuredClone(store.audits),
        overrideEvents: structuredClone(store.overrideEvents)
      };
      try {
        return await work();
      } catch (error) {
        store.allocations = new Map(snapshot.allocations);
        store.audits = snapshot.audits;
        store.overrideEvents = snapshot.overrideEvents;
        throw error;
      }
    }
  };
  return store;
}
