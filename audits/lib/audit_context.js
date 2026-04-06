// audits/lib/audit_context.js
// Builds a common runtime context for all audit checks.

import { fileURLToPath } from "url";
import path from "path";
import { AUDITS_ROOT, WORKSPACE_ROOT, AGENT_ROOT, CORE_ROOT, ARTIFACTS_ROOT, REPORTS_DIR, LATEST_REPORT_DIR, FIXTURES_DIR } from "./constants.js";

export function buildAuditContext(opts = {}) {
  const now = new Date();
  return {
    // Paths
    auditsRoot: AUDITS_ROOT,
    workspaceRoot: WORKSPACE_ROOT,
    agentRoot: AGENT_ROOT,
    coreRoot: CORE_ROOT,
    artifactsRoot: ARTIFACTS_ROOT,
    reportsDir: REPORTS_DIR,
    latestReportDir: LATEST_REPORT_DIR,
    fixturesDir: FIXTURES_DIR,

    // Execution context
    startedAt: now.toISOString(),
    profile: opts.profile || "fast",
    strict: opts.strict ?? false,
    auditFamily: opts.auditFamily || null,
    checkName: opts.checkName || null,

    // Environment snapshot
    nodeVersion: process.version,
    platform: process.platform,
    env: {
      rpcUrl: process.env.RPC_URL || null,
      mcpEndpoint: process.env.AGI_ALPHA_MCP || null,
      agentAddress: process.env.AGENT_ADDRESS || null,
      chainId: process.env.EXPECTED_CHAIN_ID || null,
    },

    // Result accumulator
    checks: [],
    metrics: {},
    errors: [],
  };
}

export function addCheck(ctx, check) {
  const { name, status, details, severity, durationMs, extra } = check;
  ctx.checks.push({
    ...extra,
    name,
    status,
    details: details || null,
    severity: severity || null,
    durationMs: durationMs || null,
  });
}

export function addMetric(ctx, key, value) {
  ctx.metrics[key] = value;
}

export function addError(ctx, err) {
  ctx.errors.push({
    message: err.message || String(err),
    stack: err.stack || null,
    at: new Date().toISOString(),
  });
}
