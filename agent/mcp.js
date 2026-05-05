// ./agent/mcp.js
import { loadEnv } from "./env.js";

loadEnv();

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const HEX_0X = /^0x[0-9a-fA-F]+$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireTxShape(tx, label) {
  assert(tx && typeof tx === "object", `${label} missing`);
  assert(typeof tx.to === "string" && tx.to.length > 0, `${label}.to missing`);
  assert(typeof tx.data === "string" && HEX_0X.test(tx.data), `${label}.data must be hex`);
  if (tx.value != null) {
    const asString = String(tx.value);
    assert(/^([0-9]+|0x[0-9a-fA-F]+)$/.test(asString), `${label}.value invalid`);
  }
}

function validateWriteToolResponse(tool, result) {
  if (tool === "upload_to_ipfs") {
    assert(result && typeof result === "object", "[MCP:upload_to_ipfs] expected object");
    assert(typeof result.ipfsUri === "string" && result.ipfsUri.startsWith("ipfs://"),
      "[MCP:upload_to_ipfs] missing valid ipfsUri");
    return result;
  }

  if (tool === "request_job_completion") {
    requireTxShape(result, "[MCP:request_job_completion]");
    return result;
  }

  if (tool === "apply_for_job") {
    assert(result && typeof result === "object", "[MCP:apply_for_job] expected object");
    requireTxShape(result.approve, "[MCP:apply_for_job] approve");
    requireTxShape(result.apply, "[MCP:apply_for_job] apply");
    return result;
  }

  return result;
}

function getEndpoint() {
  const endpoint = process.env.AGI_ALPHA_MCP;
  if (!endpoint) throw new Error("AGI_ALPHA_MCP not set");
  return endpoint;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  return (
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("AbortError") ||
    msg.includes("timed out")
  );
}

function unpack(result) {
  if (result == null) return result;

  if (result.content && Array.isArray(result.content)) {
    const textItems = result.content.filter((item) => item?.type === "text");
    if (textItems.length === 0) return result;

    const joined = textItems.map((item) => item.text ?? "").join("\n").trim();
    if (!joined) return result;

    try {
      return JSON.parse(joined);
    } catch {
      return joined;
    }
  }

  return result;
}

async function parseSseResponse(res, tool) {
  const text = await res.text();
  const lines = text.split(/\r?\n/);

  let firstResult;
  let sawPayload = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;

    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;

    let msg;
    try {
      msg = JSON.parse(payload);
    } catch {
      continue;
    }

    sawPayload = true;

    if (msg.error) {
      throw new Error(`[MCP:${tool}] ${msg.error.message || JSON.stringify(msg.error)}`);
    }

    if (msg.result !== undefined) {
      const unpacked = unpack(msg.result);
      if (firstResult === undefined) {
        firstResult = unpacked;
      } else if (JSON.stringify(unpacked) !== JSON.stringify(firstResult)) {
        throw new Error(`[MCP:${tool}] conflicting SSE result payloads`);
      }
    }
  }

  if (!sawPayload) throw new Error(`[MCP:${tool}] no SSE payload received`);
  if (firstResult === undefined) throw new Error(`[MCP:${tool}] no result in SSE stream`);

  return firstResult;
}

async function parseJsonResponse(res, tool) {
  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`[MCP:${tool}] invalid JSON response: ${err.message}`);
  }

  if (data?.error) {
    throw new Error(`[MCP:${tool}] ${data.error.message || JSON.stringify(data.error)}`);
  }

  return unpack(data?.result);
}

async function rawCallMcp(tool, args = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const endpoint = getEndpoint();

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: tool,
        arguments: args
      }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      `[MCP:${tool}] HTTP ${res.status}${body ? ` :: ${body.slice(0, 300)}` : ""}`
    );
    err.status = res.status;
    throw err;
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("text/event-stream")) {
    return parseSseResponse(res, tool);
  }

  return parseJsonResponse(res, tool);
}

export async function callMcp(tool, args = {}, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 0,
    retryDelayMs = 1_000
  } = options;

  let attempt = 0;
  let lastErr;

  while (attempt <= retries) {
    try {
      const raw = await rawCallMcp(tool, args, timeoutMs);
      return validateWriteToolResponse(tool, raw);
    } catch (err) {
      lastErr = err;
      const retryable =
        (typeof err.status === "number" && RETRYABLE_STATUS.has(err.status)) ||
        isRetryableError(err);

      if (!retryable || attempt === retries) {
        throw err;
      }

      await sleep(retryDelayMs * (attempt + 1));
      attempt += 1;
    }
  }

  throw lastErr;
}

