// audits/integration/checks/ipfs_health.js
// Verifies IPFS gateway connectivity and Pinata API reachability.
// A healthy IPFS integration is required for submitting deliverables.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";

const CHECK_NAME = "integration.ipfs_health";
const TIMEOUT_MS = 5000;

const GATEWAYS = [
  { name: "ipfs.io", url: "https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/readme" },
  { name: "cloudflare-ipfs", url: "https://cloudflare-ipfs.com/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/readme" },
];

const PINATA_API = "https://api.pinata.cloud/data/testAuthentication";

async function probe(url, name, headers = {}) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { name, ok: res.ok, status: res.status };
  } catch (err) {
    return { name, ok: false, error: err.message };
  }
}

export async function run(ctx) {
  const start = Date.now();
  const results = [];

  for (const gw of GATEWAYS) {
    const result = await probe(gw.url, gw.name);
    results.push(result);
  }

  const pinataJwt = process.env.PINATA_JWT;
  if (pinataJwt) {
    const pinata = await probe(PINATA_API, "pinata", {
      Authorization: `Bearer ${pinataJwt}`,
    });
    results.push(pinata);
  } else {
    results.push({ name: "pinata", ok: null, skipped: true, reason: "PINATA_JWT not set" });
  }

  const failed = results.filter(r => r.ok === false);
  const passed = results.filter(r => r.ok === true);
  const skipped = results.filter(r => r.skipped);

  if (failed.length === GATEWAYS.length) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `All IPFS gateways unreachable: ${failed.map(f => `${f.name} (${f.error || f.status})`).join(", ")}`,
      durationMs: Date.now() - start,
      extra: { results },
    });
  } else if (failed.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `${failed.length} IPFS endpoint(s) unreachable, ${passed.length} healthy: ${failed.map(f => f.name).join(", ")}`,
      durationMs: Date.now() - start,
      extra: { results },
    });
  } else {
    const detail = skipped.length > 0
      ? `${passed.length} endpoint(s) healthy (${skipped.map(s => s.name).join(", ")} skipped: ${skipped[0].reason})`
      : `All ${passed.length} IPFS endpoint(s) healthy`;
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: detail,
      durationMs: Date.now() - start,
      extra: { results },
    });
  }

  return ctx;
}
