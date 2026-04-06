// audits/static/checks/env_contracts.js
// Validate canonical contract constants match expected values.

import { checkEnvContracts } from "../../lib/env_utils.js";

export async function run(ctx) {
  const start = Date.now();
  const checks = [];

  const result = checkEnvContracts();

  checks.push({
    name: "env_contracts",
    status: result.ok ? "pass" : "fail",
    details: result.ok
      ? "All environment contract addresses match canonical values"
      : `Contract address mismatches:\n${result.issues.map(i => `  ${i.key}: expected ${i.expected}, got ${i.got}`).join("\n")}`,
    durationMs: Date.now() - start,
  });

  return checks;
}
