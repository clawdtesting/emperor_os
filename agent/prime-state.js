// prime-state.js
// Durable per-procurement state persistence.
//
// All state files live under:
//   .openclaw/workspace/artifacts/proc_<procurementId>/state.json
//
// State survives restarts. All writes are atomic (tmp + rename).
// State integrity is verified via SHA-256 hash on every read.
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
  const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
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
    procurementId:   String(procurementId),
    linkedJobId:     jobId ? String(jobId) : null,
    employer:        null,
    status:          PROC_STATUS.DISCOVERED,
    statusHistory:   [{ status: PROC_STATUS.DISCOVERED, at: now }],
    stateHash:       null,
    fitApproved:     null,
    fitDecisionAt:   null,
    applicationURI:  null,
    commitmentSalt:  null,
    commitmentHash:  null,
    commitTxHash:    null,
    revealTxHash:    null,
    shortlisted:     null,
    shortlistBlock:  null,
    acceptTxHash:    null,
    trialArtifactDir: null,
    trialURI:        null,
    trialFetchback:  null,
    trialTxHash:     null,
    selected:         null,
    selectionBlock:   null,
    jobExecutionStarted: null,
    completionURI:    null,
    completionTxHash: null,
    reviewLog:        [],
    operatorTx:       {},
    txProvenance:     [],
    stepJournal:      {},
    txHandoffs:       {},
    createdAt:        now,
    updatedAt:        now,
    lastChainSync:    null,
  };
}

// ── State integrity ───────────────────────────────────────────────────────────

function computeStateHash(data) {
  const { stateHash, stateIntegrityError, ...rest } = data;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

function attachStateHash(state) {
  state.stateHash = computeStateHash(state);
  return state;
}

function verifyStateHash(state) {
  if (!state || !state.stateHash) return { valid: false, reason: "no stateHash present" };
  const expected = computeStateHash(state);
  if (expected !== state.stateHash) {
    return { valid: false, reason: `hash mismatch: expected ${expected}, got ${state.stateHash}` };
  }
  return { valid: true };
}

// ── Read / write ──────────────────────────────────────────────────────────────

/**
 * Loads the current state for a procurement.
 * Verifies state integrity via SHA-256 hash. Returns null if no state file exists.
 * If hash verification fails, returns state with `stateIntegrityError` set.
 * @param {string|number} procurementId
 * @returns {Promise<ProcState|null>}
 */
export async function getProcState(procurementId) {
  const state = await readJson(procStatePath(procurementId), null);
  if (!state) return null;

  const integrity = verifyStateHash(state);
  if (!integrity.valid) {
    state.stateIntegrityError = {
      detectedAt: new Date().toISOString(),
      reason: integrity.reason,
    };
  }
  return state;
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
  await writeJson(procStatePath(procurementId), attachStateHash(fresh));
  return fresh;
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

export async function writeProcCheckpoint(procurementId, filename, data) {
  const dir = procRootDir(procurementId);
  await ensureDir(dir);
  await writeJson(path.join(dir, filename), data);
}

export async function readProcCheckpoint(procurementId, filename, fallback = null) {
  return readJson(path.join(procRootDir(procurementId), filename), fallback);
}

// ── Sub-directory ensure helpers ─────────────────────────────────────────────

export async function ensureProcSubdir(procurementId, sub) {
  const dir = procSubdir(procurementId, sub);
  await ensureDir(dir);
  return dir;
}

/**
 * Throws if the procurement state has an integrity error.
 * Call this before any irreversible action (tx building, status transitions).
 * @param {ProcState} state
 * @throws {Error}
 */
export function assertStateIntegrity(state) {
  if (state?.stateIntegrityError) {
    throw new Error(
      `State integrity compromised for procurement ${state.procurementId}: ` +
      `${state.stateIntegrityError.reason}. ` +
      `Do not proceed until state is restored from backup or re-inspected.`
    );
  }
}

// ── LLM call audit log (append-only) ──────────────────────────────────────────

function llmAuditLogPath(procurementId) {
  return path.join(procRootDir(procurementId), "llm_audit.json");
}

/**
 * Reads the append-only LLM call audit log for a procurement.
 * Returns { calls: Array<{phase, at, hash}> }
 */
export async function readLlmAuditLog(procurementId) {
  const data = await readJson(llmAuditLogPath(procurementId), null);
  return { calls: Array.isArray(data?.calls) ? data.calls : [] };
}

/**
 * Appends an LLM call record to the audit log.
 * The log is append-only: we read existing entries, append one, and write atomically.
 * Returns the total call count after append.
 */
export async function appendLlmCallAudit(procurementId, phase, detail = {}) {
  const log = await readLlmAuditLog(procurementId);
  const entry = {
    phase,
    at: new Date().toISOString(),
    hash: createHash("sha256").update(JSON.stringify({ procurementId: String(procurementId), phase, ...detail })).digest("hex").slice(0, 16),
    ...detail,
  };
  log.calls.push(entry);
  await ensureDir(procRootDir(procurementId));
  await writeJson(llmAuditLogPath(procurementId), log);
  return log.calls.length;
}

/**
 * Returns true if the LLM call budget has been consumed for this procurement.
 * Budget is enforced by counting entries in the append-only audit log.
 */
export async function isLlmBudgetConsumed(procurementId, maxCalls = 1) {
  const log = await readLlmAuditLog(procurementId);
  return log.calls.length >= maxCalls;
}
