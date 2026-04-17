// prime-client.js
// Read-only typed RPC client for AGIJobDiscoveryPrime (Contract 2).
//
// SAFETY CONTRACT:
//   - No private key. No signing. No broadcasting. Read-only.
//   - All writes go through prime-state.js artifact model.
//   - This module exists only to fetch truth from the chain.

import "dotenv/config";
import { ethers } from "ethers";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import { CONFIG } from "./config.js";
import { loadEnv } from "./env.js";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const require    = createRequire(import.meta.url);

// ── Contract addresses ────────────────────────────────────────────────────────

export const PRIME_V1_CONTRACT = "0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29";
export const PRIME_V2_CONTRACT = "0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e";
export const PRIME_CONTRACT = PRIME_V1_CONTRACT;
export const JOB_MGR_CONTRACT = CONFIG.CONTRACT; // 0xB3AAeb69...
export const CHAIN_ID         = CONFIG.CHAIN_ID;  // 1
export const AGIALPHA_TOKEN   = process.env.AGIALPHA_TOKEN_ADDRESS ?? "0xa61a3b3a130a9c20768eebf97e21515a6046a1fa";

// ── ABI (loaded from registry file) ──────────────────────────────────────────

let _abi = null;
function loadAbi() {
  if (_abi) return _abi;
  _abi = require("./abi/AGIJobDiscoveryPrime.json");
  return _abi;
}

// ── Provider (read-only, no wallet) ──────────────────────────────────────────

let _provider = null;

export function getProvider() {
  if (_provider) return _provider;
  const rpc = process.env.ETH_RPC_URL;
  if (!rpc) throw new Error("ETH_RPC_URL not set — cannot read chain");
  _provider = new ethers.JsonRpcProvider(rpc);
  return _provider;
}

// ── Contract interface (read-only) ────────────────────────────────────────────

let _contract = null;

export function getPrimeContract() {
  if (_contract) return _contract;
  _contract = new ethers.Contract(PRIME_CONTRACT, loadAbi(), getProvider());
  return _contract;
}

export async function fetchValidatorAssignment(procurementId, validatorAddress) {
  const c = getPrimeContract();
  const pid = BigInt(procurementId);
  const addr = String(validatorAddress ?? "").toLowerCase();

  const probes = [
    async () => Boolean(await c.isAssignedValidator(pid, addr)),
    async () => Boolean(await c.validatorAssigned(pid, addr)),
    async () => Boolean(await c.validatorAssignments(pid, addr)),
  ];
  for (const probe of probes) {
    try {
      const assigned = await probe();
      return { assigned };
    } catch {
      // continue
    }
  }
  return { assigned: false, unknownMethod: true };
}

// ── Typed read: procurement struct ───────────────────────────────────────────

/**
 * Fetches the full procurement struct from chain.
 * Returns a plain object with BigInt fields converted to strings.
 * @param {number|string|bigint} procurementId
 * @returns {Promise<ProcurementStruct>}
 */
export async function fetchProcurement(procurementId) {
  const c = getPrimeContract();
  const p = await c.procurements(BigInt(procurementId));
  return {
    jobId:                  p.jobId.toString(),
    employer:               p.employer.toLowerCase(),
    commitDeadline:         p.commitDeadline.toString(),
    revealDeadline:         p.revealDeadline.toString(),
    finalistAcceptDeadline: p.finalistAcceptDeadline.toString(),
    trialDeadline:          p.trialDeadline.toString(),
    scoreCommitDeadline:    p.scoreCommitDeadline.toString(),
    scoreRevealDeadline:    p.scoreRevealDeadline.toString(),
  };
}

// ── Typed read: application view for our agent ────────────────────────────────

/**
 * Fetches application state for the given agent address on a procurement.
 * Phase numbers: 0=None, 1=Committed, 2=Revealed, 3=Shortlisted, 4=TrialSubmitted
 * @param {number|string|bigint} procurementId
 * @param {string} agentAddress
 * @returns {Promise<ApplicationView>}
 */
export async function fetchApplicationView(procurementId, agentAddress) {
  const c = getPrimeContract();
  const app = await c.applicationView(BigInt(procurementId), agentAddress);
  return {
    phase:          Number(app.phase),
    phaseName:      APPLICATION_PHASE_NAMES[Number(app.phase)] ?? `phase_${Number(app.phase)}`,
    applicationURI: app.applicationURI ?? "",
    commitment:     app.commitment,
    shortlisted:    Boolean(app.shortlisted),
  };
}

