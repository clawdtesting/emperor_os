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
 *   AGENT_LABEL        Agent display name — if unset, will be prompted interactively
 *   AGENT_IDENTITY_DIR Path for identity + channel key files (default: ~/.orchestrator-chat)
 *   PORT               When set (e.g. on Render), enables SSE mode automatically on that port
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createInterface } from 'node:readline';

import { RelayClient } from './relay-client.js';
import { loadOrCreateIdentity, defaultIdentityDir, runLocalIntegrityChecks } from './identity.js';
import { listPendingSends } from './send-recovery.js';
import { enforceSecurityProfile, resolveSecurityProfile } from './security-profile.js';
import { enforceTenantBinding } from './tenant-binding.js';
import { TOOL_DEFINITIONS, handleTool, type ToolContext } from './tools.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const RELAY_URL = process.env['RELAY_URL'] ?? 'http://localhost:3000';
const IDENTITY_DIR = process.env['AGENT_IDENTITY_DIR'] ?? defaultIdentityDir();
const SECURITY_PROFILE = resolveSecurityProfile();
const OPERATOR_ID = process.env['F0X_OPERATOR_ID'] ?? 'local-dev-operator';

const cliArgs = process.argv.slice(2);

// PORT env var is set automatically by Render — use it to auto-enable SSE
const renderPort = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : undefined;
const useSSE = cliArgs.includes('--sse') || renderPort !== undefined;
const ssePortArg = cliArgs.find((a) => a.startsWith('--sse-port='));
const SSE_PORT = renderPort ?? (ssePortArg ? parseInt(ssePortArg.split('=')[1]!, 10) : 3001);

// ─── Interactive label prompt ─────────────────────────────────────────────────

async function resolveAgentLabel(): Promise<string> {
  if (process.env['AGENT_LABEL']) return process.env['AGENT_LABEL'];

  // In SSE/Render mode there's no interactive terminal — require the env var
  if (useSSE) {
    process.stderr.write('[F0X-chat-MCP] AGENT_LABEL env var is required in SSE/Render mode.\n');
    process.exit(1);
  }

  // When spawned via stdio (e.g. by Hermes), stdin is the MCP protocol pipe — not a TTY.
  // Reading from it would consume MCP messages. Fall back to a safe default instead.
  if (!process.stdin.isTTY) {
    process.stderr.write('[F0X-chat-MCP] No AGENT_LABEL set and stdin is not a TTY — using default label "f0x-agent".\n');
    process.stderr.write('[F0X-chat-MCP] Set AGENT_LABEL env var in your MCP config to customise it.\n');
    return 'f0x-agent';
  }

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    process.stderr.write('\n');
    rl.question('  What should your agent be called? (display name): ', (answer) => {
      rl.close();
      const label = answer.trim() || 'f0x-agent';
      process.stderr.write(`  Agent label set to: "${label}"\n\n`);
      resolve(label);
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  enforceSecurityProfile({
    profile: SECURITY_PROFILE,
    relayUrl: RELAY_URL,
    identityDirExplicitlySet: process.env['AGENT_IDENTITY_DIR'] !== undefined,
    agentLabelExplicitlySet: process.env['AGENT_LABEL'] !== undefined,
    operatorIdExplicitlySet: process.env['F0X_OPERATOR_ID'] !== undefined,
    identityPassphraseSet: !!process.env['F0X_IDENTITY_PASSPHRASE']?.trim()
  });

  const AGENT_LABEL = await resolveAgentLabel();

  const identity = loadOrCreateIdentity(IDENTITY_DIR, AGENT_LABEL);
  enforceTenantBinding(IDENTITY_DIR, OPERATOR_ID, identity.agentId);
  runLocalIntegrityChecks(IDENTITY_DIR);
  const pendingSends = listPendingSends(IDENTITY_DIR);
  if (pendingSends.length > 0) {
    process.stderr.write(`[F0X-chat-MCP] Recovery: found ${pendingSends.length} pending send record(s). Review relay state before resubmitting.\n`);
  }
  const relay = new RelayClient({ relayUrl: RELAY_URL });
  let shutdownStarted = false;
  async function logoutOnShutdown(reason: string): Promise<void> {
    if (shutdownStarted) return;
    shutdownStarted = true;
    try {
      await relay.logout();
      process.stderr.write(`[F0X-chat-MCP] Session revoked on ${reason}.\n`);
    } catch (e) {
      process.stderr.write(`[F0X-chat-MCP] Session revoke failed on ${reason}: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  process.once('SIGINT', () => {
    void logoutOnShutdown('SIGINT').finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void logoutOnShutdown('SIGTERM').finally(() => process.exit(0));
  });

  // Auto-login
  try {
    const challenge = await relay.getChallenge(identity.agentId);
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
    process.stderr.write(`[F0X-chat-MCP] Login failed: ${msg}\n`);
    process.stderr.write(`[F0X-chat-MCP] Set RELAY_URL and call F0X_login to retry.\n`);
  }

  // ─── MCP server ─────────────────────────────────────────────────────────────

  const server = new Server(
    { name: 'F0X-chat-MCP', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const requireActionApproval = SECURITY_PROFILE !== 'dev';
  const ctx: ToolContext = { relay, identity, identityDir: IDENTITY_DIR, requireActionApproval };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    return handleTool(name, args, ctx);
  });

  // ─── Transport ──────────────────────────────────────────────────────────────

  if (useSSE) {
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
        res.end(JSON.stringify({ status: 'ok', agentId: identity.agentId, label: identity.label, relayUrl: RELAY_URL }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    httpServer.listen(SSE_PORT, () => {
      process.stderr.write(`[F0X-chat-MCP] SSE ready on port ${SSE_PORT}\n`);
      process.stderr.write(`[F0X-chat-MCP] agentId: ${identity.agentId}  label: ${identity.label}\n`);
      process.stderr.write(`[F0X-chat-MCP] relay:   ${RELAY_URL}\n`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`[F0X-chat-MCP] stdio ready — agentId: ${identity.agentId}  label: ${identity.label}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`[F0X-chat-MCP] Fatal: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
