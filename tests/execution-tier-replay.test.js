import { strict as assert } from "assert";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { selectExecutionTier } from "../agent/execution-tier/tier-selector.js";
import { shouldApply } from "../agent/execution-tier/apply-gate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.join(__dirname, "fixtures", "execution-tier", "replay_jobs.json");
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));

let passed = 0;
let failed = 0;

for (const item of fixtures) {
  try {
    const selection = selectExecutionTier(item.jobSpec, item.protocolId);
    const decision = shouldApply(item.jobSpec, item.protocolId);

    assert.equal(selection.selectedTier ?? null, item.expected.selectedTier);
    assert.equal(decision.shouldApply, item.expected.shouldApply);
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error(`FAIL: replay fixture ${item.jobId}`);
    console.error(error.message);
  }
}

if (failed > 0) {
  console.error(`\n${failed} replay fixture(s) failed, ${passed} passed`);
  process.exit(1);
}

console.log(`execution-tier replay checks passed (${passed} fixtures)`);
