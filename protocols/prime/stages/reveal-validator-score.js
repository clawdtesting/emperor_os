import { scoreCommitGuard, scoreRevealGuard } from "../guards.js";
import { transition } from "./_helpers.js";

export async function revealValidatorScoreStage({ state, context, input }) {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const deadlines = input.deadlines ?? {};
  if (!scoreCommitGuard(now, deadlines) && !scoreRevealGuard(now, deadlines)) {
    return { state: await transition(context, state, "BLOCKED_DEADLINE", { guard: "scoreWindows" }), stop: true };
  }
  return { state: await transition(context, state, "WINNER_PENDING", { stage: "validator-score" }) };
}
