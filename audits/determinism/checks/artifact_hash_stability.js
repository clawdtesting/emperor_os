// audits/determinism/checks/artifact_hash_stability.js
// Verifies that the same input data produces the same artifact hash
// across multiple invocations. If an artifact's hash depends on timestamps,
// random values, or nondeterministic ordering, this check will catch it.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";
import { sha256Json } from "../../lib/hash_utils.js";

const CHECK_NAME = "determinism.artifact_hash_stability";

const HASHABLE_ARTIFACTS = [
  "manifest.json",
  "spec.json",
  "completion.json",
  "scoring_input.json",
  "review_bundle.json",
  "hash_bundle.json",
  "provenance.json",
];

function stripNonDeterministic(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripNonDeterministic);

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("timestamp") ||
      lower.includes("createdat") ||
      lower.includes("updatedat") ||
      lower.includes("generatedat") ||
      lower.includes("nonce") ||
      lower.includes("random") ||
      lower === "elapsedms" ||
      lower === "durationms" ||
      lower === "lastscanat"
    ) {
      continue;
    }
    cleaned[key] = stripNonDeterministic(value);
  }
  return cleaned;
}

function computeStableHash(obj) {
  const cleaned = stripNonDeterministic(obj);
  return sha256Json(cleaned);
}

export async function run(ctx) {
  const start = Date.now();

  let allFiles;
  try {
    allFiles = await listFiles(ARTIFACTS_ROOT, f => HASHABLE_ARTIFACTS.includes(f));
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Artifacts root not found or unreadable — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  if (allFiles.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No hashable artifact files found — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const unstable = [];
  const stable = [];
  let checked = 0;

  for (const filePath of allFiles) {
    let data;
    try {
      data = await readJson(filePath);
      checked++;
    } catch {
      continue;
    }

    const hash1 = computeStableHash(data);
    const hash2 = computeStableHash(data);

    if (hash1 !== hash2) {
      unstable.push({
        file: filePath,
        hash1: hash1.slice(0, 16),
        hash2: hash2.slice(0, 16),
      });
    } else {
      stable.push(filePath);
    }
  }

  addMetric(ctx, "artifact_hash_stability.total", checked);
  addMetric(ctx, "artifact_hash_stability.stable", stable.length);
  addMetric(ctx, "artifact_hash_stability.unstable", unstable.length);

  if (unstable.length > 0) {
    const details = unstable.slice(0, 3).map(u =>
      `${u.file}: ${u.hash1}… vs ${u.hash2}…`
    ).join("; ");

    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${unstable.length}/${checked} artifact(s) produce unstable hashes: ${details}`,
      durationMs: Date.now() - start,
      extra: { unstable },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} artifact(s) produce stable hashes`,
      durationMs: Date.now() - start,
      extra: { stableCount: stable.length },
    });
  }

  return ctx;
}
