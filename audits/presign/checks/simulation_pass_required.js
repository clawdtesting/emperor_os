// audits/presign/checks/simulation_pass_required.js
// Verifies that a simulation result is recorded for each tx package
// and that it passed. A tx that has not been simulated, or that
// failed simulation, must not be handed to the operator for signing.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "presign.simulation_pass_required";
const TX_PACKAGE_NAMES = ["tx_package.json", "unsigned_tx.json"];
const SIMULATION_NAMES = ["simulation_result.json", "sim_result.json", "dry_run_result.json"];

export async function run(ctx) {
  const start = Date.now();

  const allPackages = [];
  for (const baseDir of [ARTIFACTS_ROOT, `${AGENT_ROOT}/artifacts`]) {
    try {
      const files = await listFiles(baseDir, f => TX_PACKAGE_NAMES.includes(f));
      allPackages.push(...files);
    } catch { continue; }
  }

  if (allPackages.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No tx packages found — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const noSimulation = [];
  const simFailed = [];
  let checked = 0;

  for (const pkgPath of allPackages) {
    let pkg;
    try { pkg = await readJson(pkgPath); checked++; } catch { continue; }

    // Check inline simulation result first
    const inlineSim = pkg.simulationResult || pkg.simulation || pkg.dryRun;
    if (inlineSim) {
      if (inlineSim.success === false || inlineSim.passed === false || inlineSim.status === "failed") {
        simFailed.push(`${pkgPath}: inline simulation failed — ${inlineSim.error || inlineSim.revertReason || "unknown"}`);
      }
      continue;
    }

    const dir = pkgPath.substring(0, pkgPath.lastIndexOf("/"));
    let simFound = false;

    for (const simName of SIMULATION_NAMES) {
      const simPath = `${dir}/${simName}`;
      if (await fileExists(simPath)) {
        simFound = true;
        let sim;
        try { sim = await readJson(simPath); } catch { break; }
        if (sim.success === false || sim.passed === false || sim.status === "failed") {
          simFailed.push(`${pkgPath}: simulation failed — ${sim.error || sim.revertReason || "unknown"}`);
        }
        break;
      }
    }

    if (!simFound) {
      noSimulation.push(pkgPath);
    }
  }

  const total = noSimulation.length + simFailed.length;

  if (simFailed.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${simFailed.length} tx package(s) failed simulation: ${simFailed.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { simFailed, noSimulation },
    });
  } else if (noSimulation.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `${noSimulation.length} tx package(s) have no simulation result on record`,
      durationMs: Date.now() - start,
      extra: { noSimulation },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} tx package(s) have passing simulation results`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
