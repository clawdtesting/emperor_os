// ./agent/rpc.js
import { JsonRpcProvider } from "ethers";
import { CONFIG, requireEnv } from "./config.js";

let provider = null;

export function getProvider() {
  if (provider) return provider;

  requireEnv("ETH_RPC_URL", process.env.ETH_RPC_URL);
  provider = new JsonRpcProvider(process.env.ETH_RPC_URL);
  return provider;
}

export async function assertMainnet() {
  const p = getProvider();
  const network = await p.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== CONFIG.CHAIN_ID) {
    throw new Error(`Wrong chain: expected ${CONFIG.CHAIN_ID}, got ${chainId}`);
  }

  return chainId;
}
