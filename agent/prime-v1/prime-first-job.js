// prime/prime-first-job.js
// Deterministic first-procurement dry-run helper.

import { startPrimeMonitor } from "../prime-monitor.js";
import { orchestrateOnceForProcurement } from "./prime-orchestrator.js";

async function main() {
  const procurementId = process.env.PRIME_PROCUREMENT_ID;
  if (!procurementId) throw new Error("PRIME_PROCUREMENT_ID not set");
  if (!process.env.ETH_RPC_URL) throw new Error("ETH_RPC_URL not set");
  if (!process.env.AGENT_ADDRESS) throw new Error("AGENT_ADDRESS not set");
  if (!process.env.AGENT_SUBDOMAIN) throw new Error("AGENT_SUBDOMAIN not set");

  console.log(`[prime-first-job] monitor once for procurement=${procurementId}`);
  await startPrimeMonitor({ agentAddress: process.env.AGENT_ADDRESS, once: true });

  const steps = [
    "EVALUATE_FIT",
    "DRAFT_APPLICATION",
    "BUILD_COMMIT_TX",
    "WAIT_REVEAL_WINDOW",
    "BUILD_REVEAL_TX",
  ];

  for (const s of steps) {
    console.log(`[prime-first-job] step=${s}`);
    const out = await orchestrateOnceForProcurement(procurementId);
    if (out?.handoffRequired) {
      console.log(`[prime-first-job] STOP for operator handoff: ${out.handoffRequired}`);
      break;
    }
  }
}

main().catch((err) => {
  console.error("[prime-first-job] fatal", err);
  process.exit(1);
});
