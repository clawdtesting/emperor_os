import { finalistAcceptGuard } from "../guards.js";
import { transition } from "./_helpers.js";

export async function acceptFinalistStage({ state, context, input }) {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!finalistAcceptGuard(now, input.deadlines ?? {})) {
    return { state: await transition(context, state, "BLOCKED_DEADLINE", { guard: "finalistAccept" }), stop: true };
  }
  const accepted = await transition(context, state, "FINALIST_ACCEPTED_UNSIGNED", { stage: "accept-finalist" });
  return { state: await transition(context, accepted, "FINALIST_ACCEPT_CONFIRMED", { stage: "accept-confirm" }) };
}
