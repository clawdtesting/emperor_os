// agent/operator-review-packet.js
// Builds a packet for operator review of a dry-run job.

import { getJobArtifactPaths } from "./artifact-manager.js";

export function buildOperatorReviewPacket(jobId, artifacts) {
  return {
    schema: "emperor-os/operator-review-packet/v1",
    kind: "operator-review-packet",
    generatedAt: new Date().toISOString(),
    jobId,
    // Job summary
    jobSummary: {
      jobId,
      decision: artifacts.decision?.decision || "unknown",
      score: artifacts.decision?.score || 0,
      status: artifacts.jobCompletion?.status || "unknown"
    },
    // Decision summary
    decisionSummary: {
      decision: artifacts.decision?.decision || "unknown",
      reason: artifacts.decision?.reason || "",
      score: artifacts.decision?.score || 0,
      timestamp: artifacts.decision?.timestamp || null
    },
    // Validation summary
    validationSummary: {
      passed: artifacts.validationReport?.ok || false,
      errors: artifacts.validationReport?.errors || [],
      length: artifacts.validationReport?.length || 0,
      checkedAt: artifacts.validationReport?.timestamp || null
    },
    // Artifact references
    artifactReferences: {
      artifactManifest: artifacts.artifactManifest ? {
        path: "artifact_manifest.json",
        mimeType: "application/json"
      } : null,
      jobCompletion: artifacts.jobCompletion ? {
        path: "job_completion.json",
        mimeType: "application/json"
      } : null,
      unsignedTxRequest: artifacts.unsignedTxRequest ? {
        path: "unsigned_tx_request.json",
        mimeType: "application/json"
      } : null,
      deliverable: artifacts.deliverable ? {
        path: artifacts.deliverable.path || "deliverables/deliverable.md",
        mimeType: artifacts.deliverable.mimeType || "text/markdown"
      } : null
    },
    // Safety checklist
    safetyChecklist: {
      dryRunMode: true,
      noPrivateKeysUsed: true,
      noTransactionSigned: true,
      noTransactionBroadcast: true,
      noMainnetInteraction: true,
      validationPassed: artifacts.validationReport?.ok || false,
      safetyCheckPassed: artifacts.runManifest?.safetyFlags?.safetyCheckPassed || false,
      humanReviewRequired: true
    },
    // Required human actions
    requiredHumanActions: [
      "Review job completion and validation results",
      "Verify safety checklist confirms dry-run mode",
      "Confirm no private keys were used or transactions signed",
      "Examine deliverable for quality and completeness",
      "Decide whether to approve similar real job processing"
    ],
    // Explicit warning
    warnings: [
      "NO TRANSACTION HAS BEEN SIGNED OR BROADCAST",
      "THIS IS A DRY-RUN SIMULATION ONLY",
      "UNSIGNED TX REQUEST IS A PLACEHOLDER AND NOT EXECUTABLE ON MAINNET"
    ],
    // Artifact paths for quick reference
    artifactPaths: {
      decision: artifacts.decision ? "decision.json" : null,
      executionPlan: artifacts.executionPlan ? "execution_plan.json" : null,
      deliverable: artifacts.deliverable ? artifacts.deliverable.path : null,
      validationReport: artifacts.validationReport ? "validation_report.json" : null,
      jobCompletion: artifacts.jobCompletion ? "job_completion.json" : null,
      unsignedTxRequest: artifacts.unsignedTxRequest ? "unsigned_tx_request.json" : null,
      operatorReviewPacket: "operator_review_packet.json",
      artifactManifest: artifacts.artifactManifest ? "artifact_manifest.json" : null,
      runManifest: artifacts.runManifest ? "run_manifest.json" : null
    }
  };
}