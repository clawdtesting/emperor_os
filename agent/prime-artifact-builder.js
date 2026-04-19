// prime-artifact-builder.js
// Builds canonical phase-specific artifact bundles for Prime procurements.
//
// Each phase produces a directory of artifacts under:
//   artifacts/proc_<id>/<phase>/
//
// Every bundle includes a review_manifest.json that lists all files,
// their purpose, and an operator checklist.
//
// SAFETY CONTRACT: File I/O only. No signing. No network calls (caller provides data).

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { CONFIG } from "./config.js";
import { ensureProcSubdir, procSubdir, writeJson, readJson } from "./prime-state.js";

// ── Low-level file write ──────────────────────────────────────────────────────

async function writeFile(filePath, content) {
  const tmp = `${filePath}.tmp.${Date.now()}.${Buffer.from(filePath).toString('hex').slice(0, 6)}`;
  const data = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, filePath);
}

function sha256(content) {
  const data = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

// ── INSPECTION BUNDLE ─────────────────────────────────────────────────────────
// Built by prime-inspector.js. This function writes the additional files
// that belong in the inspection bundle but aren't chain-reads.

/**
 * Writes the fit evaluation and review manifest to the inspection bundle.
 * @param {string|number} procurementId
 * @param {object} opts
 * @param {object} opts.normalizedJobSpec   - normalized job spec JSON
 * @param {object} opts.fitEvaluation       - { score, decision, reason, checklist }
 * @param {object} opts.nextAction          - from prime-next-action.js
 * @returns {Promise<{dir: string, files: string[]}>}
 */
export async function writeInspectionExtras(procurementId, { normalizedJobSpec, fitEvaluation, nextAction }) {
  const dir = await ensureProcSubdir(procurementId, "inspection");

  const files = [];

  if (normalizedJobSpec) {
    const p = path.join(dir, "normalized_job_spec.json");
    await writeFile(p, normalizedJobSpec);
    files.push(p);
  }

  if (fitEvaluation) {
    const p = path.join(dir, "fit_evaluation.json");
    await writeFile(p, { ...fitEvaluation, generatedAt: new Date().toISOString() });
    files.push(p);
  }

  if (nextAction) {
    const p = path.join(dir, "next_action.json");
    await writeFile(p, nextAction);
    files.push(p);
  }

  // Review manifest
  const manifest = buildReviewManifest({
    procurementId,
    phase:       "inspection",
    files:       ["procurement_snapshot.json", "linked_job_snapshot.json", "normalized_job_spec.json",
                  "fit_evaluation.json", "next_action.json", "review_manifest.json"],
    checklist: [
      "Confirm procurement ID and linked job ID are correct.",
      "Confirm the chain phase reflects current deadlines.",
      "Review fit evaluation decision: approve or reject.",
      "If approved, proceed to application bundle.",
      "If rejected, set status to NOT_A_FIT in state.",
    ],
    warnings: fitEvaluation?.warnings ?? [],
  });
  const mp = path.join(dir, "review_manifest.json");
  await writeFile(mp, manifest);
  files.push(mp);

  return { dir, files };
}

// ── APPLICATION BUNDLE ────────────────────────────────────────────────────────

/**
 * Writes the application bundle to artifacts/proc_<id>/application/.
 * Caller provides the already-drafted content and commitment material.
 *
 * @param {string|number} procurementId
 * @param {object} opts
 * @param {string} opts.applicationMarkdown  - raw markdown text
 * @param {string} opts.applicationURI       - ipfs://... pinned URI
 * @param {string} opts.commitmentSalt       - bytes32 hex
 * @param {string} opts.commitmentHash       - bytes32 hex (keccak256 commitment)
 * @param {string} opts.agentAddress
 * @param {string} opts.agentSubdomain
 * @param {string[]} opts.merklePoof         - bytes32[] proof elements
 * @returns {Promise<{dir: string, files: string[]}>}
 */
export async function writeApplicationBundle(procurementId, {
  applicationMarkdown,
  applicationURI,
  commitmentSalt,
  commitmentHash,
  agentAddress,
  agentSubdomain,
  merkleProof,
}) {
  const dir = await ensureProcSubdir(procurementId, "application");
  const files = [];

  // application_brief.md
  const briefPath = path.join(dir, "application_brief.md");
  await writeFile(briefPath, applicationMarkdown);
  files.push(briefPath);

  // application_payload.json
  const payloadPath = path.join(dir, "application_payload.json");
  await writeFile(payloadPath, {
    procurementId:  String(procurementId),
    applicationURI,
    agentAddress,
    agentSubdomain,
    merkleProof,
    generatedAt:    new Date().toISOString(),
  });
  files.push(payloadPath);

  const capabilityPath = path.join(dir, "capability_claims.json");
  await writeFile(capabilityPath, {
    procurementId: String(procurementId),
    claims: [
      "artifact-first delivery",
      "public IPFS publication",
      "unsigned-only transaction handoff",
      "restart-safe state machine",
    ],
    generatedAt: new Date().toISOString(),
  });
  files.push(capabilityPath);

  const evidencePath = path.join(dir, "evidence_manifest.json");
  await writeFile(evidencePath, {
    procurementId: String(procurementId),
    evidence: [
      { file: "application_brief.md", role: "primary narrative artifact" },
      { file: "application_payload.json", role: "structured submission metadata" },
      { file: "commitment_material.json", role: "commit/reveal binding material" },
    ],
    generatedAt: new Date().toISOString(),
  });
  files.push(evidencePath);

  // commitment_material.json — SENSITIVE: contains salt, do not share
  const commitPath = path.join(dir, "commitment_material.json");
  await writeFile(commitPath, {
    procurementId:  String(procurementId),
    applicationURI,
    agentAddress,
    salt:           commitmentSalt,
    commitmentHash,
    generatedAt:    new Date().toISOString(),
    warning:        "SENSITIVE: commitment_material.json contains the reveal salt. Keep private until reveal phase.",
  });
  files.push(commitPath);

  // review_manifest.json
  const manifest = buildReviewManifest({
    procurementId,
    phase: "application",
    files: ["application_brief.md", "application_payload.json", "capability_claims.json", "evidence_manifest.json", "commitment_material.json",
            "unsigned_commit_tx.json", "review_manifest.json"],
    checklist: [
      "Review application_brief.md: confirm content is appropriate and accurate.",
      "Verify applicationURI in application_payload.json is reachable on IPFS.",
      "Check commitment_material.json: salt and hash are recorded.",
      "Review unsigned_commit_tx.json: confirm target contract, args, chainId.",
      "Confirm merkle proof is correct for our agent subdomain.",
      "Sign unsigned_commit_tx.json with MetaMask + Ledger.",
      "Record tx hash in procurement state after broadcast.",
    ],
    warnings: [
      "IMPORTANT: commitment_material.json salt must never be revealed until the reveal phase.",
      "IMPORTANT: commitmentHash must match what is stored on-chain after commit tx.",
    ],
  });
  const mPath = path.join(dir, "review_manifest.json");
  await writeFile(mPath, manifest);
  files.push(mPath);

  return { dir, files };
}

// ── REVEAL BUNDLE ─────────────────────────────────────────────────────────────

/**
 * @param {string|number} procurementId
 * @param {object} opts
 * @param {string} opts.commitmentSalt
 * @param {string} opts.commitmentHash       - expected hash (to verify)
 * @param {string} opts.applicationURI
 * @param {string} opts.agentAddress
 * @param {string} opts.agentSubdomain
 * @param {string[]} opts.merkleProof
 * @param {boolean} opts.verificationPassed  - did re-computed hash match stored?
 */
export async function writeRevealBundle(procurementId, {
  commitmentSalt,
  commitmentHash,
  applicationURI,
  agentAddress,
  agentSubdomain,
  merkleProof,
  verificationPassed,
}) {
  const dir = await ensureProcSubdir(procurementId, "reveal");
  const files = [];

  const revealPath = path.join(dir, "reveal_payload.json");
  await writeFile(revealPath, {
    procurementId:   String(procurementId),
    applicationURI,
    agentAddress,
    agentSubdomain,
    merkleProof,
    salt:            commitmentSalt,
    generatedAt:     new Date().toISOString(),
  });
  files.push(revealPath);

  const verifyPath = path.join(dir, "commitment_verification.json");
  await writeFile(verifyPath, {
    procurementId:    String(procurementId),
    expectedCommitHash: commitmentHash,
    verificationPassed,
    verifiedAt:       new Date().toISOString(),
  });
  files.push(verifyPath);

  const manifest = buildReviewManifest({
    procurementId,
    phase: "reveal",
    files: ["reveal_payload.json", "commitment_verification.json",
            "unsigned_reveal_tx.json", "review_manifest.json"],
    checklist: [
      "Verify commitment_verification.json shows verificationPassed = true.",
      "Review reveal_payload.json: applicationURI, salt, subdomain, proof are correct.",
      "Review unsigned_reveal_tx.json: target contract, args, chainId.",
      "Confirm reveal window is currently open before signing.",
      "Sign unsigned_reveal_tx.json with MetaMask + Ledger.",
      "Record reveal tx hash in procurement state after broadcast.",
    ],
    warnings: verificationPassed ? [] : [
      "WARNING: Commitment verification FAILED. Do not reveal until commitment mismatch is resolved.",
    ],
  });
  await writeFile(path.join(dir, "review_manifest.json"), manifest);

  return { dir, files };
}

// ── FINALIST BUNDLE ───────────────────────────────────────────────────────────

/**
 * @param {string|number} procurementId
 * @param {object} opts
 * @param {object} opts.stakeRequirements   - { requiredStake, currency, notes }
 * @param {object} opts.trialExecutionPlan  - summary of how we'll do the trial
 */
export async function writeFinalistBundle(procurementId, {
  stakeRequirements,
  trialExecutionPlan,
}) {
  const dir = await ensureProcSubdir(procurementId, "finalist");
  const files = [];

  const acceptPath = path.join(dir, "finalist_acceptance_packet.json");
  await writeFile(acceptPath, {
    procurementId: String(procurementId),
    decision:      "ACCEPT",
    generatedAt:   new Date().toISOString(),
  });
  files.push(acceptPath);

  const stakePath = path.join(dir, "stake_requirements.json");
  await writeFile(stakePath, {
    procurementId: String(procurementId),
    ...stakeRequirements,
    recordedAt:    new Date().toISOString(),
  });
  files.push(stakePath);

  const planPath = path.join(dir, "trial_execution_plan.json");
  await writeFile(planPath, {
    procurementId: String(procurementId),
    ...trialExecutionPlan,
    generatedAt:   new Date().toISOString(),
  });
  files.push(planPath);

  // stake_preflight.json — operator must verify and update hasSufficientBalance
  // and allowanceSufficient before the finalist gate will pass.
  const preflightPath = path.join(dir, "stake_preflight.json");
  await writeFile(preflightPath, {
    schema: "emperor-os/stake-preflight/v1",
    procurementId: String(procurementId),
    hasSufficientBalance: false,
    allowanceSufficient: false,
    note: "OPERATOR ACTION REQUIRED: verify wallet balance and token allowance, then set both fields to true.",
    generatedAt: new Date().toISOString(),
  });
  files.push(preflightPath);

  const manifest = buildReviewManifest({
    procurementId,
    phase: "finalist",
    files: ["finalist_acceptance_packet.json", "stake_requirements.json",
            "trial_execution_plan.json", "stake_preflight.json",
            "unsigned_accept_finalist_tx.json", "review_manifest.json"],
    checklist: [
      "Review stake_requirements.json: confirm required stake amount is acceptable.",
      "Review trial_execution_plan.json: confirm trial approach is feasible.",
      "Verify we are on the ShortlistFinalized event's finalists list.",
      "Confirm finalist accept window is currently open.",
      "Update stake_preflight.json: set hasSufficientBalance=true and allowanceSufficient=true after verifying.",
      "Review unsigned_accept_finalist_tx.json: target contract, args, chainId.",
      "Sign unsigned_accept_finalist_tx.json with MetaMask + Ledger.",
      "Record accept tx hash in procurement state after broadcast.",
    ],
    warnings: [
      "stake_preflight.json defaults to false — gate will block until operator confirms balance and allowance.",
    ],
  });
  await writeFile(path.join(dir, "review_manifest.json"), manifest);

  return { dir, files };
}

// ── TRIAL BUNDLE ──────────────────────────────────────────────────────────────

/**
 * @param {string|number} procurementId
 * @param {object} opts
 * @param {string} opts.trialDeliverablePath  - path to the actual deliverable file
 * @param {string} opts.trialURI              - ipfs://... pinned URI
 * @param {object} opts.publicationRecord     - { pinataHash, gatewayURL, pinnedAt }
 * @param {object} opts.fetchbackVerification - { uri, fetchedAt, verified, hashMatch }
 */
export async function writeTrialBundle(procurementId, {
  trialURI,
  publicationRecord,
  fetchbackVerification,
  retrievalPacket,
  decompositionPlan,
  validatorPacket,
  draftMarkdown,
  finalMarkdown,
}) {
  const dir = await ensureProcSubdir(procurementId, "trial");
  const files = [];

  // trial_artifact_manifest.json — canonical schema field required by gate
  const manifestData = {
    schema: "emperor-os/prime-trial-artifact-manifest/v1",
    procurementId: String(procurementId),
    trialURI,
    generatedAt:   new Date().toISOString(),
  };
  const manifestPath = path.join(dir, "trial_artifact_manifest.json");
  await writeFile(manifestPath, manifestData);
  files.push(manifestPath);

  const pubPath = path.join(dir, "publication_record.json");
  await writeFile(pubPath, { procurementId: String(procurementId), ...publicationRecord });
  files.push(pubPath);

  const fetchPath = path.join(dir, "fetchback_verification.json");
  await writeFile(fetchPath, { procurementId: String(procurementId), ...fetchbackVerification });
  files.push(fetchPath);

  await writeFile(path.join(dir, "retrieval_packet.json"), retrievalPacket ?? {
    schema: "emperor-os/retrieval-packet/v1",
    procurementId: String(procurementId),
    results: [],
    items: [],
  });
  await writeFile(path.join(dir, "decomposition_plan.json"), decompositionPlan ?? { procurementId: String(procurementId), steps: [] });
  await writeFile(path.join(dir, "validator_packet.json"), validatorPacket ?? { procurementId: String(procurementId), checks: [] });
  await writeFile(path.join(dir, "draft.md"), draftMarkdown ?? "# Draft\n");
  await writeFile(path.join(dir, "final.md"), finalMarkdown ?? "# Final\n");

  const verified = fetchbackVerification?.verified === true;

  const manifest = buildReviewManifest({
    procurementId,
    phase: "trial",
    files: ["trial_artifact_manifest.json", "publication_record.json",
            "fetchback_verification.json", "retrieval_packet.json", "decomposition_plan.json",
            "validator_packet.json", "draft.md", "final.md",
            "unsigned_submit_trial_tx.json", "review_manifest.json"],
    checklist: [
      "Verify fetchback_verification.json shows verified = true.",
      "Confirm trialURI in trial_artifact_manifest.json is publicly reachable.",
      "Review publication_record.json: hash and gateway URL match.",
      "Confirm trial window is currently open.",
      "Review unsigned_submit_trial_tx.json: target, args, chainId.",
      "Sign unsigned_submit_trial_tx.json with MetaMask + Ledger.",
      "Record trial tx hash in procurement state after broadcast.",
    ],
    warnings: verified ? [] : [
      "WARNING: Fetchback verification not yet confirmed. Do not submit trial until verified.",
    ],
  });
  await writeFile(path.join(dir, "review_manifest.json"), manifest);

  return { dir, files };
}

// ── SELECTION BUNDLE ──────────────────────────────────────────────────────────

/**
 * @param {string|number} procurementId
 * @param {object} opts
 * @param {boolean} opts.selected
 * @param {string} [opts.selectedAgentAddress]
 * @param {string} [opts.selectionBlock]
 */
export async function writeSelectionBundle(procurementId, {
  selected,
  selectedAgentAddress,
  selectionBlock,
}) {
  const dir = await ensureProcSubdir(procurementId, "selection");

  await writeFile(path.join(dir, "selection_state_snapshot.json"), {
    procurementId: String(procurementId),
    selected,
    snapshotAt:    new Date().toISOString(),
  });

  await writeFile(path.join(dir, "selected_agent_status.json"), {
    procurementId:        String(procurementId),
    selected,
    selectedAgentAddress: selectedAgentAddress ?? null,
    selectionBlock:       selectionBlock ?? null,
    recordedAt:           new Date().toISOString(),
  });

  return { dir };
}

// ── COMPLETION BUNDLE ─────────────────────────────────────────────────────────

/**
 * @param {string|number} procurementId
 * @param {object} opts
 * @param {object} opts.jobExecutionPlan     - plan for executing the linked job
 * @param {object} opts.jobCompletion        - completion metadata JSON
 * @param {string} opts.completionURI        - ipfs://... pinned URI
 * @param {object} opts.publicationRecord    - { pinataHash, gatewayURL, pinnedAt }
 * @param {object} opts.fetchbackVerification
 */
export async function writeCompletionBundle(procurementId, {
  jobExecutionPlan,
  jobCompletion,
  completionURI,
  publicationRecord,
  fetchbackVerification,
}) {
  const dir = await ensureProcSubdir(procurementId, "completion");

  await writeFile(path.join(dir, "job_execution_plan.json"), {
    procurementId: String(procurementId),
    ...jobExecutionPlan,
    generatedAt:   new Date().toISOString(),
  });
  await writeFile(path.join(dir, "job_completion.json"),     { ...jobCompletion, completionURI });
  await writeFile(path.join(dir, "publication_record.json"), { procurementId: String(procurementId), ...publicationRecord });
  await writeFile(path.join(dir, "fetchback_verification.json"), { procurementId: String(procurementId), ...fetchbackVerification });

  // completion_manifest.json — stable schema + required keys
  await writeFile(path.join(dir, "completion_manifest.json"), {
    schema: "emperor-os/prime-completion-manifest/v1",
    procurementId: String(procurementId),
    completionURI,
    publicationHash: publicationRecord?.pinataHash ?? null,
    generatedAt:   new Date().toISOString(),
  });

  const manifest = buildReviewManifest({
    procurementId,
    phase: "completion",
    files: ["job_execution_plan.json", "job_completion.json", "completion_manifest.json",
            "publication_record.json", "fetchback_verification.json",
            "unsigned_request_completion_tx.json", "review_manifest.json"],
    checklist: [
      "Verify fetchback_verification.json shows verified = true.",
      "Confirm completionURI in job_completion.json is publicly reachable.",
      "Review job_completion.json: jobId, procurementId, completionURI correct.",
      "Review unsigned_request_completion_tx.json: target AGIJobManager, args, chainId.",
      "Confirm we are the selected agent for this procurement.",
      "Sign unsigned_request_completion_tx.json with MetaMask + Ledger.",
      "Record completion tx hash in procurement state after broadcast.",
    ],
    warnings: [],
  });
  await writeFile(path.join(dir, "review_manifest.json"), manifest);

  return { dir };
}

export async function writeValidatorScoreCommitBundle(procurementId, {
  scoreCommitment,
  score,
  validatorAddress,
  scoringInputHash,
  salt,              // canonical field name; callers previously used saltHash — use salt
  notes,
}) {
  const dir = await ensureProcSubdir(procurementId, "scoring");
  await writeFile(path.join(dir, "score_commit_payload.json"), {
    schema: "emperor-os/prime-score-commit-payload/v1",
    procurementId: String(procurementId),
    validatorAddress: validatorAddress ?? null,
    scoringInputHash: scoringInputHash ?? null,
    score: Number.isFinite(score) ? Number(score) : null,
    scoreCommitment,
    salt: salt ?? null,
    notes: notes ?? null,
    generatedAt: new Date().toISOString(),
  });
  await writeFile(path.join(dir, "review_manifest_score_commit.json"), buildReviewManifest({
    procurementId,
    phase: "score_commit",
    files: ["score_commit_payload.json", "unsigned_score_commit_tx.json"],
    checklist: [
      "Confirm validator score commit payload fields are correct.",
      "Confirm score commit window is currently open.",
      "Sign unsigned_score_commit_tx.json with MetaMask + Ledger.",
    ],
  }));
  return { dir };
}

export async function writeValidatorScoreRevealBundle(procurementId, {
  score,
  salt,
  expectedCommitment,
  commitmentCheck,
}) {
  const dir = await ensureProcSubdir(procurementId, "scoring");
  await writeFile(path.join(dir, "score_reveal_payload.json"), {
    schema: "emperor-os/prime-score-reveal-payload/v1",
    procurementId: String(procurementId),
    score,
    salt,
    expectedCommitment: expectedCommitment ?? null,
    commitmentCheck: commitmentCheck ?? null,
    generatedAt: new Date().toISOString(),
  });
  await writeFile(path.join(dir, "review_manifest_score_reveal.json"), buildReviewManifest({
    procurementId,
    phase: "score_reveal",
    files: ["score_commit_payload.json", "score_reveal_payload.json", "unsigned_score_reveal_tx.json"],
    checklist: [
      "Confirm score reveal payload matches prior commitment.",
      "Confirm score reveal window is currently open.",
      "Sign unsigned_score_reveal_tx.json with MetaMask + Ledger.",
    ],
  }));
  return { dir };
}

// ── Review manifest builder ───────────────────────────────────────────────────

function buildReviewManifest({ procurementId, phase, files, checklist, warnings = [] }) {
  return {
    schema:        "emperor-os/prime-review-manifest/v1",
    procurementId: String(procurementId),
    phase,
    generatedAt:   new Date().toISOString(),
    files,
    checklist,
    warnings,
    instruction:   "Complete every checklist item before signing the unsigned tx package. " +
                   "Reject or defer if any item cannot be confirmed.",
  };
}
