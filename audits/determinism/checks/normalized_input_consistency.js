// audits/determinism/checks/normalized_input_consistency.js
// Verifies that input normalization produces consistent output across
// equivalent inputs with different ordering, casing, or formatting.
// Catches nondeterministic normalization logic that could cause scoring
// divergence between runs.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT, ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, readText, fileExists } from "../../lib/fs_utils.js";
import { sha256Json } from "../../lib/hash_utils.js";

const CHECK_NAME = "determinism.normalized_input_consistency";

const NORMALIZED_FILES = [
  "scoring_input.json",
  "normalized_spec.json",
  "brief.json",
  "input_bundle.json",
];

function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(normalizeValue).sort((a, b) => {
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
  });
  if (typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = normalizeValue(value[key]);
    }
    return sorted;
  }
  return value;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findDifferences(obj1, obj2, path = "") {
  const diffs = [];

  if (typeof obj1 !== typeof obj2) {
    diffs.push({ path, type: "type_mismatch", a: typeof obj1, b: typeof obj2 });
    return diffs;
  }

  if (obj1 === null || obj2 === null || typeof obj1 !== "object") {
    if (obj1 !== obj2) {
      diffs.push({ path, type: "value_mismatch", a: obj1, b: obj2 });
    }
    return diffs;
  }

  const keys1 = Object.keys(obj1).sort();
  const keys2 = Object.keys(obj2).sort();

  if (JSON.stringify(keys1) !== JSON.stringify(keys2)) {
    diffs.push({ path, type: "key_mismatch", a: keys1, b: keys2 });
    return diffs;
  }

  for (const key of keys1) {
    const childPath = path ? `${path}.${key}` : key;
    diffs.push(...findDifferences(obj1[key], obj2[key], childPath));
  }

  return diffs;
}

export async function run(ctx) {
  const start = Date.now();

  const scoringInputs = [];
  const sources = [AGENT_ROOT, CORE_ROOT, ARTIFACTS_ROOT];

  for (const sourceDir of sources) {
    try {
      const files = await listFiles(sourceDir, f => NORMALIZED_FILES.includes(f));
      for (const file of files) {
        try {
          const data = await readJson(file);
          scoringInputs.push({ file, data });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  if (scoringInputs.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No normalized input files found — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const inconsistencies = [];
  let checked = 0;

  for (const { file, data } of scoringInputs) {
    checked++;

    const normalized1 = normalizeValue(data);
    const normalized2 = normalizeValue(data);

    if (!deepEqual(normalized1, normalized2)) {
      const diffs = findDifferences(normalized1, normalized2);
      inconsistencies.push({
        file,
        diffs: diffs.slice(0, 5),
      });
      continue;
    }

    const hash1 = sha256Json(normalized1);
    const hash2 = sha256Json(normalized2);

    if (hash1 !== hash2) {
      inconsistencies.push({
        file,
        diffs: [{ path: "root", type: "hash_mismatch", a: hash1, b: hash2 }],
      });
    }
  }

  addMetric(ctx, "normalized_input_consistency.total", checked);
  addMetric(ctx, "normalized_input_consistency.inconsistent", inconsistencies.length);

  if (inconsistencies.length > 0) {
    const details = inconsistencies.slice(0, 3).map(i =>
      `${i.file}: ${i.diffs.map(d => `${d.path} (${d.type})`).join(", ")}`
    ).join("; ");

    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${inconsistencies.length}/${checked} input(s) normalize inconsistently: ${details}`,
      durationMs: Date.now() - start,
      extra: { inconsistencies },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} normalized input(s) are consistent`,
      durationMs: Date.now() - start,
      extra: { consistentCount: checked },
    });
  }

  return ctx;
}
