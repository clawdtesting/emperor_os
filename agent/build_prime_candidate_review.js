#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.js";
import { inspectPrimeProcurement } from "./inspect_prime_procurement.js";
import { forceSetProcState, getProcState } from "./prime-state.js";

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
    path.join(__dirname, "inspect_prime_procurement.js"),
    path.join(__dirname, "prime-inspector.js"),
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assessFitAndRisk(report) {
  const fitSignals = [];
  const risks = [];

  if (report.windows?.commitWindowOpen) fitSignals.push("commit_window_open");
  if (report.windows?.revealWindowOpen) fitSignals.push("reveal_window_open");
  if (report.applicationView?.shortlisted === true) fitSignals.push("shortlisted");

  if (!report.windows?.commitWindowOpen) risks.push("commit window closed or near close");
  if (!report.windows?.revealWindowOpen && !report.windows?.commitWindowOpen) risks.push("active application windows unavailable");
  if (!report.agentAddress) risks.push("agent address not configured; application status uncertain");
  if (report.applicationView?.error) risks.push(report.applicationView.error);
  for (const w of report.warnings ?? []) risks.push(w);

  let recommendedNextAction = "watch";
  if (report.windows?.commitWindowOpen) recommendedNextAction = "prepare_application_draft";
  if (!report.windows?.commitWindowOpen && !report.windows?.revealWindowOpen) recommendedNextAction = "watch";
  if (risks.length >= 4 && !report.windows?.commitWindowOpen) recommendedNextAction = "reject";

  const requiredHumanDecision =
    recommendedNextAction === "prepare_application_draft"
      ? "Operator decide whether to proceed with application drafting and subsequent manual review."
      : recommendedNextAction === "reject"
      ? "Operator decide whether to reject this procurement for now."
      : "Operator decide whether to continue watching this procurement window.";

  return {
    fitSignals,
    risks: [...new Set(risks)],
    recommendedNextAction,
    requiredHumanDecision,
  };
}

async function writePacket(packetPath, packet) {
  await fs.mkdir(path.dirname(packetPath), { recursive: true });
  const tmp = `${packetPath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(packet, null, 2), "utf8");
  await fs.rename(tmp, packetPath);
}

export async function buildPrimeCandidateReview(procurementId, { fixture = false, force = false } = {}) {
  await safetySelfCheck();

  const id = String(procurementId).trim();
  if (!id) throw new Error("Missing procurementId");

  const reviewDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "review");
  const packetPath = path.join(reviewDir, "prime_candidate_review_packet.json");

  if (await fileExists(packetPath) && !force) {
    console.log(`[build_prime_candidate_review] Packet already exists (idempotent): ${packetPath}`);
    return { packetPath, idempotent: true };
  }

  if (!fixture && !process.env.ETH_RPC_URL) {
    throw new Error("ETH_RPC_URL not set — live read-only inspection unavailable");
  }

  const { report } = await inspectPrimeProcurement(id, { writeReportFlag: false, fixture });
  const assessment = assessFitAndRisk(report);

  const packet = {
    schema: "emperor-os/prime-candidate-review/v1",
    procurementId: id,
    linkedJobId: report.linkedJobId ?? null,
    employer: report.employer ?? null,
    deadlineWindowSummary: {
      chainPhase: report.chainPhase,
      windows: report.windows,
      deadlines: report.deadlines,
    },
    applicationStatus: report.applicationView ?? null,
    fitRiskAssessment: {
      fitSignals: assessment.fitSignals,
      risks: assessment.risks,
    },
    requiredHumanDecision: assessment.requiredHumanDecision,
    recommendedNextAction: assessment.recommendedNextAction,
    missingDataOrWarnings: report.warnings ?? [],
    readOnly: true,
    noUnsignedTxBuilt: true,
    noStateTransition: !fixture,
    humanReviewRequired: true,
    safety: {
      noSigning: true,
      noBroadcasting: true,
      noPrivateKey: true,
      noLiveWritePackageBuilt: true,
    },
    generatedAt: new Date().toISOString(),
    fixture,
  };

  await writePacket(packetPath, packet);
  console.log(`[build_prime_candidate_review] Wrote review packet: ${packetPath}`);

  if (fixture) {
    const current = await getProcState(id);
    const nextStatus = current?.status ?? "INSPECTED";
    await forceSetProcState(
      id,
      {
        status: nextStatus,
        primeCandidateReviewPending: true,
        reviewPacketPath: packetPath,
      },
      "fixture mode local review packet update"
    );
    console.log(`[build_prime_candidate_review] Fixture state updated for procurement ${id}`);
  }

  return { packetPath, idempotent: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const procurementId = args.find((a) => !a.startsWith("--"));
  const fixture = args.includes("--fixture");
  const force = args.includes("--force");

  if (!procurementId) {
    console.error("Usage: node agent/build_prime_candidate_review.js <procurementId> [--fixture] [--force]");
    process.exit(1);
  }

  buildPrimeCandidateReview(procurementId, { fixture, force }).catch((err) => {
    console.error(`[build_prime_candidate_review] Error: ${err.message}`);
    process.exit(1);
  });
}
