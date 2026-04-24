#!/usr/bin/env node
/**
 * F0X Chat MCP Server — top-level dispatcher.
 *
 * This is the `bin` entry point (`f0x-chat-mcp`). It picks the right
 * adapter based on detected host and CLI flags, then delegates. The
 * three adapters are:
 *
 *   src/adapters/hermes-mcp/      Hermes MCP adapter (stdio)
 *   src/adapters/openclaw-mcp/    OpenClaw MCP/tool adapter (stdio)
 *   src/adapters/cli-ui/          CLI + local dashboard UI
 *
 * Dispatch rules:
 *   - `--adapter=hermes|openclaw|cli-ui`  explicit operator override
 *   - detectAgentHost() === 'openclaw'    OpenClaw adapter
 *   - detectAgentHost() === 'hermes'      Hermes adapter
 *   - fallback (generic MCP client)       Hermes adapter (no-op host tag)
 *
 * The dispatcher is intentionally minimal so it adds no runtime
 * behaviour of its own — all security-relevant code lives in the
 * adapters and core modules.
 */

import { detectAgentHost } from './core/runtime.js';

const args = process.argv.slice(2);
const adapterFlag = args.find((a) => a.startsWith('--adapter='))?.split('=')[1];

type AdapterChoice = 'hermes' | 'openclaw' | 'cli-ui';

function choose(): AdapterChoice {
  if (adapterFlag === 'hermes' || adapterFlag === 'openclaw' || adapterFlag === 'cli-ui') {
    return adapterFlag;
  }
  const host = detectAgentHost();
  if (host === 'openclaw') return 'openclaw';
  return 'hermes';
}

const choice = choose();

if (choice === 'openclaw') {
  await import('./adapters/openclaw-mcp/index.js');
} else if (choice === 'cli-ui') {
  await import('./adapters/cli-ui/cli.js');
} else {
  await import('./adapters/hermes-mcp/index.js');
}
