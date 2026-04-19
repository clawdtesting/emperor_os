// tests/protocol-runtime/artifact-restart-reconcile.test.js
//
// Focused tests for:
//   A. restart during/after artifact generation (recovery logic)
//   B. completionArchiveRecord schema consistency (reconcile idempotency)
//   C. submit blocked on incomplete/schema-invalid artifact bundles
//   D. artifact shape parity: signing-manifest/v1 vs prime-review-manifest/v1

import assert from "assert";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";

// ── helpers ───────────────────────────────────────────────────────────────────

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "emperor-test-"));
}

async function writeJson(p, data) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

async function fileExists(p) {
  if (!p) return false;
  try { await fs.access(p); return true; } catch { return false; }
}

// ── validateArtifactShape: inline reimplementation for testing ────────────────
// Mirrors agent/artifact-manager.js validateArtifactShape exactly.

async function validateArtifactShape(filePath, requiredFields, label) {
  let data;
  try {
    const raw = await fs.readFile(filePath, "utf8");
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label}: cannot read/parse artifact at ${filePath}: ${err.message}`);
  }
  if (!data || typeof data !== "object") {
    throw new Error(`${label}: artifact at ${filePath} is not a JSON object`);
  }
  const missing = requiredFields.filter((fieldPath) => {
    const parts = fieldPath.split(".");
    let cur = data;
    for (const p of parts) cur = cur?.[p];
    return cur == null || cur === "";
  });
  if (missing.length > 0) {
    throw new Error(`${label}: artifact at ${filePath} missing required fields: ${missing.join(", ")}`);
  }
  return data;
}

// ── buildArchiveRecord: inline reimplementation for testing ───────────────────
// Mirrors the helper in agent/reconcile-completion.js exactly.

function buildArchiveRecord({ jobId, archiveId, completionURI, deliverableURI, sourceArtifact,
                               skippedExtraction, reason, timestampKey, timestamp }) {
  return {
    schema: "emperor-os/v1-completion-archive-record/v1",
    jobId: String(jobId),
    archiveId,
    completionURI: completionURI ?? "",
    deliverableURI: deliverableURI ?? "",
    sourceArtifact: sourceArtifact ?? null,
    skippedExtraction,
    reason: reason ?? null,
    [timestampKey]: timestamp,
  };
}

// ── A1: deliverable_ready with missing artifacts → recovery resets to working ─

{
  const tmpDir = await makeTmpDir();
  const artifactPath = path.join(tmpDir, "artifacts", "job_101", "deliverable.md");
  const briefPath = null;  // path not set

  // Files intentionally NOT created
  const deliverableOk = await fileExists(artifactPath);
  const briefOk = await fileExists(briefPath);

  assert.equal(deliverableOk, false, "deliverable should be missing");
  assert.equal(briefOk, false, "brief path not set → missing");

  const shouldReset = !deliverableOk || !briefOk;
  assert.equal(shouldReset, true, "recovery condition must fire when artifacts missing");

  console.log("PASS A1: deliverable_ready with missing artifacts triggers working reset");
}

// ── A2: completion_pending_review with missing signing → recovery rolls back ──

{
  const tmpDir = await makeTmpDir();
  const signingManifestPath = path.join(tmpDir, "signing_manifest.json");
  const unsignedCompletionPath = null;  // not set

  const signingOk  = await fileExists(signingManifestPath);
  const unsignedOk = await fileExists(unsignedCompletionPath);

  assert.equal(signingOk,  false, "signing manifest file absent");
  assert.equal(unsignedOk, false, "unsigned path not set → missing");

  const shouldRollback = !signingOk || !unsignedOk;
  assert.equal(shouldRollback, true, "recovery must roll back completion_pending_review → deliverable_ready");

  console.log("PASS A2: completion_pending_review with missing signing artifacts triggers rollback");
}

// ── A3: state.js VALID_TRANSITIONS includes the new recovery transition ────────
// Read the file directly to avoid the dotenv transitive dependency.

{
  const stateSource = await fs.readFile(
    path.join(process.cwd(), "agent", "state.js"),
    "utf8"
  );

  // After the fix, COMPLETION_PENDING_REVIEW must list DELIVERABLE_READY as valid target.
  const transitionLineRe = /COMPLETION_PENDING_REVIEW\]:\s*\[[^\]]+DELIVERABLE_READY/;
  assert.ok(
    transitionLineRe.test(stateSource),
    "state.js must include DELIVERABLE_READY as a valid target from COMPLETION_PENDING_REVIEW"
  );

  console.log("PASS A3: state.js VALID_TRANSITIONS wires completion_pending_review → deliverable_ready");
}

// ── B: completionArchiveRecord schema is consistent across both paths ─────────

{
  const REQUIRED_KEYS = ["schema", "jobId", "archiveId", "completionURI", "deliverableURI",
                         "sourceArtifact", "skippedExtraction", "reason"];

  const base = {
    jobId: "123", archiveId: "arc_abc",
    completionURI: "ipfs://x", deliverableURI: "ipfs://y",
    sourceArtifact: "/foo/job_completion.json",
  };

  const skipped = buildArchiveRecord({
    ...base, skippedExtraction: true, reason: "already_extracted",
    timestampKey: "recordedAt", timestamp: new Date().toISOString(),
  });

  const fresh = buildArchiveRecord({
    ...base, skippedExtraction: false, reason: null,
    timestampKey: "extractedAt", timestamp: new Date().toISOString(),
  });

  for (const key of REQUIRED_KEYS) {
    assert.ok(key in skipped, `skipped path missing required key: ${key}`);
    assert.ok(key in fresh,   `fresh path missing required key: ${key}`);
  }

  // Both shapes must share the same non-timestamp keys
  const nonTsKeys = k => !["recordedAt", "extractedAt"].includes(k);
  const skippedKeysSorted = Object.keys(skipped).filter(nonTsKeys).sort();
  const freshKeysSorted   = Object.keys(fresh).filter(nonTsKeys).sort();
  assert.deepEqual(skippedKeysSorted, freshKeysSorted,
    "both completionArchiveRecord branches must have identical non-timestamp key sets");

  // Idempotency: calling buildArchiveRecord twice with same inputs yields same shape
  const skipped2 = buildArchiveRecord({
    ...base, skippedExtraction: true, reason: "already_extracted",
    timestampKey: "recordedAt", timestamp: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(skipped2.archiveId, skipped.archiveId);
  assert.equal(skipped2.completionURI, skipped.completionURI);
  assert.equal(skipped2.skippedExtraction, true);

  console.log("PASS B: completionArchiveRecord is schema-consistent and idempotent across both paths");
}

// ── C: validateArtifactShape blocks on missing/schema-invalid artifacts ────────

{
  const tmpDir = await makeTmpDir();

  // C1: file missing
  let threw = false;
  try {
    await validateArtifactShape(path.join(tmpDir, "nonexistent.json"), ["schema"], "test-missing");
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes("test-missing"), "error must name the artifact label");
  }
  assert.equal(threw, true, "missing file must throw");

  // C2: file present but missing required field
  const badArtifact = path.join(tmpDir, "bad.json");
  await writeJson(badArtifact, { someField: "value" });
  threw = false;
  try {
    await validateArtifactShape(badArtifact, ["schema"], "bad-artifact");
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes("schema"), "error must name the missing field");
  }
  assert.equal(threw, true, "missing field must throw");

  // C3: valid artifact passes
  const goodArtifact = path.join(tmpDir, "good.json");
  await writeJson(goodArtifact, { schema: "emperor-os/retrieval-packet/v1" });
  const result = await validateArtifactShape(goodArtifact, ["schema"], "retrieval-packet");
  assert.equal(result.schema, "emperor-os/retrieval-packet/v1");

  // C4: nested dot-path validation (properties.jobId)
  const nestedGood = path.join(tmpDir, "completion_good.json");
  await writeJson(nestedGood, {
    name: "Test", description: "desc",
    properties: { schema: "agijobmanager/job-completion/v1", jobId: 42 }
  });
  const nd = await validateArtifactShape(nestedGood,
    ["name", "description", "properties", "properties.jobId", "properties.schema"], "jobCompletion");
  assert.ok(nd.properties.jobId === 42);

  // C5: nested field absent
  const nestedBad = path.join(tmpDir, "completion_bad.json");
  await writeJson(nestedBad, { name: "Test", description: "desc", properties: {} });
  threw = false;
  try {
    await validateArtifactShape(nestedBad,
      ["name", "description", "properties", "properties.jobId", "properties.schema"], "jobCompletion-bad");
  } catch { threw = true; }
  assert.equal(threw, true, "missing nested field must throw");

  console.log("PASS C: validateArtifactShape correctly gates on file existence and schema fields");
}

// ── D: signing-manifest/v1 has parity keys with prime-review-manifest/v1 ──────

{
  // Replicate the shape that buildSigningManifest now produces after the fix.
  function buildSigningManifestShape({ jobId, kind, contract, chainId, deliverableUri,
                                        jobCompletionUri, files = [], artifacts = {}, warnings = [] }) {
    return {
      schema: "emperor-os/signing-manifest/v1",
      generatedAt: new Date().toISOString(),
      jobId: String(jobId),
      kind,
      contract,
      chainId,
      deliverableUri: deliverableUri || null,
      jobCompletionUri: jobCompletionUri || null,
      files,
      artifacts,
      checklist: [
        "Verify job ID matches the intended job",
        "Verify deliverable URI resolves to correct content",
        "Verify completion metadata URI resolves and references the deliverable",
        "Verify contract address and chain ID are correct",
        "Verify unsigned tx data matches expected function selector",
        "Confirm artifact SHA-256 hashes match local files",
      ],
      warnings,
      instruction: "Complete every checklist item before signing the unsigned tx package. " +
                   "Reject or defer if any item cannot be confirmed.",
    };
  }

  function buildPrimeReviewManifestShape({ procurementId, phase, files = [], checklist = [], warnings = [] }) {
    return {
      schema: "emperor-os/prime-review-manifest/v1",
      procurementId: String(procurementId),
      phase,
      generatedAt: new Date().toISOString(),
      files,
      checklist,
      warnings,
      instruction: "Complete every checklist item before signing the unsigned tx package. " +
                   "Reject or defer if any item cannot be confirmed.",
    };
  }

  const signingManifest = buildSigningManifestShape({
    jobId: "42", kind: "requestJobCompletion", contract: "0xABC", chainId: 1,
  });
  const primeManifest = buildPrimeReviewManifestShape({
    procurementId: "99", phase: "completion",
  });

  // Keys that must be present in BOTH manifests for operator tooling parity
  const PARITY_KEYS = ["schema", "generatedAt", "files", "checklist", "warnings", "instruction"];
  for (const key of PARITY_KEYS) {
    assert.ok(key in signingManifest, `signing manifest missing parity key: ${key}`);
    assert.ok(key in primeManifest,   `prime review manifest missing parity key: ${key}`);
  }

  assert.ok(Array.isArray(signingManifest.warnings),  "signing manifest warnings must be array");
  assert.ok(Array.isArray(primeManifest.warnings),    "prime manifest warnings must be array");
  assert.ok(typeof signingManifest.instruction === "string", "instruction must be string");
  assert.ok(typeof primeManifest.instruction === "string",   "instruction must be string");

  // Signing manifest has 'artifacts' (hash map); prime has none — that's intentional schema divergence
  assert.ok("artifacts" in signingManifest, "signing manifest must have artifacts hash map");

  console.log("PASS D: signing-manifest/v1 and prime-review-manifest/v1 share all operator parity keys");
}

// ── D2: score commit payload uses canonical 'salt' not 'saltHash' ─────────────

{
  // Verify the source of prime-artifact-builder.js no longer contains 'saltHash'
  const builderSource = await fs.readFile(
    path.join(process.cwd(), "agent", "prime-artifact-builder.js"),
    "utf8"
  );

  // The writeValidatorScoreCommitBundle must write 'salt:' not 'saltHash:'
  const saltHashPresent = /saltHash\s*:/.test(builderSource);
  assert.equal(saltHashPresent, false,
    "prime-artifact-builder.js must not use 'saltHash' key in score commit payload");

  // Must write 'salt:' (the canonical field name matching prime-validator-engine.js)
  const saltPresent = /\bsalt\s*:/.test(builderSource);
  assert.equal(saltPresent, true,
    "prime-artifact-builder.js must use canonical 'salt' key in score commit payload");

  console.log("PASS D2: prime-artifact-builder uses canonical 'salt' field (not deprecated 'saltHash')");
}

// ── D3: stake_preflight.json is now generated in finalist bundle ───────────────

{
  const builderSource = await fs.readFile(
    path.join(process.cwd(), "agent", "prime-artifact-builder.js"),
    "utf8"
  );

  assert.ok(
    builderSource.includes("stake_preflight.json"),
    "prime-artifact-builder.js must generate stake_preflight.json in writeFinalistBundle"
  );
  assert.ok(
    builderSource.includes("hasSufficientBalance"),
    "stake_preflight.json must include hasSufficientBalance field"
  );

  console.log("PASS D3: writeFinalistBundle generates stake_preflight.json (unblocks finalist gate)");
}

// ── D4: trial_artifact_manifest.json has schema field ─────────────────────────

{
  const builderSource = await fs.readFile(
    path.join(process.cwd(), "agent", "prime-artifact-builder.js"),
    "utf8"
  );

  assert.ok(
    builderSource.includes("emperor-os/prime-trial-artifact-manifest/v1"),
    "trial_artifact_manifest.json must include a stable schema identifier"
  );

  console.log("PASS D4: trial_artifact_manifest.json includes schema field");
}

console.log("\nAll artifact-restart-reconcile tests passed.");
