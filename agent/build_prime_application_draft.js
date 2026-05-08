#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { CONFIG } from "./config.js";
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
    path.join(__dirname, "build_prime_candidate_review.js"),
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

function toJson(obj) {
  return JSON.stringify(obj, null, 2);
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

function buildBrief(reviewPacket) {
  const procurementId = reviewPacket.procurementId;
  const linkedJobId = reviewPacket.linkedJobId ?? "unknown";
  const summary = reviewPacket.deadlineWindowSummary ?? {};
  const risks = reviewPacket.fitRiskAssessment?.risks ?? [];

  return `# Prime Application Brief\n\n## Procurement Context\n- procurementId: ${procurementId}\n- linkedJobId: ${linkedJobId}\n- employer: ${reviewPacket.employer ?? "unknown"}\n\n## Operator Summary\nThis is a draft-only application artifact prepared for operator review. No on-chain action has been prepared or executed.\n\n## Proposed Execution Approach\n1. Confirm window and eligibility from current read-only inspection.\n2. Align deliverable structure with procurement requirements.\n3. Prepare validation-ready artifacts before any commit material preparation stage.\n\n## Capability Fit\n- Signals: ${(reviewPacket.fitRiskAssessment?.fitSignals ?? []).join(", ") || "none recorded"}\n- Recommended next action from review packet: ${reviewPacket.recommendedNextAction}\n\n## Risk Assessment\n${risks.length ? risks.map((r) => `- ${r}`).join("\n") : "- No explicit risk entries provided"}\n\n## Deliverable Plan\n- Draft application content\n- Supporting evidence packet\n- Artifact manifest with hashes\n\n## Validation Plan\n- Verify completeness of narrative against review packet\n- Verify evidence references are internally consistent\n- Verify manifest hashes and file sizes\n\n## Safety Doctrine\n- Emperor OS will not sign transactions\n- Emperor OS will not broadcast transactions\n- External human review is required before any later commit-material stage\n`;
}

export async function buildPrimeApplicationDraft(procurementId, { fixture = false, force = false } = {}) {
  await safetySelfCheck();

  const id = String(procurementId).trim();
  if (!id) throw new Error("Missing procurementId");

  if (!fixture && !process.env.ETH_RPC_URL) {
    throw new Error("ETH_RPC_URL not set — live mode application drafting disabled (use --fixture for local drafting)");
  }

  const procRoot = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`);
  const reviewPath = path.join(procRoot, "review", "prime_candidate_review_packet.json");
  if (!(await fileExists(reviewPath))) {
    throw new Error(`Missing review packet: ${reviewPath}. Run build_prime_candidate_review.js first.`);
  }

  const appDir = path.join(procRoot, "application");
  await fs.mkdir(appDir, { recursive: true });

  const briefPath = path.join(appDir, "application_brief.md");
  const payloadPath = path.join(appDir, "application_payload.json");
  const evidencePath = path.join(appDir, "application_evidence_packet.json");
  const manifestPath = path.join(appDir, "application_artifact_manifest.json");
  const draftReviewPath = path.join(appDir, "application_draft_review_packet.json");

  const outputs = [briefPath, payloadPath, evidencePath, manifestPath, draftReviewPath];
  const allExist = await Promise.all(outputs.map(fileExists));
  if (allExist.every(Boolean) && !force) {
    console.log("[build_prime_application_draft] Application draft artifacts already exist (idempotent):");
    for (const p of outputs) console.log(`- ${p}`);
    return { idempotent: true, outputs };
  }

  const reviewPacket = JSON.parse(await fs.readFile(reviewPath, "utf8"));
  const brief = buildBrief(reviewPacket);
  await fs.writeFile(briefPath, brief, "utf8");

  const evidence = {
    schema: "emperor-os/prime-application-evidence/v1",
    procurementSummary: {
      procurementId: id,
      linkedJobId: reviewPacket.linkedJobId ?? null,
      employer: reviewPacket.employer ?? null,
      deadlineWindowSummary: reviewPacket.deadlineWindowSummary ?? null,
    },
    candidateReviewSummary: {
      recommendedNextAction: reviewPacket.recommendedNextAction,
      requiredHumanDecision: reviewPacket.requiredHumanDecision,
    },
    rationaleForApplying: "Candidate review indicates potential fit subject to human approval and downstream commit-material preparation.",
    riskList: reviewPacket.fitRiskAssessment?.risks ?? [],
    assumptions: [
      "Inspection data remains current at operator review time",
      "No on-chain write actions are executed in this stage",
    ],
    missingData: reviewPacket.missingDataOrWarnings ?? [],
    artifactReferences: {
      reviewPacketPath: reviewPath,
      applicationBriefPath: briefPath,
    },
    reviewChecklist: [
      "Confirm procurement and employer details",
      "Confirm approach matches procurement scope",
      "Confirm risks and assumptions are acceptable",
      "Confirm no commit/reveal tx package is produced in this stage",
    ],
    safety: {
      noUnsignedTxBuilt: true,
      noSigning: true,
      noBroadcasting: true,
      noPrivateKey: true,
      humanReviewRequired: true,
    },
    generatedAt: new Date().toISOString(),
    fixture,
  };
  await fs.writeFile(evidencePath, toJson(evidence), "utf8");

  const payload = {
    schema: "emperor-os/prime-application-payload/v1",
    procurementId: id,
    linkedJobId: reviewPacket.linkedJobId ?? null,
    sourceReviewPacketPath: reviewPath,
    applicationBriefPath: briefPath,
    evidencePacketPath: evidencePath,
    generatedAt: new Date().toISOString(),
    fixture,
    humanReviewRequired: true,
    readyForCommitPackage: false,
  };
  await fs.writeFile(payloadPath, toJson(payload), "utf8");

  const manifestEntries = [];
  for (const p of [briefPath, payloadPath, evidencePath]) {
    const stat = await fs.stat(p);
    manifestEntries.push({
      relativePath: path.relative(procRoot, p),
      sha256: await sha256File(p),
      sizeBytes: stat.size,
      mimeType: mimeTypeFor(p),
    });
  }
  const manifest = {
    schema: "emperor-os/prime-application-artifact-manifest/v1",
    procurementId: id,
    generatedAt: new Date().toISOString(),
    files: manifestEntries,
  };
  await fs.writeFile(manifestPath, toJson(manifest), "utf8");

  const draftReview = {
    schema: "emperor-os/prime-application-draft-review/v1",
    procurementId: id,
    summary: "Application draft is ready for operator review. No commit/reveal action has been performed.",
    status: {
      committed: false,
      revealed: false,
      unsignedTxBuilt: false,
    },
    nextPossibleStage: "commit material preparation after explicit human approval",
    humanReviewRequired: true,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(draftReviewPath, toJson(draftReview), "utf8");

  if (fixture) {
    const current = await getProcState(id);
    const nextStatus = current?.status && current.status !== "DISCOVERED" ? current.status : "APPLICATION_DRAFTED";
    await forceSetProcState(id, {
      status: nextStatus,
      applicationDraftReady: true,
      applicationDraftPath: briefPath,
    }, "fixture mode application draft update");
    console.log(`[build_prime_application_draft] Fixture state updated for procurement ${id}`);
  }

  console.log("[build_prime_application_draft] Wrote application draft artifacts:");
  for (const p of outputs) console.log(`- ${p}`);

  return { idempotent: false, outputs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const procurementId = args.find((a) => !a.startsWith("--"));
  const fixture = args.includes("--fixture");
  const force = args.includes("--force");

  if (!procurementId) {
    console.error("Usage: node agent/build_prime_application_draft.js <procurementId> [--fixture] [--force]");
    process.exit(1);
  }

  buildPrimeApplicationDraft(procurementId, { fixture, force }).catch((err) => {
    console.error(`[build_prime_application_draft] Error: ${err.message}`);
    process.exit(1);
  });
}
