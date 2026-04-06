// audits/lib/rpc_utils.js
// RPC utilities for audit checks.

import { ethers } from "ethers";

export function getProvider(rpcUrl) {
  const url = rpcUrl || process.env.RPC_URL || "https://mainnet.base.org";
  return new ethers.JsonRpcProvider(url);
}

export async function checkRpcHealth(rpcUrl) {
  try {
    const provider = getProvider(rpcUrl);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    return {
      ok: true,
      chainId: Number(network.chainId),
      blockNumber,
      latencyMs: null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
    };
  }
}

export async function simulateTx(provider, txParams) {
  try {
    const result = await provider.call({
      to: txParams.to,
      data: txParams.data,
      from: txParams.from || "0x0000000000000000000000000000000000000001",
      value: txParams.value || "0x0",
    });
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
