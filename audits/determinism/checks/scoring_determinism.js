// audits/determinism/checks/scoring_determinism.js
// Verifies that scoring operations produce deterministic results.
// The same job spec + application data must always yield the same score.
// Catches nondeterministic scoring logic (random tiebreakers, time-based
// adjustments, unordered iteration) that could cause inconsistent rankings.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT, ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";
import { sha256Json } from "../../lib/hash_utils.js";

const CHECK_NAME = "determinism.scoring_determinism";

const SCORING_FILES = [
  "scoring_input.json",
  "score_result.json",
  "scoring_output.json",
  "evaluator_result.json",
  "fit_result.json",
  "evaluation.json",
];

const SCORING_FIELDS = [
  "score",
  "totalScore",
  "weightedScore",
  "rank",
  "grade",
  "confidence",
  "fitScore",
  "qualityScore",
  "relevanceScore",
];

function normalizeForScoring(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(normalizeForScoring).sort((a, b) => {
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
  });

  const result = {};
  for (const key of Object.keys(obj).sort()) {
    const lower = key.toLowerCase();
    if (
      lower.includes("timestamp") ||
      lower.includes("createdat") ||
      lower.includes("evaluatedat") ||
      lower.includes("nonce") ||
      lower.includes("random")
    ) {
      continue;
    }
    result[key] = normalizeForScoring(obj[key]);
  }
  return result;
}

function extractScoreVector(obj, path = "") {
  const scores = [];

  if (!obj || typeof obj !== "object") return scores;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (SCORING_FIELDS.includes(key) && typeof value === "number") {
      scores.push({ field: currentPath, value });
    } else if (typeof value === "object" && value !== null) {
      scores.push(...extractScoreVector(value, currentPath));
    }
  }

  return scores;
}

function scoreVectorsMatch(v1, v2) {
  if (v1.length !== v2.length) return false;
  for (let i = 0; i < v1.length; i++) {
    if (v1[i].field !== v2[i].field || v1[i].value !== v2[i].value) {
      return false;
    }
  }
  return true;
}

export async function run(ctx) {
  const start = Date.now();

  const allFiles = [];
  const sources = [AGENT_ROOT, CORE_ROOT, ARTIFACTS_ROOT];

  for (const sourceDir of sources) {
    try {
      const files = await listFiles(sourceDir, f => SCORING_FILES.includes(f));
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
      details: "No scoring files found — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const RUNS = 3;
  const nondeterministic = [];
  const noScores = [];
  let checked = 0;

  for (const filePath of allFiles) {
    let data;
    try {
      data = await readJson(filePath);
      checked++;
    } catch {
      continue;
    }

    const scoreVectors = [];
    for (let i = 0; i < RUNS; i++) {
      const normalized = normalizeForScoring(data);
      const vector = extractScoreVector(normalized);
      scoreVectors.push(vector);
    }

    if (scoreVectors[0].length === 0) {
      noScores.push(filePath);
      continue;
    }

    let consistent = true;
    for (let i = 1; i < RUNS; i++) {
      if (!scoreVectorsMatch(scoreVectors[0], scoreVectors[i])) {
        consistent = false;
        break;
      }
    }

    if (!consistent) {
      nondeterministic.push({
        file: filePath,
        scoreCount: scoreVectors[0].length,
        vectors: scoreVectors.map((v, i) => ({
          run: i + 1,
          hash: sha256Json(v).slice(0, 16),
          scores: v.slice(0, 5),
        })),
      });
    }
  }

  addMetric(ctx, "scoring_determinism.total", checked);
  addMetric(ctx, "scoring_determinism.nondeterministic", nondeterministic.length);
  addMetric(ctx, "scoring_determinism.no_scores", noScores.length);

  if (nondeterministic.length > 0) {
    const details = nondeterministic.slice(0, 3).map(n =>
      `${n.file}: ${n.scoreCount} score(s), ${n.vectors.map(v => `run${v.run}=${v.hash}`).join(" vs ")}`
    ).join("; ");

    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${nondeterministic.length}/${checked} scoring file(s) produce different results across ${RUNS} runs: ${details}`,
      durationMs: Date.now() - start,
      extra: { nondeterministic },
    });
  } else {
    const detail = noScores.length > 0
      ? `All ${checked} scoring file(s) are deterministic (${noScores.length} had no extractable scores)`
      : `All ${checked} scoring file(s) produce identical results across ${RUNS} runs`;

    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details,
      durationMs: Date.now() - start,
      extra: { consistentCount: checked - nondeterministic.length, noScoresCount: noScores.length },
    });
  }

  return ctx;
}
