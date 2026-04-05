// audits/safety/checks/signing_manifest_integrity.js
// Validates the structure and required fields of any signing manifests in artifacts.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";
import { hasRequiredKeys } from "../../lib/json_utils.js";
 
const CHECK_NAME = "safety.signing_manifest_integrity";
 
const REQUIRED_MANIFEST_FIELDS = [
  "jobId",
  "targetContract",
  "chainId",
  "calldata",
  "createdAt",
];
 
export async function run(ctx) {
  const start = Date.now();
 
  let files;
  try {
    files = await listFiles(ARTIFACTS_ROOT, f => f.includes("manifest") && f.endsWith(".json"));
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Artifacts directory not accessible — cannot validate signing manifests",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  if (files.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No signing manifests found — integrity requirement satisfied by absence",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  const invalid = [];
 
  for (const file of files) {
    let manifest;
    try {
      manifest = await readJson(file);
    } catch (err) {
      invalid.push(`${file}: parse error — ${err.message}`);
      continue;
    }
 
    const { valid, missing } = hasRequiredKeys(manifest, REQUIRED_MANIFEST_FIELDS);
    if (!valid) {
      invalid.push(`${file}: missing fields [${missing.join(", ")}]`);
    }
  }
 
  if (invalid.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.FAIL,
      severity: SEVERITY.FAIL,
      details: `${invalid.length} invalid manifest(s): ${invalid.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { invalid },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${files.length} signing manifest(s) have required fields`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}