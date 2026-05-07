
import {
  lowerEnvironmentAwardCycle2026Fixture,
  lowerEnvironmentParkFixture
} from "@green-flag/contracts";
import type { ApplicantStore } from "../applicant.js";
import { canAccessResource } from "../authorization.js";
import type { SessionProfile } from "../auth.js";
import type { AllocationStore } from "./store.js";

export function readyEpisodeItems(applicantStore: ApplicantStore, allocationStore: AllocationStore, session: SessionProfile) {
  return [...applicantStore.applications.values()]
    .filter((application) => applicantStore.episodeStatuses.get(application.episodeId) === "READY_FOR_ALLOCATION")
    .filter((application) => {
      const ownership = applicantStore.parkOwnerships.get(application.parkId);
      return ownership ? canAccessResource(session, ownership) : false;
    })
    .map((application) => {
      const existing = [...allocationStore.allocations.values()].find((allocation) => allocation.episodeId === application.episodeId);
      return {
        episodeId: application.episodeId,
        applicationId: application.applicationId,
        parkId: application.parkId,
        parkName: lowerEnvironmentParkFixture.name,
        cycleYear: lowerEnvironmentAwardCycle2026Fixture.cycleYear,
        episodeType: "FULL_ASSESSMENT" as const,
        episodeStatus: applicantStore.episodeStatuses.get(application.episodeId) ?? "READY_FOR_ALLOCATION" as const,
        paymentStatus: "PAID" as const,
        documentStatus: "complete" as const,
        suggestedJudgeCount: 2,
        judgeCountReasons: ["new_site" as const],
        allocationStatus: existing?.status === "HELD" ? "held" as const : existing ? "released" as const : "not_started" as const
      };
    });
}
