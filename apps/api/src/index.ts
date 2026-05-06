import { buildApp } from "./app.js";
import { createPostgresApiRuntime } from "./postgres-runtime.js";

const runtime = await createPostgresApiRuntime();
const app = buildApp(runtime
  ? {
      resolveSession: runtime.resolveSession,
      auditLedger: runtime.auditLedger,
      registrationStore: runtime.stores.registrationStore,
      applicantStore: runtime.stores.applicantStore,
      assessorStore: runtime.stores.assessorStore
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
