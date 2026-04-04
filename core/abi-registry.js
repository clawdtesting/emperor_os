import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Interface } from "ethers";
import { CONFIG } from "./config.js";

const ABI_DIR = path.join(CONFIG.WORKSPACE_ROOT, "agent", "abi");
const FALLBACK_ABI_DIR = path.dirname(fileURLToPath(import.meta.url));

const CONTRACTS = {
  AGI_JOB_MANAGER: "0xB3AAeb69b630f0299791679c063d68d6687481d1",
  AGIALPHA_TOKEN: "0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA"
};

function normalizeAddress(address) {
  return String(address ?? "").toLowerCase();
}

async function readAbiJson(filename) {
  const candidatePaths = [
    path.join(ABI_DIR, filename),
    path.join(FALLBACK_ABI_DIR, filename)
  ];

  let lastErr = null;
  for (const filePath of candidatePaths) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const json = JSON.parse(raw);
      if (Array.isArray(json)) return json;
      if (Array.isArray(json.abi)) return json.abi;
      throw new Error(`Invalid ABI JSON structure in ${filePath}`);
    } catch (err) {
      lastErr = err;
      if (err.code !== "ENOENT") throw err;
    }
  }
  throw lastErr ?? new Error(`Missing ABI file: ${filename}`);
}

let cache = null;

export async function loadAbiRegistry() {
  if (cache) return cache;

  const agiJobManagerAbi = await readAbiJson("AGIJobManager.json");
  const erc20Abi = await readAbiJson("ERC20.json");

  cache = {
    addresses: {
      AGI_JOB_MANAGER: normalizeAddress(CONTRACTS.AGI_JOB_MANAGER),
      AGIALPHA_TOKEN: normalizeAddress(CONTRACTS.AGIALPHA_TOKEN)
    },
    abis: {
      AGI_JOB_MANAGER: agiJobManagerAbi,
      AGIALPHA_TOKEN: erc20Abi
    },
    interfaces: {
      AGI_JOB_MANAGER: new Interface(agiJobManagerAbi),
      AGIALPHA_TOKEN: new Interface(erc20Abi)
    }
  };

  return cache;
}

export async function getAllowedContracts() {
  const registry = await loadAbiRegistry();
  return new Set([
    registry.addresses.AGI_JOB_MANAGER,
    registry.addresses.AGIALPHA_TOKEN
  ]);
}

export async function getInterfaceForAddress(address) {
  const registry = await loadAbiRegistry();
  const normalized = normalizeAddress(address);

  if (normalized === registry.addresses.AGI_JOB_MANAGER) {
    return {
      contractKey: "AGI_JOB_MANAGER",
      address: registry.addresses.AGI_JOB_MANAGER,
      iface: registry.interfaces.AGI_JOB_MANAGER
    };
  }
  if (normalized === registry.addresses.AGIALPHA_TOKEN) {
    return {
      contractKey: "AGIALPHA_TOKEN",
      address: registry.addresses.AGIALPHA_TOKEN,
      iface: registry.interfaces.AGIALPHA_TOKEN
    };
  }

  throw new Error(`Address not in allowlist: ${address}`);
}
