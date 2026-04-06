// /home/emperor/.openclaw/workspace/agent/discover.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { listJobs, getJob, fetchJobSpec } from "./mcp.js";
import { listAllJobStates, getJobState, setJobState, normalizeJobId } from "./state.js";
import { CONFIG } from "./config.js";
import { normalizeJob, parsePayoutNumber } from "./job-normalize.js";
import { ensureJobArtifactDir, getJobArtifactPaths, writeJson } from "./artifact-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEBUG_DIR = path.join(__dirname, "debug");

async function ensureDebugDir() {
  await fs.mkdir(DEBUG_DIR, { recursive: true });
}

async function writeDebugJson(name, data) {
  await ensureDebugDir();
  const filePath = path.join(DEBUG_DIR, name);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function inferCategoryFromSpec(spec) {
  if (!spec || typeof spec !== "object") return "other";
  const p = spec.properties && typeof p === "object" ? p : spec.properties;
  return (
    (p && p.category) ||
    spec.category ||
    "other"
  );
}

function inferTitleFromSpec(spec, fallback = "Untitled job") {
  if (!spec || typeof spec !== "object") return fallback;
  const p = spec.properties && typeof spec.properties === "object" ? spec.properties : {};
  return p.title ?? spec.title ?? fallback;
}

function inferDetailsFromSpec(spec, fallback = "") {
  if (!spec || typeof spec !== "object") return fallback;
  const p = spec.properties && typeof spec.properties === "object" ? spec.properties : {};
  return p.details ?? p.summary ?? spec.description ?? fallback;
}

function inferDurationSeconds(spec, fallback = null) {
  if (!spec || typeof spec !== "object") return fallback;
  const p = spec.properties && typeof spec.properties === "object" ? spec.properties : {};
  return p.durationSeconds ?? fallback;
}

function parseDurationToSeconds(durationValue) {
  if (durationValue == null) return null;
  if (typeof durationValue === "number") return durationValue;

  const s = String(durationValue).trim().toLowerCase();
  const match = s.match(/^(\d+)\s*(day|days|hour|hours|minute|minutes|second|seconds)$/);
  if (!match) return null;

  const n = Number(match[1]);
  const unit = match[2];

  if (unit.startsWith("day")) return n * 86400;
  if (unit.startsWith("hour")) return n * 3600;
  if (unit.startsWith("minute")) return n * 60;
  if (unit.startsWith("second")) return n;
  return null;
}

function classifyJob(job, ourAddress) {
  const status = String(job.status ?? "").trim().toLowerCase();
  const assignedAgent = String(job.assignedAgent ?? "").toLowerCase();
  const ours = String(ourAddress ?? "").toLowerCase();

  if (["completed", "disputed", "cancelled", "canceled", "closed", "expired"].includes(status)) {
    return { action: "skip", reason: status };
  }

  if (status === "assigned") {
    if (ours && assignedAgent === ours) {
      return { action: "track-assigned", reason: "already assigned to us" };
    }
    return { action: "skip", reason: "assigned to another agent" };
  }

  if (["open", "created", "active", "available", ""].includes(status)) {
    return { action: "candidate", reason: "open" };
  }

  return { action: "skip", reason: `unknown status: ${job.status}` };
}

async function countActivePipelineStates() {
  const all = await listAllJobStates();
  return all.filter((j) =>
    ["queued", "scored", "assignment_pending", "assigned", "working", "deliverable_ready", "completion_pending_review"].includes(j.status)
  ).length;
}

export async function discover() {
  const activeCount = await countActivePipelineStates();
  if (activeCount >= CONFIG.MAX_ACTIVE_JOBS) {
    console.log(`[discover] max active reached (${activeCount}/${CONFIG.MAX_ACTIVE_JOBS})`);
    return;
  }

  const jobs = await listJobs();
  await writeDebugJson("list_jobs.json", jobs);

  const sliced = jobs.slice(0, CONFIG.DISCOVER_LIMIT);

  let discovered = 0;
  let skipped = 0;
  let trackedAssigned = 0;

  for (const entry of sliced) {
    const rough = normalizeJob(entry);

    if (!rough?.jobId && rough?.jobId !== 0) {
      console.log("[discover] skip: missing jobId in list_jobs entry");
      skipped += 1;
      continue;
    }

    try {
      normalizeJobId(rough.jobId);
    } catch {
      console.log(`[discover] skip invalid jobId from list_jobs: ${JSON.stringify(rough.jobId)}`);
      skipped += 1;
      continue;
    }

    const existing = await getJobState(rough.jobId);
    if (existing) {
      console.log(`[discover] skip ${rough.jobId}: already in state (${existing.status})`);
      skipped += 1;
      continue;
    }

    let fullJobRaw;
    try {
      fullJobRaw = await getJob(rough.jobId);
      await writeDebugJson(`get_job_${rough.jobId}.json`, fullJobRaw);
    } catch (err) {
      console.error(`[discover] skip ${rough.jobId}: get_job failed: ${err.message}`);
      skipped += 1;
      continue;
    }

    const fullJob = normalizeJob(fullJobRaw);

    if (!fullJob || (fullJob.jobId == null && fullJob.jobId !== 0)) {
      console.log(`[discover] skip ${rough.jobId}: normalized get_job missing jobId`);
      skipped += 1;
      continue;
    }

    const classification = classifyJob(fullJob, CONFIG.AGENT_ADDRESS);

    if (classification.action === "skip") {
      console.log(`[discover] skip ${fullJob.jobId}: ${classification.reason}`);
      skipped += 1;
      continue;
    }

    let spec = null;
    try {
      spec = await fetchJobSpec(fullJob.jobId);
      await writeDebugJson(`fetch_job_spec_${fullJob.jobId}.json`, spec);
    } catch (err) {
      console.error(`[discover] spec fetch failed for ${fullJob.jobId}: ${err.message}`);
    }

    await ensureJobArtifactDir(fullJob.jobId);
    const artifactPaths = getJobArtifactPaths(fullJob.jobId);

    if (spec) {
      await writeJson(artifactPaths.rawSpec, spec);
    }

    const payout = parsePayoutNumber(fullJob.payout);
    const category = inferCategoryFromSpec(spec);
    const title = inferTitleFromSpec(spec, `Job ${fullJob.jobId}`);
    const details = inferDetailsFromSpec(spec, fullJob.details ?? "");
    const durationSeconds =
      inferDurationSeconds(spec, null) ?? parseDurationToSeconds(fullJob.raw?.duration);

    if (classification.action === "track-assigned") {
      await setJobState(fullJob.jobId, {
        status: "assigned",
        source: "agialpha-mcp",
        discoveredAt: new Date().toISOString(),
        title,
        category,
        payout: String(payout),
        durationSeconds,
        specUri: fullJob.jobSpecURI ?? null,
        details,
        assignedAt: new Date().toISOString(),
        assignedAgent: fullJob.assignedAgent,
        rawJob: fullJob.raw,
        rawSpec: spec,
        artifactDir: artifactPaths.dir
      });

      console.log(`[discover] tracked already-assigned job ${fullJob.jobId} for our wallet`);
      trackedAssigned += 1;
      continue;
    }

    await setJobState(fullJob.jobId, {
      status: "queued",
      source: "agialpha-mcp",
      discoveredAt: new Date().toISOString(),
      title,
      category,
      payout: String(payout),
      durationSeconds,
      specUri: fullJob.jobSpecURI ?? null,
      details,
      rawJob: fullJob.raw,
      rawSpec: spec,
      artifactDir: artifactPaths.dir
    });

    console.log(
      `[discover] queued ${fullJob.jobId}: payout=${payout} category=${category} title=${JSON.stringify(title)}`
    );

    discovered += 1;
  }

  console.log(
    `[discover] discovered=${discovered} trackedAssigned=${trackedAssigned} skipped=${skipped}`
  );
}
