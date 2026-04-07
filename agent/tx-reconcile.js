// ./agent/tx-reconcile.js
import { getProvider, assertMainnet } from "./rpc.js";

export async function fetchReceipt(txHash) {
  await assertMainnet();
  const provider = getProvider();
  return provider.getTransactionReceipt(txHash);
}

export async function classifyTxOutcome(txHash) {
  const receipt = await fetchReceipt(txHash);

  if (!receipt) {
    return {
      outcome: "pending_or_unknown",
      txHash
    };
  }

  if (receipt.status === 1) {
    return {
      outcome: "confirmed",
      txHash,
      blockNumber: receipt.blockNumber
    };
  }

  return {
    outcome: "failed_revert",
    txHash,
    blockNumber: receipt.blockNumber
  };
}
