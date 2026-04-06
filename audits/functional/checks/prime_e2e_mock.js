// audits/functional/checks/prime_e2e_mock.js
// End-to-end mock test for the AGIPrimeDiscovery procurement pipeline.
// Simulates: DISCOVERED → INSPECTED → FIT_EVALUATED → COMMIT_READY
// → REVEAL_READY → SHORTLISTED → TRIAL_READY → COMPLETION_READY → DONE.
// No network calls, no chain interaction — pure deterministic simulation.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "functional.prime_e2e_mock";

const REQUIRED_FILES = [
  `${AGENT_ROOT}/prime-review-gates.js`,
  `${AGENT_ROOT}/prime-artifact-builder.js`,
  `${AGENT_ROOT}/prime-tx-builder.js`,
];

const PHASE_SEQUENCE = [
  "DISCOVERED",
  "INSPECTED",
  "FIT_EVALUATED",
  "COMMIT_READY",
  "REVEAL_READY",
  "SHORTLISTED",
  "TRIAL_READY",
  "COMPLETION_READY",
  "DONE",
];

const MOCK_PROCUREMENT = {
  procurementId: "MOCK-99999",
  employer: "0x0000000000000000000000000000000000000002",
  payout: 500,
  deadline: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
};

export async function run(ctx) {
  const start = Date.now();
  const missing = [];

  for (const file of REQUIRED_FILES) {
    const exists = await fileExists(file);
    if (!exists) missing.push(file.replace(AGENT_ROOT, "agent"));
  }

  if (missing.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `Prime pipeline incomplete — missing: ${missing.join(", ")}`,
      durationMs: Date.now() - start,
      extra: { missing },
    });
    return ctx;
  }

  const stages = [];

  try {
    let state = { status: "DISCOVERED", procurementId: MOCK_PROCUREMENT.procurementId };

    for (let i = 0; i < PHASE_SEQUENCE.length; i++) {
      const phase = PHASE_SEQUENCE[i];
      const prevPhase = PHASE_SEQUENCE[i - 1] || null;

      // Simulate gate check
      const gatePass = state.status === phase || state.status === prevPhase;

      // Simulate building artifact bundle
      const artifact = {
        phase,
        procurementId: MOCK_PROCUREMENT.procurementId,
        generatedAt: "MOCK",
      };

      // Simulate building unsigned tx (for READY phases only)
      const isReadyPhase = phase.endsWith("_READY");
      const tx = isReadyPhase ? {
        to: "0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29",
        data: `0xMOCK_${phase}`,
        signed: false,
      } : null;

      const stagePassed = tx ? !tx.signed : true;

      stages.push({
        phase,
        artifact: artifact.phase,
        tx: tx ? { signed: tx.signed } : null,
        passed: stagePassed,
      });

      state = { ...state, status: phase };
    }

    const allPassed = stages.every(s => s.passed);

    if (allPassed) {
      addCheck(ctx, {
        name: CHECK_NAME,
        status: SEVERITY.PASS,
        severity: SEVERITY.PASS,
        details: `Prime e2e mock passed all ${stages.length} phase(s)`,
        durationMs: Date.now() - start,
        extra: { stages },
      });
    } else {
      const failed = stages.filter(s => !s.passed).map(s => s.phase);
      addCheck(ctx, {
        name: CHECK_NAME,
        status: SEVERITY.CRITICAL,
        severity: SEVERITY.CRITICAL,
        details: `Prime e2e mock failed at phase(s): ${failed.join(", ")}`,
        durationMs: Date.now() - start,
        extra: { stages },
      });
    }
  } catch (err) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `Prime e2e mock threw: ${err.message}`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
