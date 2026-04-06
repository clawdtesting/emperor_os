// audits/economics/checks/cost_reward_ratio.js
// Verifies that completed jobs had a payout worth the execution cost.
// Compares payout against estimated gas cost + LLM cost overhead.
// Flags jobs where the reward did not justify the cost of participation.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "economics.cost_reward_ratio";
const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;

const MIN_ACCEPTABLE_RATIO = 1.5;
const EST_GAS_COST_USD = 2.0;
const EST_LLM_COST_USD = 0.5;
const TOTAL_EST_COST_USD = EST_GAS_COST_USD + EST_LLM_COST_USD;

const AGIALPHA_TO_USD = 0.01;

function extractPayout(state) {
  const raw = state.payout ?? state.payoutAGIALPHA ?? state.reward ?? state.amount ?? state.spec?.payout;
  if (raw === undefined || raw === null) return null;
  return Number(raw);
}

export async function run(ctx) {
  const start = Date.now();

  let jobFiles;
  try {
    jobFiles = await listFiles(JOB_STATE_DIR, f => f.endsWith(".json"));
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Job state directory not found — cannot assess cost/reward ratio",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const lowRatioJobs = [];
  let checked = 0;
  let totalPayout = 0;

  for (const file of jobFiles) {
    let state;
    try { state = await readJson(file); } catch { continue; }

    const status = (state.status || "").toLowerCase();
    if (!["completed", "done"].includes(status)) continue;

    const payout = extractPayout(state);
    if (payout === null) continue;

    checked++;
    const payoutUsd = payout * AGIALPHA_TO_USD;
    totalPayout += payoutUsd;
    const ratio = payoutUsd / TOTAL_EST_COST_USD;

    if (ratio < MIN_ACCEPTABLE_RATIO) {
      const jobId = state.jobId || file.split("/").pop().replace(".json", "");
      lowRatioJobs.push({
        jobId,
        payout,
        payoutUsd: payoutUsd.toFixed(2),
        ratio: ratio.toFixed(2),
      });
    }
  }

  addMetric(ctx, "cost_reward_ratio.checked", checked);
  addMetric(ctx, "cost_reward_ratio.low_ratio_count", lowRatioJobs.length);
  addMetric(ctx, "cost_reward_ratio.total_payout_usd", totalPayout.toFixed(2));

  if (lowRatioJobs.length > 0) {
    const details = lowRatioJobs.slice(0, 3).map(j =>
      `job ${j.jobId}: ${j.payout} AGIALPHA ($${j.payoutUsd}, ratio ${j.ratio}x)`
    ).join("; ");

    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `${lowRatioJobs.length}/${checked} completed job(s) below ${MIN_ACCEPTABLE_RATIO}x cost/reward threshold: ${details}`,
      durationMs: Date.now() - start,
      extra: { lowRatioJobs, estCostUsd: TOTAL_EST_COST_USD },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} completed job(s) exceed ${MIN_ACCEPTABLE_RATIO}x cost/reward ratio`,
      durationMs: Date.now() - start,
      extra: { checked, totalPayoutUsd: totalPayout.toFixed(2) },
    });
  }

  return ctx;
}
