#!/usr/bin/env node

import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function run(cmd) {
  const out = execSync(cmd, { cwd: repoRoot, stdio: "pipe", encoding: "utf8" });
  console.log(`$ ${cmd}\n${out}`);
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureTrialArtifacts(procurementId) {
  const trialDir = path.join(repoRoot, "artifacts", `proc_${procurementId}`, "trial");
  await fs.mkdir(trialDir, { recursive: true });
  await fs.writeFile(path.join(trialDir, "trial_artifact_manifest.json"), JSON.stringify({ files: ["trial.md"] }, null, 2));
  await fs.writeFile(path.join(trialDir, "publication_record.json"), JSON.stringify({ trialURI: "ipfs://fixture-trial-uri" }, null, 2));
  await fs.writeFile(path.join(trialDir, "fetchback_verification.json"), JSON.stringify({ verified: true }, null, 2));
}

async function main() {
  const procurementId = "1001";

  run("node agent/seed_prime_fixture.js");

  run(`node agent/prime_approve_action.js ${procurementId} commit`);
  run(`node agent/prime_mark_external_action.js ${procurementId} commit --tx-hash 0xfixture --force`);

  run(`node agent/prime_approve_action.js ${procurementId} reveal`);
  run(`node agent/prime_mark_external_action.js ${procurementId} reveal --tx-hash 0xfixture --force`);
  run(`node -e "import('./agent/prime-state.js').then(m => m.setProcState('${procurementId}', { status: 'SHORTLISTED' }))"`);

  run(`node agent/prime_approve_action.js ${procurementId} accept-finalist`);

  run(`node agent/prime_mark_external_action.js ${procurementId} accept-finalist --tx-hash 0xfixture --force`);
  run(`node -e "import('./agent/prime-state.js').then(m => m.setProcState('${procurementId}', { status: 'TRIAL_IN_PROGRESS' }))"`);

  await ensureTrialArtifacts(procurementId);
  run(`node agent/prime_approve_action.js ${procurementId} submit-trial`);

  const statePath = path.join(repoRoot, "artifacts", `proc_${procurementId}`, "state.json");
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  assert(state.status === "TRIAL_READY", `expected final state TRIAL_READY, got ${state.status}`);

  console.log("[test] PASS test_prime_state_machine_fixture: final state TRIAL_READY");
}

main().catch((err) => {
  console.error(`[test] FAIL: ${err.message}`);
  process.exit(1);
});
