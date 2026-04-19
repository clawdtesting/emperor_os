// ./agent/state.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { CONFIG } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const STATE_ROOT = path.join(__dirname, "state");
const ARCHIVE_INDEX_DIR = path.join(CONFIG.WORKSPACE_ROOT, "archive", "state_index");
export const JOBS_DIR = path.join(STATE_ROOT, "jobs");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureStateDirs() {
  await ensureDir(STATE_ROOT);
  await ensureDir(JOBS_DIR);
}

const VERSIONED_JOB_ID_RE = /^(v\d+|prime)_\d+$/;

export function normalizeJobId(jobId) {
  const raw = String(jobId ?? "").trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid jobId: ${JSON.stringify(jobId)}`);
  }
  return raw;
}

export function buildVersionedJobId(version, rawJobId) {
  return `${version}_${normalizeJobId(rawJobId)}`;
}

export function isVersionedJobId(id) {
  return VERSIONED_JOB_ID_RE.test(String(id ?? "").trim());
}

export function parseVersionedJobId(id) {
  const raw = String(id ?? "").trim();
  const match = raw.match(/^(v\d+|prime)_(\d+)$/);
  if (!match) return { version: null, jobId: raw };
  return { version: match[1], jobId: match[2] };
}

/**
 * Extract the raw numeric job ID from a potentially versioned ID.
 * "v2_123" → 123, "v1_456" → 456, "789" → 789
 */
export function rawJobId(id) {
  const { jobId } = parseVersionedJobId(id);
  return Number(jobId);
}

export function resolveJobId(id) {
  if (isVersionedJobId(id)) return id;
  return id;
}

export function jobStatePath(jobId) {
  const resolved = resolveJobId(jobId);
  return path.join(JOBS_DIR, `${resolved}.json`);
}

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
  const tmp = `${filePath}.tmp.${Date.now()}.${Buffer.from(filePath).toString("hex").slice(0, 6)}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

export async function getJobState(jobId) {
  return readJson(jobStatePath(jobId), null);
}

// ── State machine ─────────────────────────────────────────────────────────────

const JOB_STATUS = {
  QUEUED: "queued",
  SCORED: "scored",
  APPLICATION_PENDING_REVIEW: "application_pending_review",
  APPLIED: "applied",
  ASSIGNMENT_PENDING: "assignment_pending",
  ASSIGNED: "assigned",
  WORKING: "working",
  DELIVERABLE_READY: "deliverable_ready",
  PUBLICATION_PENDING: "publication_pending",
  COMPLETION_PENDING_REVIEW: "completion_pending_review",
  SUBMITTED: "submitted",
  COMPLETED: "completed",
  DISPUTED: "disputed",
  FAILED: "failed",
  REJECTED: "rejected",
  EXPIRED: "expired",
  SKIPPED: "skipped",
};

const TERMINAL_STATUSES = new Set([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.DISPUTED,
  JOB_STATUS.FAILED,
  JOB_STATUS.REJECTED,
  JOB_STATUS.EXPIRED,
  JOB_STATUS.SKIPPED,
]);

const VALID_TRANSITIONS = {
  [JOB_STATUS.QUEUED]: [JOB_STATUS.SCORED, JOB_STATUS.SKIPPED],
  [JOB_STATUS.SCORED]: [JOB_STATUS.APPLICATION_PENDING_REVIEW, JOB_STATUS.SKIPPED],
  [JOB_STATUS.APPLICATION_PENDING_REVIEW]: [
    JOB_STATUS.ASSIGNMENT_PENDING,
    JOB_STATUS.APPLIED,
    JOB_STATUS.ASSIGNED,
    JOB_STATUS.REJECTED,
    JOB_STATUS.EXPIRED,
    JOB_STATUS.FAILED,
  ],
  [JOB_STATUS.APPLIED]: [
    JOB_STATUS.ASSIGNMENT_PENDING,
    JOB_STATUS.ASSIGNED,
    JOB_STATUS.REJECTED,
    JOB_STATUS.EXPIRED,
    JOB_STATUS.FAILED,
  ],
  [JOB_STATUS.ASSIGNMENT_PENDING]: [
    JOB_STATUS.ASSIGNED,
    JOB_STATUS.REJECTED,
    JOB_STATUS.EXPIRED,
    JOB_STATUS.FAILED,
  ],
  [JOB_STATUS.ASSIGNED]: [JOB_STATUS.WORKING, JOB_STATUS.DELIVERABLE_READY, JOB_STATUS.FAILED],
  [JOB_STATUS.WORKING]: [JOB_STATUS.ASSIGNED, JOB_STATUS.DELIVERABLE_READY, JOB_STATUS.FAILED],
  [JOB_STATUS.DELIVERABLE_READY]: [
    JOB_STATUS.PUBLICATION_PENDING,
    JOB_STATUS.COMPLETION_PENDING_REVIEW,
    JOB_STATUS.FAILED,
  ],
  [JOB_STATUS.PUBLICATION_PENDING]: [
    JOB_STATUS.DELIVERABLE_READY,
    JOB_STATUS.COMPLETION_PENDING_REVIEW,
    JOB_STATUS.FAILED,
  ],
  [JOB_STATUS.COMPLETION_PENDING_REVIEW]: [JOB_STATUS.SUBMITTED, JOB_STATUS.FAILED, JOB_STATUS.DELIVERABLE_READY],
  [JOB_STATUS.SUBMITTED]: [JOB_STATUS.COMPLETED, JOB_STATUS.DISPUTED, JOB_STATUS.FAILED],
};

function isValidJobTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return TERMINAL_STATUSES.has(to);
  return allowed.includes(to);
}

