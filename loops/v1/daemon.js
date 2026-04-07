// ./agent/daemon.js
import "dotenv/config";
import { acquireLock } from "./lock.js";
import { ensureStateDirs } from "./state.js";
import { recover } from "./recovery.js";
import { ensureWorkspaceArtifactDirs } from "./artifact-manager.js";
import { runOrchestratorCycle } from "./orchestrator.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCycle() {
  await runOrchestratorCycle();
}

async function main() {
  const { lockPath } = await acquireLock();
  console.log(`[daemon] lock acquired: ${lockPath}`);

  await ensureStateDirs();
  await ensureWorkspaceArtifactDirs();
  await recover();

  console.log("[daemon] starting");

  for (;;) {
    try {
      await runCycle();
    } catch (err) {
      console.error("[daemon] cycle failed:", err);
    }

    await sleep(15_000);
  }
}

main().catch((err) => {
  console.error("[daemon] fatal:", err);
  process.exit(1);
});
