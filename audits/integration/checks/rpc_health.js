// audits/integration/checks/rpc_health.js
// Verifies the Ethereum RPC endpoint is healthy and on the correct chain.
// Uses eth_chainId and eth_blockNumber to confirm live connectivity.
// A dead RPC blocks all on-chain validation and tx package building.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { MAINNET_CHAIN_ID } from "../../lib/constants.js";

const CHECK_NAME = "integration.rpc_health";
const TIMEOUT_MS = 8000;

async function rpcCall(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

export async function run(ctx) {
  const start = Date.now();

  const rpcUrl = process.env.RPC_URL || process.env.ETH_RPC_URL;
  if (!rpcUrl) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "RPC_URL not configured — skipping RPC health check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  let chainId, blockNumber;

  try {
    const chainIdHex = await rpcCall(rpcUrl, "eth_chainId");
    chainId = parseInt(chainIdHex, 16);
  } catch (err) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `RPC endpoint unreachable or erroring: ${err.message}`,
      durationMs: Date.now() - start,
      extra: { rpcUrl },
    });
    return ctx;
  }

  try {
    const blockHex = await rpcCall(rpcUrl, "eth_blockNumber");
    blockNumber = parseInt(blockHex, 16);
    addMetric(ctx, "rpc_health.blockNumber", blockNumber);
  } catch {
    // non-critical, continue
  }

  if (chainId !== MAINNET_CHAIN_ID) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `RPC is on wrong chain: chainId ${chainId}, expected ${MAINNET_CHAIN_ID} (mainnet)`,
      durationMs: Date.now() - start,
      extra: { chainId, expected: MAINNET_CHAIN_ID, rpcUrl },
    });
    return ctx;
  }

  addCheck(ctx, {
    name: CHECK_NAME,
    status: SEVERITY.PASS,
    severity: SEVERITY.PASS,
    details: `RPC healthy — chainId ${chainId} (mainnet), block #${blockNumber ?? "unknown"} (${Date.now() - start}ms)`,
    durationMs: Date.now() - start,
    extra: { chainId, blockNumber, rpcUrl },
  });

  return ctx;
}
