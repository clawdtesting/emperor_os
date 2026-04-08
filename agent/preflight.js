// agent/preflight.js
// Pre-run reachability checks for RPC and MCP endpoints.
// Aborts early with a clear error if infrastructure is unreachable.

import { getProvider } from "./rpc.js";
import { CONFIG } from "./config.js";

const PREFLIGHT_TIMEOUT_MS = 15_000;

async function checkRpc() {
  const provider = getProvider();
  const blockNumber = await provider.getBlockNumber();
  if (!Number.isFinite(blockNumber) || blockNumber <= 0) {
    throw new Error(`RPC returned invalid block number: ${blockNumber}`);
  }
  return blockNumber;
}

async function checkMcp() {
  const endpoint = CONFIG.AGI_ALPHA_MCP;
  if (!endpoint) {
    throw new Error("AGI_ALPHA_MCP not set");
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: "get_protocol_info", arguments: {} },
    }),
    signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}`);
  }
}

export async function runPreflight() {
  const results = { rpc: null, mcp: null };

  console.log("[preflight] checking RPC reachability...");
  try {
    const block = await checkRpc();
    results.rpc = { ok: true, blockNumber: block };
    console.log(`[preflight] RPC ok — block ${block}`);
  } catch (err) {
    results.rpc = { ok: false, error: err.message };
    console.error(`[preflight] RPC failed: ${err.message}`);
  }

  console.log("[preflight] checking MCP reachability...");
  try {
    await checkMcp();
    results.mcp = { ok: true };
    console.log("[preflight] MCP ok");
  } catch (err) {
    results.mcp = { ok: false, error: err.message };
    console.error(`[preflight] MCP failed: ${err.message}`);
  }

  if (!results.rpc.ok || !results.mcp.ok) {
    const failures = [];
    if (!results.rpc.ok) failures.push(`RPC: ${results.rpc.error}`);
    if (!results.mcp.ok) failures.push(`MCP: ${results.mcp.error}`);
    throw new Error(`Preflight failed — ${failures.join("; ")}`);
  }

  return results;
}
