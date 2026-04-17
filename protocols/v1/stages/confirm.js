import { transition } from "./_helpers.js";
export async function confirmStage({ state, context }) {
  return { state: await transition(context, state, "APPLIED_CONFIRMED", { stage: "confirm" }) };
}
