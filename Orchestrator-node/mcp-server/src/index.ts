#!/usr/bin/env node
/**
 * Orchestrator Chat MCP Server
 *
 * Usage:
 *   # stdio (default — for Hermes local mode)
 *   node dist/index.js
 *
 *   # SSE — for remote Hermes / deployed relay
 *   node dist/index.js --sse [--sse-port=3001]
 *
 * Environment variables:
 *   RELAY_URL          Relay base URL (default: http://localhost:3000)
 *   AGENT_LABEL        Agent display name (default: hermes-agent)
 *   AGENT_IDENTITY_DIR Path for identity + channel key files
 *                      (default: ~/.orchestrator-chat)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { RelayClient } from './relay-client.js';
import { loadOrCreateIdentity, defaultIdentityDir } from './identity.js';
import { TOOL_DEFINITIONS, handleTool, type ToolContext } from './tools.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const RELAY_URL = process.env['RELAY_URL'] ?? 'http://localhost:3000';
const AGENT_LABEL = process.env['AGENT_LABEL'] ?? 'hermes-agent';
const IDENTITY_DIR = process.env['AGENT_IDENTITY_DIR'] ?? defaultIdentityDir();

const args = process.argv.slice(2);
const useSSE = args.includes('--sse');
const ssePortArg = args.find((a) => a.startsWith('--sse-port='));
const SSE_PORT = ssePortArg ? parseInt(ssePortArg.split('=')[1]!, 10) : 3001;

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const identity = loadOrCreateIdentity(IDENTITY_DIR, AGENT_LABEL);
const relay = new RelayClient({ relayUrl: RELAY_URL });

// Auto-login
async function ensureAuthenticated(): Promise<void> {
  try {
    const challenge = await relay.getChallenge(identity.agentId);

    // Sign with Ed25519 signing key
    const { signChallenge } = await import('./crypto.js');
    const signature = signChallenge(challenge.message, identity.signingSecretKey);

    await relay.login({
      agentId: identity.agentId,
      label: identity.label,
      signingPublicKey: identity.signingPublicKey,
      encryptionPublicKey: identity.encryptionPublicKey,
      signature,
      capabilities: { mcp: true, sse: true }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[orchestrator-chat-mcp] Login failed: ${msg}\n`);
    process.stderr.write(`[orchestrator-chat-mcp] Set RELAY_URL env var and call relay_login tool to retry.\n`);
  }
}

// ─── MCP server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'orchestrator-chat', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const ctx: ToolContext = { relay, identity, identityDir: IDENTITY_DIR };

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  return handleTool(name, args, ctx);
});

// ─── Transport ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await ensureAuthenticated();

  if (useSSE) {
    // SSE transport — Hermes connects via HTTP
    const sseTransports = new Map<string, SSEServerTransport>();

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '/';

      if (url === '/sse' && req.method === 'GET') {
        const transport = new SSEServerTransport('/messages', res);
        const sessionId = transport.sessionId;
        sseTransports.set(sessionId, transport);

        res.on('close', () => sseTransports.delete(sessionId));

        await server.connect(transport);
        return;
      }

      if (url.startsWith('/messages') && req.method === 'POST') {
        const params = new URLSearchParams(url.split('?')[1] ?? '');
        const sessionId = params.get('sessionId');
        const transport = sessionId ? sseTransports.get(sessionId) : undefined;

        if (transport) {
          await transport.handlePostMessage(req, res);
        } else {
          res.writeHead(404);
          res.end('Session not found');
        }
        return;
      }

      if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', agentId: identity.agentId, relayUrl: RELAY_URL }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    httpServer.listen(SSE_PORT, () => {
      process.stderr.write(`[orchestrator-chat-mcp] SSE transport listening on port ${SSE_PORT}\n`);
      process.stderr.write(`[orchestrator-chat-mcp] agentId: ${identity.agentId}\n`);
      process.stderr.write(`[orchestrator-chat-mcp] relay:   ${RELAY_URL}\n`);
    });
  } else {
    // stdio transport — Hermes spawns this process
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`[orchestrator-chat-mcp] stdio ready — agentId: ${identity.agentId}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`[orchestrator-chat-mcp] Fatal: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
