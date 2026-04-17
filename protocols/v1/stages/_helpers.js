import * as machine from "../state-machine.js";
import { runTransition } from "../../../runtime/engine/transition-runner.js";

export async function transition(context, state, to, metadata = {}) {
  const next = await runTransition({ protocol: "v1", state, targetState: to, machine, metadata });
  await context.stateStore.write(next, context.id);
  return next;
}
