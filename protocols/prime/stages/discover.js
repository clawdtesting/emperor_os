import { ensureRetrievalPacket } from "../../../runtime/retrieval/retrieval-packet.js";
import { transition } from "./_helpers.js";

export async function discoverStage({ state, context }) {
  await ensureRetrievalPacket({ artifacts: context.artifacts, jobFamily: "prime", query: `procurement:${context.id}` });
  return { state: await transition(context, { ...state, retrievalComplete: true }, "EVALUATED", { stage: "discover" }) };
}
