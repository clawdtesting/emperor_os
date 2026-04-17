import { buildUnsignedEnvelope, assertUnsignedOnly } from "../../../runtime/tx/unsigned-envelope.js";
import { transition } from "./_helpers.js";

export async function applyStage({ state, context, input }) {
  const envelope = buildUnsignedEnvelope({ kind: "requestJobApplication", chainId: input.chainId ?? 1, to: input.contract ?? "0x0000000000000000000000000000000000000001", data: "0x327c1255", jobId: context.id });
  assertUnsignedOnly(envelope);
  await context.artifacts.writeJson("unsigned_apply.json", envelope);
  return { state: await transition(context, state, "APPLIED_UNSIGNED", { stage: "apply" }) };
}
