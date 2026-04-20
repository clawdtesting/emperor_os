// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/ipfs-verify.js
import { createHash } from "crypto";

function toGatewayUrl(uri) {
  if (!uri || typeof uri !== "string" || !uri.startsWith("ipfs://")) {
    throw new Error(`Invalid IPFS URI: ${uri}`);
  }

  return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
}

export function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function fetchIpfsText(uri) {
  const url = toGatewayUrl(uri);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch IPFS content: ${res.status} ${url}`);
  }

  return res.text();
}

export async function verifyIpfsTextHash(uri, expectedSha256) {
  const text = await fetchIpfsText(uri);
  const actual = sha256Text(text);

  return {
    ok: actual === expectedSha256,
    expectedSha256,
    actualSha256: actual
  };
}
export function verifyInventoryHashes(inventory = [], expectedByPath = {}) {
  const mismatches = []
  for (const item of inventory) {
    const expected = expectedByPath[item.path]
    if (expected && expected !== item.sha256) mismatches.push({ path: item.path, expected, actual: item.sha256 })
  }
  return { ok: mismatches.length === 0, mismatches }
}
