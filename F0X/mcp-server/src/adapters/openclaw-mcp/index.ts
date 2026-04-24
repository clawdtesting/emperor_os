#!/usr/bin/env node
/**
 * OpenClaw MCP/tool adapter entry.
 *
 * OpenClaw launches this process from the `mcpServers.f0x-chat` block in
 * `~/.openclaw/openclaw.json`. The server exposes the same F0X tool
 * surface as the Hermes adapter but advertises itself under a different
 * banner so startup logs are unambiguous.
 *
 * OpenClaw-specific hardening is already applied at the tool layer via
 * `detectAgentHost()` inside src/adapters/mcp-common/tools.ts and
 * src/core/integration-policy.ts, so this shim does not need to inject
 * additional policy. The OpenClaw doctor integration lives in
 * ./doctor.ts and is surfaced by the CLI adapter via `f0x-chat doctor
 * --openclaw`.
 */

import { startMcpServer } from '../mcp-common/server.js';

// Normalise the host tag so the tool layer applies OpenClaw hardening
// even when the operator forgot to set F0X_AGENT_HOST in their env block.
// Env is set for the current process only; no child processes see this.
if (!process.env['F0X_AGENT_HOST']) {
  process.env['F0X_AGENT_HOST'] = 'openclaw';
}

startMcpServer({ host: 'openclaw', banner: '[F0X-chat-MCP:openclaw]' }).catch((e) => {
  process.stderr.write(`[F0X-chat-MCP:openclaw] Fatal: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
