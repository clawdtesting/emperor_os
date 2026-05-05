import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import { CONFIG } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function chainIdOrUnknown(value) {
  if (value === null || value === undefined || value === "") return "unknown";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  return String(n);
}

const ABI_PATHS = {
  v1: path.join(__dirname, "abi", "AGIJobManager.json"),
  v2: path.join(__dirname, "abi", "AGIJobManager-v2.json"),
  primeDiscovery: path.join(__dirname, "abi", "AGIJobDiscoveryPrime.json"),
  // Note: Prime manager ABI is not available locally; treat as partial
  primeManager: null
};

export const PROTOCOL_REGISTRY = {
  v1: {
    protocol: "v1",
    chainId: chainIdOrUnknown(CONFIG.CHAIN_ID),
    contractAddress: "0xB3AAeb69b630f0299791679c063d68d6687481d1",
    contractName: "AGIJobManager",
    abi: {
      status: "available",
      sourcePath: ABI_PATHS.v1
    },
    supportedActions: {
      apply: {
        supported: true,
        method: "applyForJob",
        argsSchema: ["uint256 _jobId", "string subdomain", "bytes32[] proof"],
        methodStatus: "verified_from_local_abi"
      },
      completion: {
        supported: true,
        method: "requestJobCompletion",
        argsSchema: ["uint256 _jobId", "string _jobCompletionURI"],
        methodStatus: "verified_from_local_abi"
      },
      validation: {
        supported: true,
        method: "getJobValidation",
        argsSchema: ["uint256 _jobId"],
        methodStatus: "verified_from_local_abi"
      }
    }
  },
  v2: {
    protocol: "v2",
    chainId: chainIdOrUnknown(CONFIG.CHAIN_ID),
    contractAddress: "0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2",
    contractName: "AGIJobManagerV2/EmployerBurnCandidate",
    abi: {
      status: "available",
      sourcePath: ABI_PATHS.v2
    },
    supportedActions: {
      apply: {
        supported: true,
        method: "applyForJob",
        argsSchema: ["uint256 _jobId", "string subdomain", "bytes32[] proof"],
        methodStatus: "verified_from_local_abi"
      },
      completion: {
        supported: true,
        method: "requestJobCompletion",
        argsSchema: ["uint256 _jobId", "string _jobCompletionURI"],
        methodStatus: "verified_from_local_abi"
      },
      validation: {
        supported: true,
        method: "getJobValidation",
        argsSchema: ["uint256 _jobId"],
        methodStatus: "verified_from_local_abi"
      }
    }
  },
  prime: {
    protocol: "prime",
    chainId: chainIdOrUnknown(CONFIG.CHAIN_ID),
    contractAddress: "0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29",
    managerContractAddress: "0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e",
    discoveryContract: "0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29",
    managerContract: "0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e",
    contractName: "AGIJobDiscoveryPrime (discovery) / AGIJobPrimeManager (manager)",
    abi: {
      discovery: {
        status: "partial", // We have the discovery ABI
        sourcePath: ABI_PATHS.primeDiscovery
      },
      manager: {
        status: "unavailable", // No local ABI for manager contract
        sourcePath: null
      }
    },
    supportedActions: {
      // Discovery flow (read-only and write actions)
      discover: {
        supported: false, // Not implemented yet
        method: "discover", // Hypothetical
        argsSchema: [], // To be defined
        methodStatus: "needs_contract_abi_confirmation"
      },
      // Prime specific actions (simplified)
      // These are placeholder; actual Prime contract has more complex flows
      commitPackage: {
        supported: false,
        method: "commitPackage",
        argsSchema: [],
        methodStatus: "needs_contract_abi_confirmation"
      },
      revealPackage: {
        supported: false,
        method: "revealPackage",
        argsSchema: [],
        methodStatus: "needs_contract_abi_confirmation"
      },
      // Validator scoring under Prime
      scoreValidation: {
        supported: false,
        method: "scoreValidation",
        argsSchema: [],
        methodStatus: "needs_contract_abi_confirmation"
      },
      // Settlement
      settle: {
        supported: false,
        method: "settle",
        argsSchema: [],
        methodStatus: "needs_contract_abi_confirmation"
      }
    }
  }
};

export function getProtocolConfig(protocol) {
  const key = String(protocol || "").toLowerCase();
  const entry = PROTOCOL_REGISTRY[key];
  if (!entry) throw new Error(`Unknown protocol: ${protocol}`);
  return entry;
}

export async function isAbiFileAvailable(protocol) {
  // For prime, we need to check discovery and manager separately
  if (protocol === "prime") {
    const discoveryAvailable = await fs.access(ABI_PATHS.primeDiscovery).then(() => true).catch(() => false);
    const managerAvailable = ABI_PATHS.primeManager !== null && await fs.access(ABI_PATHS.primeManager).then(() => true).catch(() => false);
    return { discovery: discoveryAvailable, manager: managerAvailable };
  }
  const p = getProtocolConfig(protocol).abi.sourcePath;
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function getProtocolWarnings(protocolConfig) {
  const warnings = [];
  if (protocolConfig.chainId === "unknown") warnings.push("chainId is unknown");
  if (!protocolConfig.contractAddress && !protocolConfig.discoveryContract) warnings.push("contract address missing");
  if (protocolConfig.protocol === "prime") {
    if (protocolConfig.abi.discovery.status !== "available") warnings.push(`Prime discovery ABI status is ${protocolConfig.abi.discovery.status}`);
    if (protocolConfig.abi.manager.status !== "available") warnings.push(`Prime manager ABI status is ${protocolConfig.abi.manager.status}`);
  } else if (protocolConfig.abi.status !== "available") {
    warnings.push(`ABI status is ${protocolConfig.abi.status}`);
  }
  return warnings;
}