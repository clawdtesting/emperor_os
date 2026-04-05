// prime-state.js
// Durable per-procurement state persistence.
//
// All state files live under:
//   .openclaw/workspace/artifacts/proc_<procurementId>/state.json
//
// State survives restarts. All writes are atomic (tmp + rename).
// No signing. No broadcasting. Pure file I/O.

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.js";
import { PROC_STATUS, isValidTransition, assertValidTransition } from "./prime-phase-model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Directory helpers ─────────────────────────────────────────────────────────

export function procRootDir(procurementId) {
  return path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`);
}

export function procStatePath(procurementId) {
  return path.join(procRootDir(procurementId), "state.json");
}

export function procSubdir(procurementId, sub) {
  return path.join(procRootDir(procurementId), sub);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// ── Atomic JSON I/O ───────────────────────────────────────────────────────────

export async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJson(filePath, data) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

// ── Initial state factory ─────────────────────────────────────────────────────

/**
 * Returns a fresh empty state for a procurement.
 * @param {string|number} procurementId
 * @param {string} [jobId]
 * @returns {ProcState}
 */
export function emptyProcState(procurementId, jobId) {
  const now = new Date().toISOString();
  return {
    // Core identity
    procurementId:   String(procurementId),
    linkedJobId:     jobId ? String(jobId) : null,
    employer:        null,

    // Local phase tracking
    status:          PROC_STATUS.DISCOVERED,
    statusHistory:   [{ status: PROC_STATUS.DISCOVERED, at: now }],

    // State integrity hash chain — each write appends the hash of the previous state
    stateHash:       null,

    // Operator decisions
    fitApproved:     null,
    fitDecisionAt:   null,

    // Application material
    applicationURI:  null,
    commitmentSalt:  null,
    commitmentHash:  null,
    commitTxHash:    null,
    revealTxHash:    null,

    // Finalist material
    shortlisted:     null,
    shortlistBlock:  null,
    acceptTxHash:    null,

    // Trial material
    trialArtifactDir: null,
    trialURI:        null,
    trialFetchback:  null,
    trialTxHash:     null,

    // Selection / winner
    selected:         null,
    selectionBlock:   null,

    // Linked job execution
    jobExecutionStarted: null,
    completionURI:    null,
    completionTxHash: null,

    // Operator review log
    reviewLog:        [],
    operatorTx:       {},
    txProvenance:     [],
    stepJournal:      {},

    // Tx handoff paths (relative to proc root dir)
    txHandoffs:       {},

    // Timestamps
    createdAt:        now,
    updatedAt:        now,
    lastChainSync:    null,
  };
}

// ── Read / write ──────────────────────────────────────────────────────────────

/**
 * Loads the current state for a procurement.
 * Returns null if no state file exists.
 * @param {string|number} procurementId
 * @returns {Promise<ProcState|null>}
 */
export async function getProcState(procurementId) {
  return readJson(procStatePath(procurementId), null);
}

/**
 * Loads state or creates a fresh one.
 * @param {string|number} procurementId
 * @param {string} [jobId]
 * @returns {Promise<ProcState>}
 */
export async function getOrCreateProcState(procurementId, jobId) {
  const existing = await getProcState(procurementId);
  if (existing) return existing;
  const fresh = emptyProcState(procurementId, jobId);
  await ensureDir(procRootDir(procurementId));
  await writeJson(procStatePath(procurementId), fresh);
  return fresh;
}

function computeStateHash(data) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function attachStateHash(state) {
  state.stateHash = computeStateHash(state);
  return state;
}

/**
 * Applies a patch to the current procurement state.
 * If the patch includes a `status` field, transition validation is enforced
 * — the new status must be a valid next state from the current status.
 * Use forceSetProcState() only for explicit operator recovery.
 * @param {string|number} procurementId
 * @param {Partial<ProcState>} patch
 * @returns {Promise<ProcState>}
 */
export async function setProcState(procurementId, patch) {
  const now     = new Date().toISOString();
  const current = await getProcState(procurementId) ?? emptyProcState(procurementId);
  const next    = {
    ...current,
    ...patch,
    updatedAt: now,
  };

  if ("status" in patch && patch.status !== current.status) {
    assertValidTransition(current.status, patch.status);
    next.statusHistory = [
      ...(current.statusHistory ?? []),
      { status: patch.status, at: now },
    ];
  }

  await ensureDir(procRootDir(procurementId));
  await writeJson(procStatePath(procurementId), attachStateHash(next));
  return next;
}

/**
 * Forces a state patch WITHOUT transition validation.
 * ONLY for explicit operator recovery. Logs the override.
 * @param {string|number} procurementId
 * @param {Partial<ProcState>} patch
 * @param {string} [reason] - operator note for audit trail
 * @returns {Promise<ProcState>}
 */
export async function forceSetProcState(procurementId, patch, reason = "operator override") {
  const now     = new Date().toISOString();
  const current = await getProcState(procurementId) ?? emptyProcState(procurementId);
  const next    = {
    ...current,
    ...patch,
    updatedAt: now,
    forceOverrideNote: {
      reason,
      previousStatus: current.status,
      newStatus: patch.status ?? current.status,
      at: now,
    },
  };

  if ("status" in patch && patch.status !== current.status) {
    next.statusHistory = [
      ...(current.statusHistory ?? []),
      { status: patch.status, at: now, forced: true },
    ];
  }

  await ensureDir(procRootDir(procurementId));
  await writeJson(procStatePath(procurementId), attachStateHash(next));
  return next;
}

/**
 * Transitions the procurement to a new status with explicit validation.
 * Appends to statusHistory. Throws if the transition is not valid.
 * @param {string|number} procurementId
 * @param {string} newStatus  - a PROC_STATUS value
 * @param {object} [extra]    - additional fields to merge into state
 * @returns {Promise<ProcState>}
 */
export async function transitionProcStatus(procurementId, newStatus, extra = {}) {
  const current = await getProcState(procurementId);
  if (!current) throw new Error(`No state found for procurement ${procurementId}`);

  assertValidTransition(current.status, newStatus);

  const now = new Date().toISOString();
  const next = {
    ...current,
    ...extra,
    status: newStatus,
    statusHistory: [
      ...(current.statusHistory ?? []),
      { status: newStatus, at: now },
    ],
    updatedAt: now,
  };

  await writeJson(procStatePath(procurementId), attachStateHash(next));
  return next;
}

// ── Review log ────────────────────────────────────────────────────────────────

/**
 * Appends an operator review entry to the procurement state.
 * @param {string|number} procurementId
 * @param {string} phase   - e.g. "commit", "reveal", "finalist", "trial"
 * @param {string} outcome - "approved" | "rejected" | "deferred"
 * @param {string} [note]  - optional operator note
 */
export async function appendReviewLog(procurementId, phase, outcome, note = "") {
  const current = await getProcState(procurementId);
  if (!current) throw new Error(`No state found for procurement ${procurementId}`);

  const entry = {
    phase,
    outcome,
    note,
    at: new Date().toISOString(),
  };

  await setProcState(procurementId, {
    reviewLog: [...(current.reviewLog ?? []), entry],
  });
}

// ── Tx handoff registration ───────────────────────────────────────────────────

/**
 * Records the path of a generated unsigned tx handoff file in state.
 * @param {string|number} procurementId
 * @param {string} txKind   - e.g. "commitApplication", "revealApplication", etc.
 * @param {string} filePath - absolute or relative path to the unsigned tx JSON
 */
export async function recordTxHandoff(procurementId, txKind, filePath) {
  const current = await getProcState(procurementId);
  if (!current) throw new Error(`No state found for procurement ${procurementId}`);

  const txHandoffs = {
    ...(current.txHandoffs ?? {}),
    [txKind]: {
      path: filePath,
      generatedAt: new Date().toISOString(),
    },
  };

  await setProcState(procurementId, { txHandoffs });
}

export async function recordOperatorTxHash(procurementId, action, txHash, meta = {}) {
  const current = await getProcState(procurementId);
  if (!current) throw new Error(`No state found for procurement ${procurementId}`);
  const operatorTx = {
    ...(current.operatorTx ?? {}),
    [action]: {
      txHash,
      status: "submitted",
      submittedAt: new Date().toISOString(),
      ...meta,
    },
  };
  return setProcState(procurementId, { operatorTx });
}

export async function bindFinalizedTxReceipt(procurementId, action, receipt, meta = {}) {
  const current = await getProcState(procurementId);
  if (!current) throw new Error(`No state found for procurement ${procurementId}`);
  const existing = current.operatorTx?.[action] ?? {};
  const operatorTx = {
    ...(current.operatorTx ?? {}),
    [action]: {
      ...existing,
      status: "finalized",
      finalizedAt: new Date().toISOString(),
      receipt: {
        transactionHash: receipt.transactionHash,
        status: receipt.status,
        blockNumber: Number(receipt.blockNumber),
      },
      ...meta,
    },
  };
  const txProvenance = [
    ...(current.txProvenance ?? []),
    {
      action,
      txHash: receipt.transactionHash,
      status: receipt.status,
      blockNumber: Number(receipt.blockNumber),
      finalizedAt: new Date().toISOString(),
    },
  ];
  return setProcState(procurementId, { operatorTx, txProvenance });
}

// ── List all tracked procurements ─────────────────────────────────────────────

/**
 * Lists all proc_<id> directories and loads their state.json.
 * @returns {Promise<ProcState[]>} sorted by updatedAt descending
 */
export async function listAllProcStates() {
  const artifactsDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts");
  let entries;
  try {
    entries = await fs.readdir(artifactsDir);
  } catch {
    return [];
  }

  const procDirs = entries.filter(e => e.startsWith("proc_"));
  const states   = [];

  for (const dir of procDirs) {
    const stateFile = path.join(artifactsDir, dir, "state.json");
    const state     = await readJson(stateFile, null);
    if (state) states.push(state);
  }

  states.sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return tb - ta;
  });

  return states;
}

/**
 * Lists procurements that are in active (non-terminal) states.
 * @returns {Promise<ProcState[]>}
 */
export async function listActiveProcurements() {
  const all = await listAllProcStates();
  return all.filter(s => {
    const terminal = new Set([
      PROC_STATUS.NOT_A_FIT,
      PROC_STATUS.DONE,
      PROC_STATUS.REJECTED,
      PROC_STATUS.NOT_SHORTLISTED,
      PROC_STATUS.EXPIRED,
    ]);
    return !terminal.has(s.status);
  });
}

// ── Checkpoint helpers ────────────────────────────────────────────────────────

/**
 * Writes a named checkpoint file inside the proc artifact directory.
 * Useful for "chain_snapshot.json", "deadlines.json", "next_action.json".
 * @param {string|number} procurementId
 * @param {string} filename  - just the filename, no path
 * @param {object} data
 */
export async function writeProcCheckpoint(procurementId, filename, data) {
  const dir = procRootDir(procurementId);
  await ensureDir(dir);
  await writeJson(path.join(dir, filename), data);
}

/**
 * Reads a named checkpoint file.
 * @param {string|number} procurementId
 * @param {string} filename
 * @param {*} fallback
 */
export async function readProcCheckpoint(procurementId, filename, fallback = null) {
  return readJson(path.join(procRootDir(procurementId), filename), fallback);
}

// ── Sub-directory ensure helpers ─────────────────────────────────────────────

/**
 * Ensures a phase sub-directory exists under the proc artifact dir.
 * e.g. ensureProcSubdir(id, "application") → .../proc_<id>/application/
 */
export async function ensureProcSubdir(procurementId, sub) {
  const dir = procSubdir(procurementId, sub);
  await ensureDir(dir);
  return dir;
}
