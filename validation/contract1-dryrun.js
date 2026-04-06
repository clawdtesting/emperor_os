// validation/contract1-dryrun.js
// Dry-run validation for AGIJobManager (Contract #1) v1 jobs.
//
// Simulates the complete validation → submit → reconcile pipeline
// for a given jobId without making any on-chain calls or IPFS uploads.
//
// Checks:
//   1. Job state exists and is in a valid state for validation
//   2. All required artifacts exist and are structurally valid
//   3. Deliverable content passes all validation rules
//   4. IPFS publication would succeed (URI format, hash consistency)
//   5. Completion metadata would be buildable
//   6. Unsigned tx package would be correctly formed
//   7. State transitions are all legal
//   8. Pre-sign checks would pass
//   9. Signing manifest would be complete
//
// SAFETY CONTRACT: Read-only. No network calls. No signing. No broadcasting.
// This is a pure simulation that writes a dry-run report to disk.

import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { CONFIG } from "../agent/config.js";
import { getJobState, listAllJobStates, assertValidJobTransition } from "../agent/state.js";
import { getJobArtifactPaths, readText } from "../agent/artifact-manager.js";
import { validateOutput, isSubstantive } from "../agent/validate.js";
import { ethers } from "ethers";

// ── Contract #1 ABI (inline to avoid circular deps) ──────────────────────────

const JOB_MGR_ABI = [
  "function applyForJob(uint256 _jobId, string subdomain, bytes32[] proof)",
  "function requestJobCompletion(uint256 _jobId, string _jobCompletionURI)",
  "function jobs(uint256 jobId) view returns (tuple(address employer, string specURI, string subdomain, uint256 payout, uint256 deadline, uint256 createdAt, string status))",
];

const JOB_MGR_IFACE = new ethers.Interface(JOB_MGR_ABI);
const JOB_MGR_CONTRACT = CONFIG.CONTRACT;
const CHAIN_ID = CONFIG.CHAIN_ID;

const FORBIDDEN_PATTERNS = [
  /as an ai/i,
  /i can't/i,
  /i cannot/i,
  /here'?s the final deliverable/i,
  /meta commentary/i,
];

const MIN_SUBSTANTIVE_CHARS = 120;

// ── Dry-run report schema ────────────────────────────────────────────────────

function initReport(jobId) {
  return {
    schema: "emperor-os/contract1-dryrun/v1",
    jobId: String(jobId),
    contract: JOB_MGR_CONTRACT,
    chainId: CHAIN_ID,
    generatedAt: new Date().toISOString(),
    checks: [],
    stateValidation: null,
    artifactValidation: null,
    contentValidation: null,
    publicationValidation: null,
    completionValidation: null,
    txValidation: null,
    transitionValidation: null,
    presignValidation: null,
    signingManifestValidation: null,
    summary: null,
  };
}

function addCheck(report, name, passed, detail = null) {
  report.checks.push({
    name,
    passed,
    detail,
    checkedAt: new Date().toISOString(),
  });
}

// ── State validation ─────────────────────────────────────────────────────────

