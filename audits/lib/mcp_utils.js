// audits/lib/mcp_utils.js
// MCP (Model Context Protocol) request/response helpers for audit checks.

const MCP_ENDPOINT = process.env.AGI_ALPHA_MCP || "https://agialpha.com/api/mcp";

async function callMcp(tool, args = {}, timeoutMs = 20000) {
  const res = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: tool, arguments: args } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const d = JSON.parse(line.slice(5).trim());
        if (d.result !== undefined) return unpackMcp(d.result);
      } catch {}
    }
    throw new Error("No result in SSE stream");
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return unpackMcp(data.result);
}

function unpackMcp(result) {
  if (!result) return result;
  if (result.content && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.type === "text") {
        try { return JSON.parse(item.text); } catch { return item.text; }
      }
    }
  }
  return result;
}

export async function checkMcpConnectivity(timeoutMs = 10000) {
  const start = Date.now();
  try {
    await callMcp("list_jobs", {}, timeoutMs);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err.message, latencyMs: Date.now() - start };
  }
}

export { callMcp, unpackMcp };
