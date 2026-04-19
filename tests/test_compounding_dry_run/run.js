import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const TMP_WORKSPACE = path.join(REPO_ROOT, ".tmp", `compounding_dry_run_workspace_${Date.now()}`);

async function main() {
  process.env.WORKSPACE_ROOT = TMP_WORKSPACE;

  await fs.mkdir(TMP_WORKSPACE, { recursive: true });

  const retrievalMod = await import("../../agent/prime-retrieval.js");
  const contentMod = await import("../../agent/prime-v1/prime-content.js");
  const validateMod = await import("../../agent/validate.js");

  // Run 1: complete job creates an archive primitive.
  await retrievalMod.extractSteppingStone({
    source: "v1",
    procurementId: "dryrun_1",
    phase: "analysis",
    artifactPath: path.join(TMP_WORKSPACE, "artifacts", "job_1", "deliverable.md"),
    metadata: {
      domain: "protocol",
      deliverableType: "analysis",
      timestamp: new Date().toISOString(),
      qualityScore: 0.92,
      wasAccepted: true,
    },
    primitive: {
      artifactPath: path.join(TMP_WORKSPACE, "artifacts", "job_1", "deliverable.md"),
      outcomeStatus: "validated",
      outcomeScore: 0.92,
      contentSample: "This is a prior high-quality analysis deliverable for protocol architecture.",
    },
    title: "Protocol architecture analysis template",
    summary: "Prior successful analysis on procurement architecture and validator integration.",
    tags: ["analysis", "protocol", "architecture", "validator"],
  });

  const archiveIndexPath = path.join(TMP_WORKSPACE, "archive", "index.json");
  const archiveIndex = JSON.parse(await fs.readFile(archiveIndexPath, "utf8"));
  if (!archiveIndex.entries?.length) {
    throw new Error("archive index did not grow after first execution");
  }

  // Run 2: similar job retrieves the first primitive.
  const retrievalPacket = await retrievalMod.createRetrievalPacket({
    procurementId: "dryrun_2",
    phase: "analysis",
    keywords: ["protocol", "architecture", "validator"],
  });
  const retrievalPacketPath = path.join(
    TMP_WORKSPACE,
    "artifacts",
    "proc_dryrun_2",
    "retrieval",
    "retrieval_packet_analysis.json"
  );
  await fs.access(retrievalPacketPath);
  await fs.access(path.join(TMP_WORKSPACE, "artifacts", "proc_dryrun_2", "retrieval", "retrieval_packet.json"));

  if (!retrievalPacket.results?.length) {
    throw new Error("second execution did not retrieve prior primitive");
  }

  const emptyPacket = await retrievalMod.ensureRetrievalPacketForProc({
    procurementId: "dryrun_3",
    phase: "completion",
    keywords: ["nonexistentkeyword"],
    noResultsReason: "test_no_results",
  });
  if (emptyPacket.resultsFound !== 0 || emptyPacket.retrievalStatus !== "empty") {
    throw new Error("empty retrieval packet was not recorded canonically");
  }

  const trialMarkdown = contentMod.generateTrialMarkdown({
    procurementId: "dryrun_2",
    jobSpec: {
      title: "Architecture analysis for validator pipeline",
      details: "Analyze protocol architecture and validator scoring mechanics.",
      category: "analysis",
    },
    retrievalPacket,
  });
  if (!trialMarkdown.includes("Retrieved Protocol Context")) {
    throw new Error("retrieved content was not injected into generated artifact");
  }
  if (!trialMarkdown.includes("Protocol architecture analysis template")) {
    throw new Error("generated content did not include retrieved prior work pattern");
  }

  // Validation guard: placeholder-only section bodies should fail.
  const placeholderOnly = `# Deliverable

## Overview
*[Main analysis results]*

## Key Findings
*[Insert findings]*

## Detailed Analysis
*[Detailed analysis here]*

## Implications
*[Implications]*

## Conclusion
*[Conclusion here]*`;

  const validation = validateMod.validateOutput(placeholderOnly, {
    required_sections: ["Overview", "Key Findings", "Detailed Analysis", "Implications", "Conclusion"],
  });
  if (validation.ok) {
    throw new Error("placeholder-only artifact unexpectedly passed validation");
  }

  const completionRecordPath = path.join(
    TMP_WORKSPACE,
    "artifacts",
    "proc_dryrun_2",
    "completion",
    "completion_archive_record.json"
  );
  const artifactPath = path.join(TMP_WORKSPACE, "artifacts", "proc_dryrun_2", "trial", "trial_deliverable.md");
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, trialMarkdown, "utf8");

  const completionRecordOne = await retrievalMod.ensureTerminalCompoundingArtifacts({
    source: "prime",
    procurementId: "dryrun_2",
    phase: "completion",
    artifactPath,
    completionRecordPath,
    completionURI: "ipfs://dryrun_completion",
    deliverableURI: "ipfs://dryrun_deliverable",
    title: "Dry run completion artifact",
    summary: "Dry run completion artifact summary",
    tags: ["dryrun", "completion"],
    metadata: { domain: "protocol", deliverableType: "analysis", qualityScore: 1, wasAccepted: true },
    primitive: { outcomeStatus: "completion_ready", outcomeScore: 1 },
  });
  const completionRecordTwo = await retrievalMod.ensureTerminalCompoundingArtifacts({
    source: "prime",
    procurementId: "dryrun_2",
    phase: "completion",
    artifactPath,
    completionRecordPath,
    completionURI: "ipfs://dryrun_completion",
    deliverableURI: "ipfs://dryrun_deliverable",
    title: "Dry run completion artifact",
    summary: "Dry run completion artifact summary",
    tags: ["dryrun", "completion"],
    metadata: { domain: "protocol", deliverableType: "analysis", qualityScore: 1, wasAccepted: true },
    primitive: { outcomeStatus: "completion_ready", outcomeScore: 1 },
  });
  if (completionRecordOne.archiveId !== completionRecordTwo.archiveId) {
    throw new Error("completion compounding was not idempotent");
  }
  const finalIndex = JSON.parse(await fs.readFile(archiveIndexPath, "utf8"));
  const matches = finalIndex.entries.filter((e) => e.id === completionRecordOne.archiveId);
  if (matches.length !== 1) {
    throw new Error("archive index was not updated deterministically for completion record");
  }

  console.log("dry-run OK");
  console.log(`archive entries: ${finalIndex.entries.length}`);
  console.log(`retrieval results: ${retrievalPacket.results.length}`);
  console.log(`retrieval packet: ${retrievalPacketPath}`);
  console.log(`completion archive record: ${completionRecordPath}`);
}

main().catch((err) => {
  console.error("dry-run FAILED:", err.message);
  process.exit(1);
});
