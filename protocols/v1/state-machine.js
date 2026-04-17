import { V1_TRANSITIONS } from "./transitions.js";

export function canTransition(from, to) {
  return (V1_TRANSITIONS[from] ?? []).includes(to);
}

export function applyTransition({ state, to, metadata = {} }) {
  if (!canTransition(state.status, to)) {
    throw new Error(`Illegal v1 transition ${state.status} -> ${to}`);
  }
  return {
    ...state,
    status: to,
    statusHistory: [
      ...(state.statusHistory ?? []),
      { status: to, at: new Date().toISOString(), metadata }
    ]
  };
}
