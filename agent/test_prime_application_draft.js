#!/usr/bin/env node

import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function run(cmd, env = process.env) {
  return execSync(cmd, { cwd: repoRoot, stdio: "pipe", encoding: "utf8", env });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function collectUnsigned(procId) {
  const root = path.join(repoRoot, "artifacts", `proc_${procId}`);
  const found = [];
  async function walk(dir) {
    let ents = [];
    try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/unsigned_.*_tx\.json$/i.test(e.name)) found.push(p);
    }
  }
  await walk(root);
  return found;
}

async function main() {
  const procId = "424242";
  const procRoot = path.join(repoRoot, "artifacts", `proc_${procId}`);
  const appDir = path.join(procRoot, "application");
  const reviewDir = path.join(procRoot, "review");
  const envNoRpc = { ...process.env };
  delete envNoRpc.ETH_RPC_URL;

  // clean
  await fs.rm(procRoot, { recursive: true, force: true });

  // missing review packet fails cleanly
  let failedMissing = false;
  try {
    run(`node agent/build_prime_application_draft.js ${procId} --fixture`, envNoRpc);
  } catch (err) {
    failedMissing = true;
    const out = String(err.stdout || "") + String(err.stderr || "");
    assert.ok(out.includes("Run build_prime_candidate_review.js first"), "missing-review guidance missing");
  }
  assert.ok(failedMissing, "expected missing review packet failure");

  // generate review packet in fixture mode
  run(`node agent/build_prime_candidate_review.js ${procId} --fixture --force`, envNoRpc);

  // build draft
  const out1 = run(`node agent/build_prime_application_draft.js ${procId} --fixture --force`, envNoRpc);
  assert.ok(out1.includes("Wrote application draft artifacts"), "draft build did not complete");

  const briefPath = path.join(appDir, "application_brief.md");
  const payloadPath = path.join(appDir, "application_payload.json");
  const evidencePath = path.join(appDir, "application_evidence_packet.json");
  const manifestPath = path.join(appDir, "application_artifact_manifest.json");

  assert.equal(await exists(briefPath), true, "application_brief.md missing");
  const brief = await fs.readFile(briefPath, "utf8");
  assert.ok(brief.trim().length > 0, "application_brief.md is empty");

  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  assert.equal(payload.humanReviewRequired, true);
  assert.equal(payload.readyForCommitPackage, false);

  const evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  assert.equal(evidence.safety.noUnsignedTxBuilt, true);
  assert.equal(evidence.safety.noSigning, true);
  assert.equal(evidence.safety.noBroadcasting, true);
  assert.equal(evidence.safety.noPrivateKey, true);

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.ok(Array.isArray(manifest.files) && manifest.files.length >= 3, "manifest files missing");
  for (const f of manifest.files) {
    assert.ok(f.relativePath && f.sha256 && Number.isFinite(f.sizeBytes) && f.sizeBytes > 0 && f.mimeType, "manifest entry invalid");
  }

  const unsigned = await collectUnsigned(procId);
  assert.equal(unsigned.length, 0, `unexpected unsigned tx files: ${unsigned.join(",")}`);

  // idempotency
  const out2 = run(`node agent/build_prime_application_draft.js ${procId} --fixture`, envNoRpc);
  assert.ok(out2.includes("already exist (idempotent)"), "idempotency message missing");

  // live no-RPC mode fails cleanly (with review present)
  let failedNoRpc = false;
  try {
    run(`node agent/build_prime_application_draft.js ${procId}`, envNoRpc);
  } catch (err) {
    failedNoRpc = true;
    const out = String(err.stdout || "") + String(err.stderr || "");
    assert.ok(out.includes("ETH_RPC_URL not set") || out.includes("read-only"), "live no-RPC failure not clean");
  }
  assert.ok(failedNoRpc, "expected live no-RPC failure");

  const script = await fs.readFile(path.join(repoRoot, "agent", "build_prime_application_draft.js"), "utf8");
  assert.ok(!/new\s+ethers\s*\.\s*Wallet\s*\(/.test(script), "must not construct wallet");
  assert.ok(!/sendTransaction\s*\(/.test(script), "must not send tx");
  assert.ok(!/signTransaction\s*\(/.test(script), "must not sign tx");

  console.log("[test] PASS test_prime_application_draft");
}

main().catch((err) => {
  console.error(`[test] FAIL: ${err.message}`);
  process.exit(1);
});
