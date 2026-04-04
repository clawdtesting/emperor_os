import { getProvider, assertMainnet } from "../core/rpc.js";
import { bindFinalizedOperatorReceipt, getJobState } from "./state.js";

const FINALITY_DEPTH = Number(process.env.JOB_FINALITY_DEPTH ?? "12");

export async function ingestFinalizedJobReceipt({ jobId, action }) {
  const state = await getJobState(jobId);
  const txHash = state?.operatorTx?.[action]?.txHash;
  if (!txHash) return { ok: false, reason: `missing operator tx hash for ${action}` };

  await assertMainnet();
  const provider = getProvider();
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return { ok: false, reason: "receipt-not-found" };
  const currentBlock = await provider.getBlockNumber();
  const depth = Number(currentBlock) - Number(receipt.blockNumber);
  if (depth < FINALITY_DEPTH) {
    return {
      ok: false,
      reason: "not-finalized",
      finalityDepth: depth,
      requiredDepth: FINALITY_DEPTH,
      blockNumber: Number(receipt.blockNumber),
    };
  }

  await bindFinalizedOperatorReceipt(jobId, action, receipt, {
    finalityDepth: depth,
    finalizedAgainstBlock: Number(currentBlock),
  });

  return { ok: true, txHash, blockNumber: Number(receipt.blockNumber), finalityDepth: depth };
}
