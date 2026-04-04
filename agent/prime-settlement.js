export const FINALITY_DEPTH = Number(process.env.PRIME_FINALITY_DEPTH ?? "12");

export function isFinalizedBlock(eventBlock, currentBlock, minDepth = FINALITY_DEPTH) {
  if (!Number.isFinite(Number(eventBlock)) || !Number.isFinite(Number(currentBlock))) return false;
  return Number(currentBlock) - Number(eventBlock) >= Number(minDepth);
}

export function reconcileWinnerEvidence(evidence = []) {
  if (!Array.isArray(evidence) || evidence.length === 0) return { selected: null, source: null, blockNumber: null };
  const sorted = [...evidence].sort((a, b) => Number(b.blockNumber ?? 0) - Number(a.blockNumber ?? 0));
  const top = sorted[0];
  return {
    selected: top.winner ?? null,
    source: top.source ?? "unknown",
    blockNumber: Number(top.blockNumber ?? 0),
    conflictingEvidence: sorted.filter((x) => String(x.winner).toLowerCase() !== String(top.winner).toLowerCase()),
  };
}
