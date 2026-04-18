import "dotenv/config";
import { acquireLock } from "../runtime/state/state-lock.js";
import { pruneStateFiles } from "../runtime/state/retention.js";
import { recover } from "../runtime/state/recovery.js";
import { runRuntimeItem } from "./runner.js";
import { createStateStore } from "../runtime/state/store.js";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function readContractVersionHint() {
  const stateStore = createStateStore({ protocol: "v1", stateDir: "agent/state" });
  const state = await stateStore.read("runtime");
  return state?._contractVersion ?? state?.contractVersion ?? state?.rawJob?._contractVersion ?? null;
}

export async function runDaemonCycle() {
  const contractVersion = await readContractVersionHint();
  await runRuntimeItem({ _contractVersion: contractVersion, jobId: "runtime", stateDir: "agent/state", artifactRoot: "artifacts" });
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
