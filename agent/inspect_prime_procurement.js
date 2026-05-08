#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.js";
import {
  fetchProcurement,
  fetchApplicationView,
  getCurrentBlock,
  getBlockHash,
} from "./prime-client.js";
import { deriveChainPhase, CHAIN_PHASE } from "./prime-phase-model.js";

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
    path.join(__dirname, "prime-client.js"),
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

function usage() {
  console.log("Usage: node agent/inspect_prime_procurement.js <procurementId> [--write-report] [--fixture]");
}

function windowsFromDeadlines(proc, nowSecs) {
  const cd = Number(proc.commitDeadline);
  const rd = Number(proc.revealDeadline);
  const fad = Number(proc.finalistAcceptDeadline);
  const td = Number(proc.trialDeadline);
  const scd = Number(proc.scoreCommitDeadline);
  const srd = Number(proc.scoreRevealDeadline);

  return {
    commitWindowOpen: nowSecs < cd,
    revealWindowOpen: nowSecs >= cd && nowSecs < rd,
    finalistWindowOpen: nowSecs >= rd && nowSecs < fad,
    trialWindowOpen: nowSecs >= fad && nowSecs < td,
    scoreCommitWindowOpen: nowSecs >= td && nowSecs < scd,
    scoreRevealWindowOpen: nowSecs >= scd && nowSecs < srd,
  };
}

function buildWarnings(proc, windows, appView) {
  const warnings = [];
  if (!windows.commitWindowOpen) warnings.push("Commit window is closed.");
  if (!windows.revealWindowOpen) warnings.push("Reveal window is closed or not yet open.");
  if (!windows.finalistWindowOpen) warnings.push("Finalist accept window is closed or not yet open.");
  if (!windows.trialWindowOpen) warnings.push("Trial window is closed or not yet open.");
  if (appView && appView.phaseName === "None") warnings.push("Agent has no on-chain application phase yet.");
  return warnings;
}

function fixtureProcurement(procurementId) {
  const now = Math.floor(Date.now() / 1000);
  return {
    jobId: "999001",
    employer: "0x000000000000000000000000000000000000dEaD".toLowerCase(),
    commitDeadline: String(now + 3600),
    revealDeadline: String(now + 7200),
    finalistAcceptDeadline: String(now + 10800),
    trialDeadline: String(now + 14400),
    scoreCommitDeadline: String(now + 18000),
    scoreRevealDeadline: String(now + 21600),
    _fixtureProcurementId: String(procurementId),
  };
}

async function writeReport(procurementId, report) {
  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "live_inspection");
  await fs.mkdir(dir, { recursive: true });
  const reportPath = path.join(dir, "prime_procurement_inspection.json");
  const tmp = `${reportPath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(report, null, 2), "utf8");
  await fs.rename(tmp, reportPath);
  return reportPath;
}

export async function inspectPrimeProcurement(procurementId, { writeReportFlag = false, fixture = false } = {}) {
  await safetySelfCheck();

  const id = String(procurementId).trim();
  if (!id) throw new Error("Missing procurementId");

  const nowSecs = Math.floor(Date.now() / 1000);
  const readOnly = true;

  if (!fixture && !process.env.ETH_RPC_URL) {
    const error = "ETH_RPC_URL not set — read-only live inspection unavailable";
    if (!writeReportFlag) {
      throw new Error(error);
    }

    const report = {
      schema: "emperor-os/prime-procurement-inspection/v1",
      readOnly,
      humanReviewRequired: true,
      noStateTransition: true,
      noUnsignedTxBuilt: true,
      procurementId: id,
      error,
      generatedAt: new Date().toISOString(),
    };
    const reportPath = await writeReport(id, report);
    return { report, reportPath };
  }

  const procurement = fixture ? fixtureProcurement(id) : await fetchProcurement(id);
  const chainPhase = deriveChainPhase(procurement, nowSecs);
  const windows = windowsFromDeadlines(procurement, nowSecs);

  let currentBlock = null;
  let currentBlockHash = null;
  if (!fixture) {
    currentBlock = await getCurrentBlock();
    currentBlockHash = await getBlockHash(currentBlock);
  }

  let appView = null;
  if (CONFIG.AGENT_ADDRESS) {
    try {
      appView = fixture
        ? { phase: 0, phaseName: "None", applicationURI: "", commitment: "0x", shortlisted: false }
        : await fetchApplicationView(id, CONFIG.AGENT_ADDRESS);
    } catch (err) {
      appView = { error: `applicationView unavailable: ${err.message}` };
    }
  }

  const warnings = buildWarnings(procurement, windows, appView && !appView.error ? appView : null);

  const summary = {
    schema: "emperor-os/prime-procurement-inspection/v1",
    readOnly,
    humanReviewRequired: true,
    noStateTransition: true,
    noUnsignedTxBuilt: true,
    procurementId: id,
    linkedJobId: procurement.jobId,
    employer: procurement.employer,
    deadlines: {
      commitDeadline: procurement.commitDeadline,
      revealDeadline: procurement.revealDeadline,
      finalistAcceptDeadline: procurement.finalistAcceptDeadline,
      trialDeadline: procurement.trialDeadline,
      scoreCommitDeadline: procurement.scoreCommitDeadline,
      scoreRevealDeadline: procurement.scoreRevealDeadline,
    },
    chainPhase,
    windows,
    currentBlock,
    currentBlockHash,
    agentAddress: CONFIG.AGENT_ADDRESS || null,
    applicationView: appView,
    warnings,
    generatedAt: new Date().toISOString(),
    fixture,
  };

  console.log("=== Prime Procurement Inspection (Read-only) ===");
  console.log(`procurementId: ${summary.procurementId}`);
  console.log(`linkedJobId: ${summary.linkedJobId}`);
  console.log(`employer: ${summary.employer}`);
  console.log(`chainPhase: ${summary.chainPhase}`);
  console.log(`windows: commit=${summary.windows.commitWindowOpen} reveal=${summary.windows.revealWindowOpen} finalist=${summary.windows.finalistWindowOpen} trial=${summary.windows.trialWindowOpen}`);
  if (summary.agentAddress) {
    console.log(`agentAddress: ${summary.agentAddress}`);
    console.log(`applicationView: ${JSON.stringify(summary.applicationView)}`);
  } else {
    console.log("agentAddress: not configured");
  }
  if (summary.warnings.length) {
    console.log("warnings:");
    for (const w of summary.warnings) console.log(`- ${w}`);
  }

  let reportPath = null;
  if (writeReportFlag) {
    reportPath = await writeReport(id, summary);
    console.log(`reportPath: ${reportPath}`);
  }

  return { report: summary, reportPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const procurementId = args.find((a) => !a.startsWith("--"));
  const writeReportFlag = args.includes("--write-report");
  const fixture = args.includes("--fixture");

  if (!procurementId) {
    usage();
    process.exit(1);
  }

  inspectPrimeProcurement(procurementId, { writeReportFlag, fixture }).catch((err) => {
    console.error(`[inspect_prime_procurement] Error: ${err.message}`);
    process.exit(1);
  });
}
