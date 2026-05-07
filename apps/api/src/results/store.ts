
import type { z } from "zod";
import { adminResultDetailResponseSchema } from "@green-flag/contracts";
import type { AuditEvent } from "../auth.js";

export type DecisionResult = z.infer<typeof adminResultDetailResponseSchema>["decision"] extends infer T | undefined ? T : never;
export type ResultArtifact = z.infer<typeof adminResultDetailResponseSchema>["artifacts"][number];
export type AwardCacheEntry = z.infer<typeof adminResultDetailResponseSchema>["awardCache"] extends infer T | undefined ? T : never;
export type PublicMapUpdateEvent = z.infer<typeof adminResultDetailResponseSchema>["publicMapEvents"][number];

export interface ResultsStore {
  decisions: Map<string, DecisionResult>;
  artifacts: Map<string, ResultArtifact>;
  awardCache: Map<string, AwardCacheEntry>;
  publicMapEvents: Map<string, PublicMapUpdateEvent>;
  audits: AuditEvent[];
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export function createResultsStore(): ResultsStore {
  const store: ResultsStore = {
    decisions: new Map(),
    artifacts: new Map(),
    awardCache: new Map(),
    publicMapEvents: new Map(),
    audits: [],
    async withTransaction(work) {
      const snapshot = {
        decisions: structuredClone([...store.decisions.entries()]),
        artifacts: structuredClone([...store.artifacts.entries()]),
        awardCache: structuredClone([...store.awardCache.entries()]),
        publicMapEvents: structuredClone([...store.publicMapEvents.entries()]),
        audits: structuredClone(store.audits)
      };
      try {
        return await work();
      } catch (error) {
        store.decisions = new Map(snapshot.decisions);
        store.artifacts = new Map(snapshot.artifacts);
        store.awardCache = new Map(snapshot.awardCache);
        store.publicMapEvents = new Map(snapshot.publicMapEvents);
        store.audits = snapshot.audits;
        throw error;
      }
    }
  };
  return store;
}
