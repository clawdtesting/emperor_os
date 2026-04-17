import { requireCanonicalArtifacts } from "../guards.js";
import { buildUnsignedEnvelope, assertUnsignedOnly } from "../../../runtime/tx/unsigned-envelope.js";
import { transition } from "./_helpers.js";

export async function submitStage({ state, context, input }) {
  const gate = await requireCanonicalArtifacts(context.artifacts);
  if (!gate.ok) {
    return { state: await transition(context, state, gate.blockedState, { gate: gate.reason, missing: gate.missing }), stop: true };
  }
  const envelope = buildUnsignedEnvelope({ kind: "requestJobCompletion", chainId: input.chainId ?? 1, to: input.contract ?? "0x0000000000000000000000000000000000000001", data: "0x8d1bc00f", jobId: context.id });
  assertUnsignedOnly(envelope);
  await context.artifacts.writeJson("unsigned_completion.json", envelope);
  const submitted = await transition(context, state, "SUBMITTED_UNSIGNED", { stage: "submit" });
  return { state: await transition(context, submitted, "RECONCILING", { stage: "submit" }) };
}
