#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash, randomBytes } from "crypto";
import { CONFIG } from "./config.js";
import { computeCommitment } from "./prime-client.js";
import { getProcState, forceSetProcState } from "./prime-state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const forbiddenChecks = [
  { label: "ethers.Wallet runtime", regex: /new\s+ethers\s*\.\s*Wallet\s*\(/ },
  { label: "sendTransaction runtime", regex: /\bsendTransaction\s*\(/ },
  { label: "signTransaction runtime", regex: /\bsignTransaction\s*\(/ },
  { label: "broadcast runtime", regex: /\bbroadcast\s*\(/ },
  { label: "PRIVATE_KEY runtime", regex: /process\s*\.\s*env\s*\.\s*PRIVATE_KEY/ },
];

async function safetySelfCheck() {
  const filesToCheck = [
    __filename,
    path.join(__dirname, "build_prime_application_draft.js"),
    path.join(__dirname, "prime-client.js"),
  ];
  for (const filePath of filesToCheck) {
    const content = await fs.readFile(filePath, "utf8");
    for (const check of forbiddenChecks) {
      if (check.regex.test(content)) {
        throw new Error(`SAFETY VIOLATION: forbidden pattern "${check.label}" found in ${filePath}`);
      }
    }
  }
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function sha256File(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

function mimeTypeFor(filePath) {
  if (filePath.endsWith(".md")) return "text/markdown";
  if (filePath.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

function guidanceMissingInputs(id) {
  return `Missing application draft inputs for procurement ${id}. Run:\n` +
    `  node agent/build_prime_candidate_review.js ${id} --fixture\n` +
    `  node agent/build_prime_application_draft.js ${id} --fixture`;
}

export async function buildPrimeCommitMaterial(procurementId, { fixture = false, force = false } = {}) {
  await safetySelfCheck();

  const id = String(procurementId).trim();
  if (!id) throw new Error("Missing procurementId");

  if (!fixture && !process.env.ETH_RPC_URL) {
    throw new Error("ETH_RPC_URL not set — live mode commit material preparation disabled (use --fixture for local preparation)");
  }

  const procRoot = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`);
  const appDir = path.join(procRoot, "application");

  const briefPath = path.join(appDir, "application_brief.md");
  const payloadPath = path.join(appDir, "application_payload.json");
  const evidencePath = path.join(appDir, "application_evidence_packet.json");
  const appManifestPath = path.join(appDir, "application_artifact_manifest.json");

  const required = [briefPath, payloadPath, evidencePath, appManifestPath];
  for (const p of required) {
    if (!(await fileExists(p))) {
      throw new Error(guidanceMissingInputs(id));
    }
  }

  const commitmentPath = path.join(appDir, "commitment_material.json");
  const reviewPath = path.join(appDir, "commitment_review_packet.json");
  const manifestPath = path.join(appDir, "commitment_artifact_manifest.json");

  const outputs = [commitmentPath, reviewPath, manifestPath];
  const existFlags = await Promise.all(outputs.map(fileExists));
  if (existFlags.every(Boolean) && !force) {
    console.log("[build_prime_commit_material] Commitment artifacts already exist (idempotent):");
    for (const p of outputs) console.log(`- ${p}`);
    return { idempotent: true, outputs };
  }

  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  const linkedJobId = payload.linkedJobId ?? null;

  const applicationBriefHash = await sha256File(briefPath);
  const applicationPayloadHash = await sha256File(payloadPath);
  const applicationEvidenceHash = await sha256File(evidencePath);

  const salt = `0x${randomBytes(32).toString("hex")}`;
  const applicationURI = null;
  const requiresRealApplicationUri = true;
  const commitmentMode = "fixture_provisional";
  const executableAsIs = false;
  const readyForCommitTx = false;

  const agentAddress = CONFIG.AGENT_ADDRESS || "0x0000000000000000000000000000000000000000";
  const provisionalUri = "fixture://missing-application-uri";
  const commitmentHash = computeCommitment(id, agentAddress, provisionalUri, salt);

  const commitmentMaterial = {
    schema: "emperor-os/prime-commitment-material/v1",
    procurementId: id,
    linkedJobId,
    applicationURI,
    applicationBriefHash,
    applicationPayloadHash,
    applicationEvidenceHash,
    salt,
    commitmentHash,
    commitmentFormula: "keccak256(procurementId, agentAddress, applicationURI, salt)",
    commitmentMode,
    executableAsIs,
    fixture,
    requiresRealApplicationUri,
    readyForCommitTx,
    humanReviewRequired: true,
    generatedAt: new Date().toISOString(),
  };

  await writeJsonAtomic(commitmentPath, commitmentMaterial);

  const reviewPacket = {
    schema: "emperor-os/prime-commitment-review/v1",
    procurementId: id,
    linkedJobId,
    sourceApplicationFiles: {
      applicationBriefPath: briefPath,
      applicationPayloadPath: payloadPath,
      applicationEvidencePath: evidencePath,
      applicationArtifactManifestPath: appManifestPath,
    },
    hashes: {
      applicationBriefHash,
      applicationPayloadHash,
      applicationEvidenceHash,
    },
    saltPresent: true,
    commitmentHash,
    applicationUriStatus: "missing_real_uri",
    warnings: [
      "applicationURI is null; commitment is provisional",
      "requiresRealApplicationUri is true; do not build live commit tx yet",
    ],
    requiredHumanDecisions: [
      "Confirm final application URI publication plan",
      "Approve later commit package preparation stage explicitly",
    ],
    nextAllowedAction: "prepare_real_application_uri_then_operator_approved_commit_package_stage",
    safety: {
      noUnsignedTxBuilt: true,
      noSigning: true,
      noBroadcasting: true,
      noPrivateKey: true,
      externalHumanReviewRequired: true,
    },
    generatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(reviewPath, reviewPacket);

  const manifestFiles = [
    briefPath,
    payloadPath,
    evidencePath,
    appManifestPath,
    commitmentPath,
    reviewPath,
  ];
  const manifestEntries = [];
  for (const p of manifestFiles) {
    const stat = await fs.stat(p);
    manifestEntries.push({
      relativePath: path.relative(procRoot, p),
      sha256: await sha256File(p),
      sizeBytes: stat.size,
      mimeType: mimeTypeFor(p),
    });
  }

  const commitManifest = {
    schema: "emperor-os/prime-commitment-artifact-manifest/v1",
    procurementId: id,
    generatedAt: new Date().toISOString(),
    files: manifestEntries,
  };
  await writeJsonAtomic(manifestPath, commitManifest);

  if (fixture) {
    const current = await getProcState(id);
    const keepStatus = current?.status ?? "APPLICATION_DRAFTED";
    await forceSetProcState(id, {
      status: keepStatus,
      primeCommitMaterialPrepared: true,
      commitmentMaterialPath: commitmentPath,
      commitmentReadyForTx: false,
    }, "fixture mode commit material prepared");
    console.log(`[build_prime_commit_material] Fixture state updated for procurement ${id}`);
  }

  console.log("[build_prime_commit_material] Wrote commitment artifacts:");
  for (const p of outputs) console.log(`- ${p}`);
  console.log(`[build_prime_commit_material] commitmentMode=${commitmentMode}`);

  return { idempotent: false, outputs, commitmentMode };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const procurementId = args.find((a) => !a.startsWith("--"));
  const fixture = args.includes("--fixture");
  const force = args.includes("--force");

  if (!procurementId) {
    console.error("Usage: node agent/build_prime_commit_material.js <procurementId> [--fixture] [--force]");
    process.exit(1);
  }

  buildPrimeCommitMaterial(procurementId, { fixture, force }).catch((err) => {
    console.error(`[build_prime_commit_material] Error: ${err.message}`);
    process.exit(1);
  });
}
