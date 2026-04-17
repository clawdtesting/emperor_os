import "dotenv/config";
import { acquireLock } from "../runtime/state/state-lock.js";
import { pruneStateFiles } from "../runtime/state/retention.js";
import { recover } from "../runtime/state/recovery.js";
import { runRuntimeItem } from "./runner.js";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function runDaemonCycle() {
  await runRuntimeItem({ protocol: "v1", jobId: "runtime", stateDir: "agent/state", artifactRoot: "artifacts" });
}

export async function startDaemon() {
  const { lockPath } = await acquireLock();
  console.log(`[runtime-daemon] lock acquired: ${lockPath}`);
  await recover();
  for (;;) {
    await runDaemonCycle();
    await pruneStateFiles();
    await sleep(15_000);
  }
}

if (process.argv[1]?.endsWith("app/daemon.js")) {
  startDaemon().catch((err) => {
    console.error("[runtime-daemon] fatal", err);
    process.exit(1);
  });
}
