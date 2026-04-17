import { publishIpfsDraft } from "../../../runtime/publish/ipfs-publish.js";
import { transition } from "./_helpers.js";

export async function publishStage({ state, context }) {
  await publishIpfsDraft({ artifacts: context.artifacts });
  return { state: await transition(context, state, "PUBLISHED", { stage: "publish" }) };
}
