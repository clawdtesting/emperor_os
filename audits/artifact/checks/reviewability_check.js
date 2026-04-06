// audits/artifact/checks/reviewability_check.js
// Ensures that artifacts produced for completed jobs contain sufficient
// information for operator review. A deliverable without context, provenance,
// or acceptance criteria is not reviewable — it blocks the operator from
// making an informed signing decision.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT, AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, readText, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "artifact.reviewability_check";

const REVIEWABLE_ARTIFACT_DIRS = ["artifacts", "archive"];

const REVIEW_REQUIREMENTS = {
  manifest: {
    files: ["manifest.json"],
    description: "manifest file",
  },
  spec: {
    files: ["spec.json", "brief.md"],
    description: "spec or brief (at least one)",
    atLeastOne: true,
  },
  completion: {
    files: ["completion.json", "delivery.json"],
    description: "completion or delivery record (at least one)",
    atLeastOne: true,
  },
  provenance: {
    files: ["provenance.json", "hash_bundle.json"],
    description: "provenance or hash bundle (at least one)",
    atLeastOne: true,
  },
};

function hasMinimumContent(data, minLength = 50) {
  if (!data) return false;
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return text.trim().length >= minLength;
}

function checkReviewability(dirPath, dirName) {
  const issues = [];
  const warnings = [];

  for (const [category, requirement] of Object.entries(REVIEW_REQUIREMENTS)) {
    const found = [];

    for (const file of requirement.files) {
      const fullPath = `${dirPath}/${file}`;
      found.push({ file, exists: false, valid: false, reason: null });
    }

    let anyFound = false;
    for (const entry of found) {
      const fullPath = `${dirPath}/${entry.file}`;
      if (fileExists(fullPath)) {
        entry.exists = true;
        anyFound = true;
      }
    }

    if (requirement.atLeastOne) {
      if (!anyFound) {
        issues.push(`missing ${requirement.description}`);
      }
    } else {
      for (const entry of found) {
        if (!entry.exists) {
          warnings.push(`optional: missing ${entry.file}`);
        }
      }
    }
  }

  return { dir: dirName, issues, warnings };
}

export async function run(ctx) {
  const start = Date.now();
  const results = [];

  for (const artifactBase of REVIEWABLE_ARTIFACT_DIRS) {
    const basePath = artifactBase === "artifacts"
      ? `${AGENT_ROOT}/artifacts`
      : `${ARTIFACTS_ROOT}`;

    let dirs;
    try {
      dirs = await listFiles(basePath, f => {
        return f.startsWith("proc_") || f.startsWith("job_") || f.includes("-");
      });
    } catch {
      continue;
    }

    for (const dir of dirs) {
      const dirName = dir.split("/").pop();
      const result = checkReviewability(dir, dirName);
      if (result.issues.length > 0 || result.warnings.length > 0) {
        results.push(result);
      }
    }
  }

  const critical = results.filter(r => r.issues.length > 0);
  const warned = results.filter(r => r.issues.length === 0 && r.warnings.length > 0);
  const clean = results.filter(r => r.issues.length === 0 && r.warnings.length === 0);

  if (critical.length > 0) {
    const details = critical.slice(0, 3).map(r =>
      `${r.dir}: ${r.issues.join(", ")}`
    ).join("; ");

    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${critical.length} artifact dir(s) not reviewable: ${details}`,
      durationMs: Date.now() - start,
      extra: {
        total: results.length,
        critical: critical.length,
        warned: warned.length,
        clean: clean.length,
        items: critical,
      },
    });
  } else if (results.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `${results.length} artifact dir(s) reviewed — ${warned.length} with minor warnings, ${clean.length} clean`,
      durationMs: Date.now() - start,
      extra: {
        total: results.length,
        critical: 0,
        warned: warned.length,
        clean: clean.length,
      },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No artifact directories found to check — nothing to review",
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