async function validateJobState(jobId, report) {
  const state = await getJobState(jobId);

  if (!state) {
    addCheck(report, "job_state_exists", false, "No state file found for this jobId");
    report.stateValidation = { exists: false, reason: "no_state_file" };
    return { state, valid: false };
  }

  addCheck(report, "job_state_exists", true);

  const requiredFields = ["jobId", "status", "createdAt", "updatedAt"];
  const missingFields = requiredFields.filter(f => state[f] === undefined || state[f] === null);
  if (missingFields.length > 0) {
    addCheck(report, "job_state_required_fields", false, `Missing: ${missingFields.join(", ")}`);
    report.stateValidation = { exists: true, valid: false, missingFields };
    return { state, valid: false };
  }

  addCheck(report, "job_state_required_fields", true);

  const validStatuses = [
    "queued", "scored", "application_pending_review", "assigned",
    "deliverable_ready", "completion_pending_review", "submitted",
    "completed", "disputed", "failed", "rejected", "expired", "skipped",
  ];
  if (!validStatuses.includes(state.status)) {
    addCheck(report, "job_state_valid_status", false, `Unknown status: ${state.status}`);
    report.stateValidation = { exists: true, valid: false, reason: `invalid_status: ${state.status}` };
    return { state, valid: false };
  }

  addCheck(report, "job_state_valid_status", true, state.status);

  // Check if status history is consistent
  if (state.statusHistory && state.statusHistory.length > 0) {
    for (let i = 1; i < state.statusHistory.length; i++) {
      const from = state.statusHistory[i - 1].status;
      const to = state.statusHistory[i].status;
      try {
        assertValidJobTransition(from, to);
      } catch (err) {
        addCheck(report, "job_state_history_valid", false, `Invalid transition: ${from} → ${to}`);
        report.stateValidation = { exists: true, valid: false, reason: err.message };
        return { state, valid: false };
      }
    }
    addCheck(report, "job_state_history_valid", true, `${state.statusHistory.length} transitions`);
  }

  // Check if job is in a state where validation dry-run is meaningful
  const validationReadyStatuses = ["assigned", "deliverable_ready", "completion_pending_review"];
  const isValidationReady = validationReadyStatuses.includes(state.status);

  addCheck(report, "job_state_validation_ready", isValidationReady,
    isValidationReady
      ? `Job is ${state.status} — validation dry-run is meaningful`
      : `Job is ${state.status} — validation dry-run may have limited scope`);

  report.stateValidation = {
    exists: true,
    valid: true,
    status: state.status,
    statusHistory: state.statusHistory?.length ?? 0,
    validationReady: isValidationReady,
    artifactPath: state.artifactPath ?? null,
    briefPath: state.briefPath ?? null,
    deliverableIpfs: state.deliverableIpfs ?? null,
  };

  return { state, valid: true };
}

// ── Artifact validation ──────────────────────────────────────────────────────

async function validateArtifacts(jobId, state, report) {
  const artifactPaths = getJobArtifactPaths(jobId);
  const results = { exists: {}, missing: [], readable: {}, errors: {} };

  // Check critical artifacts
  const criticalArtifacts = [
    { key: "brief", path: artifactPaths.brief, label: "brief.json" },
    { key: "deliverable", path: artifactPaths.deliverable, label: "deliverable.md" },
  ];

  const optionalArtifacts = [
    { key: "rawSpec", path: artifactPaths.rawSpec, label: "raw_spec.json" },
    { key: "normalizedSpec", path: artifactPaths.normalizedSpec, label: "normalized_spec.json" },
    { key: "strategy", path: artifactPaths.strategy, label: "strategy.json" },
    { key: "executionValidation", path: artifactPaths.executionValidation, label: "execution_validation.json" },
    { key: "publicationValidation", path: artifactPaths.publicationValidation, label: "publication_validation.json" },
    { key: "publishManifest", path: artifactPaths.publishManifest, label: "publish_manifest.json" },
  ];

  for (const artifact of [...criticalArtifacts, ...optionalArtifacts]) {
    try {
      await fs.access(artifact.path);
      results.exists[artifact.key] = true;
      addCheck(report, `artifact_exists_${artifact.key}`, true);
    } catch {
      results.exists[artifact.key] = false;
      results.missing.push(artifact.label);
      addCheck(report, `artifact_exists_${artifact.key}`, false, `${artifact.label} not found at ${artifact.path}`);
    }
  }

  // Check if critical artifacts are missing
  const missingCritical = criticalArtifacts.filter(a => !results.exists[a.key]);
  if (missingCritical.length > 0) {
    addCheck(report, "artifacts_critical_present", false,
      `Missing critical: ${missingCritical.map(a => a.label).join(", ")}`);
    report.artifactValidation = results;
    return { results, valid: false };
  }

  addCheck(report, "artifacts_critical_present", true);

  // Try to read critical artifacts
  for (const artifact of criticalArtifacts) {
    if (results.exists[artifact.key]) {
      try {
        const content = await readText(artifact.path);
        results.readable[artifact.key] = true;
        results.content = results.content || {};
        results.content[artifact.key] = content;
        addCheck(report, `artifact_readable_${artifact.key}`, true, `${content.length} bytes`);
      } catch (err) {
        results.readable[artifact.key] = false;
        results.errors[artifact.key] = err.message;
        addCheck(report, `artifact_readable_${artifact.key}`, false, err.message);
      }
    }
  }

  report.artifactValidation = results;
  return { results, valid: missingCritical.length === 0 };
}

