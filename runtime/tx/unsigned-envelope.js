export function buildUnsignedEnvelope({ kind, chainId, to, data, jobId, extra = {} }) {
  return {
    schema: "emperor-os/unsigned-tx/v1",
    kind,
    chainId,
    to,
    data,
    value: "0",
    jobId: String(jobId),
    generatedAt: new Date().toISOString(),
    extra
  };
}

export function assertUnsignedOnly(txLike = {}) {
  const forbidden = ["privateKey", "signature", "signedTx", "rawTransaction", "broadcast", "sendTransaction"];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(txLike, key)) {
      throw new Error(`Signing boundary violation: found forbidden field ${key}`);
    }
  }
  return true;
}
