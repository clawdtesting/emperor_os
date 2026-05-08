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
  const reviewPath = path.join(procRoot, "review", "prime_candidate_review_packet.json");

  await fs.rm(procRoot, { recursive: true, force: true });

  const envNoRpc = { ...process.env };
  delete envNoRpc.ETH_RPC_URL;

  // live no-RPC mode fails and does not mutate/create state
  let failed = false;
  try {
    run(`node agent/build_prime_candidate_review.js ${procId}`, envNoRpc);
  } catch (err) {
    failed = true;
    const out = String(err.stdout || "") + String(err.stderr || "");
    assert.ok(out.includes("ETH_RPC_URL not set"), "expected clean no-RPC failure");
  }
  assert.ok(failed, "live no-RPC mode must fail");
  assert.equal(await exists(path.join(procRoot, "state.json")), false, "no-RPC live mode must not mutate state");

  // fixture mode create packet + fixture state
  const out1 = run(`node agent/build_prime_candidate_review.js ${procId} --fixture`, envNoRpc);
  assert.ok(out1.includes("Wrote review packet"), "fixture mode did not write packet");
  assert.equal(await exists(reviewPath), true, "review packet missing");

  const packet = JSON.parse(await fs.readFile(reviewPath, "utf8"));
  assert.equal(packet.readOnly, true);
  assert.equal(packet.noUnsignedTxBuilt, true);
  assert.equal(packet.humanReviewRequired, true);

  const statePath = path.join(procRoot, "state.json");
  assert.equal(await exists(statePath), true, "fixture state should be created/updated");

  const unsigned = await collectUnsigned(procId);
  assert.equal(unsigned.length, 0, `unexpected unsigned tx files: ${unsigned.join(",")}`);

  const script = await fs.readFile(path.join(repoRoot, "agent", "build_prime_candidate_review.js"), "utf8");
  assert.ok(!/ethers\.Wallet\s*\(/.test(script), "must not construct wallet");
  assert.ok(!/sendTransaction\s*\(/.test(script), "must not send tx");
  assert.ok(!/signTransaction\s*\(/.test(script), "must not sign tx");

  // idempotency
  const out2 = run(`node agent/build_prime_candidate_review.js ${procId} --fixture`, envNoRpc);
  assert.ok(out2.includes("Packet already exists (idempotent)"), "idempotency message missing");

  console.log("[test] PASS test_prime_candidate_review_packet");
}

main().catch((err) => {
  console.error(`[test] FAIL: ${err.message}`);
  process.exit(1);
});
