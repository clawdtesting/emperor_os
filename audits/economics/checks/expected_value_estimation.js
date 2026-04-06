// audits/economics/checks/expected_value_estimation.js
// Computes the expected value of the agent's job portfolio.
// EV = sum(payout * win_probability) across all applied jobs.
// A healthy EV is positive and growing. Flags if EV is negative
// or if win rate is below the minimum viable threshold.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "economics.expected_value_estimation";
const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;

const MIN_WIN_RATE = 0.05;
const AGIALPHA_TO_USD = 0.01;

function extractPayout(state) {
  const raw = state.payout ?? state.payoutAGIALPHA ?? state.reward ?? state.spec?.payout;
  return raw !== undefined ? Number(raw) : 0;
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
      details: "Job state directory not found — cannot compute expected value",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  let applied = 0;
  let won = 0;
  let totalPayout = 0;
  let totalAppliedPayout = 0;

  for (const file of jobFiles) {
    let state;
    try { state = await readJson(file); } catch { continue; }

    const status = (state.status || "").toLowerCase();
    const payout = extractPayout(state);

    if (["applied", "assigned", "in_progress", "completed", "done"].includes(status)) {
      applied++;
      totalAppliedPayout += payout;
    }
    if (["completed", "done"].includes(status)) {
      won++;
      totalPayout += payout;
    }
  }

  const winRate = applied > 0 ? won / applied : 0;
  const avgPayout = applied > 0 ? (totalAppliedPayout / applied) * AGIALPHA_TO_USD : 0;
  const ev = avgPayout * winRate;
  const realizedUsd = totalPayout * AGIALPHA_TO_USD;

  addMetric(ctx, "expected_value.applied", applied);
  addMetric(ctx, "expected_value.won", won);
  addMetric(ctx, "expected_value.win_rate", winRate.toFixed(3));
  addMetric(ctx, "expected_value.ev_usd", ev.toFixed(4));
  addMetric(ctx, "expected_value.realized_usd", realizedUsd.toFixed(2));

  if (applied === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No applied jobs found — EV not computable yet",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  if (winRate < MIN_WIN_RATE && applied >= 10) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `Win rate ${(winRate * 100).toFixed(1)}% below minimum ${(MIN_WIN_RATE * 100).toFixed(0)}% (${won}/${applied} jobs) — EV: $${ev.toFixed(4)}/job`,
      durationMs: Date.now() - start,
      extra: { applied, won, winRate, ev, realizedUsd },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `EV healthy: ${(winRate * 100).toFixed(1)}% win rate (${won}/${applied}), $${ev.toFixed(4)}/job, $${realizedUsd.toFixed(2)} realized`,
      durationMs: Date.now() - start,
      extra: { applied, won, winRate, ev, realizedUsd },
    });
  }

  return ctx;
}
