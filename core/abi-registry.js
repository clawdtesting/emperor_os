import { promises as fs } from "fs";
import path from "path";
import { Interface } from "ethers";
import { adapters, getAdapter, getAdapterByAddress } from "../contracts/registry.js";

const ERC20_ABI_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "ERC20.json"
);

function normalizeAddress(address) {
  return String(address ?? "").toLowerCase();
}

let cache = null;

export async function loadAbiRegistry() {
  if (cache) return cache;

  const v1Adapter = adapters.v1;
  const primeAdapter = adapters.prime;

  let erc20Abi;
  try {
    const raw = await fs.readFile(ERC20_ABI_PATH, "utf8");
    const json = JSON.parse(raw);
    erc20Abi = Array.isArray(json) ? json : json.abi;
  } catch {
    erc20Abi = [];
  }

  const agiJobManagerAbi = v1Adapter.abi;
  const primeAbi = primeAdapter.abi;

  cache = {
    addresses: {
      AGI_JOB_MANAGER: normalizeAddress(v1Adapter.address),
      AGIALPHA_TOKEN: normalizeAddress(process.env.AGIALPHA_TOKEN ?? "0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA"),
      AGI_JOB_DISCOVERY_PRIME: normalizeAddress(primeAdapter.address)
    },
    abis: {
      AGI_JOB_MANAGER: agiJobManagerAbi,
      AGIALPHA_TOKEN: erc20Abi,
      AGI_JOB_DISCOVERY_PRIME: primeAbi
    },
    interfaces: {
      AGI_JOB_MANAGER: new Interface(agiJobManagerAbi),
      AGIALPHA_TOKEN: new Interface(erc20Abi),
      AGI_JOB_DISCOVERY_PRIME: new Interface(primeAbi)
    }
  };

  return cache;
}

export async function getAllowedContracts() {
  const registry = await loadAbiRegistry();
  return new Set([
    registry.addresses.AGI_JOB_MANAGER,
    registry.addresses.AGIALPHA_TOKEN,
    registry.addresses.AGI_JOB_DISCOVERY_PRIME
  ]);
}

export async function getInterfaceForAddress(address) {
  const registry = await loadAbiRegistry();
  const normalized = normalizeAddress(address);

  const match = getAdapterByAddress(address);
  if (match) {
    return {
      contractKey: `AGI_JOB_MANAGER_${match.version.toUpperCase()}`,
      address: normalized,
      iface: match.adapter.iface
    };
  }

  if (normalized === registry.addresses.AGIALPHA_TOKEN) {
    return {
      contractKey: "AGIALPHA_TOKEN",
      address: registry.addresses.AGIALPHA_TOKEN,
      iface: registry.interfaces.AGIALPHA_TOKEN
    };
  }

  if (normalized === registry.addresses.AGI_JOB_MANAGER) {
    return {
      contractKey: "AGI_JOB_MANAGER",
      address: registry.addresses.AGI_JOB_MANAGER,
      iface: registry.interfaces.AGI_JOB_MANAGER
    };
  }

  if (normalized === registry.addresses.AGI_JOB_DISCOVERY_PRIME) {
    return {
      contractKey: "AGI_JOB_DISCOVERY_PRIME",
      address: registry.addresses.AGI_JOB_DISCOVERY_PRIME,
      iface: registry.interfaces.AGI_JOB_DISCOVERY_PRIME
    };
  }

  throw new Error(`Address not in allowlist: ${address}`);
}