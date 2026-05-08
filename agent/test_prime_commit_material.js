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
  const envNoRpc = { ...process.env };
  delete envNoRpc.ETH_RPC_URL;

  const procRoot = path.join(repoRoot, "artifacts", `proc_${procId}`);
  const appDir = path.join(procRoot, "application");
  const commitmentPath = path.join(appDir, "commitment_material.json");
  const reviewPath = path.join(appDir, "commitment_review_packet.json");
  const manifestPath = path.join(appDir, "commitment_artifact_manifest.json");

  await fs.rm(procRoot, { recursive: true, force: true });

  // missing draft fails closed
  let missingDraftFailed = false;
  try {
    run(`node agent/build_prime_commit_material.js ${procId} --fixture`, envNoRpc);
  } catch (err) {
    missingDraftFailed = true;
    const out = String(err.stdout || "") + String(err.stderr || "");
    assert.ok(out.includes("Run:"), "missing draft guidance missing");
    assert.ok(out.includes("build_prime_candidate_review.js"), "candidate review guidance missing");
  }
  assert.ok(missingDraftFailed, "expected missing draft failure");

  // generate prerequisites
  run(`node agent/build_prime_candidate_review.js ${procId} --fixture --force`, envNoRpc);
  run(`node agent/build_prime_application_draft.js ${procId} --fixture --force`, envNoRpc);

  // build commitment material
  const out1 = run(`node agent/build_prime_commit_material.js ${procId} --fixture --force`, envNoRpc);
  assert.ok(out1.includes("Wrote commitment artifacts"), "commit material build missing output");
  assert.equal(await exists(commitmentPath), true, "commitment_material.json missing");
  assert.equal(await exists(reviewPath), true, "commitment_review_packet.json missing");
  assert.equal(await exists(manifestPath), true, "commitment_artifact_manifest.json missing");

  const cm = JSON.parse(await fs.readFile(commitmentPath, "utf8"));
  assert.equal(cm.readyForCommitTx, false);
  assert.equal(cm.requiresRealApplicationUri, true);
  assert.equal(cm.commitmentMode, "fixture_provisional");

  const unsigned = await collectUnsigned(procId);
  assert.equal(unsigned.length, 0, `unexpected unsigned tx files: ${unsigned.join(",")}`);

  // idempotency
  const out2 = run(`node agent/build_prime_commit_material.js ${procId} --fixture`, envNoRpc);
  assert.ok(out2.includes("already exist (idempotent)"), "idempotency message missing");

  // live no-rpc fails cleanly
  let liveNoRpcFailed = false;
  try {
    run(`node agent/build_prime_commit_material.js ${procId}`, envNoRpc);
  } catch (err) {
    liveNoRpcFailed = true;
    const out = String(err.stdout || "") + String(err.stderr || "");
    assert.ok(out.includes("ETH_RPC_URL not set"), "live no-rpc failure not clean");
  }
  assert.ok(liveNoRpcFailed, "expected live no-rpc failure");

  const script = await fs.readFile(path.join(repoRoot, "agent", "build_prime_commit_material.js"), "utf8");
  assert.ok(!/new\s+ethers\s*\.\s*Wallet\s*\(/.test(script), "must not construct wallet");
  assert.ok(!/sendTransaction\s*\(/.test(script), "must not send tx");
  assert.ok(!/signTransaction\s*\(/.test(script), "must not sign tx");

  console.log("[test] PASS test_prime_commit_material");
}

main().catch((err) => {
  console.error(`[test] FAIL: ${err.message}`);
  process.exit(1);
});
