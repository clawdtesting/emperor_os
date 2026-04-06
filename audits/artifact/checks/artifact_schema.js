// audits/artifact/checks/artifact_schema.js
// Validates that artifact JSON files conform to expected schemas.
// Catches structural drift early — missing required fields, wrong types,
// or unexpected shapes in manifests, specs, and completion bundles.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "artifact.artifact_schema";

const SCHEMAS = {
  "manifest.json": {
    required: ["jobId", "createdAt", "artifacts"],
    types: {
      jobId: ["string", "number"],
      createdAt: ["string"],
      artifacts: ["object", "array"],
    },
  },
  "spec.json": {
    required: ["jobId", "title", "description"],
    types: {
      jobId: ["string", "number"],
      title: ["string"],
      description: ["string"],
    },
  },
  "completion.json": {
    required: ["jobId", "completedAt", "deliverables"],
    types: {
      jobId: ["string", "number"],
      completedAt: ["string"],
      deliverables: ["array"],
    },
  },
  "state.json": {
    required: ["status"],
    types: {
      status: ["string"],
    },
  },
};

function validateSchema(data, schema, filePath) {
  const errors = [];

  for (const field of schema.required) {
    if (!(field in data)) {
      errors.push(`missing required field: "${field}"`);
    }
  }

  for (const [field, allowedTypes] of Object.entries(schema.types)) {
    if (!(field in data)) continue;
    const actualType = typeof data[field];
    if (data[field] === null) {
      errors.push(`field "${field}" is null, expected ${allowedTypes.join(" or ")}`);
    } else if (!allowedTypes.includes(actualType)) {
      errors.push(`field "${field}" has type "${actualType}", expected ${allowedTypes.join(" or ")}`);
    }
  }

  return errors;
}

export async function run(ctx) {
  const start = Date.now();

  let allFiles;
  try {
    allFiles = await listFiles(ARTIFACTS_ROOT, f => f.endsWith(".json"));
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
      details: "No JSON files found in artifacts — nothing to validate",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const allErrors = [];
  let checked = 0;
  let skipped = 0;

  for (const filePath of allFiles) {
    const fileName = filePath.split("/").pop();
    const schema = SCHEMAS[fileName];

    if (!schema) {
      skipped++;
      continue;
    }

    let data;
    try {
      data = await readJson(filePath);
      checked++;
    } catch (err) {
      allErrors.push(`${filePath}: invalid JSON — ${err.message}`);
      continue;
    }

    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      allErrors.push(`${filePath}: expected JSON object, got ${Array.isArray(data) ? "array" : typeof data}`);
      continue;
    }

    const errors = validateSchema(data, schema, filePath);
    for (const err of errors) {
      allErrors.push(`${filePath}: ${err}`);
    }
  }

  if (allErrors.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${allErrors.length} schema violation(s) across ${checked} file(s): ${allErrors.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { errors: allErrors, filesChecked: checked, filesSkipped: skipped },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} schema-eligible file(s) pass validation (${skipped} skipped — no schema defined)`,
      durationMs: Date.now() - start,
      extra: { filesChecked: checked, filesSkipped: skipped },
    });
  }

  return ctx;
}
