import { transition } from "./_helpers.js";
export async function finalizeWinnerStage({ state, context, input }) {
  if (input.designatedWinner) return { state: await transition(context, state, "WINNER_DESIGNATED", { stage: "finalize-winner" }) };
  return { state: await transition(context, state, "FALLBACK_PROMOTABLE", { stage: "finalize-winner" }) };
}
