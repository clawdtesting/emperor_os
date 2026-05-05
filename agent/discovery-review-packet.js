// agent/discovery-review-packet.js
// Builds a packet for operator review of discovered jobs.

import { getJobArtifactPaths } from "./artifact-manager.js";

export function buildDiscoveryReviewPacket(jobId, artifacts, extraInfo = {}) {
  return {
    schema: "emperor-os/discovery-review-packet/v1",
    kind: "discovery-review-packet",
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
    // Artifact references
    artifactReferences: {
      specRaw: artifacts.specRaw ? {
        path: "spec.raw.json",
        mimeType: "application/json"
      } : null,
      specNormalized: artifacts.specNormalized ? {
        path: "spec.normalized.json",
        mimeType: "application/json"
      } : null,
      decision: artifacts.decision ? {
        path: "decision.json",
        mimeType: "application/json"
      } : null
    },
    // Protocol and source information
    protocolInfo: {
      protocol: extraInfo.protocol || "unknown",
      source: extraInfo.source || "unknown",
      rawJobId: extraInfo.rawJobId || null,
      canonicalJobId: extraInfo.canonicalJobId || jobId
    },
    // Safety checklist
    safetyChecklist: {
      dryRunMode: false,
      noPrivateKeysUsed: true,
      noTransactionSigned: true,
      noTransactionBroadcast: true,
      noMainnetInteraction: true,
      validationPassed: false, // Not applicable for discovery review
      humanReviewRequired: true
    },
    // Required human actions
    requiredHumanActions: [
      "Review job details and scoring rationale",
      "Verify no conflicts of interest",
      "Confirm job aligns with agent capabilities",
      "Decide whether to apply, watch, or reject",
      "Provide operator decision via appropriate mechanism"
    ],
    // Explicit warning
    warnings: [
      "NO TRANSACTION HAS BEEN SIGNED OR BROADCAST",
      "THIS IS A DISCOVERY REVIEW ONLY - NO APPLICATION YET",
      "HUMAN OPERATOR MUST DECIDE NEXT STEPS"
    ],
    // Artifact paths for quick reference
    artifactPaths: {
      specRaw: artifacts.specRaw ? "spec.raw.json" : null,
      specNormalized: artifacts.specNormalized ? "spec.normalized.json" : null,
      decision: artifacts.decision ? "decision.json" : null
    }
  };
}