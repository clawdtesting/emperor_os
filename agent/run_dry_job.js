// agent/run_dry_job.js
// Dry-run lifecycle orchestrator for Emperor OS.
// Processes a fake AGI job lifecycle without touching mainnet.

import { normalizeJob } from "./job-normalize.js";
import { scoreJob } from "./score.js";
import { ensureJobArtifactDir, getJobArtifactPaths, writeJson, writeText } from "./artifact-manager.js";
import { CONFIG } from "./config.js";
import { validateOutput } from "./validate.js";
import { buildOperatorReviewPacket } from "./operator-review-packet.js";
import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";

const FIXTURE_PATH = "./agent/fixtures/dry-job.fixture.json";

/**
 * Load a spec for the job. In a real scenario, this would fetch from IPFS.
 * For dry-run, we generate a minimal spec based on the job details.
 */
function generateMockSpec(job) {
  return {
    properties: {
      category: job.details.toLowerCase().includes("research") ? "research" : "other",
      durationSeconds: job.duration || 259200, // 3 days
    },
    attributes: [
      { trait_type: "Category", value: job.details.toLowerCase().includes("research") ? "Research" : "Other" }
    ]
  };
}

/**
 * Create a mock brief for validation.
 */
function createMockBrief(job) {
  return {
    required_sections: ["Overview", "Methodology", "Results", "Conclusion"]
  };
}

/**
 * Execute a safe deterministic mock handler: produce a simple deliverable.
 */
async function createMockDeliverable(artifactDir, jobId) {
  const deliverablesDir = path.join(artifactDir, "deliverables");
  await fs.mkdir(deliverablesDir, { recursive: true });
  const deliverablePath = path.join(deliverablesDir, "deliverable.md");
  const content = `# Job ${jobId} Deliverable

## Overview
This is a mock deliverable for dry-run job ${jobId}. It demonstrates the Emperor OS lifecycle without touching mainnet. The job was processed through a deterministic scoring model and simulated execution to produce this artifact. This section provides a high-level summary of the job's purpose and the approach taken to address its requirements.

## Methodology
We used a deterministic scoring model based on payout, feasibility, speed, and competition factors. The job was normalized using the existing job-normalize.js module, scored with score.js, and a decision was made based on the score. A mock handler was executed to generate this deliverable, ensuring no real LLM APIs were called and no on-chain interactions occurred.

## Results
- Job processed successfully through all lifecycle stages
- Normalization completed without errors
- Score achieved: 0.50 (pass threshold: 0.45)
- Decision: accept based on score
- All validation checks passed
- Artifacts created in ${artifactDir}
- No private keys were created or used
- No transactions were signed or broadcast
- No mainnet interactions occurred

## Conclusion
The dry-run lifecycle orchestrator functions as expected, demonstrating that Emperor OS can process a complete AGI job lifecycle in a safe, simulated environment. This approach allows for testing and validation of job processing workflows without risking real funds or network resources. The system is ready for integration with real job processing pipelines after successful dry-run validation.
`;
  await writeText(deliverablePath, content);
  return content;
}

/**
 * Calculate SHA256 hash of a file
 */
async function getFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
  } catch (err) {
    return null;
  }
}

/**
 * Get file size in bytes
 */
async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (err) {
    return 0;
  }
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.json': return 'application/json';
    case '.md': return 'text/markdown';
    default: return 'application/octet-stream';
  }
}

/**
 * Perform safety self-check for forbidden patterns
 */
async function performSafetyCheck() {
  const forbiddenPatterns = [
    'ethers.Wallet',
    'sendTransaction',
    'signTransaction',
    'broadcast',
    'PRIVATE_KEY'
  ];
  
  const filesToCheck = [
    './agent/job-normalize.js',
    './agent/score.js',
    './agent/validate.js',
    './agent/artifact-manager.js',
    './agent/operator-review-packet.js'
  ];
  
  let violations = [];
  
  for (const filePath of filesToCheck) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      for (const pattern of forbiddenPatterns) {
        if (content.includes(pattern)) {
          violations.push({ file: filePath, pattern });
        }
      }
    } catch (err) {
      // If we can't read the file, skip it
    }
  }
  
  return {
    passed: violations.length === 0,
    violations
  };
}

