// validation/score-tx-handoff.js
// Builds and validates unsigned score transaction packages for validator role.
// SAFETY CONTRACT: No private key. No signing. No broadcasting.

import path from "path";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import { encodePrimeCall, PRIME_CONTRACT, CHAIN_ID } from "../agent/prime-client.js";
import { CONFIG } from "../agent/config.js";
import { ensureProcSubdir, writeJson } from "../agent/prime-state.js";
import { VALIDATOR_CONFIG } from "./config.js";
import { computeScoreCommitment, verifyScoreReveal } from "./scoring-adjudicator.js";

export const SCORE_COMMIT_ARTIFACTS = [
  "scoring/validator_assignment.json",
  "scoring/evidence_bundle.json",
  "scoring/adjudication_result.json",
  "scoring/score_commit_payload.json",
  "scoring/unsigned_score_commit_tx.json",
];

export const SCORE_REVEAL_ARTIFACTS = [
  "scoring/score_commit_payload.json",
  "scoring/score_reveal_payload.json",
  "scoring/unsigned_score_reveal_tx.json",
];

async function computeReviewRootHash(procurementId, artifactBindings, calldata) {
  const procRoot = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`);
  const pieces = [];
  for (const binding of artifactBindings ?? []) {
    const rel = String(binding?.file ?? "");
    const abs = path.join(procRoot, rel);
    try {
      const content = await fs.readFile(abs);
      const digest = createHash("sha256").update(content).digest("hex");
      pieces.push(`${rel}:${digest}`);
    } catch {
      pieces.push(`${rel}:MISSING`);
    }
  }
  pieces.sort();
  pieces.push(`calldata:${createHash("sha256").update(String(calldata ?? ""), "utf8").digest("hex")}`);
  return createHash("sha256").update(pieces.join("|"), "utf8").digest("hex");
}

function buildScoreCommitPackage({ procurementId, score, salt, scoreCommitment, adjudication }) {
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Number(process.env.PRIME_UNSIGNED_TX_TTL_MS ?? "900000")).toISOString();
  const { data } = encodePrimeCall("scoreCommit", [BigInt(procurementId), scoreCommitment]);

  return {
    schema: "emperor-os/validator-score-commit-tx/v1",
    chainId: CHAIN_ID,
    target: PRIME_CONTRACT,
    contractName: "AGIJobDiscoveryPrime",
    function: "scoreCommit",
    args: {
      procurementId: String(procurementId),
      scoreCommitment,
    },
    calldata: data,
    decodedCall: `scoreCommit(procurementId=${procurementId}, scoreCommitment=${scoreCommitment})`,
    generatedAt,
    expiresAt,
    phase: "VALIDATOR_SCORE_COMMIT",
    procurementId: String(procurementId),
    preconditions: [
      "Validator role confirmed for this procurement",
      "Score commit window is open (check scoreCommitDeadline)",
      "Commitment computed deterministically: keccak256(score:salt)",
      "Evidence bundle fetched and reviewed",
      "Adjudication score matches commitment input",
    ],
    artifactBindings: [
      { file: "scoring/evidence_bundle.json", role: "on-chain + IPFS evidence" },
      { file: "scoring/adjudication_result.json", role: "scoring evaluation" },
      { file: "scoring/score_commit_payload.json", role: "commitment source" },
      { file: "scoring/unsigned_score_commit_tx.json", role: "this tx package" },
    ],
    reviewChecklist: [
      "Confirm procurementId matches the intended procurement",
      "Confirm scoreCommitment matches adjudication_result.json score + salt",
      "Confirm score commit window has not expired",
      "Confirm target contract is AGIJobDiscoveryPrime",
      "Confirm chainId is 1 (Ethereum Mainnet)",
      "Verify score is within valid range (0-100)",
    ],
    reviewMessage: "Validator score commit tx. This commits your score without revealing it. Verify the commitment hash matches your local score + salt. Use MetaMask + Ledger. Never skip the checklist.",
    safety: {
      noPrivateKeyInRuntime: true,
      noSigningInRuntime: true,
      noBroadcastInRuntime: true,
    },
    validatorMetadata: {
      validatorAddress: VALIDATOR_CONFIG.VALIDATOR_ADDRESS,
      score,
      scoreCommitment,
      adjudicationSummary: adjudication ? {
        score: adjudication.score,
        dimensions: Object.fromEntries(Object.entries(adjudication.dimensions ?? {}).map(([k, v]) => [k, v.score])),
      } : null,
    },
  };
}

function buildScoreRevealPackage({ procurementId, score, salt, expectedCommitment, adjudication }) {
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Number(process.env.PRIME_UNSIGNED_TX_TTL_MS ?? "900000")).toISOString();
  const { data } = encodePrimeCall("scoreReveal", [BigInt(procurementId), BigInt(score), salt]);

  return {
    schema: "emperor-os/validator-score-reveal-tx/v1",
    chainId: CHAIN_ID,
    target: PRIME_CONTRACT,
    contractName: "AGIJobDiscoveryPrime",
    function: "scoreReveal",
    args: {
      procurementId: String(procurementId),
      score: String(score),
      salt,
    },
    calldata: data,
    decodedCall: `scoreReveal(procurementId=${procurementId}, score=${score}, salt=${salt})`,
    generatedAt,
    expiresAt,
    phase: "VALIDATOR_SCORE_REVEAL",
    procurementId: String(procurementId),
    preconditions: [
      "Score reveal window is open (check scoreRevealDeadline)",
      "Salt matches the salt used to compute the commitment",
      "Recomputed commitment matches the on-chain committed value",
      "Score commit was previously submitted and confirmed",
    ],
    artifactBindings: [
      { file: "scoring/score_commit_payload.json", role: "original commitment source" },
      { file: "scoring/score_reveal_payload.json", role: "reveal source" },
      { file: "scoring/adjudication_result.json", role: "scoring evaluation" },
      { file: "scoring/unsigned_score_reveal_tx.json", role: "this tx package" },
    ],
    reviewChecklist: [
      "Confirm score reveal window is open",
      "Confirm salt matches score_commit_payload.json",
      "Confirm recomputed commitment matches original commitment",
      "Confirm score value matches committed score",
      "Confirm target contract is AGIJobDiscoveryPrime",
      "Confirm chainId is 1",
    ],
    reviewMessage: "Validator score reveal tx. This reveals your score and salt on-chain. Verify the salt matches your commitment. Use MetaMask + Ledger. Never skip the checklist.",
    safety: {
      noPrivateKeyInRuntime: true,
      noSigningInRuntime: true,
      noBroadcastInRuntime: true,
    },
    validatorMetadata: {
      validatorAddress: VALIDATOR_CONFIG.VALIDATOR_ADDRESS,
      score,
      salt,
      expectedCommitment,
      commitmentCheck: verifyScoreReveal({ score, salt, expectedCommitment }),
      adjudicationSummary: adjudication ? {
        score: adjudication.score,
        dimensions: Object.fromEntries(Object.entries(adjudication.dimensions ?? {}).map(([k, v]) => [k, v.score])),
      } : null,
    },
  };
}

async function writeTxFile(dir, filename, pkg) {
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, filename);
  const tmp = `${p}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, JSON.stringify(pkg, null, 2), "utf8");
  await fs.rename(tmp, p);
  return p;
}

