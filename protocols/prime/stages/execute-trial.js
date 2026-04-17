import { trialGuard } from "../guards.js";
import { transition } from "./_helpers.js";

export async function executeTrialStage({ state, context, input }) {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!trialGuard(now, input.deadlines ?? {})) {
    return { state: await transition(context, state, "BLOCKED_DEADLINE", { guard: "trialWindow" }), stop: true };
  }
  await context.artifacts.writeText("execution_trace.jsonl", JSON.stringify({ msg: "prime trial executed", at: new Date().toISOString() }) + "\n");
  return { state: await transition(context, state, "TRIAL_EXECUTED", { stage: "execute-trial" }) };
}
