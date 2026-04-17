import { hasValidRetrievalPacket } from "../../runtime/retrieval/retrieval-packet.js";

export function requireRetrievalBeforeSolve(state) {
  if (!hasValidRetrievalPacket(state)) {
    return { ok: false, blockedState: "BLOCKED_RETRIEVAL_REQUIRED", reason: "retrieval packet missing" };
  }
  return { ok: true };
}

export async function requireCanonicalArtifacts(artifacts) {
  try {
    await artifacts.requireCanonical();
    return { ok: true };
  } catch (err) {
    return { ok: false, blockedState: "BLOCKED_ARTIFACT_EMISSION_REQUIRED", reason: err.message, missing: err.details?.missing ?? [] };
  }
}
