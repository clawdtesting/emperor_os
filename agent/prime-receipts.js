import { fetchTransactionReceipt, getCurrentBlock } from "./prime-client.js";
import { isFinalizedReceipt } from "./prime-settlement.js";
import { bindFinalizedTxReceipt, getProcState } from "./prime-state.js";

export async function ingestFinalizedOperatorReceipt({ procurementId, action }) {
  const state = await getProcState(procurementId);
  const txHash = state?.operatorTx?.[action]?.txHash;
  if (!txHash) {
    return { ok: false, reason: `missing operatorTx hash for action=${action}` };
  }
  const receipt = await fetchTransactionReceipt(txHash);
  if (!receipt) return { ok: false, reason: "receipt-not-found" };

  const currentBlock = await getCurrentBlock();
  if (!isFinalizedReceipt(receipt, currentBlock)) {
    return {
      ok: false,
      reason: "not-finalized",
      receipt: { blockNumber: Number(receipt.blockNumber), status: receipt.status },
      currentBlock,
    };
  }

  await bindFinalizedTxReceipt(procurementId, action, receipt, { currentBlock });
  return { ok: true, txHash, blockNumber: Number(receipt.blockNumber), currentBlock };
}