export function assertValidJobTransition(from, to) {
  if (!isValidJobTransition(from, to)) {
    const allowed = VALID_TRANSITIONS[from] ?? [];
    throw new Error(
      `Invalid job state transition: "${from}" → "${to}". ` +
      `Allowed: ${allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"}`
    );
  }
}

export async function transitionJobStatus(jobId, newStatus, extra = {}) {
  const current = await getJobState(jobId);
  if (!current) throw new Error(`job ${jobId} state not found`);

  assertValidJobTransition(current.status, newStatus);

  const now = new Date().toISOString();
  const next = {
    ...current,
    ...extra,
    status: newStatus,
    statusHistory: [...(current.statusHistory ?? []), { status: newStatus, at: now }],
    updatedAt: now,
  };

  await writeJson(jobStatePath(jobId), next);
  return next;
}

export async function setJobState(jobId, patch) {
  const now = new Date().toISOString();
  const current =
    (await getJobState(jobId)) ??
    {
      jobId,
      status: "queued",
      operatorTx: {},
      stageIdempotency: {},
      attempts: {
        apply: 0,
        execute: 0,
        submit: 0
      },
      createdAt: now,
      updatedAt: now
    };

  const next = {
    ...current,
    ...patch,
    attempts: {
      ...current.attempts,
      ...(patch.attempts ?? {})
    },
    updatedAt: now
  };

  if ("status" in patch && patch.status !== current.status) {
    assertValidJobTransition(current.status, patch.status);
    next.statusHistory = [...(current.statusHistory ?? []), { status: patch.status, at: now }];
  }

  await writeJson(jobStatePath(jobId), next);
  return next;
}

export async function claimJobStageIdempotency(jobId, stage, key) {
  const state = await getJobState(jobId);
  if (!state) return { claimed: false, reason: "missing-job-state" };
  const existing = state.stageIdempotency?.[stage];
  if (existing?.key === key) {
    return { claimed: false, reason: "duplicate-key", existing };
  }
  await setJobState(jobId, {
    stageIdempotency: {
      ...(state.stageIdempotency ?? {}),
      [stage]: {
        key,
        claimedAt: new Date().toISOString(),
      }
    }
  });
  return { claimed: true };
}

export async function recordOperatorTxHash(jobId, action, txHash, meta = {}) {
  const state = await getJobState(jobId);
  if (!state) throw new Error(`job ${jobId} state not found`);
  return setJobState(jobId, {
    operatorTx: {
      ...(state.operatorTx ?? {}),
      [action]: {
        txHash,
        status: "submitted",
        submittedAt: new Date().toISOString(),
        ...meta,
      }
    }
  });
}