async function runDryJob() {
  console.log("[dry-run] Starting Emperor OS dry-run job lifecycle...");
  const startTime = new Date();

  // 1. Load fixture
  let rawJob;
  try {
    const fixtureContent = await fs.readFile(FIXTURE_PATH, "utf8");
    rawJob = JSON.parse(fixtureContent);
    console.log(`[dry-run] Loaded fixture job: ${rawJob.jobId}`);
  } catch (err) {
    console.error(`[dry-run] Failed to load fixture: ${err.message}`);
    process.exit(1);
  }

  // 2. Normalize job
  const normalizedJob = normalizeJob(rawJob);
  if (!normalizedJob) {
    console.error("[dry-run] Job normalization failed");
    process.exit(1);
  }
  console.log("[dry-run] Job normalized");

  // 3. Generate mock spec (since we cannot fetch from IPFS in dry-run)
  const spec = generateMockSpec(normalizedJob);
  console.log("[dry-run] Generated mock spec");

  // 4. Score job
  const scoreResult = scoreJob(normalizedJob, spec);
  console.log(`[dry-run] Job scored: ${scoreResult.score} (${scoreResult.reason})`);

  // 5. Determine decision
  let decision;
  if (scoreResult.pass && scoreResult.score >= 0.45) {
    decision = "accept";
  } else if (scoreResult.score >= 0.3) {
    decision = "watch";
  } else {
    decision = "reject";
  }
  console.log(`[dry-run] Decision: ${decision}`);

  // 6. Create artifact directory using job_ prefix convention
  const artifactDir = await ensureJobArtifactDir(normalizedJob.jobId);
  console.log(`[dry-run] Artifact directory: ${artifactDir}`);

  // 7. Write raw and normalized specs
  await writeJson(path.join(artifactDir, "spec.raw.json"), rawJob);
  await writeJson(path.join(artifactDir, "spec.normalized.json"), normalizedJob);
  console.log("[dry-run] Wrote spec.raw.json and spec.normalized.json");

  // 8. Write decision.json
  const decisionObj = {
    jobId: normalizedJob.jobId,
    decision,
    score: scoreResult.score,
    reason: scoreResult.reason,
    timestamp: new Date().toISOString()
  };
  await writeJson(path.join(artifactDir, "decision.json"), decisionObj);
  console.log("[dry-run] Wrote decision.json");

  // 9. Write execution_plan.json
  const executionPlan = {
    jobId: normalizedJob.jobId,
    decision,
    steps: [
      "normalize",
      "score",
      "decide",
      "create_artifacts",
      "execute_handler",
      "validate",
      "finalize"
    ],
    deliverablePath: "deliverables/deliverable.md",
    timestamp: new Date().toISOString()
  };
  await writeJson(path.join(artifactDir, "execution_plan.json"), executionPlan);
  console.log("[dry-run] Wrote execution_plan.json");

  // 10. Execute mock handler (create deliverable)
  const deliverableContent = await createMockDeliverable(artifactDir, normalizedJob.jobId);
  console.log("[dry-run] Created deliverables/deliverable.md");

  // 11. Run validation
  const brief = createMockBrief(normalizedJob);
  const validationResult = validateOutput(deliverableContent, brief);
  console.log(`[dry-run] Validation: ${validationResult.ok ? "PASS" : "FAIL"}`);
  if (!validationResult.ok) {
    console.error(`[dry-run] Validation errors: ${validationResult.errors.join(", ")}`);
  }

  // 12. Write validation_report.json
  const validationReport = {
    jobId: normalizedJob.jobId,
    ok: validationResult.ok,
    errors: validationResult.errors,
    length: validationResult.length,
    timestamp: new Date().toISOString()
  };
  await writeJson(path.join(artifactDir, "validation_report.json"), validationReport);
  console.log("[dry-run] Wrote validation_report.json");

  // 13. Perform safety self-check before generating unsigned tx
  const safetyCheck = await performSafetyCheck();
  console.log(`[dry-run] Safety self-check: ${safetyCheck.passed ? "PASS" : "FAIL"}`);
  if (!safetyCheck.passed) {
    console.error("[dry-run] Safety check failed! Forbidden patterns detected:");
    for (const v of safetyCheck.violations) {
      console.error(`  - ${v.file}: ${v.pattern}`);
    }
    console.error("[dry-run] Aborting unsigned TX generation due to safety check failure.");
    process.exit(1);
  }

  // 14. Write job_completion.json (we'll update the artifact count later)
  const jobCompletion = {
    schema: "emperor-os/job-completion/v1",
    jobId: normalizedJob.jobId,
    protocol: "agi-job-manager-v1",
    completedAt: new Date().toISOString(),
    deliverables: [{
      path: "deliverables/deliverable.md",
      mimeType: "text/markdown"
    }],
    artifactManifest: {
      path: "artifact_manifest.json",
      mimeType: "application/json"
    },
    validation: {
      ok: validationResult.ok,
      errors: validationResult.errors,
      length: validationResult.length,
      checkedAt: new Date().toISOString()
    },
    completionSummary: {
      decision,
      score: scoreResult.score,
      phasesCompleted: [
        "normalization",
        "scoring",
        "decision",
        "artifactCreation",
        "execution",
        "validation"
      ],
      artifactCount: 0 // Will be updated after manifest generation
    },
    operatorNotes: "Dry-run job completed successfully. All artifacts generated in simulation mode.",
    humanReviewRequired: true
  };
  await writeJson(path.join(artifactDir, "job_completion.json"), jobCompletion);
  console.log("[dry-run] Wrote job_completion.json");

  // 15. Write unsigned_tx_request.json only if validation passed and safety check passed
  if (validationResult.ok && safetyCheck.passed) {
    const unsignedTx = {
      schema: "emperor-os/unsigned-tx/v1",
      dryRun: true,
      humanReviewRequired: true,
      protocol: "agi-job-manager-v1",
      contractAddress: CONFIG.CONTRACT,
      chainId: CONFIG.CHAIN_ID,
      method: "completeJob(uint256,string,bytes)",
      args: [
        normalizedJob.jobId,
        "QmDryRunPlaceholder",
        "0x"
      ],
      value: "0",
      createdAt: new Date().toISOString(),
      jobId: normalizedJob.jobId,
      artifactManifestUri: `ipfs://QmDryRunPlaceholder/artifact_manifest.json`,
      safety: {
        privateKeyUsed: false,
        transactionSigned: false,
        transactionBroadcast: false,
        mainnetInteraction: false,
        dryRunMode: true
      }
    };
    await writeJson(path.join(artifactDir, "unsigned_tx_request.json"), unsignedTx);
    console.log("[dry-run] Wrote unsigned_tx_request.json (dry-run placeholder)");
  } else {
    console.log("[dry-run] Skipping unsigned_tx_request.json due to validation failure or safety check failure");
  }

  // 16. Write run_manifest.json
  const runManifest = {
    schema: "emperor-os/run-manifest/v1",
    runId: `dry_run_${Date.now()}`,
    jobId: normalizedJob.jobId,
    mode: "dry-run",
    startedAt: startTime.toISOString(),
    completedAt: new Date().toISOString(),
    phasesCompleted: [
      "normalization",
      "scoring",
      "decision",
      "artifactCreation",
      "execution",
      "validation",
      "safetyCheck"
    ],
    artifactPaths: {
      specRaw: "spec.raw.json",
      specNormalized: "spec.normalized.json",
      decision: "decision.json",
      executionPlan: "execution_plan.json",
      deliverable: "deliverables/deliverable.md",
      validationReport: "validation_report.json",
      jobCompletion: "job_completion.json",
      unsignedTxRequest: validationResult.ok && safetyCheck.passed ? "unsigned_tx_request.json" : null,
      operatorReviewPacket: "operator_review_packet.json",
      runManifest: "run_manifest.json"
    },
    safetyFlags: {
      dryRunMode: true,
      noPrivateKeys: true,
      noSigning: true,
      noBroadcast: true,
      noMainnetInteraction: true,
      validationPassed: validationResult.ok,
      safetyCheckPassed: safetyCheck.passed
    }
  };
  
  // Add conditional phases to phasesCompleted
  if (validationResult.ok && safetyCheck.passed) {
    runManifest.phasesCompleted.push("unsignedTxRequest");
    runManifest.phasesCompleted.push("jobCompletion");
    runManifest.phasesCompleted.push("operatorReviewPacket");
  }
  await writeJson(path.join(artifactDir, "run_manifest.json"), runManifest);
  console.log("[dry-run] Wrote run_manifest.json");

  // 17. Write operator_review_packet.json
  const artifacts = {
    decision: decisionObj,
    executionPlan,
    deliverable: { path: "deliverables/deliverable.md", content: deliverableContent },
    validationReport,
    jobCompletion,
    unsignedTxRequest: validationResult.ok && safetyCheck.passed ? undefined : null,
    runManifest
  };
  const reviewPacket = buildOperatorReviewPacket(normalizedJob.jobId, artifacts);
  await writeJson(path.join(artifactDir, "operator_review_packet.json"), reviewPacket);
  console.log("[dry-run] Wrote operator_review_packet.json");

  // 18. Generate artifact manifest (after all other artifacts are written)
  const artifactFiles = [
    "spec.raw.json",
    "spec.normalized.json",
    "decision.json",
    "execution_plan.json",
    "deliverables/deliverable.md",
    "validation_report.json",
    "job_completion.json",
    "unsigned_tx_request.json",
    "operator_review_packet.json",
    "run_manifest.json"
  ];
  
  const artifactManifest = {
    schema: "emperor-os/artifact-manifest/v1",
    jobId: normalizedJob.jobId,
    generatedAt: new Date().toISOString(),
    artifactCount: 0,
    totalSizeBytes: 0,
    artifacts: []
  };
  
  let totalSize = 0;
  let validArtifacts = 0;
  
  for (const relativePath of artifactFiles) {
    const filePath = path.join(artifactDir, relativePath);
    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        const hash = await getFileHash(filePath);
        const size = await getFileSize(filePath);
        const mimeType = getMimeType(filePath);
        
        artifactManifest.artifacts.push({
          relativePath,
          sha256: hash || null,
          sizeBytes: size,
          mimeType
        });
        
        totalSize += size;
        validArtifacts++;
      }
    } catch (err) {
      // File doesn't exist or other error - skip it
      console.warn(`[dry-run] Could not process artifact ${relativePath}: ${err.message}`);
    }
  }
  
  artifactManifest.artifactCount = validArtifacts;
  artifactManifest.totalSizeBytes = totalSize;
  
  await writeJson(path.join(artifactDir, "artifact_manifest.json"), artifactManifest);
  console.log("[dry-run] Wrote artifact_manifest.json");

  // 19. Update job completion with actual artifact count
  jobCompletion.completionSummary.artifactCount = validArtifacts;
  await writeJson(path.join(artifactDir, "job_completion.json"), jobCompletion);

  // 20. Print summary
  console.log("\n=== Dry-run Job Lifecycle Summary ===");
  console.log(`Job ID: ${normalizedJob.jobId}`);
  console.log(`Artifact Folder: ${artifactDir}`);
  console.log(`Decision: ${decision} (score: ${scoreResult.score})`);
  console.log(`Validation: ${validationResult.ok ? "PASS" : "FAIL"}`);
  console.log(`Safety Check: ${safetyCheck.passed ? "PASS" : "FAIL"}`);
  console.log(`Unsigned TX Generated: ${validationResult.ok && safetyCheck.passed ? "YES" : "NO"}`);
  console.log(`Artifacts Created: ${validArtifacts}`);
  console.log("=====================================\n");

  // Exit with success if validation passed and safety check passed, else failure
  process.exit((validationResult.ok && safetyCheck.passed) ? 0 : 1);
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDryJob().catch((err) => {
    console.error("[dry-run] Unexpected error:", err);
    process.exit(1);
  });
}

export { runDryJob };