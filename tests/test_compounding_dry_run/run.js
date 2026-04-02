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
  const contentMod = await import("../../agent/prime/prime-content.js");
  const validateMod = await import("../../core/validate.js");

  // Run 1: complete job creates an archive primitive.
  await retrievalMod.extractSteppingStone({
    procurementId: "dryrun_1",
    phase: "analysis",
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
    searchKeywords: ["protocol", "architecture", "validator"],
  });
  if (!retrievalPacket.results?.length) {
    throw new Error("second execution did not retrieve prior primitive");
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

  console.log("dry-run OK");
  console.log(`archive entries: ${archiveIndex.entries.length}`);
  console.log(`retrieval results: ${retrievalPacket.results.length}`);
}

main().catch((err) => {
  console.error("dry-run FAILED:", err.message);
  process.exit(1);
});
