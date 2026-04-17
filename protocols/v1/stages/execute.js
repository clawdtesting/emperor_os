import { requireRetrievalBeforeSolve } from "../guards.js";
import { transition } from "./_helpers.js";

export async function executeStage({ state, context }) {
  const retrievalGate = requireRetrievalBeforeSolve(state);
  if (!retrievalGate.ok) {
    return { state: await transition(context, state, retrievalGate.blockedState, { gate: retrievalGate.reason }), stop: true };
  }
  await context.artifacts.writeText("execution_trace.jsonl", JSON.stringify({ at: new Date().toISOString(), msg: "executed" }) + "\n");
  return { state: await transition(context, state, "EXECUTED", { stage: "execute" }) };
}
