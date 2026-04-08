import "dotenv/config";
import { acquireLock } from "../../agent/lock.js";
import { ensureStateDirs } from "../../agent/state.js";
import { recover } from "../../agent/recovery.js";
import { ensureWorkspaceArtifactDirs } from "../../agent/artifact-manager.js";
import { CONFIG } from "../../agent/config.js";
import { pruneStateFiles } from "../../agent/state-retention.js";
import { runOrchestratorCycle } from "../../agent/orchestrator.js";
import { runPreflight } from "../../agent/preflight.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCycle() {
  await runOrchestratorCycle();
}

async function main() {
  const { lockPath } = await acquireLock();
  console.log(`[runner] lock acquired: ${lockPath}`);

  await ensureStateDirs();
  await ensureWorkspaceArtifactDirs();
  await runPreflight();
  await recover();
  await pruneStateFiles();

  console.log("[runner] starting");

  let consecutiveFailures = 0;

  for (;;) {
    try {
      await runCycle();
      consecutiveFailures = 0;
    } catch (err) {
      console.error("[runner] cycle failed:", err);
      consecutiveFailures += 1;
    }

    try {
      const pruned = await pruneStateFiles();
      if (pruned.removed > 0) {
        console.log(`[runner] pruned state files: ${pruned.removed}/${pruned.total}`);
      }
    } catch (err) {
      console.error("[runner] state prune failed:", err);
    }

    const baseDelay = Math.max(1_000, Number(CONFIG.LOOP_BASE_DELAY_MS ?? 15_000));
    const maxDelay = Math.max(baseDelay, Number(CONFIG.LOOP_MAX_DELAY_MS ?? 300_000));
    const backoffMultiplier = Math.max(1, Number(CONFIG.LOOP_BACKOFF_MULTIPLIER ?? 2));
    const jitterMax = Math.max(0, Number(CONFIG.LOOP_BACKOFF_JITTER_MS ?? 1_000));

    const exp = Math.max(0, consecutiveFailures - 1);
    const backedOffDelay = Math.min(maxDelay, Math.floor(baseDelay * Math.pow(backoffMultiplier, exp)));
    const jitter = jitterMax > 0 ? Math.floor((Date.now() + consecutiveFailures) % (jitterMax + 1)) : 0;
    const nextDelay = backedOffDelay + jitter;

    console.log(`[runner] sleeping ${nextDelay}ms (failures=${consecutiveFailures})`);
    await sleep(nextDelay);
  }
}

main().catch((err) => {
  console.error("[runner] fatal:", err);
  process.exit(1);
});
