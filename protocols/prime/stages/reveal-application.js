import { revealWindowGuard } from "../guards.js";
import { buildUnsignedEnvelope, assertUnsignedOnly } from "../../../runtime/tx/unsigned-envelope.js";
import { transition } from "./_helpers.js";

export async function revealApplicationStage({ state, context, input }) {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!revealWindowGuard(now, input.deadlines ?? {})) {
    return { state: await transition(context, state, "BLOCKED_DEADLINE", { guard: "revealWindow" }), stop: true };
  }
  const envelope = buildUnsignedEnvelope({ kind: "primeReveal", chainId: input.chainId ?? 1, to: input.contract ?? "0x1", data: "0xbbbb0002", jobId: context.id });
  assertUnsignedOnly(envelope);
  await context.artifacts.writeJson("unsigned_reveal.json", envelope);
  const revealed = await transition(context, state, "REVEALED_UNSIGNED", { stage: "reveal" });
  return { state: await transition(context, revealed, "REVEAL_CONFIRMED", { stage: "reveal-confirm" }) };
}