export async function validateValidatorScoreHandoff({ procurementId, mode, continuity = null }) {
  const root = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`);
  const required = mode === "reveal" ? SCORE_REVEAL_ARTIFACTS : SCORE_COMMIT_ARTIFACTS;
  const checks = await Promise.all(required.map(async (rel) => ({
    path: rel,
    present: await fs.access(path.join(root, rel)).then(() => true).catch(() => false),
  })));
  const missingRequiredArtifacts = checks.filter((c) => !c.present).map((c) => c.path);
  const continuityOk = mode === "reveal" ? Boolean(continuity?.verified) : true;
  return {
    mode,
    procurementId: String(procurementId),
    requiredArtifacts: checks,
    missingRequiredArtifacts,
    continuity,
    complete: missingRequiredArtifacts.length === 0 && continuityOk,
  };
}

export async function buildValidatorScoreCommitHandoff({ procurementId, score, salt, adjudication }) {
  const scoreCommitment = computeScoreCommitment(score, salt);
  const pkg = buildScoreCommitPackage({ procurementId, score, salt, scoreCommitment, adjudication });

  pkg.reviewRootHash = await computeReviewRootHash(procurementId, pkg.artifactBindings, pkg.calldata);

  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  const filePath = await writeTxFile(scoringDir, "unsigned_score_commit_tx.json", pkg);

  const payload = {
    procurementId: String(procurementId),
    score,
    salt,
    scoreCommitment,
    adjudication,
    txPath: filePath,
    generatedAt: new Date().toISOString(),
  };
  await writeJson(path.join(scoringDir, "score_commit_payload.json"), payload);

  const completeness = await validateValidatorScoreHandoff({ procurementId, mode: "commit" });
  return { path: filePath, package: pkg, payload, completeness };
}

export async function buildValidatorScoreRevealHandoff({ procurementId, score, salt, adjudication }) {
  const scoreCommitment = computeScoreCommitment(score, salt);
  const continuity = verifyScoreReveal({ score, salt, expectedCommitment: scoreCommitment });
  const pkg = buildScoreRevealPackage({
    procurementId,
    score,
    salt,
    expectedCommitment: scoreCommitment,
    adjudication,
  });

  pkg.reviewRootHash = await computeReviewRootHash(procurementId, pkg.artifactBindings, pkg.calldata);

  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  const filePath = await writeTxFile(scoringDir, "unsigned_score_reveal_tx.json", pkg);

  const payload = {
    procurementId: String(procurementId),
    score,
    salt,
    expectedCommitment: scoreCommitment,
    commitmentCheck: continuity,
    adjudication,
    txPath: filePath,
    generatedAt: new Date().toISOString(),
  };
  await writeJson(path.join(scoringDir, "score_reveal_payload.json"), payload);

  const completeness = await validateValidatorScoreHandoff({ procurementId, mode: "reveal", continuity });
  return { path: filePath, package: pkg, payload, continuity, completeness };
}
