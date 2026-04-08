// agent/abi-registry.js
// Contract address allowlist and ABI interface registry.
// Used by tx-validator.js to verify unsigned transaction targets.

import { Interface } from "ethers";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONTRACTS = {
  AGI_JOB_MANAGER_V1: "0xB3AAeb69b630f0299791679c063d68d6687481d1",
  AGI_JOB_MANAGER_V2: "0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29",
  AGIALPHA_TOKEN: "0x5aFE3855358E112B5647B952709E6165e1c1eEEe",
};

const ALLOWED_SET = new Set(
  Object.values(CONTRACTS).map((a) => a.toLowerCase())
);

const abiCache = new Map();

async function loadAbi(filePath) {
  if (abiCache.has(filePath)) return abiCache.get(filePath);
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
  const abi = Array.isArray(raw) ? raw : raw.abi;
  const iface = new Interface(abi);
  abiCache.set(filePath, iface);
  return iface;
}

export async function getAllowedContracts() {
  return ALLOWED_SET;
}

export async function getInterfaceForAddress(address) {
  const lower = String(address).toLowerCase();
  const contractsDir = path.resolve(__dirname, "..", "contracts");

  if (lower === CONTRACTS.AGI_JOB_MANAGER_V1.toLowerCase()) {
    return loadAbi(path.join(contractsDir, "AGIJobManager-v1", "AGIJobManager.v1.json"));
  }
  if (lower === CONTRACTS.AGI_JOB_MANAGER_V2.toLowerCase()) {
    return loadAbi(path.join(contractsDir, "AGIJobManager-v2", "AGIJobManager.v2.json"));
  }
  return null;
}
