import { transition } from "./_helpers.js";
export async function finalizeShortlistStage({ state, context, input }) {
  if (input.isFinalist) return { state: await transition(context, state, "FINALIST", { stage: "shortlist" }) };
  return { state: await transition(context, state, "WINNER_PENDING", { stage: "shortlist" }) };
}
