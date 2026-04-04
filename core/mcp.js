// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/mcp.js
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

  let lastResult;
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
      lastResult = unpack(msg.result);
    }
  }

  if (!sawPayload) throw new Error(`[MCP:${tool}] no SSE payload received`);
  if (lastResult === undefined) throw new Error(`[MCP:${tool}] no result in SSE stream`);

  return lastResult;
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
  return result;
}

export async function getJob(jobId) {
  const result = await callMcp("get_job", { jobId }, { retries: 2 });
  if (!result || typeof result !== "object") {
    throw new Error(`[MCP:get_job] expected object for jobId=${jobId}`);
  }
  return result;
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
