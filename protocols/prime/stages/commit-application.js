import { commitWindowGuard } from "../guards.js";
import { buildUnsignedEnvelope, assertUnsignedOnly } from "../../../runtime/tx/unsigned-envelope.js";
import { transition } from "./_helpers.js";

export async function commitApplicationStage({ state, context, input }) {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!commitWindowGuard(now, input.deadlines ?? {})) {
    return { state: await transition(context, state, "BLOCKED_DEADLINE", { guard: "commitWindow" }), stop: true };
  }
  const envelope = buildUnsignedEnvelope({ kind: "primeCommit", chainId: input.chainId ?? 1, to: input.contract ?? "0x1", data: "0xaaaa0001", jobId: context.id });
  assertUnsignedOnly(envelope);
  await context.artifacts.writeJson("unsigned_commit.json", envelope);
  const committed = await transition(context, state, "COMMITTED_UNSIGNED", { stage: "commit" });
  return { state: await transition(context, committed, "COMMIT_CONFIRMED", { stage: "commit-confirm" }) };
}
