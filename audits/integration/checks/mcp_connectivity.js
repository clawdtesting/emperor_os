// audits/integration/checks/mcp_connectivity.js
// Verifies the AGI Alpha MCP endpoint is reachable and responding.
// The agent cannot discover or apply to jobs if MCP is down.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";

const CHECK_NAME = "integration.mcp_connectivity";
const TIMEOUT_MS = 8000;

export async function run(ctx) {
  const start = Date.now();

  const endpoint = process.env.AGI_ALPHA_MCP || "https://agialpha.com/api/mcp";

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "list_tools", args: {} }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `MCP endpoint unreachable: ${err.message} (${endpoint})`,
      durationMs: Date.now() - start,
      extra: { endpoint },
    });
    return ctx;
  }

  if (!res.ok) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `MCP endpoint returned HTTP ${res.status} (${endpoint})`,
      durationMs: Date.now() - start,
      extra: { endpoint, httpStatus: res.status },
    });
    return ctx;
  }

  let body;
  try {
    body = await res.json();
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `MCP endpoint reachable but response is not valid JSON (${endpoint})`,
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  addCheck(ctx, {
    name: CHECK_NAME,
    status: SEVERITY.PASS,
    severity: SEVERITY.PASS,
    details: `MCP endpoint healthy — ${endpoint} (${Date.now() - start}ms)`,
    durationMs: Date.now() - start,
    extra: { endpoint, tools: Array.isArray(body?.tools) ? body.tools.length : "unknown" },
  });

  return ctx;
}
