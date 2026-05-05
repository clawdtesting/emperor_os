#!/usr/bin/env node
"use strict";

import path from "path";
import { getJobState } from "./state.js";
import { getJobArtifactDir, readJson } from "./artifact-manager.js";
import { getProtocolConfig } from "./protocol-registry.js";

function parseId(raw) {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Missing jobId");
  if (/^(v1|v2|prime)_\d+$/i.test(s)) return s.toLowerCase();
  if (/^\d+$/.test(s)) return `v1_${s}`;
  throw new Error("Invalid jobId format");
}

function validateCommon(pkg, label, issues) {
  if (!pkg?.schema) issues.push(`${label}: missing schema`);
  if (!pkg?.kind) issues.push(`${label}: missing kind`);
  if (pkg?.humanReviewRequired !== true) issues.push(`${label}: humanReviewRequired must be true`);
  if (!pkg?.safety) issues.push(`${label}: missing safety`);
  if (pkg?.signedTx || pkg?.rawSignedTx || pkg?.signature) issues.push(`${label}: contains signed tx fields`);
  const raw = JSON.stringify(pkg);
  if (/PRIVATE_KEY|0x[a-fA-F0-9]{64}/.test(raw) && raw.includes("PRIVATE_KEY")) issues.push(`${label}: suspicious private key material`);
  if (pkg?.executableAsIs !== false) issues.push(`${label}: executableAsIs must remain false`);
}

function validateHonesty(pkg, protocol, issues, label) {
  let cfg = null;
  try { cfg = getProtocolConfig(protocol); } catch {}
  if (!cfg) return;

  if (cfg.contractAddress && pkg.contractAddress !== cfg.contractAddress) {
    issues.push(`${label}: contractAddress mismatch with protocol registry`);
  }
  if (cfg.chainId !== "unknown" && String(pkg.chainId) !== String(cfg.chainId)) {
    issues.push(`${label}: chainId mismatch with protocol registry`);
  }

  if (label === "unsigned_completion_tx" && cfg.supportedActions?.completion) {
    const m = cfg.supportedActions.completion.method;
    if (m && pkg.method !== m) issues.push(`${label}: method mismatch for completion action`);
  }
  if (label === "unsigned_apply_tx" && cfg.supportedActions?.apply) {
    const m = cfg.supportedActions.apply.method;
    if (m && pkg.method !== m) issues.push(`${label}: method mismatch for apply action`);
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node agent/validate_unsigned_packages.js <jobId>");
    process.exit(1);
  }

  const jobId = parseId(arg);
  const state = await getJobState(jobId);
  if (!state) throw new Error(`Job state not found: ${jobId}`);
  const artifactDir = getJobArtifactDir(jobId);

  const apply = await readJson(path.join(artifactDir, "unsigned_apply_tx.json"));
  const completion = await readJson(path.join(artifactDir, "unsigned_completion_tx.json"));

  const issues = [];
  if (!apply) issues.push("unsigned_apply_tx.json missing");
  if (!completion) issues.push("unsigned_completion_tx.json missing");

  if (apply) {
    validateCommon(apply, "unsigned_apply_tx", issues);
    validateHonesty(apply, apply.protocol, issues, "unsigned_apply_tx");
  }
  if (completion) {
    validateCommon(completion, "unsigned_completion_tx", issues);
    validateHonesty(completion, completion.protocol, issues, "unsigned_completion_tx");
    if (!String(completion.jobCompletionURI || "").startsWith("ipfs://")) {
      issues.push("unsigned_completion_tx: invalid jobCompletionURI");
    }
  }

  if (issues.length > 0) {
    console.log("[validate_unsigned_packages] FAIL");
    for (const i of issues) console.log(` - ${i}`);
    process.exit(1);
  }

  console.log("[validate_unsigned_packages] PASS");
  console.log(` - jobId: ${jobId}`);
  console.log(` - apply package: ${path.join(artifactDir, "unsigned_apply_tx.json")}`);
  console.log(` - completion package: ${path.join(artifactDir, "unsigned_completion_tx.json")}`);
}

main().catch((err) => {
  console.error("[validate_unsigned_packages] Error:", err.message || err);
  process.exit(1);
});
