// ./agent/simulation.js
import { getProvider, assertMainnet } from "./rpc.js";

function normalizeValue(value) {
  if (value == null) return "0x0";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("0x")) return trimmed;
    return `0x${BigInt(trimmed).toString(16)}`;
  }
  if (typeof value === "number") return `0x${BigInt(value).toString(16)}`;
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  throw new Error(`Unsupported value type: ${typeof value}`);
}

function stringifyError(err) {
  if (!err) return "Unknown simulation error";
  if (err.shortMessage) return err.shortMessage;
  if (err.message) return err.message;
  return String(err);
}

export async function simulateUnsignedTx(unsignedTx, fromAddress) {
  await assertMainnet();
  const provider = getProvider();

  const tx = {
    from: fromAddress,
    to: unsignedTx.to,
    data: unsignedTx.data,
    value: normalizeValue(unsignedTx.value ?? "0")
  };

  try {
    const result = await provider.call(tx);
    let gasEstimate = null;

    try {
      gasEstimate = await provider.estimateGas(tx);
    } catch {
      gasEstimate = null;
    }

    return {
      ok: true,
      result,
      gasEstimate: gasEstimate ? gasEstimate.toString() : null
    };
  } catch (err) {
    return {
      ok: false,
      error: stringifyError(err)
    };
  }
}
