import { buildApp } from "./app.js";
import { createPostgresApiRuntime } from "./postgres-runtime.js";

const runtime = await createPostgresApiRuntime();
const app = buildApp(runtime
  ? {
      resolveSession: runtime.resolveSession,
      auditLedger: runtime.auditLedger,
      productionLike: true,
      registrationRepository: runtime.registrationRepository,
      applicantRepository: runtime.applicantRepository,
      assessorRepository: runtime.assessorRepository,
      allocationRepository: runtime.allocationRepository,
      assessmentRepository: runtime.assessmentRepository,
      registrationStore: runtime.stores.registrationStore,
      applicantStore: runtime.stores.applicantStore,
      assessorStore: runtime.stores.assessorStore,
      allocationStore: runtime.stores.allocationStore,
      assessmentStore: runtime.stores.assessmentStore,
      resultsStore: runtime.stores.resultsStore,
      communicationsStore: runtime.stores.communicationsStore
    }
  : {});
const port = Number(process.env.PORT ?? "4000");
const host = process.env.HOST ?? "127.0.0.1";

await app.listen({ port, host });
console.log(`Green Flag API listening on http://${host}:${port}`);

process.on("SIGTERM", async () => {
  await runtime?.pool.end();
  await app.close();
});
