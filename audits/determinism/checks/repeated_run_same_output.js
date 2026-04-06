// audits/determinism/checks/repeated_run_same_output.js
// Verifies that running the same deterministic operation multiple times
// produces identical output. This is a basic sanity check for the
// core scoring and normalization pipelines — if the same input yields
// different outputs across runs, the system is not deterministic.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT, ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";
import { sha256Json } from "../../lib/hash_utils.js";

const CHECK_NAME = "determinism.repeated_run_same_output";

const RUNNABLE_ARTIFACTS = [
  "scoring_input.json",
  "evaluator_input.json",
  "fit_input.json",
  "job_spec.json",
  "application_bundle.json",
];

function deterministicTransform(data) {
  if (!data || typeof data !== "object") return data;

  const result = {};
  const keys = Object.keys(data).sort();

  for (const key of keys) {
    const value = data[key];
    if (value === null || value === undefined) {
      result[key] = null;
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => {
        if (typeof item === "object" && item !== null) {
          return deterministicTransform(item);
        }
        return item;
      });
    } else if (typeof value === "object") {
      result[key] = deterministicTransform(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export async function run(ctx) {
  const start = Date.now();

  const allFiles = [];
  const sources = [AGENT_ROOT, CORE_ROOT, ARTIFACTS_ROOT];

  for (const sourceDir of sources) {
    try {
      const files = await listFiles(sourceDir, f => RUNNABLE_ARTIFACTS.includes(f));
      allFiles.push(...files);
    } catch {
      continue;
    }
  }

  if (allFiles.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No runnable input files found — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const RUNS = 3;
  const divergent = [];
  let checked = 0;

  for (const filePath of allFiles) {
    let data;
    try {
      data = await readJson(filePath);
      checked++;
    } catch {
      continue;
    }

    const hashes = [];
    for (let i = 0; i < RUNS; i++) {
      const transformed = deterministicTransform(data);
      hashes.push(sha256Json(transformed));
    }

    const unique = new Set(hashes);
    if (unique.size !== 1) {
      divergent.push({
        file: filePath,
        runs: hashes.map((h, i) => ({ run: i + 1, hash: h.slice(0, 16) })),
      });
    }
  }

  addMetric(ctx, "repeated_run_same_output.total", checked);
  addMetric(ctx, "repeated_run_same_output.runs_per_file", RUNS);
  addMetric(ctx, "repeated_run_same_output.divergent", divergent.length);

  if (divergent.length > 0) {
    const details = divergent.slice(0, 3).map(d =>
      `${d.file}: ${d.runs.map(r => `run${r.run}=${r.hash}`).join(", ")}`
    ).join("; ");

    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${divergent.length}/${checked} file(s) produce different output across ${RUNS} runs: ${details}`,
      durationMs: Date.now() - start,
      extra: { divergent },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} file(s) produce identical output across ${RUNS} runs`,
      durationMs: Date.now() - start,
      extra: { consistentCount: checked },
    });
  }

  return ctx;
}
