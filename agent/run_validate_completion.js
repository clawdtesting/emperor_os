#!/usr/bin/env node
"use strict";

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { getJobState } from "./state.js";
import { getJobArtifactDir, readJson, writeJson } from "./artifact-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseInput(raw) {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Missing input");
  if (s.startsWith("ipfs://")) return { mode: "remote", uri: s };
  if (/^(v1|v2|prime)_\d+$/i.test(s)) return { mode: "local", jobId: s.toLowerCase() };
  if (/^\d+$/.test(s)) return { mode: "local", jobId: `v1_${s}` };
  throw new Error("Invalid input. Use <jobId> or ipfs://...");
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function listFilesRecursive(root) {
  const out = [];
  async function walk(cur) {
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      const fp = path.join(cur, e.name);
      if (e.isDirectory()) await walk(fp);
      else out.push(fp);
    }
  }
  await walk(root);
  return out;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function safetySelfCheck() {
  const forbidden = [
    { label: "ethers.Wallet", regex: /ethers\s*\.\s*Wallet/ },
    { label: "sendTransaction", regex: /\bsendTransaction\s*\(/ },
    { label: "signTransaction", regex: /\bsignTransaction\s*\(/ },
    { label: "broadcast", regex: /\bbroadcast\s*\(/ },
    { label: "PRIVATE_KEY", regex: /\bPRIVATE_KEY\b/ },
    { label: "process.env.PRIVATE_KEY", regex: /process\s*\.\s*env\s*\.\s*PRIVATE_KEY/ }
  ];

  const scanFiles = [
    path.join(__dirname, "submit.js"),
    path.join(__dirname, "tx-builder.js"),
    path.join(__dirname, "reconcile-completion.js")
  ];

  for (const f of scanFiles) {
    if (!(await exists(f))) continue;
    const c = await fs.readFile(f, "utf8");
    for (const chk of forbidden) {
      if (chk.regex.test(c)) {
        throw new Error(`[run_validate_completion] SAFETY VIOLATION: '${chk.label}' found in ${f}`);
      }
    }
  }
  console.log("[run_validate_completion] Safety self-check passed: no signing/broadcast/private-key patterns detected.");
}

async function verifyManifest(artifactDir, manifest) {
  const issues = [];
  let verified = 0;
  for (const a of manifest.artifacts || []) {
    const fp = path.join(artifactDir, a.relativePath);
    if (!(await exists(fp))) {
      issues.push(`missing file: ${a.relativePath}`);
      continue;
    }
    const buf = await fs.readFile(fp);
    const h = sha256(buf);
    const st = await fs.stat(fp);
    if (h !== a.sha256 || st.size !== a.sizeBytes) {
      issues.push(`hash/size mismatch: ${a.relativePath}`);
      continue;
    }
    verified += 1;
  }
  return { ok: issues.length === 0, verified, total: (manifest.artifacts || []).length, issues };
}

function containsPlaceholder(text) {
  const re = /(TODO|lorem ipsum|mock only)/i;
  return re.test(text || "");
}

function scoreFromChecks(checks) {
  const artifactIntegrityScore = checks.manifest.ok ? 1 : 0.2;
  const deliverableCompletenessScore = checks.deliverable.exists && checks.deliverable.nonEmpty ? 1 : 0.1;
  const specCoverageScore = checks.completionSummary.nonEmpty ? 0.8 : 0.2;
  const evidenceQualityScore = (checks.validation.passed ? 0.5 : 0) + (checks.ipfs.ok ? 0.5 : 0.2);
  const safetyScore = checks.humanReviewRequired ? 1 : 0.2;
  const overallScore = Number(((artifactIntegrityScore + deliverableCompletenessScore + specCoverageScore + evidenceQualityScore + safetyScore) / 5).toFixed(3));

  let recommendedValidatorAction = "needs_human_review";
  if (!checks.manifest.ok) recommendedValidatorAction = "invalid_bundle";
  else if (!checks.validation.passed || !checks.deliverable.nonEmpty) recommendedValidatorAction = "reject_candidate";
  else if (overallScore >= 0.85) recommendedValidatorAction = "approve_candidate";

  return { artifactIntegrityScore, deliverableCompletenessScore, specCoverageScore, evidenceQualityScore, safetyScore, overallScore, recommendedValidatorAction };
}

async function main() {
  const inputArg = process.argv[2];
  const forceFlag = process.argv.includes("--force");
  if (!inputArg || inputArg === "--force") {
    console.error("Usage: node agent/run_validate_completion.js <jobId-or-uri> [--force]");
    process.exit(1);
  }

  await safetySelfCheck();
  const parsed = parseInput(inputArg);

  if (parsed.mode === "remote") {
    console.error("[run_validate_completion] Remote IPFS mode TODO. Use local fixture/job mode for now.");
    process.exit(1);
  }

  const jobId = parsed.jobId;
  const artifactDir = getJobArtifactDir(jobId);
  const reportPath = path.join(artifactDir, "validator_report.json");
  const packetPath = path.join(artifactDir, "validator_review_packet.json");

  if (!forceFlag && (await exists(reportPath) || await exists(packetPath))) {
    console.log(`[run_validate_completion] Idempotency skip for ${jobId}: validator artifacts already exist.`);
    console.log(`[run_validate_completion] Existing validator report: ${reportPath}`);
    console.log(`[run_validate_completion] Existing validator review packet: ${packetPath}`);
    console.log("[run_validate_completion] Use --force to regenerate.");
    process.exit(0);
  }

  const required = [
    "job_completion.json",
    "artifact_manifest.json",
    "validation_report.json",
    "storage_publish_report.json",
    "ipfs_verification.json",
    "deliverables/deliverable.md"
  ];

  for (const rel of required) {
    const fp = path.join(artifactDir, rel);
    if (!(await exists(fp))) throw new Error(`Missing required input file: ${rel}`);
  }

  const jobCompletion = await readJson(path.join(artifactDir, "job_completion.json"));
  const artifactManifest = await readJson(path.join(artifactDir, "artifact_manifest.json"));
  const validationReport = await readJson(path.join(artifactDir, "validation_report.json"));
  const storagePublishReport = await readJson(path.join(artifactDir, "storage_publish_report.json"));
  const ipfsVerification = await readJson(path.join(artifactDir, "ipfs_verification.json"));
  const deliverableText = await fs.readFile(path.join(artifactDir, "deliverables", "deliverable.md"), "utf8");
  const jobState = await getJobState(jobId);

  const checks = {
    manifest: await verifyManifest(artifactDir, artifactManifest),
    validation: { passed: validationReport?.passed === true },
    ipfs: { ok: ipfsVerification?.ok === true },
    deliverable: { exists: true, nonEmpty: deliverableText.trim().length > 0, placeholdersFound: containsPlaceholder(deliverableText) },
    completionSummary: { nonEmpty: String(jobCompletion?.completionSummary || "").trim().length > 0 },
    humanReviewRequired: jobCompletion?.humanReviewRequired === true
  };

  const reasons = [];
  if (!jobCompletion?.schema) reasons.push("job_completion.json missing schema");
  if (!checks.manifest.ok) reasons.push(...checks.manifest.issues);
  if (!checks.validation.passed) reasons.push("validation_report.json does not indicate passed=true");
  if (!checks.ipfs.ok) reasons.push("ipfs_verification.json ok is not true");
  if (!checks.deliverable.nonEmpty) reasons.push("deliverable is empty");
  if (checks.deliverable.placeholdersFound) reasons.push("deliverable contains placeholder text");
  if (!checks.completionSummary.nonEmpty) reasons.push("completion summary is empty");
  if (!checks.humanReviewRequired) reasons.push("job_completion.humanReviewRequired is not true");

  const score = scoreFromChecks(checks);
  if (reasons.length > 0 && score.recommendedValidatorAction === "approve_candidate") {
    score.recommendedValidatorAction = "needs_human_review";
  }

  const fixtureMode = true;
  const validatorReport = {
    schema: "emperor-os/validator-report/v1",
    jobId,
    protocol: jobState?.contractVersion || "v1",
    source: "local_artifacts",
    checkedAt: new Date().toISOString(),
    bundleUri: storagePublishReport?.jobCompletionURI || null,
    fixtureMode,
    notForOnChainValidation: true,
    artifactIntegrityChecks: checks.manifest,
    deliverableChecks: checks.deliverable,
    storageVerificationChecks: {
      ipfsVerified: checks.ipfs.ok,
      ipfsVerificationPath: "ipfs_verification.json",
      storagePublishReportPath: "storage_publish_report.json"
    },
    validationChecks: {
      passed: checks.validation.passed,
      validationReportPath: "validation_report.json"
    },
    scoreBreakdown: score,
    recommendedValidatorAction: score.recommendedValidatorAction,
    reasons,
    humanReviewRequired: true
  };

  const validatorReviewPacket = {
    schema: "emperor-os/validator-review-packet/v1",
    jobId,
    createdAt: new Date().toISOString(),
    validatorReportPath: "validator_report.json",
    completionBundlePath: artifactDir,
    completionBundleUri: storagePublishReport?.jobCompletionURI || null,
    scoreSummary: score,
    recommendedAction: score.recommendedValidatorAction,
    humanChecklist: [
      "Review validator_report.json reason list and score breakdown.",
      "Verify artifact integrity findings manually if any mismatch is reported.",
      "Review deliverable substance and spec relevance.",
      "Independently verify current on-chain status before any external validator action."
    ],
    warnings: [
      "No on-chain validation submitted.",
      "No approval/rejection signed.",
      "No broadcast performed.",
      "No private key used.",
      "Human must independently review before any external validator action."
    ],
    fixtureMode: true,
    notForOnChainValidation: true,
    humanReviewRequired: true
  };

  await writeJson(reportPath, validatorReport);
  await writeJson(packetPath, validatorReviewPacket);

  console.log(`[run_validate_completion] Wrote validator report: ${reportPath}`);
  console.log(`[run_validate_completion] Wrote validator review packet: ${packetPath}`);
  console.log(`[run_validate_completion] Recommended validator action: ${score.recommendedValidatorAction}`);
  console.log(`[run_validate_completion] Overall score: ${score.overallScore}`);
  console.log("[run_validate_completion] Executor job lifecycle state left unchanged.");
  console.log("[run_validate_completion] No on-chain validation/signing/broadcast/private key usage.");
}

main().catch((err) => {
  console.error("[run_validate_completion] Fatal error:", err.message || err);
  process.exit(1);
});
