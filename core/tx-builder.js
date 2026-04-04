// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/tx-builder.js
import { CONFIG } from "./config.js";

function toBigIntValue(value) {
  if (value == null) return "0";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return BigInt(value).toString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "0";
    return BigInt(trimmed).toString();
  }
  throw new Error(`Unsupported numeric value type: ${typeof value}`);
}

function normalizePreparedTx(preparedTx) {
  if (!preparedTx || typeof preparedTx !== "object") {
    throw new Error("preparedTx missing or invalid");
  }

  const tx =
    preparedTx.tx && typeof preparedTx.tx === "object"
      ? preparedTx.tx
      : preparedTx.transaction && typeof preparedTx.transaction === "object"
      ? preparedTx.transaction
      : preparedTx;

  const to = tx.to;
  const data = tx.data ?? "0x";
  const value = toBigIntValue(tx.value);

  if (!to || typeof to !== "string") {
    throw new Error("preparedTx.to missing");
  }

  if (typeof data !== "string") {
    throw new Error("preparedTx.data missing or invalid");
  }

  return {
    to,
    data,
    value,
    chainId: CONFIG.CHAIN_ID
  };
}

export function buildUnsignedTxPackage({ kind, jobId, preparedTx, extra = {} }) {
  const tx = normalizePreparedTx(preparedTx);

  return {
    schema: "emperor-os/unsigned-tx/v1",
    kind,
    jobId: Number(jobId),
    contract: CONFIG.CONTRACT,
    chainId: CONFIG.CHAIN_ID,
    to: tx.to,
    data: tx.data,
    value: tx.value,
    generatedAt: new Date().toISOString(),
    reviewMessage:
      "Review signing_manifest.json, decode checks, simulation results, freshness, and target fields before signing with Ledger.",
    ...extra
  };
}

function selectorOf(data) {
  return String(data ?? "").slice(0, 10).toLowerCase();
}

export function buildUnsignedApplyTxPackage({ jobId, preparedTx, agentSubdomain }) {
  if (!preparedTx || typeof preparedTx !== "object") {
    throw new Error("apply preparedTx missing");
  }
  const approve = normalizePreparedTx(preparedTx.approve);
  const apply = normalizePreparedTx(preparedTx.apply);

  if (selectorOf(approve.data) !== "0x095ea7b3") {
    throw new Error(`unexpected approve selector: ${selectorOf(approve.data)}`);
  }
  if (selectorOf(apply.data) !== "0x327c1255") {
    throw new Error(`unexpected apply selector: ${selectorOf(apply.data)}`);
  }
  if (String(approve.value) !== "0" || String(apply.value) !== "0") {
    throw new Error("apply package requires zero-value txs");
  }

  return {
    schema: "emperor-os/unsigned-tx-bundle/v1",
    kind: "requestJobApplication",
    chainId: CONFIG.CHAIN_ID,
    jobId: Number(jobId),
    contract: CONFIG.CONTRACT,
    generatedAt: new Date().toISOString(),
    deterministicVerification: {
      selectorChecks: {
        approve: selectorOf(approve.data),
        apply: selectorOf(apply.data),
      },
      zeroValueChecksPassed: true,
      applyTargetMatchesContract: String(apply.to).toLowerCase() === String(CONFIG.CONTRACT).toLowerCase(),
    },
    txs: [
      { step: "approve", ...approve },
      { step: "apply", ...apply },
    ],
    agentSubdomain,
    reviewMessage:
      "Review both tx steps (approve, then apply). Validate selectors/targets before Ledger signing.",
  };
}
