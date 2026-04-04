// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/state.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const STATE_ROOT = path.join(__dirname, "state");
export const JOBS_DIR = path.join(STATE_ROOT, "jobs");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureStateDirs() {
  await ensureDir(STATE_ROOT);
  await ensureDir(JOBS_DIR);
}

export function normalizeJobId(jobId) {
  const raw = String(jobId ?? "").trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid jobId: ${JSON.stringify(jobId)}`);
  }
  return raw;
}

export function jobStatePath(jobId) {
  const normalizedJobId = normalizeJobId(jobId);
  return path.join(JOBS_DIR, `${normalizedJobId}.json`);
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
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

export async function getJobState(jobId) {
  return readJson(jobStatePath(jobId), null);
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
  for (const jobId of toRemove) {
    await fs.rm(jobStatePath(jobId), { force: true });
    removed += 1;
  }

  return {
    removed,
    total: jobs.length,
    ttlDays: CONFIG.STATE_TTL_DAYS,
    maxStateFiles: CONFIG.MAX_STATE_FILES
  };
}
