import { transition } from "./_helpers.js";
export async function evaluateStage({ state, context }) {
  return { state: await transition(context, state, "APPLY_READY", { stage: "evaluate" }) };
}
