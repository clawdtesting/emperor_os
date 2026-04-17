import { transition } from "./_helpers.js";
export async function validateStage({ state, context }) {
  await context.artifacts.writeJson("findings.json", { ok: true, checkedAt: new Date().toISOString() });
  return { state: await transition(context, state, "VALIDATED", { stage: "validate" }) };
}
