import { transition } from "./_helpers.js";
export async function settleStage({ state, context }) {
  return { state: await transition(context, state, "DONE", { stage: "settle" }) };
}