export async function bindFinalizedOperatorReceipt(jobId, action, receipt, meta = {}) {
  const state = await getJobState(jobId);
  if (!state) throw new Error(`job ${jobId} state not found`);
  const existing = state.operatorTx?.[action] ?? {};
  return setJobState(jobId, {
    operatorTx: {
      ...(state.operatorTx ?? {}),
      [action]: {
        ...existing,
        status: "finalized",
        finalizedAt: new Date().toISOString(),
        receiptRef: {
          txHash: receipt.transactionHash,
          blockNumber: Number(receipt.blockNumber),
          status: Number(receipt.status),
        },
        ...meta,
      }
    }
  });
}

export async function listAllJobStates() {
  await ensureStateDirs();
  const files = await fs.readdir(JOBS_DIR);
  const out = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const fullPath = path.join(JOBS_DIR, file);
    const data = await readJson(fullPath, null);
    if (data) out.push(data);
  }

  out.sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return tb - ta;
  });

  return out;
}

const TERMINAL_RETENTION_STATUSES = new Set([
  "failed",
  "submitted",
  "completed",
  "cancelled",
  "canceled",
  "closed",
  "expired",
  "disputed"
]);

function toTimestamp(value) {
  const ts = Date.parse(String(value ?? ""));
  return Number.isFinite(ts) ? ts : 0;
}

async function ensureArchiveIndexDir() {
  await fs.mkdir(ARCHIVE_INDEX_DIR, { recursive: true });
}

async function writeArchiveIndexEntry(job) {
  const entry = {
    jobId: String(job.jobId),
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    archivedAt: new Date().toISOString(),
    artifactDir: job.artifactDir ?? null,
    deliverablePath: job.deliverablePath ?? null,
    specPath: job.specPath ?? null,
    stateHash: job.stateHash ?? null,
    removalReason: job.removalReason ?? null,
  };
  const hash = createHash("sha256").update(JSON.stringify(entry)).digest("hex").slice(0, 12);
  const indexFile = path.join(ARCHIVE_INDEX_DIR, `${entry.jobId}_${hash}.json`);
  await fs.writeFile(indexFile, JSON.stringify(entry, null, 2), "utf8");
  return indexFile;
}

export async function pruneStateFiles() {
  const jobs = await listAllJobStates();
  if (jobs.length === 0) return { removed: 0, reason: "no-state" };

  const nowMs = Date.now();
  const ttlMs = Math.max(0, Number(CONFIG.STATE_TTL_DAYS ?? 0)) * 24 * 60 * 60 * 1000;
  const maxFiles = Math.max(0, Number(CONFIG.MAX_STATE_FILES ?? 0));

  const terminalJobs = jobs.filter((job) =>
    TERMINAL_RETENTION_STATUSES.has(String(job.status ?? "").toLowerCase())
  );

  const toRemove = new Set();

  if (ttlMs > 0) {
    for (const job of terminalJobs) {
      const ts = toTimestamp(job.updatedAt ?? job.createdAt);
      if (!ts) continue;
      if (nowMs - ts > ttlMs) {
        toRemove.add(String(job.jobId));
      }
    }
  }

  if (maxFiles > 0 && jobs.length - toRemove.size > maxFiles) {
    const overflow = jobs.length - toRemove.size - maxFiles;
    const orderedTerminal = [...terminalJobs].sort(
      (a, b) => toTimestamp(a.updatedAt ?? a.createdAt) - toTimestamp(b.updatedAt ?? b.createdAt)
    );

    for (const job of orderedTerminal) {
      if (toRemove.size >= overflow) break;
      toRemove.add(String(job.jobId));
    }
  }

  let removed = 0;
  const archived = [];
  await ensureArchiveIndexDir();

  for (const jobId of toRemove) {
    const job = jobs.find((j) => String(j.jobId) === jobId);
    if (job) {
      job.removalReason = ttlMs > 0 && nowMs - toTimestamp(job.updatedAt ?? job.createdAt) > ttlMs
        ? "ttl-expired"
        : "max-files-overflow";
      const indexFile = await writeArchiveIndexEntry(job);
      archived.push(indexFile);
    }
    await fs.rm(jobStatePath(jobId), { force: true });
    removed += 1;
  }

  return {
    removed,
    archived,
    total: jobs.length,
    ttlDays: CONFIG.STATE_TTL_DAYS,
    maxStateFiles: CONFIG.MAX_STATE_FILES,
    archiveIndexDir: ARCHIVE_INDEX_DIR,
  };
}
