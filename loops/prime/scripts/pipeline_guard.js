#!/usr/bin/env node
/**
 * pipeline_guard.js — Zero-trust reliability layer checks.
 *
 * Enforces stage gates:
 * artifact generation -> artifact validation -> packaging validation
 * -> unsigned tx generation -> STOP (human review).
 */
"use strict";

const fs = require("fs");
const crypto = require("crypto");

const STAGES = {
  artifact_generation: ["/tmp/selected_job.json", "/tmp/review_summary.json", "/tmp/validation_report.json"],
  packaging_validation: ["/tmp/package_manifest.json"],
  unsigned_tx_generation: ["/tmp/unsigned_tx.json"],
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function validateReviewSummary(summary) {
  if (!summary || typeof summary !== "object") return "review_summary.json must be a JSON object";
  if (!summary.jobId) return "review_summary.json missing jobId";
  if (!summary.decision) return "review_summary.json missing decision";
  if (!Array.isArray(summary.reasons)) return "review_summary.json reasons must be an array";
  return null;
}

function validateValidationReport(report) {
  if (!report || typeof report !== "object") return "validation_report.json must be a JSON object";
  if (!Array.isArray(report.checks)) return "validation_report.json checks must be an array";
  const hasFailed = report.checks.some((c) => c && c.status === "failed");
  if (hasFailed) return "validation_report.json includes failed checks";
  return null;
}

function validateUnsignedTx(unsignedTx) {
  if (!unsignedTx || typeof unsignedTx !== "object") return "unsigned_tx.json must be a JSON object";
  if (!unsignedTx.to || !unsignedTx.data) return "unsigned_tx.json missing required fields (to, data)";
  if (unsignedTx.signed === true) return "unsigned_tx.json must not be signed";
  return null;
}

function validateIpfsUri(uri) {
  return typeof uri === "string" && /^ipfs:\/\/[a-zA-Z0-9]+/.test(uri);
}

function runGate() {
  const failures = [];

  for (const [stage, files] of Object.entries(STAGES)) {
    for (const filePath of files) {
      if (!exists(filePath)) failures.push(`${stage}: missing ${filePath}`);
    }
  }

  const selectedJob = readJson("/tmp/selected_job.json");
  const reviewSummary = readJson("/tmp/review_summary.json");
  const validationReport = readJson("/tmp/validation_report.json");
  const packageManifest = readJson("/tmp/package_manifest.json");
  const unsignedTx = readJson("/tmp/unsigned_tx.json");

  const reviewErr = validateReviewSummary(reviewSummary);
  if (reviewErr) failures.push(reviewErr);

  const validationErr = validateValidationReport(validationReport);
  if (validationErr) failures.push(validationErr);

  const txErr = validateUnsignedTx(unsignedTx);
  if (txErr) failures.push(txErr);

  if (!selectedJob || !selectedJob.jobId) {
    failures.push("selected_job.json missing jobId");
  }

  if (!packageManifest || typeof packageManifest !== "object") {
    failures.push("package_manifest.json missing or invalid");
  } else {
    const payloadHash = packageManifest.payloadHash;
    const artifactUri = packageManifest.artifactUri;
    if (!payloadHash) failures.push("package_manifest.json missing payloadHash");
    if (!artifactUri || !validateIpfsUri(artifactUri)) failures.push("package_manifest.json artifactUri must be a valid ipfs:// URI");

    if (selectedJob) {
      const computed = sha256Hex(JSON.stringify(selectedJob));
      if (payloadHash && payloadHash !== computed) {
        failures.push("package_manifest payloadHash mismatch with selected_job.json");
      }
    }
  }

  const result = {
    timestamp: new Date().toISOString(),
    passed: failures.length === 0,
    failures,
    enforcedStopAfterUnsignedTx: true,
    nextState: failures.length === 0 ? "blocked_for_human_review" : "failed",
  };

  fs.writeFileSync("/tmp/pipeline_gate_result.json", JSON.stringify(result, null, 2));

  if (failures.length > 0) {
    process.stderr.write(`[pipeline_guard] BLOCKED/FAILED:\n- ${failures.join("\n- ")}\n`);
    process.exit(2);
  }

  process.stderr.write("[pipeline_guard] PASS: unsigned tx generated and blocked pending human review\n");
}

runGate();
