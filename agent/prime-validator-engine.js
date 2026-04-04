import { createHash } from "crypto";
import path from "path";
import { readJson, writeJson, procSubdir, ensureProcSubdir } from "./prime-state.js";
import { encodePrimeCall, fetchValidatorAssignment } from "./prime-client.js";

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deterministicScore(input) {
  const asJson = stableStringify(input ?? {});
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

export function computeScoreCommitment(score, salt) {
  return `0x${createHash("sha256").update(`${score}:${salt}`, "utf8").digest("hex")}`;
}

export function verifyScoreRevealAgainstCommit({ score, salt, expectedCommitment }) {
  const recomputed = computeScoreCommitment(score, salt);
  return {
    expectedCommitment: String(expectedCommitment ?? "").toLowerCase(),
    recomputedCommitment: recomputed.toLowerCase(),
    verified: recomputed.toLowerCase() === String(expectedCommitment ?? "").toLowerCase(),
  };
}

export async function discoverValidatorAssignment(procurementId, validatorAddress) {
  const assignment = await fetchValidatorAssignment(procurementId, validatorAddress);
  const result = {
    procurementId: String(procurementId),
    validatorAddress: String(validatorAddress ?? "").toLowerCase(),
    assigned: Boolean(assignment?.assigned),
    assignment,
    checkedAt: new Date().toISOString(),
  };

  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  await writeJson(path.join(scoringDir, "validator_assignment.json"), result);
  return result;
}

export async function buildValidatorScoringPayloads({ procurementId, linkedJobId, validatorAddress }) {
  const chainSnapshot = await readJson(path.join(procSubdir(procurementId, ""), "chain_snapshot.json"), {});
  const trialManifest = await readJson(path.join(procSubdir(procurementId, "trial"), "trial_artifact_manifest.json"), {});
  const input = {
    procurementId: String(procurementId),
    linkedJobId: linkedJobId != null ? String(linkedJobId) : null,
    validatorAddress: String(validatorAddress ?? "").toLowerCase(),
    chainSnapshot,
    trialManifest,
  };
  const score = deterministicScore(input);
  const salt = randomSaltLike(procurementId, score, stableStringify(input));
  const commitmentHex = computeScoreCommitment(score, salt);

  const commitTx = encodePrimeCall("scoreCommit", [BigInt(procurementId), commitmentHex]);
  const revealTx = encodePrimeCall("scoreReveal", [BigInt(procurementId), BigInt(score), salt]);

  const scoreCommitPayload = {
    procurementId: String(procurementId),
    linkedJobId: linkedJobId != null ? String(linkedJobId) : null,
    validatorAddress: String(validatorAddress ?? "").toLowerCase(),
    scoringInputHash: createHash("sha256").update(stableStringify(input), "utf8").digest("hex"),
    score,
    salt,
    scoreCommitment: commitmentHex,
    preparedTx: { tx: commitTx },
    generatedAt: new Date().toISOString(),
  };
  const scoreRevealPayload = {
    procurementId: String(procurementId),
    linkedJobId: linkedJobId != null ? String(linkedJobId) : null,
    validatorAddress: String(validatorAddress ?? "").toLowerCase(),
    score,
    salt,
    expectedCommitment: commitmentHex,
    commitmentCheck: verifyScoreRevealAgainstCommit({ score, salt, expectedCommitment: commitmentHex }),
    preparedTx: { tx: revealTx },
    generatedAt: new Date().toISOString(),
  };

  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  await writeJson(path.join(scoringDir, "score_commit_payload.json"), scoreCommitPayload);
  await writeJson(path.join(scoringDir, "score_reveal_payload.json"), scoreRevealPayload);

  return { scoreCommitPayload, scoreRevealPayload };
}
