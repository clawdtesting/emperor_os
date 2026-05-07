#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function run(cmd) {
  return execSync(cmd, { cwd: repoRoot, stdio: "pipe", encoding: "utf8" });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const procurementId = "1001";
  console.log("[test] seed fixture");
  console.log(run("node agent/seed_prime_fixture.js"));

  console.log("[test] first commit approval");
  const out1 = run(`node agent/prime_approve_action.js ${procurementId} commit`);
  console.log(out1);

  const appDir = path.join(repoRoot, "artifacts", `proc_${procurementId}`, "application");
  const packetPath = path.join(appDir, "prime_action_review_packet.json");
  const txPath = path.join(appDir, "unsigned_commit_tx.json");

  assert(await exists(packetPath), `missing packet: ${packetPath}`);
  assert(await exists(txPath), `missing unsigned tx: ${txPath}`);

  const unsignedPkg = JSON.parse(await fs.readFile(txPath, "utf8"));
  assert(unsignedPkg.humanReviewRequired === true, "humanReviewRequired must be true");
  assert(unsignedPkg.executableAsIs === false, "executableAsIs must be false");
  assert(typeof unsignedPkg.calldata === "string" && unsignedPkg.calldata.startsWith("0x"), "calldata must be 0x-prefixed string");
  assert(!("privateKey" in unsignedPkg), "unsigned package must not contain privateKey");
  assert(!("signature" in unsignedPkg), "unsigned package must not contain signature");
  assert(!("broadcast" in unsignedPkg), "unsigned package must not contain broadcast field");
  assert(unsignedPkg.safety?.noPrivateKeyInRuntime === true, "safety.noPrivateKeyInRuntime must be true");
  assert(unsignedPkg.safety?.noSigningInRuntime === true, "safety.noSigningInRuntime must be true");
  assert(unsignedPkg.safety?.noBroadcastInRuntime === true, "safety.noBroadcastInRuntime must be true");

  console.log("[test] second commit approval (idempotency)");
  const out2 = run(`node agent/prime_approve_action.js ${procurementId} commit`);
  console.log(out2);
  assert(out2.includes("Idempotent exit"), "expected idempotent exit on second run");

  console.log("[test] PASS test_prime_approve_action_integration");
}

main().catch((err) => {
  console.error(`[test] FAIL: ${err.message}`);
  process.exit(1);
});
