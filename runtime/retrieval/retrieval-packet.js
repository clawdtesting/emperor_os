export async function ensureRetrievalPacket({ artifacts, jobFamily = "default", query = "" }) {
  const packet = {
    schema: "emperor-os/retrieval-packet/v1",
    jobFamily,
    query,
    generatedAt: new Date().toISOString(),
    hits: []
  };
  await artifacts.writeJson("retrieval_packet.json", packet);
  return packet;
}

export function hasValidRetrievalPacket(state) {
  return Boolean(state?.retrieval?.schema || state?.retrievalPacketPath || state?.retrievalComplete);
}
