#!/usr/bin/env node
/**
 * Hermes MCP adapter entry.
 *
 * Hermes spawns this process via its `mcp_servers` block, typically using
 * stdio transport. All tool behaviour is implemented in the shared MCP
 * server (src/adapters/mcp-common/server.ts); this shim exists so the
 * folder structure matches the documented adapter layout and so the
 * startup banner identifies Hermes as the host runtime.
 *
 * Host-specific hardening for Hermes is limited to banner tagging.
 * OpenClaw's additional hardening (boundary addendum, doctor checks) is
 * not applied here — see src/adapters/openclaw-mcp/index.ts for that
 * entry point.
 */

import { startMcpServer } from '../mcp-common/server.js';

startMcpServer({ host: 'hermes', banner: '[F0X-chat-MCP:hermes]' }).catch((e) => {
  process.stderr.write(`[F0X-chat-MCP:hermes] Fatal: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
