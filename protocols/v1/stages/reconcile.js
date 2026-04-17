import { transition } from "./_helpers.js";
export async function reconcileStage({ state, context }) {
  return { state: await transition(context, state, "DONE", { stage: "reconcile" }) };
}
