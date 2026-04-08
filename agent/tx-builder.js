// agent/tx-builder.js
// Build unsigned transaction packages for operator review.

import { CONFIG } from "./config.js";
import { CONTRACTS } from "./abi-registry.js";

const UNSIGNED_TX_SCHEMA = "emperor-os/unsigned-tx/v1";

export function buildUnsignedApplyTxPackage({ jobId, preparedTx, agentSubdomain }) {
  return {
    schema: UNSIGNED_TX_SCHEMA,
    kind: "requestJobApplication",
    jobId: String(jobId),
    chainId: CONFIG.CHAIN_ID,
    agentSubdomain,
    generatedAt: new Date().toISOString(),
    transactions: [
      {
        label: "approve-bond",
        to: preparedTx.approve?.to ?? CONTRACTS.AGIALPHA_TOKEN,
        data: preparedTx.approve?.data ?? "",
        value: String(preparedTx.approve?.value ?? "0"),
      },
      {
        label: "apply-for-job",
        to: preparedTx.apply?.to ?? CONTRACTS.AGI_JOB_MANAGER_V1,
        data: preparedTx.apply?.data ?? "",
        value: String(preparedTx.apply?.value ?? "0"),
      },
    ],
  };
}

export function buildUnsignedTxPackage({ kind, jobId, preparedTx, extra = {} }) {
  return {
    schema: UNSIGNED_TX_SCHEMA,
    kind,
    jobId: String(jobId),
    chainId: CONFIG.CHAIN_ID,
    to: preparedTx.to,
    data: preparedTx.data,
    value: String(preparedTx.value ?? "0"),
    generatedAt: new Date().toISOString(),
    ...extra,
  };
}
