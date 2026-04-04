import { createHash } from "crypto";
import path from "path";
import { readJson, writeJson, procSubdir, ensureProcSubdir } from "./prime-state.js";
import { encodePrimeCall, fetchValidatorAssignment } from "./prime-client.js";

function deterministicScore(input) {
  const asJson = JSON.stringify(input ?? {});
  const h = createHash("sha256").update(asJson, "utf8").digest("hex");
  const bucket = Number.parseInt(h.slice(0, 4), 16);
  return Math.max(0, Math.min(100, bucket % 101));
}

function randomSaltLike(procurementId, score, seed) {
  const h = createHash("sha256")
    .update(`${procurementId}:${score}:${seed}`, "utf8")
    .digest("hex");
  return `0x${h}`;
}

export async function discoverValidatorAssignment(procurementId, validatorAddress) {
  const assignment = await fetchValidatorAssignment(procurementId, validatorAddress);
  return {
    procurementId: String(procurementId),
    validatorAddress: String(validatorAddress ?? "").toLowerCase(),
    assigned: Boolean(assignment?.assigned),
    assignment,
    checkedAt: new Date().toISOString(),
  };
}

export async function buildValidatorScoringPayloads({ procurementId, linkedJobId, validatorAddress }) {
  const chainSnapshot = await readJson(path.join(procSubdir(procurementId, ""), "chain_snapshot.json"), {});
  const trialManifest = await readJson(path.join(procSubdir(procurementId, "trial"), "trial_artifact_manifest.json"), {});
  const input = {
    procurementId: String(procurementId),
    linkedJobId: linkedJobId != null ? String(linkedJobId) : null,
    chainSnapshot,
    trialManifest,
  };
  const score = deterministicScore(input);
  const salt = randomSaltLike(procurementId, score, JSON.stringify(chainSnapshot));
  const scoreCommitment = createHash("sha256").update(`${score}:${salt}`, "utf8").digest("hex");
  const commitmentHex = `0x${scoreCommitment}`;

  const commitTx = encodePrimeCall("scoreCommit", [BigInt(procurementId), commitmentHex]);
  const revealTx = encodePrimeCall("scoreReveal", [BigInt(procurementId), BigInt(score), salt]);

  const scoreCommitPayload = {
    procurementId: String(procurementId),
    linkedJobId: linkedJobId != null ? String(linkedJobId) : null,
    score,
    salt,
    scoreCommitment: commitmentHex,
    preparedTx: { tx: commitTx },
    generatedAt: new Date().toISOString(),
  };
  const scoreRevealPayload = {
    procurementId: String(procurementId),
    linkedJobId: linkedJobId != null ? String(linkedJobId) : null,
    score,
    salt,
    commitmentCheck: commitmentHex,
    preparedTx: { tx: revealTx },
    generatedAt: new Date().toISOString(),
  };

  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  await writeJson(path.join(scoringDir, "score_commit_payload.json"), scoreCommitPayload);
  await writeJson(path.join(scoringDir, "score_reveal_payload.json"), scoreRevealPayload);

  return { scoreCommitPayload, scoreRevealPayload };
}