export const APPLICATION_PHASE_NAMES = {
  0: "None",
  1: "Committed",
  2: "Revealed",
  3: "Shortlisted",
  4: "TrialSubmitted",
};

// ── Typed read: scan ProcurementCreated events ────────────────────────────────

/**
 * Scans for ProcurementCreated events in a block range.
 * Returns array of { procurementId, jobId, employer, blockNumber, transactionHash }.
 * @param {number} fromBlock
 * @param {number|"latest"} toBlock
 * @returns {Promise<ProcurementEvent[]>}
 */
export async function scanProcurementCreatedEvents(fromBlock, toBlock = "latest") {
  const provider = getProvider();
  const iface    = new ethers.Interface(loadAbi());
  const topicHash = iface.getEvent("ProcurementCreated").topicHash;

  const filter = {
    address:   PRIME_CONTRACT,
    topics:    [topicHash],
    fromBlock,
    toBlock,
  };

  const logs = await getLogsPaginated(provider, filter, fromBlock,
    toBlock === "latest" ? await provider.getBlockNumber() : toBlock);

  return logs.map(log => {
    const decoded = iface.parseLog(log);
    return {
      procurementId:   decoded.args[0].toString(),
      jobId:           decoded.args[1].toString(),
      employer:        decoded.args[2].toLowerCase(),
      blockNumber:     log.blockNumber,
      transactionHash: log.transactionHash,
    };
  });
}

// ── Typed read: scan ShortlistFinalized events ────────────────────────────────

/**
 * Scans for ShortlistFinalized events in a block range.
 * Returns array of { procurementId, finalists, blockNumber }.
 * @param {number} fromBlock
 * @param {number|"latest"} toBlock
 * @returns {Promise<ShortlistEvent[]>}
 */
export async function scanShortlistFinalizedEvents(fromBlock, toBlock = "latest") {
  const provider = getProvider();
  const iface    = new ethers.Interface(loadAbi());
  const topicHash = iface.getEvent("ShortlistFinalized").topicHash;

  const filter = {
    address:   PRIME_CONTRACT,
    topics:    [topicHash],
    fromBlock,
    toBlock,
  };

  const logs = await getLogsPaginated(provider, filter, fromBlock,
    toBlock === "latest" ? await provider.getBlockNumber() : toBlock);

  return logs.map(log => {
    const decoded = iface.parseLog(log);
    return {
      procurementId: decoded.args[0].toString(),
      finalists:     [...decoded.args[1]].map(a => a.toLowerCase()),
      blockNumber:   log.blockNumber,
    };
  });
}

export async function scanWinnerDesignatedEvents(fromBlock, toBlock = "latest") {
  const provider = getProvider();
  const iface = new ethers.Interface([
    "event WinnerDesignated(uint256 indexed procurementId,address indexed winner)"
  ]);
  const topicHash = iface.getEvent("WinnerDesignated").topicHash;
  const upper = toBlock === "latest" ? await provider.getBlockNumber() : toBlock;
  const logs = await getLogsPaginated(provider, {
    address: PRIME_CONTRACT,
    topics: [topicHash],
    fromBlock,
    toBlock: upper,
  }, fromBlock, upper);

  return logs.map((log) => {
    const decoded = iface.parseLog(log);
    return {
      procurementId: decoded.args[0].toString(),
      winner: String(decoded.args[1]).toLowerCase(),
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      source: "event:WinnerDesignated",
    };
  });
}

// ── Utility: current block ────────────────────────────────────────────────────

export async function getCurrentBlock() {
  return getProvider().getBlockNumber();
}

export async function getBlockHash(blockNumber) {
  if (!Number.isFinite(Number(blockNumber))) return null;
  const block = await getProvider().getBlock(Number(blockNumber));
  return block?.hash ?? null;
}

export async function fetchTransactionReceipt(txHash) {
  if (!txHash) throw new Error("txHash is required");
  return getProvider().getTransactionReceipt(txHash);
}

// ── Utility: paginated getLogs (handles RPC block range limits) ───────────────

const CHUNK_SIZE = 2000;

