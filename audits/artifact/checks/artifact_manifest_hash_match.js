// audits/artifact/checks/artifact_manifest_hash_match.js
// Verifies that artifact manifest files reference correct content hashes.
// Every manifest that declares a contentHash (or hashes array) must match
// the actual on-disk file content. Prevents stale or tampered manifest entries.

import { readFileSync } from "fs";
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT, WORKSPACE_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, readText, fileExists } from "../../lib/fs_utils.js";
import { sha256, sha256Json, hashMatch } from "../../lib/hash_utils.js";

const CHECK_NAME = "artifact.manifest_hash_match";

const MANIFEST_FILES = [
  "manifest.json",
  "completion_manifest.json",
  "submission_manifest.json",
  "artifact_manifest.json",
  "delivery_manifest.json",
];

function computeHash(content, algorithm) {
  if (algorithm === "sha256json") return sha256Json(JSON.parse(content));
  return sha256(content);
}

function readTextSyncSafe(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

async function verifyManifest(manifestPath, ctx) {
  const manifest = await readJson(manifestPath);
  const dir = manifestPath.substring(0, manifestPath.lastIndexOf("/"));
  const issues = [];

  if (manifest.contentHash) {
    const { contentHash, ...rest } = manifest;
    const computed = sha256Json(rest);
    if (!hashMatch(computed, manifest.contentHash)) {
      issues.push(`contentHash mismatch: manifest declares ${manifest.contentHash.slice(0, 16)}… but computed ${computed.slice(0, 16)}…`);
    }
  }

  const entries = manifest.files || manifest.artifacts || manifest.deliverables || [];
  for (const entry of entries) {
    const filePath = entry.path || entry.file || entry.uri;
    if (!filePath) continue;

    const resolvedPath = filePath.startsWith("/") ? filePath : `${dir}/${filePath}`;
    const exists = await fileExists(resolvedPath);
    if (!exists) {
      issues.push(`referenced file not found: ${filePath}`);
      continue;
    }

    const content = await readText(resolvedPath);
    const algorithm = entry.algorithm || "sha256";
    const computed = computeHash(content, algorithm);
    const expected = entry.hash || entry.contentHash || entry.sha256;

    if (expected && !hashMatch(computed, expected)) {
      issues.push(`hash mismatch for ${filePath}: declared ${expected.slice(0, 16)}… but computed ${computed.slice(0, 16)}…`);
    }
  }

  if (manifest.reviewRootHash) {
    const dirEntries = await listFiles(dir, f => f.endsWith(".json") || f.endsWith(".md"));
    const combined = dirEntries.sort().map(p => {
      const rel = p.replace(dir + "/", "");
      const content = readTextSyncSafe(p);
      const hash = content.trimStart().startsWith("{") ? sha256Json(JSON.parse(content)) : sha256(content);
      return `${rel}:${hash}`;
    }).join("\n");
    const rootHash = sha256(combined);
    if (!hashMatch(rootHash, manifest.reviewRootHash)) {
      issues.push(`reviewRootHash mismatch: declared ${manifest.reviewRootHash.slice(0, 16)}… but computed ${rootHash.slice(0, 16)}…`);
    }
  }

  return issues;
}

export async function run(ctx) {
  const start = Date.now();

  let allManifests;
  try {
    allManifests = await listFiles(ARTIFACTS_ROOT, f => MANIFEST_FILES.includes(f));
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

  if (allManifests.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No manifest files found in artifacts — nothing to verify",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const allIssues = [];
  let checked = 0;

  for (const manifestPath of allManifests) {
    let issues;
    try {
      issues = await verifyManifest(manifestPath, ctx);
      checked++;
    } catch (err) {
      allIssues.push(`${manifestPath}: failed to parse — ${err.message}`);
      continue;
    }

    for (const issue of issues) {
      allIssues.push(`${manifestPath}: ${issue}`);
    }
  }

  if (allIssues.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${allIssues.length} hash mismatch(es) across ${checked} manifest(s): ${allIssues.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { issues: allIssues, manifestsChecked: checked },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} manifest(s) have valid content hashes`,
      durationMs: Date.now() - start,
      extra: { manifestsChecked: checked },
    });
  }

  return ctx;
}
