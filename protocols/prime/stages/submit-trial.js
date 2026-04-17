import { publishIpfsDraft } from "../../../runtime/publish/ipfs-publish.js";
import { transition } from "./_helpers.js";
export async function submitTrialStage({ state, context }) {
  await publishIpfsDraft({ artifacts: context.artifacts, name: "trial_publish_manifest.json" });
  return { state: await transition(context, state, "TRIAL_PUBLISHED", { stage: "submit-trial" }) };
}
