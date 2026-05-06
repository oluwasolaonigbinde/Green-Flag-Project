import { spawn } from "node:child_process";
import { Socket } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://green_flag:green_flag_local_only@127.0.0.1:5432/green_flag_local";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === "win32" ? "cmd.exe" : command;
    const executableArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
    const child = spawn(executable, executableArgs, {
      stdio: "inherit",
      cwd: repoRoot,
      ...options
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function waitForDatabase() {
  const url = new URL(databaseUrl);
  const host = url.hostname;
  const port = Number(url.port || "5432");
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = new Socket();
        socket.setTimeout(1000);
        socket.once("connect", () => {
          socket.destroy();
          resolve(undefined);
        });
        socket.once("timeout", () => {
          socket.destroy();
          reject(new Error("timeout"));
        });
        socket.once("error", reject);
        socket.connect(port, host);
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Timed out waiting for local PostgreSQL.");
}

await run("docker", ["compose", "up", "-d", "postgres"]);
await waitForDatabase();
await run("corepack", ["pnpm", "exec", "vitest", "run", "apps/api/src/postgres-domain-stores.integration.test.ts"], {
  env: {
    ...process.env,
    TEST_DATABASE_URL: databaseUrl
  }
});
