#!/usr/bin/env node
/**
 * select_job.js — Pick the target job from intake artifacts
 *
 * Args:   optional jobId override
 * Reads:  /tmp/intake/analyzed.json
 * Writes: /tmp/selected_job.json
 *         /tmp/review_summary.json
 *         /tmp/validation_report.json
 * Output: GITHUB_OUTPUT lines (job_id, job_title)
 */
"use strict";

const fs = require("fs");
const { evaluateJob } = require("./job-selection-policy");

const jobIdOverride = (process.argv[2] || "").trim();

const candidates = [
  "/tmp/intake/analyzed.json",
  "/tmp/intake/tmp/analyzed.json",
];

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

let jobs = null;
for (const p of candidates) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    const jsonStart = raw.indexOf("[");
    const clean = jsonStart >= 0 ? raw.slice(jsonStart) : raw;
    jobs = JSON.parse(clean.trim());
    if (!Array.isArray(jobs)) throw new Error("not an array");
    process.stderr.write(`[select] Loaded ${jobs.length} jobs from: ${p}\n`);
    break;
  } catch (e) {
    process.stderr.write(`[select] Could not parse ${p}: ${e.message}\n`);
  }
}

if (!jobs || jobs.length === 0) {
  process.stderr.write("[select] No jobs found — cannot proceed\n");
  process.exit(1);
}

let selected = null;
if (jobIdOverride) {
  selected = jobs.find((j) => String(j.jobId) === jobIdOverride);
  if (!selected) {
    process.stderr.write(`[select] Job ID ${jobIdOverride} not found — using policy-ranked fallback\n`);
  }
}

const scored = jobs
  .map((job) => ({ job, policy: evaluateJob(job) }))
  .sort((a, b) => b.policy.policyScore - a.policy.policyScore);

if (!selected) {
  selected = scored.find((s) => s.policy.allowed && s.policy.decision === "accept")?.job
    || scored.find((s) => s.policy.allowed)?.job
    || scored[0]?.job;
}

const selectedPolicy = evaluateJob(selected);

const validationChecks = [
  {
    check: "selected_job_present",
    status: selected ? "passed" : "failed",
    details: selected ? `jobId=${selected.jobId}` : "No selected job",
  },
  {
    check: "policy_allows_selection",
    status: selectedPolicy.allowed ? "passed" : "failed",
    details: selectedPolicy.reasons.join("; "),
  },
  {
    check: "recommendation_alignment",
    status: ["accept", "review"].includes(selectedPolicy.decision) ? "passed" : "failed",
    details: `decision=${selectedPolicy.decision}`,
  },
];

const reviewSummary = {
  generatedAt: new Date().toISOString(),
  jobId: selected?.jobId ?? null,
  decision: selectedPolicy.decision,
  policyScore: selectedPolicy.policyScore,
  reasons: selectedPolicy.reasons,
};

const validationReport = {
  generatedAt: new Date().toISOString(),
  checks: validationChecks,
  status: validationChecks.some((c) => c.status === "failed") ? "failed" : "passed",
};

writeJson("/tmp/review_summary.json", reviewSummary);
writeJson("/tmp/validation_report.json", validationReport);

if (!selectedPolicy.allowed) {
  process.stderr.write(`[select] BLOCKED by policy: ${selectedPolicy.reasons.join(" | ")}\n`);
  process.exit(2);
}

process.stderr.write(`[select] Selected: jobId=${selected.jobId} \"${selected.title}\" policyScore=${selectedPolicy.policyScore} decision=${selectedPolicy.decision}\n`);

writeJson("/tmp/selected_job.json", selected);

const out = `job_id=${selected.jobId}\njob_title=${(selected.title || "").slice(0, 80)}\n`;
process.stdout.write(out);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, out);
}
