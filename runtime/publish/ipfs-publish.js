export async function publishIpfsDraft({ artifacts, name = "publish_manifest.json", cid = "pending" }) {
  const payload = {
    schema: "emperor-os/ipfs-publish/v1",
    cid,
    publishedAt: new Date().toISOString()
  };
  await artifacts.writeJson(name, payload);
  return payload;
}
