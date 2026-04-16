import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureStateDirs, jobStatePath, writeJson } from "../state.js";
import { ensureJobArtifactDir, getJobArtifactPaths } from "../artifact-manager.js";
import { execute } from "../execute.js";
import { validate } from "../validate.js";
import { submit } from "../submit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const out = {
    jobMd: path.join(ROOT, "AGIJobManager-v1-test-job.md"),
    jobId: "v1_990001",
    withSubmit: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = String(argv[i] || "").trim();
    if (a === "--job-md") out.jobMd = path.resolve(ROOT, String(argv[i + 1] || ""));
    if (a === "--job-id") out.jobId = String(argv[i + 1] || out.jobId).trim();
    if (a === "--skip-submit") out.withSubmit = false;
  }

  return out;
}

function cleanLines(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function section(lines, label) {
  const idx = lines.findIndex((l) => l.toLowerCase() === label.toLowerCase());
  if (idx < 0) return [];
  const out = [];
  for (let i = idx + 1; i < lines.length; i += 1) {
    const v = lines[i];
    if (/^(deliverables|acceptance criteria|requirements|category|payout|duration|employer:)/i.test(v)) break;
    out.push(v);
  }
  return out;
}

function parseTestJobMarkdown(raw) {
  const lines = cleanLines(raw);

  const title = lines[3] || "AGIJobManager v1 Test Job";
  const categoryPrimary = lines[0] || "development";
  const categorySecondary = lines[1] || "analysis";
  const category = String(categoryPrimary || "other").toLowerCase();

  const deliverables = section(lines, "Deliverables");
  const acceptanceCriteria = section(lines, "Acceptance criteria");
  const requirements = section(lines, "Requirements");

  const details = [
    "Test execution from AGIJobManager-v1-test-job.md",
    title,
    "",
    "Deliverables:",
    ...deliverables,
    "",
    "Acceptance criteria:",
    ...acceptanceCriteria,
    "",
    "Requirements:",
    ...requirements,
  ].join("\n");

  return {
    title,
    category,
    tags: [categoryPrimary, categorySecondary].filter(Boolean),
    details,
    deliverables,
    acceptanceCriteria,
    requirements,
    rawText: raw,
  };
}

async function seedAssignedState(jobId, parsed) {
  await ensureStateDirs();
  await ensureJobArtifactDir(jobId);
  const artifactPaths = getJobArtifactPaths(jobId);

  const now = new Date().toISOString();
  const state = {
    jobId,
    source: "manual-v1-test",
    status: "assigned",
    title: parsed.title,
    category: parsed.category,
    payout: "10000",
    durationSeconds: 172800,
    details: parsed.details,
    rawSpec: {
      schema: "agijobmanager/job-spec/v1",
      kind: "job-spec",
      properties: {
        title: parsed.title,
        category: parsed.category,
        tags: parsed.tags,
        details: parsed.details,
        deliverables: parsed.deliverables,
        acceptanceCriteria: parsed.acceptanceCriteria,
        requirements: parsed.requirements,
        payoutAGIALPHA: "10000",
        durationSeconds: 172800,
      },
    },
    assignedAgent: process.env.AGENT_ADDRESS || "local-test-agent",
    assignedAt: now,
    artifactDir: artifactPaths.dir,
    operatorTx: {
      apply: {
        status: "finalized",
        txHash: "0xtest-apply-not-broadcast",
      },
    },
    stageIdempotency: {},
    attempts: { apply: 1, execute: 0, submit: 0 },
    statusHistory: [
      { status: "queued", at: now },
      { status: "scored", at: now },
      { status: "application_pending_review", at: now },
      { status: "assigned", at: now },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await writeJson(jobStatePath(jobId), state);
  return state;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(args.jobMd, "utf8");
  const parsed = parseTestJobMarkdown(raw);

  await seedAssignedState(args.jobId, parsed);
  console.log(`[v1-test] seeded assigned state for ${args.jobId}`);

  await execute();
  await validate();

  if (args.withSubmit) {
    await submit();
  } else {
    console.log("[v1-test] --skip-submit enabled: stopping after validate stage");
  }

  console.log(`[v1-test] complete for ${args.jobId}`);
}

main().catch((err) => {
  console.error(`[v1-test] fatal: ${err.message}`);
  process.exit(1);
});