async function getLogsPaginated(provider, filter, fromBlock, toBlock) {
  const logs = [];
  let from = fromBlock;
  while (from <= toBlock) {
    const to = Math.min(from + CHUNK_SIZE - 1, toBlock);
    try {
      const chunk = await provider.getLogs({ ...filter, fromBlock: from, toBlock: to });
      logs.push(...chunk);
    } catch (err) {
      if (err.message?.includes("block range") || err.message?.includes("limit")) {
        const mid = Math.floor((from + to) / 2);
        if (mid === from) { from = to + 1; continue; }
        const a = await provider.getLogs({ ...filter, fromBlock: from, toBlock: mid });
        const b = await provider.getLogs({ ...filter, fromBlock: mid + 1, toBlock: to });
        logs.push(...a, ...b);
      } else {
        throw err;
      }
    }
    from = to + 1;
  }
  return logs;
}

// ── Utility: compute commitment hash (pure, no signing) ───────────────────────

/**
 * Computes the commitment hash for a Prime application.
 * commitment = keccak256(abi.encodePacked(procurementId, agentAddress, applicationURI, salt))
 * This is a pure function — no signing, no network calls.
 * @param {string|number|bigint} procurementId
 * @param {string} agentAddress
 * @param {string} applicationURI  e.g. "ipfs://Qm..."
 * @param {string} salt  32-byte hex string "0x..."
 * @returns {string} bytes32 commitment hash
 */
export function computeCommitment(procurementId, agentAddress, applicationURI, salt) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["uint256", "address", "string", "bytes32"],
      [BigInt(procurementId), agentAddress, applicationURI, salt]
    )
  );
}

/**
 * Generates a random 32-byte salt as a hex string.
 * @returns {string} "0x" + 64 hex chars
 */
export function generateSalt() {
  return ethers.hexlify(ethers.randomBytes(32));
}

// ── Utility: encode calldata (no signing) ─────────────────────────────────────

/**
 * ABI-encodes a Prime contract function call without signing.
 * Returns { to, data, value } suitable for unsigned tx packaging.
 * @param {string} functionName
 * @param {any[]} args
 * @returns {{ to: string, data: string, value: string }}
 */
export function encodePrimeCall(functionName, args) {
  let iface = new ethers.Interface(loadAbi());
  let data;
  try {
    data = iface.encodeFunctionData(functionName, args);
  } catch (err) {
    const fallback = new ethers.Interface([
      "function scoreCommit(uint256 procurementId, bytes32 scoreCommitment)",
      "function scoreReveal(uint256 procurementId, uint256 score, bytes32 salt)",
    ]);
    data = fallback.encodeFunctionData(functionName, args);
    iface = fallback;
  }
  return {
    to:    PRIME_CONTRACT,
    data,
    value: "0",
  };
}

/**
 * Decodes a Prime calldata hex string to a human-readable summary.
 * @param {string} calldata hex string
 * @returns {string} decoded call description
 */
export function decodePrimeCalldata(calldata) {
  try {
    const iface = new ethers.Interface(loadAbi());
    const desc  = iface.parseTransaction({ data: calldata });
    if (!desc) return `unknown calldata: ${calldata.slice(0, 10)}`;
    const argStr = desc.args
      .map((a, i) => {
        const name = desc.fragment.inputs[i]?.name ?? `arg${i}`;
        const val  = typeof a === "bigint" ? a.toString()
                   : Array.isArray(a)     ? JSON.stringify(a.map(String))
                   : String(a);
        return `${name}=${val}`;
      })
      .join(", ");
    return `${desc.name}(${argStr})`;
  } catch {
    return `undecodable calldata: ${calldata.slice(0, 10)}`;
  }
}

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

function getErc20(tokenAddress = AGIALPHA_TOKEN) {
  return new ethers.Contract(tokenAddress, ERC20_ABI, getProvider());
}

export async function fetchErc20Balance(owner, tokenAddress = AGIALPHA_TOKEN) {
  const c = getErc20(tokenAddress);
  const bal = await c.balanceOf(owner);
  return bal.toString();
}

export async function fetchErc20Allowance(owner, spender, tokenAddress = AGIALPHA_TOKEN) {
  const c = getErc20(tokenAddress);
  const a = await c.allowance(owner, spender);
  return a.toString();
}

export function encodeErc20Approve(spender, amount, tokenAddress = AGIALPHA_TOKEN) {
  const iface = new ethers.Interface(ERC20_ABI);
  return {
    to: tokenAddress,
    data: iface.encodeFunctionData("approve", [spender, amount]),
    value: "0",
  };
}
