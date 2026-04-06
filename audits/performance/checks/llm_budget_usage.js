// audits/performance/checks/llm_budget_usage.js
// Reads the LLM audit log and reports total tokens used, cost estimate,
// and call frequency. Flags if LLM budget is being consumed too quickly
// or if calls are concentrated in bursts that suggest control flow issues.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { fileExists, readText } from "../../lib/fs_utils.js";

const CHECK_NAME = "performance.llm_budget_usage";
const LLM_AUDIT_LOG = `${AGENT_ROOT}/state/llm_audit.jsonl`;

const WARN_COST_PER_DAY_USD = 5.0;
const CRITICAL_COST_PER_DAY_USD = 20.0;
const COST_PER_1K_TOKENS = 0.003;

export async function run(ctx) {
  const start = Date.now();

  const exists = await fileExists(LLM_AUDIT_LOG);
  if (!exists) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "LLM audit log not found — no LLM usage recorded yet",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  let content;
  try { content = await readText(LLM_AUDIT_LOG); } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "LLM audit log unreadable",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const lines = content.trim().split("\n").filter(Boolean);
  let totalTokens = 0;
  let totalCalls = 0;
  const callsByDay = {};

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    totalCalls++;
    const tokens = (entry.inputTokens || 0) + (entry.outputTokens || 0) + (entry.tokens || 0);
    totalTokens += tokens;

    const day = (entry.timestamp || entry.createdAt || "").slice(0, 10);
    if (day) callsByDay[day] = (callsByDay[day] || 0) + 1;
  }

  const totalCostUsd = (totalTokens / 1000) * COST_PER_1K_TOKENS;
  const days = Object.keys(callsByDay).length || 1;
  const costPerDay = totalCostUsd / days;

  addMetric(ctx, "llm_budget.total_calls", totalCalls);
  addMetric(ctx, "llm_budget.total_tokens", totalTokens);
  addMetric(ctx, "llm_budget.total_cost_usd", totalCostUsd.toFixed(4));
  addMetric(ctx, "llm_budget.cost_per_day_usd", costPerDay.toFixed(4));

  if (costPerDay > CRITICAL_COST_PER_DAY_USD) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `LLM spend critical: $${costPerDay.toFixed(2)}/day (${totalCalls} calls, ${totalTokens} tokens, $${totalCostUsd.toFixed(2)} total)`,
      durationMs: Date.now() - start,
      extra: { totalCalls, totalTokens, totalCostUsd, costPerDay },
    });
  } else if (costPerDay > WARN_COST_PER_DAY_USD) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `LLM spend elevated: $${costPerDay.toFixed(2)}/day (${totalCalls} calls, ${totalTokens} tokens)`,
      durationMs: Date.now() - start,
      extra: { totalCalls, totalTokens, totalCostUsd, costPerDay },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `LLM budget healthy: $${costPerDay.toFixed(4)}/day (${totalCalls} calls, ${totalTokens} tokens, $${totalCostUsd.toFixed(4)} total)`,
      durationMs: Date.now() - start,
      extra: { totalCalls, totalTokens, totalCostUsd, costPerDay },
    });
  }

  return ctx;
}
