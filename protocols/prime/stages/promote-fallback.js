import { fallbackPromotionGuard } from "../guards.js";
import { transition } from "./_helpers.js";

export async function promoteFallbackStage({ state, context, input }) {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!fallbackPromotionGuard(now, input.deadlines ?? {})) {
    return { state: await transition(context, state, "BLOCKED_DEADLINE", { guard: "fallbackPromotion" }), stop: true };
  }
  return { state: await transition(context, state, "WINNER_DESIGNATED", { stage: "fallback-promotion" }) };
}