export async function listJobs() {
  const result = await callMcp("list_jobs", {}, { retries: 2 });
  if (!Array.isArray(result)) {
    throw new Error("[MCP:list_jobs] expected array");
  }
  console.log(`[MCP:list_jobs] returned ${result.length} jobs`);
  if (result.length > 0) {
    const first = result[0];
    console.log(`[MCP:list_jobs] first element keys: ${Object.keys(first).join(", ")}`);
    // Log a few sample values if they are not secrets
    if (first.jobId !== undefined) {
      console.log(`[MCP:list_jobs] first jobId: ${first.jobId}`);
    }
    if (first.id !== undefined) {
      console.log(`[MCP:list_jobs] first id: ${first.id}`);
    }
  }
  return result;
}

export async function getJob(jobId) {
  // Try different argument shapes that MCP get_job might expect
  // Try numeric first as MCP confirmed it requires numeric jobId
  const argShapes = [
    { jobId: Number(jobId) },  // number (preferred based on MCP confirmation)
    { jobId: String(jobId) },  // string (fallback)
    { id: Number(jobId) },     // alternative param name as number
    { id: String(jobId) },     // alternative param name
    { job_id: Number(jobId) }, // underscore version as number
    { job_id: String(jobId) }, // underscore version
  ];

  let lastError = null;

  const debugEnabled = process.env.MCP_DEBUG === '1';

  for (const args of argShapes) {
    try {
      // Debug: log what we're trying (only if debug enabled)
      if (debugEnabled) {
        console.log(`[MCP:get_job] trying args: ${JSON.stringify(args)} for jobId=${jobId}`);
      }
      const result = await callMcp("get_job", args, { retries: 1 }); // fewer retries per attempt

      // Debug: log the result type (only if debug enabled)
      if (debugEnabled) {
        console.log(`[MCP:get_job] jobId=${jobId} result type: ${typeof result} with args ${JSON.stringify(args)}`);
        if (typeof result === 'string') {
          const preview = result.substring(0, 100);
          console.log(`[MCP:get_job] jobId=${jobId} string preview: ${preview}`);
          try {
            const parsed = JSON.parse(result);
            if (parsed !== null && typeof parsed === 'object') {
              console.log(`[MCP:get_job] jobId=${jobId} parsed string as object with args ${JSON.stringify(args)}`);
              return parsed;
            }
          } catch (e) {
            // Not JSON, continue to next shape
          }
        }
      }

      if (result !== null && typeof result === 'object') {
        if (debugEnabled) {
          console.log(`[MCP:get_job] jobId=${jobId} result keys: ${Object.keys(result).join(', ')} with args ${JSON.stringify(args)}`);
        }
        return result;
      }

      // If we got here, result was not valid, try next shape
      lastError = new Error(`[MCP:get_job] expected object but got ${typeof result} for jobId=${jobId}`);
    } catch (err) {
      lastError = err;
      if (debugEnabled) {
        console.log(`[MCP:get_job] jobId=${jobId} failed with args ${JSON.stringify(args)}: ${err.message}`);
      }
      continue; // try next shape
    }
  }

  // If all shapes failed, throw the last error
  throw new Error(`[MCP:get_job] expected object for jobId=${jobId} after trying all argument shapes. Last error: ${lastError.message}`);
}

export async function fetchJobSpec(jobId) {
  return callMcp("fetch_job_metadata", { jobId, type: "spec" }, { retries: 2 });
}

export async function uploadToIpfs(pinataJwt, metadata, name) {
  return callMcp(
    "upload_to_ipfs",
    { pinataJwt, metadata, name },
    { retries: 1, timeoutMs: 60_000 }
  );
}

export async function applyForJob(jobId, agentSubdomain) {
  return callMcp(
    "apply_for_job",
    { jobId, agentSubdomain },
    { retries: 0, timeoutMs: 30_000 }
  );
}

export async function requestJobCompletion(jobId, completionURI, agentSubdomain) {
  return callMcp(
    "request_job_completion",
    { jobId, completionURI, agentSubdomain },
    { retries: 0, timeoutMs: 30_000 }
  );
}
