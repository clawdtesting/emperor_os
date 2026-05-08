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

async function main() {
  const procurementId = "424242";
  const reportPath = path.join(repoRoot, "artifacts", `proc_${procurementId}`, "live_inspection", "prime_procurement_inspection.json");

  // A) No RPC mode: fail cleanly, no writes
  await fs.rm(path.join(repoRoot, "artifacts", `proc_${procurementId}`), { recursive: true, force: true });
  const envNoRpc = { ...process.env };
  delete envNoRpc.ETH_RPC_URL;

  let noRpcFailed = false;
  try {
    run(`node agent/inspect_prime_procurement.js ${procurementId}`, envNoRpc);
  } catch (err) {
    noRpcFailed = true;
    const output = String(err.stdout || "") + String(err.stderr || "");
    assert.ok(output.includes("ETH_RPC_URL not set"), "missing ETH_RPC_URL error not surfaced");
  }
  assert.ok(noRpcFailed, "no-RPC mode should fail");
  assert.equal(await exists(reportPath), false, "no-RPC mode without flags must not write report");

  // B) Fixture/mock mode: report writes, no unsigned tx packages generated
  const out = run(`node agent/inspect_prime_procurement.js ${procurementId} --fixture --write-report`, envNoRpc);
  assert.ok(out.includes("Prime Procurement Inspection"), "fixture inspection summary missing");
  assert.equal(await exists(reportPath), true, "fixture report was not written");

  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert.equal(report.schema, "emperor-os/prime-procurement-inspection/v1");
  assert.equal(report.readOnly, true);
  assert.equal(report.humanReviewRequired, true);
  assert.equal(report.noStateTransition, true);
  assert.equal(report.noUnsignedTxBuilt, true);

  const procRoot = path.join(repoRoot, "artifacts", `proc_${procurementId}`);
  const unsignedFiles = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/unsigned_.*_tx\.json$/i.test(e.name)) unsignedFiles.push(p);
    }
  }
  await walk(procRoot);
  assert.equal(unsignedFiles.length, 0, `unexpected unsigned tx files: ${unsignedFiles.join(", ")}`);

  const scriptContent = await fs.readFile(path.join(repoRoot, "agent", "inspect_prime_procurement.js"), "utf8");
  assert.ok(!/ethers\.Wallet\s*\(/.test(scriptContent), "must not construct wallets");
  assert.ok(!/sendTransaction\s*\(/.test(scriptContent), "must not send transactions");
  assert.ok(!/signTransaction\s*\(/.test(scriptContent), "must not sign transactions");

  console.log("[test] PASS test_prime_live_inspection_readonly");
}

main().catch((err) => {
  console.error(`[test] FAIL: ${err.message}`);
  process.exit(1);
});
