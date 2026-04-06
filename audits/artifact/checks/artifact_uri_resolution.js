// audits/artifact/checks/artifact_uri_resolution.js
// Validates that all URIs referenced in artifact files are well-formed
// and resolvable. Catches broken IPFS links, malformed spec URIs, and
// dead external references before they become submission failures.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "artifact.artifact_uri_resolution";

const URI_FIELDS = [
  "specURI",
  "specUri",
  "spec_uri",
  "applicationURI",
  "applicationUri",
  "application_uri",
  "ipfsUri",
  "ipfsURI",
  "ipfs_uri",
  "ipfsCid",
  "ipfsCID",
  "ipfs_cid",
  "deliveryURI",
  "deliveryUri",
  "delivery_uri",
  "uri",
  "url",
  "source",
  "artifactURI",
  "artifactUri",
  "artifact_uri",
];

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

function extractUris(obj, path = "") {
  const uris = [];

  if (!obj || typeof obj !== "object") return uris;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (URI_FIELDS.includes(key) && typeof value === "string" && value.trim()) {
      uris.push({ field: currentPath, value: value.trim() });
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === "string" && value[i].trim()) {
          if (value[i].startsWith("ipfs://") || value[i].startsWith("http")) {
            uris.push({ field: `${currentPath}[${i}]`, value: value[i].trim() });
          }
        } else if (typeof value[i] === "object" && value[i] !== null) {
          uris.push(...extractUris(value[i], `${currentPath}[${i}]`));
        }
      }
    } else if (typeof value === "object" && value !== null) {
      uris.push(...extractUris(value, currentPath));
    }
  }

  return uris;
}

function isValidUri(uri) {
  if (!uri || typeof uri !== "string") return false;
  if (uri.startsWith("ipfs://")) return /^[a-zA-Z0-9]+$/.test(uri.replace("ipfs://", "").split("/")[0].split("?")[0]);
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    try {
      new URL(uri);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function classifyUri(uri) {
  if (uri.startsWith("ipfs://")) return "ipfs";
  if (uri.includes("/ipfs/")) return "ipfs-gateway";
  if (uri.startsWith("http://") || uri.startsWith("https://")) return "http";
  return "unknown";
}

async function resolveUri(uri, timeoutMs = 5000) {
  const type = classifyUri(uri);

  if (type === "ipfs") {
    const cid = uri.replace("ipfs://", "").split("/")[0];
    for (const gateway of IPFS_GATEWAYS) {
      try {
        const res = await fetch(`${gateway}${cid}`, {
          method: "HEAD",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return { resolved: true, gateway, status: res.status };
      } catch {
        continue;
      }
    }
    return { resolved: false, type: "ipfs", cid };
  }

  if (type === "http" || type === "ipfs-gateway") {
    try {
      const res = await fetch(uri, {
        method: "HEAD",
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { resolved: res.ok, status: res.status };
    } catch (err) {
      return { resolved: false, type: "http", error: err.message };
    }
  }

  return { resolved: false, type: "unknown" };
}

export async function run(ctx) {
  const start = Date.now();

  let allFiles;
  try {
    allFiles = await listFiles(ARTIFACTS_ROOT, f => f.endsWith(".json"));
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Artifacts root not found or unreadable — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  if (allFiles.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No JSON files found in artifacts — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const allUris = [];
  const invalidFormat = [];
  const unresolved = [];
  let filesScanned = 0;

  for (const filePath of allFiles) {
    let data;
    try {
      data = await readJson(filePath);
      filesScanned++;
    } catch {
      continue;
    }

    const uris = extractUris(data);
    for (const uri of uris) {
      const entry = { file: filePath, ...uri, type: classifyUri(uri.value) };

      if (!isValidUri(uri.value)) {
        invalidFormat.push({ ...entry, reason: "malformed URI" });
        continue;
      }

      allUris.push(entry);
    }
  }

  const resolveTargets = allUris.filter(u => u.type === "ipfs" || u.type === "http");
  for (const uri of resolveTargets) {
    const result = await resolveUri(uri.value, 3000);
    if (!result.resolved) {
      unresolved.push({ ...uri, resolveResult: result });
    }
  }

  const totalIssues = invalidFormat.length + unresolved.length;

  if (totalIssues > 0) {
    const details = [];
    if (invalidFormat.length > 0) {
      details.push(`${invalidFormat.length} malformed URI(s)`);
    }
    if (unresolved.length > 0) {
      details.push(`${unresolved.length} unresolved URI(s)`);
    }

    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${details.join("; ")} across ${filesScanned} file(s): ${[...invalidFormat, ...unresolved].slice(0, 3).map(u => `${u.value} (${u.reason || "unresolved"})`).join("; ")}`,
      durationMs: Date.now() - start,
      extra: {
        filesScanned,
        totalUrisFound: allUris.length + invalidFormat.length,
        invalidFormat,
        unresolved,
      },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${allUris.length} URI(s) across ${filesScanned} file(s) are valid and resolvable`,
      durationMs: Date.now() - start,
      extra: {
        filesScanned,
        totalUrisFound: allUris.length,
        byType: {
          ipfs: allUris.filter(u => u.type === "ipfs").length,
          http: allUris.filter(u => u.type === "http").length,
          "ipfs-gateway": allUris.filter(u => u.type === "ipfs-gateway").length,
        },
      },
    });
  }

  return ctx;
}