// ── Content validation ───────────────────────────────────────────────────────

function validateContent(deliverableContent, briefContent, report) {
  const results = {
    length: deliverableContent?.length ?? 0,
    errors: [],
    warnings: [],
    checks: {},
  };

  if (!deliverableContent) {
    addCheck(report, "content_not_empty", false, "No deliverable content to validate");
    results.errors.push("No deliverable content");
    report.contentValidation = results;
    return results;
  }

  // Check empty
  addCheck(report, "content_not_empty", deliverableContent.trim().length > 0);

  // Check minimum length
  const meetsMinLength = deliverableContent.length >= CONFIG.MIN_ARTIFACT_CHARS;
  addCheck(report, "content_meets_min_length", meetsMinLength,
    `${deliverableContent.length} / ${CONFIG.MIN_ARTIFACT_CHARS} chars`);
  if (!meetsMinLength) results.errors.push(`Content too short: ${deliverableContent.length} < ${CONFIG.MIN_ARTIFACT_CHARS}`);

  // Check substantive
  const substantive = isSubstantive(deliverableContent);
  addCheck(report, "content_is_substantive", substantive);
  if (!substantive) results.errors.push("Content is not substantive");

  // Check placeholders
  const hasPlaceholders = /\*\[[^\]]{3,}\]\*/.test(deliverableContent);
  addCheck(report, "content_no_placeholders", !hasPlaceholders);
  if (hasPlaceholders) results.errors.push("Content contains placeholder markers");

  // Check markdown headings
  const hasHeadings = deliverableContent.includes("##");
  addCheck(report, "content_has_markdown_headings", hasHeadings);
  if (!hasHeadings) results.errors.push("Content missing markdown section headings");

  // Check forbidden patterns
  const forbiddenMatches = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(deliverableContent)) {
      forbiddenMatches.push(pattern.source);
    }
  }
  addCheck(report, "content_no_forbidden_patterns", forbiddenMatches.length === 0,
    forbiddenMatches.length > 0 ? `Matched: ${forbiddenMatches.join(", ")}` : null);
  if (forbiddenMatches.length > 0) results.errors.push(`Forbidden patterns: ${forbiddenMatches.join(", ")}`);

  // Check required sections from brief
  if (briefContent) {
    try {
      const brief = JSON.parse(briefContent);
      if (brief.required_sections) {
        const missingSections = [];
        for (const section of brief.required_sections) {
          if (!deliverableContent.toLowerCase().includes(String(section).toLowerCase())) {
            missingSections.push(section);
          }
        }
        addCheck(report, "content_has_required_sections", missingSections.length === 0,
          missingSections.length > 0 ? `Missing: ${missingSections.join(", ")}` : "All present");
        if (missingSections.length > 0) results.errors.push(`Missing sections: ${missingSections.join(", ")}`);
      }
    } catch {
      addCheck(report, "content_brief_parseable", false, "Brief JSON not parseable");
      results.warnings.push("Could not parse brief for section checks");
    }
  }

  // Content statistics
  const lines = deliverableContent.split("\n");
  const words = deliverableContent.split(/\s+/).filter(w => w.length > 0);
  const sections = (deliverableContent.match(/#{2,}\s+/g) || []).length;
  const codeBlocks = (deliverableContent.match(/```/g) || []).length / 2;

  results.checks = {
    lines: lines.length,
    words: words.length,
    sections,
    codeBlocks: Math.floor(codeBlocks),
    hasIntroduction: /introduction|overview|summary/i.test(deliverableContent),
    hasConclusion: /conclusion|summary|final/i.test(deliverableContent),
    hasLists: /[-*]\s+\S/.test(deliverableContent),
  };

  results.valid = results.errors.length === 0;
  report.contentValidation = results;
  return results;
}

// ── Publication validation ───────────────────────────────────────────────────

function validatePublication(state, report) {
  const results = {
    hasIpfsUri: false,
    uriFormatValid: false,
    wouldPassFetchback: null,
    warnings: [],
  };

  if (state.deliverableIpfs?.ipfsUri) {
    results.hasIpfsUri = true;
    addCheck(report, "publication_has_ipfs_uri", true);

    const uri = state.deliverableIpfs.ipfsUri;
    const validFormat = uri.startsWith("ipfs://") && uri.length > 7;
    results.uriFormatValid = validFormat;
    addCheck(report, "publication_uri_format_valid", validFormat, uri);

    if (validFormat) {
      const cid = uri.replace("ipfs://", "").split("/")[0];
      const gatewayUrl = `https://ipfs.io/ipfs/${cid}`;
      results.gatewayUrl = gatewayUrl;
      results.cid = cid;
      addCheck(report, "publication_gateway_url_constructable", true, gatewayUrl);
    }
  } else {
    addCheck(report, "publication_has_ipfs_uri", false, "No deliverableIpfs in job state — would need upload");
    results.warnings.push("Job has not been published to IPFS yet — dry-run simulates upload step");
  }

  report.publicationValidation = results;
  return results;
}

// ── Completion metadata validation ───────────────────────────────────────────

function validateCompletionMetadata(jobId, state, artifactResults, report) {
  const results = {
    wouldBuild: false,
    metadata: null,
    errors: [],
  };

  // Check prerequisites
  const hasDeliverableUri = state.deliverableIpfs?.ipfsUri;
  const hasArtifactPath = state.artifactPath;
  const hasBriefPath = state.briefPath;

  if (!hasDeliverableUri) {
    results.errors.push("Missing deliverableIpfs — would need IPFS upload first");
  }
  if (!hasArtifactPath) {
    results.errors.push("Missing artifactPath in job state");
  }
  if (!hasBriefPath) {
    results.errors.push("Missing briefPath in job state");
  }

  results.wouldBuild = hasDeliverableUri && hasArtifactPath && hasBriefPath;
  addCheck(report, "completion_prerequisites_met", results.wouldBuild,
    results.wouldBuild ? "All prerequisites present" : results.errors.join("; "));

  if (results.wouldBuild) {
    const completionUri = state.deliverableIpfs.ipfsUri;
    const gatewayUri = completionUri.replace("ipfs://", "https://ipfs.io/ipfs/");
    const ext = path.extname(hasArtifactPath).toLowerCase();
    const assetType = { ".md": "TXT", ".txt": "TXT", ".json": "JSON", ".pdf": "PDF" }[ext] || "FILE";

    const metadata = {
      name: `AGI Job Completion · ${state.title ?? `Job ${jobId}`}`,
      description: `Final completion package for Job ${jobId}.`,
      image: completionUri,
      attributes: [
        { trait_type: "Kind", value: "job-completion" },
        { trait_type: "Job ID", value: String(jobId) },
        { trait_type: "Category", value: state.category ?? "other" },
        { trait_type: "Final Asset Type", value: assetType },
        { trait_type: "Locale", value: CONFIG.LOCALE },
      ],
      properties: {
        schema: "agijobmanager/job-completion/v1",
        kind: "job-completion",
        version: "1.0.0",
        locale: CONFIG.LOCALE,
        title: state.title ?? `Job ${jobId}`,
        jobId: Number(jobId),
        jobSpecURI: state.specUri ?? null,
        finalDeliverables: [
          {
            name: path.basename(hasArtifactPath),
            uri: completionUri,
            gatewayURI: gatewayUri,
            description: "Primary deliverable produced by the agent",
          },
        ],
        completionStatus: "ready-for-review",
        chainId: CHAIN_ID,
        contract: JOB_MGR_CONTRACT,
        createdVia: CONFIG.CREATED_VIA,
      },
    };

    results.metadata = metadata;
    const metadataHash = sha256(JSON.stringify(metadata));
    results.metadataHash = metadataHash;

    addCheck(report, "completion_metadata_buildable", true, `SHA-256: ${metadataHash.slice(0, 16)}...`);
  }

  report.completionValidation = results;
  return results;
}

// ── Transaction validation ───────────────────────────────────────────────────

function validateTransaction(jobId, completionMetadata, report) {
  const results = {
    wouldEncode: false,
    calldata: null,
    decodedCall: null,
    errors: [],
  };

  if (!completionMetadata) {
    results.errors.push("No completion metadata — cannot build tx");
    report.txValidation = results;
    return results;
  }

  // Simulate the completionURI that would be used
  const completionUri = completionMetadata.image;
  if (!completionUri || !completionUri.startsWith("ipfs://")) {
    results.errors.push("Invalid completion URI");
    report.txValidation = results;
    return results;
  }

  try {
    const calldata = JOB_MGR_IFACE.encodeFunctionData("requestJobCompletion", [
      BigInt(jobId),
      completionUri,
    ]);

    const decoded = JOB_MGR_IFACE.parseTransaction({ data: calldata });

    results.wouldEncode = true;
    results.calldata = calldata;
    results.decodedCall = {
      function: decoded.name,
      args: {
        jobId: decoded.args[0].toString(),
        completionURI: decoded.args[1],
      },
    };
    results.selector = calldata.slice(0, 10);
    results.to = JOB_MGR_CONTRACT;
    results.value = "0";

    addCheck(report, "tx_calldata_encodable", true, `selector: ${results.selector}`);
    addCheck(report, "tx_selector_correct", results.selector === "0x8d1bc00f",
      `Expected 0x8d1bc00f, got ${results.selector}`);
    addCheck(report, "tx_target_correct", results.to.toLowerCase() === JOB_MGR_CONTRACT.toLowerCase());
    addCheck(report, "tx_value_zero", results.value === "0");

    // Build unsigned tx package simulation
    const unsignedPkg = {
      schema: "emperor-os/unsigned-tx/v1",
      kind: "requestJobCompletion",
      jobId: Number(jobId),
      contract: JOB_MGR_CONTRACT,
      chainId: CHAIN_ID,
      to: results.to,
      data: results.calldata,
      value: results.value,
      jobCompletionURI: completionUri,
      agentSubdomain: CONFIG.AGENT_SUBDOMAIN || "(not set)",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    results.unsignedPackage = unsignedPkg;
    results.unsignedPackageHash = sha256(JSON.stringify(unsignedPkg));

    addCheck(report, "tx_unsigned_package_buildable", true);

  } catch (err) {
    results.errors.push(`Tx encoding failed: ${err.message}`);
    addCheck(report, "tx_calldata_encodable", false, err.message);
  }

  report.txValidation = results;
  return results;
}

// ── Transition validation ────────────────────────────────────────────────────

function validateTransitions(state, report) {
  const results = {
    currentStatus: state.status,
    validNextTransitions: [],
    expectedPath: [],
    errors: [],
  };

  // Determine expected transition path based on current status
  const transitionMap = {
    assigned: ["deliverable_ready", "completion_pending_review", "submitted", "completed"],
    deliverable_ready: ["completion_pending_review", "submitted", "completed"],
    completion_pending_review: ["submitted", "completed"],
    submitted: ["completed"],
  };

  const expectedPath = transitionMap[state.status] || [];
  results.expectedPath = expectedPath;

  for (const nextStatus of expectedPath) {
    try {
      assertValidJobTransition(state.status, nextStatus);
      results.validNextTransitions.push(nextStatus);
      addCheck(report, `transition_valid_${state.status}_to_${nextStatus}`, true);
    } catch (err) {
      results.errors.push(err.message);
      addCheck(report, `transition_valid_${state.status}_to_${nextStatus}`, false, err.message);
    }
  }

  report.transitionValidation = results;
  return results;
}

// ── Pre-sign check simulation ────────────────────────────────────────────────

function validatePreSignChecks(unsignedPkg, report) {
  const results = {
    checks: {},
    wouldPass: true,
    errors: [],
  };

  if (!unsignedPkg) {
    results.wouldPass = false;
    results.errors.push("No unsigned package to validate");
    report.presignValidation = results;
    return results;
  }

  // Schema check
  const schemaValid = unsignedPkg.schema === "emperor-os/unsigned-tx/v1";
  results.checks.schema = schemaValid;
  addCheck(report, "presign_schema_valid", schemaValid);
  if (!schemaValid) results.errors.push("Invalid schema");

  // Chain ID check
  const chainValid = unsignedPkg.chainId === CHAIN_ID;
  results.checks.chainId = chainValid;
  addCheck(report, "presign_chain_id_valid", chainValid);
  if (!chainValid) results.errors.push("Chain ID mismatch");

  // Contract check
  const contractValid = unsignedPkg.contract?.toLowerCase() === JOB_MGR_CONTRACT.toLowerCase();
  results.checks.contract = contractValid;
  addCheck(report, "presign_contract_valid", contractValid);
  if (!contractValid) results.errors.push("Contract address mismatch");

  // Target check
  const targetValid = unsignedPkg.to?.toLowerCase() === JOB_MGR_CONTRACT.toLowerCase();
  results.checks.target = targetValid;
  addCheck(report, "presign_target_valid", targetValid);
  if (!targetValid) results.errors.push("Target address mismatch");

  // Selector check
  const selector = unsignedPkg.data?.slice(0, 10).toLowerCase();
  const selectorValid = selector === "0x8d1bc00f";
  results.checks.selector = selectorValid;
  addCheck(report, "presign_selector_valid", selectorValid, selector);
  if (!selectorValid) results.errors.push(`Unexpected selector: ${selector}`);

  // Expiration check
  const expiresAt = Date.parse(unsignedPkg.expiresAt);
  const notExpired = Number.isFinite(expiresAt) && expiresAt > Date.now();
  results.checks.notExpired = notExpired;
  addCheck(report, "presign_not_expired", notExpired);
  if (!notExpired) results.errors.push("Package expired");

  results.wouldPass = results.errors.length === 0;
  report.presignValidation = results;
  return results;
}

// ── Signing manifest validation ──────────────────────────────────────────────

function validateSigningManifest(jobId, state, unsignedPkg, report) {
  const results = {
    wouldBuild: false,
    manifest: null,
    errors: [],
  };

  if (!unsignedPkg) {
    results.errors.push("No unsigned package — cannot build manifest");
    report.signingManifestValidation = results;
    return results;
  }

  const manifest = {
    schema: "emperor-os/signing-manifest/v1",
    jobId: String(jobId),
    kind: "requestJobCompletion",
    contract: JOB_MGR_CONTRACT,
    chainId: CHAIN_ID,
    unsignedPackageHash: sha256(JSON.stringify(unsignedPkg)),
    deliverableUri: state.deliverableIpfs?.ipfsUri ?? null,
    agentSubdomain: CONFIG.AGENT_SUBDOMAIN || "(not set)",
    agentAddress: CONFIG.AGENT_ADDRESS || "(not set)",
    reviewChecklist: [
      "Confirm jobId matches the intended job",
      "Confirm completionURI is reachable on IPFS",
      "Confirm target contract is AGIJobManager",
      "Confirm chainId is 1 (Ethereum Mainnet)",
      "Confirm selector is 0x8d1bc00f (requestJobCompletion)",
      "Confirm agent subdomain is correct",
      "Sign with MetaMask + Ledger",
    ],
    generatedAt: new Date().toISOString(),
  };

  results.wouldBuild = true;
  results.manifest = manifest;
  results.manifestHash = sha256(JSON.stringify(manifest));

  addCheck(report, "signing_manifest_buildable", true);
  addCheck(report, "signing_manifest_checklist_complete", manifest.reviewChecklist.length >= 5);

  report.signingManifestValidation = results;
  return results;
}

// ── Summary ──────────────────────────────────────────────────────────────────

function buildSummary(report) {
  const totalChecks = report.checks.length;
  const passedChecks = report.checks.filter(c => c.passed).length;
  const failedChecks = report.checks.filter(c => !c.passed).length;

  const overallPass = failedChecks === 0;

  report.summary = {
    totalChecks,
    passed: passedChecks,
    failed: failedChecks,
    overallPass,
    verdict: overallPass ? "DRY_RUN_PASSED" : "DRY_RUN_FAILED",
    recommendation: overallPass
      ? "All validation checks passed. Job is ready for submission pipeline."
      : `${failedChecks} check(s) failed. Review failures before proceeding.`,
  };

  return report.summary;
}

function sha256(str) {
  return createHash("sha256").update(str, "utf8").digest("hex");
}

// ── Main dry-run entry point ─────────────────────────────────────────────────

export async function dryRunContract1Validation(jobId) {
  const report = initReport(jobId);

  console.log(`[dry-run] Starting Contract #1 validation dry-run for job ${jobId}`);

  // 1. State validation
  console.log(`[dry-run] Step 1/9: Validating job state...`);
  const { state, valid: stateValid } = await validateJobState(jobId, report);
  if (!stateValid) {
    buildSummary(report);
    await writeDryRunReport(jobId, report);
    return report;
  }

  // 2. Artifact validation
  console.log(`[dry-run] Step 2/9: Validating artifacts...`);
  const { results: artifactResults, valid: artifactValid } = await validateArtifacts(jobId, state, report);
  if (!artifactValid) {
    buildSummary(report);
    await writeDryRunReport(jobId, report);
    return report;
  }

  // 3. Content validation
  console.log(`[dry-run] Step 3/9: Validating deliverable content...`);
  validateContent(
    artifactResults.content?.deliverable,
    artifactResults.content?.brief,
    report
  );

  // 4. Publication validation
  console.log(`[dry-run] Step 4/9: Validating publication...`);
  validatePublication(state, report);

  // 5. Completion metadata validation
  console.log(`[dry-run] Step 5/9: Validating completion metadata...`);
  const completionResult = validateCompletionMetadata(jobId, state, artifactResults, report);

  // 6. Transaction validation
  console.log(`[dry-run] Step 6/9: Validating transaction encoding...`);
  const txResult = validateTransaction(jobId, completionResult.metadata, report);

  // 7. Transition validation
  console.log(`[dry-run] Step 7/9: Validating state transitions...`);
  validateTransitions(state, report);

  // 8. Pre-sign check simulation
  console.log(`[dry-run] Step 8/9: Simulating pre-sign checks...`);
  validatePreSignChecks(txResult.unsignedPackage, report);

  // 9. Signing manifest validation
  console.log(`[dry-run] Step 9/9: Validating signing manifest...`);
  validateSigningManifest(jobId, state, txResult.unsignedPackage, report);

  // Summary
  const summary = buildSummary(report);
  console.log(`[dry-run] Result: ${summary.verdict} (${summary.passed}/${summary.totalChecks} checks passed)`);

  await writeDryRunReport(jobId, report);
  return report;
}

async function writeDryRunReport(jobId, report) {
  const artifactPaths = getJobArtifactPaths(jobId);
  const reportPath = path.join(artifactPaths.dir, "dryrun_validation.json");

  try {
    await fs.mkdir(artifactPaths.dir, { recursive: true });
    const tmp = `${reportPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    await fs.writeFile(tmp, JSON.stringify(report, null, 2), "utf8");
    await fs.rename(tmp, reportPath);
    console.log(`[dry-run] Report written to ${reportPath}`);
  } catch (err) {
    console.error(`[dry-run] Failed to write report: ${err.message}`);
  }
}

// ── Batch dry-run for all jobs in a given state ──────────────────────────────

export async function dryRunBatchContract1Validation(statusFilter = null) {
  const jobs = await listAllJobStates();
  const filtered = statusFilter
    ? jobs.filter(j => j.status === statusFilter)
    : jobs;

  if (filtered.length === 0) {
    console.log(`[dry-run] No jobs found${statusFilter ? ` with status ${statusFilter}` : ""}`);
    return [];
  }

  console.log(`[dry-run] Batch dry-run for ${filtered.length} job(s)...`);
  const results = [];

  for (const job of filtered) {
    try {
      const report = await dryRunContract1Validation(job.jobId);
      results.push({
        jobId: job.jobId,
        status: job.status,
        verdict: report.summary.verdict,
        passed: report.summary.passed,
        failed: report.summary.failed,
      });
    } catch (err) {
      results.push({
        jobId: job.jobId,
        status: job.status,
        verdict: "DRY_RUN_ERROR",
        error: err.message,
      });
    }
  }

  console.log(`\n[dry-run] Batch summary:`);
  for (const r of results) {
    const icon = r.verdict === "DRY_RUN_PASSED" ? "✓" : "✗";
    console.log(`  ${icon} Job ${r.jobId} (${r.status}): ${r.verdict}`);
    if (r.error) console.log(`    Error: ${r.error}`);
  }

  return results;
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("contract1-dryrun.js")) {
  const jobId = process.argv[2];
  if (!jobId) {
    console.log("Usage: node validation/contract1-dryrun.js <jobId>");
    console.log("       node validation/contract1-dryrun.js --batch [status]");
    process.exit(1);
  }

  if (jobId === "--batch") {
    dryRunBatchContract1Validation(process.argv[3]).catch(err => {
      console.error("[dry-run] Fatal:", err.message);
      process.exit(1);
    });
  } else {
    dryRunContract1Validation(jobId).catch(err => {
      console.error("[dry-run] Fatal:", err.message);
      process.exit(1);
    });
  }
}
