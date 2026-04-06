import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { CONFIG } from "./config.js";
import { jobStatePath, listAllJobStates } from "./state.js";

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

const ARCHIVE_INDEX_DIR = path.join(CONFIG.WORKSPACE_ROOT, "archive", "state_index");

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
    const targetRemovalCount = toRemove.size + overflow;
    const orderedTerminal = [...terminalJobs].sort(
      (a, b) => toTimestamp(a.updatedAt ?? a.createdAt) - toTimestamp(b.updatedAt ?? b.createdAt)
    );

    for (const job of orderedTerminal) {
      if (toRemove.size >= targetRemovalCount) break;
      toRemove.add(String(job.jobId));
    }
  }

  let removed = 0;
  const archived = [];
  await ensureArchiveIndexDir();

  for (const jobId of toRemove) {
    const job = jobs.find(j => String(j.jobId) === jobId);
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
