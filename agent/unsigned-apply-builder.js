// agent/unsigned-apply-builder.js
// Builds an unsigned apply transaction packet for external wallet flows.
// Safety: never signs, never broadcasts, never manages nonce, never handles private keys.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getProtocolConfig } from "./protocol-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ABI_FILE_BY_PROTOCOL = {
  v1: path.join(__dirname, "abi", "AGIJobManager.json"),
  v2: path.join(__dirname, "abi", "AGIJobManager-v2.json"),
  prime: path.join(__dirname, "abi", "AGIJobDiscoveryPrime.json")
};

function normalizeProtocol(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "v1" || value === "v2" || value === "prime") return value;
  return null;
}

function detectProtocolFromJobId(jobId) {
  const id = String(jobId ?? "").trim().toLowerCase();
  if (id.startsWith("v1_")) return "v1";
  if (id.startsWith("v2_")) return "v2";
  if (id.startsWith("prime_")) return "prime";
  return null;
}

async function loadProtocolAbi(protocol) {
  const abiPath = ABI_FILE_BY_PROTOCOL[protocol];
  if (!abiPath) return null;

  try {
    const content = await fs.readFile(abiPath, "utf8");
    const parsed = JSON.parse(content);
    const abi = Array.isArray(parsed) ? parsed : parsed?.abi;
    return Array.isArray(abi) ? abi : null;
  } catch {
    return null;
  }
}

function findApplyFunction(abi) {
  if (!Array.isArray(abi)) return null;
  return abi.find(
    (entry) => entry?.type === "function" && (entry?.name === "applyForJob" || entry?.name === "apply")
  ) ?? null;
}

function resolveProtocol(jobState) {
  const fromVersion = normalizeProtocol(jobState?.contractVersion);
  const fromId = detectProtocolFromJobId(jobState?.jobId);

  if (fromVersion && fromId && fromVersion !== fromId) {
    throw new Error(
      `Ambiguous protocol for ${jobState?.jobId}: contractVersion=${fromVersion}, jobIdPrefix=${fromId}`
    );
  }

  const protocol = fromVersion ?? fromId;
  if (!protocol) {
    throw new Error(
      `Unsupported or ambiguous protocol for ${jobState?.jobId}. Expected one of: v1, v2, prime.`
    );
  }

  return protocol;
}

export async function buildUnsignedApplyTx(jobState, artifactDir) {
  const now = new Date().toISOString();
  const protocol = resolveProtocol(jobState);

  const protocolConfig = getProtocolConfig(protocol);

  const txPacket = {
    schema: "emperor-os/unsigned-tx/v1",
    kind: "apply",
    humanReviewRequired: true,
    dryRun: false,
    jobId: jobState.jobId,
    protocol,
    contractAddress: protocolConfig.contractAddress || "unknown",
    chainId: protocolConfig.chainId,
    method: protocolConfig.supportedActions.apply.method || "needs_abi_confirmation",
    args: [],
    value: "0",
    createdAt: now,
    sourceArtifacts: {
      decision: path.relative(artifactDir, path.join(artifactDir, "decision.json")),
      discoveryReviewPacket: path.relative(artifactDir, path.join(artifactDir, "discovery_review_packet.json"))
    },
    safety: {
      agentSigned: false,
      agentBroadcast: false,
      privateKeyUsed: false,
      nonceManagedByAgent: false,
      requiresExternalWallet: true
    },
    operatorInstructions: [
      "Review all packet fields and source artifacts.",
      "Re-check current on-chain/MCP job status before any external signing decision.",
      "If still valid, export this unsigned transaction package to an external wallet flow.",
      "Signing and broadcasting happen outside Emperor OS."
    ]
  };

  const abi = await loadProtocolAbi(protocol);
  const applyFunction = findApplyFunction(abi);

  if (!applyFunction) {
    txPacket.calldataStatus = "needs_contract_abi_confirmation";
    txPacket.executableAsIs = false;
    txPacket.requiresAbiVerification = true;
    txPacket.abiValidation = null;
    txPacket.warnings = [
      `No verified apply function found in local ABI for protocol ${protocol}.`,
      "This package is non-executable until ABI/function signature is independently confirmed."
    ];
    return txPacket;
  }

  txPacket.calldataStatus = "abi_verified_function_signature_only";
  txPacket.executableAsIs = false;
  txPacket.requiresAbiVerification = false;
  txPacket.abiValidation = {
    protocol,
    functionName: applyFunction.name,
    inputs: (applyFunction.inputs ?? []).map((i) => ({ name: i.name, type: i.type }))
  };
  txPacket.warnings = [
    "ABI function signature is present locally, but calldata was intentionally not synthesized in Emperor OS.",
    "External signer must independently assemble and verify calldata before signing."
  ];

  return txPacket;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[unsigned-apply-builder] Import this module from approve_for_apply.js.");
}