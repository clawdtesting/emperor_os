import { IllegalTransitionError } from "./errors.js";

export async function runTransition({ protocol, state, targetState, machine, metadata = {} }) {
  if (!machine.canTransition(state.status, targetState, metadata)) {
    throw new IllegalTransitionError(protocol, state.status, targetState);
  }
  return machine.applyTransition({ state, to: targetState, metadata });
}
