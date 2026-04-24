/**
 * Shared MCP adapter server.
 *
 * This module contains the transport-level wiring (stdio, SSE) and the
 * request handlers that register the F0X tool surface with an MCP client.
 * It is host-agnostic by default — `detectAgentHost()` inside the tool
 * layer applies host-specific hardening automatically when `F0x_AGENT_HOST`
 * or well-known host env prefixes are set.
 *
 * Thin per-host adapters (src/adapters/hermes-mcp, src/adapters/openclaw-mcp)
 * import `startMcpServer` and set their own host tag + banner text so the
 * startup logs are unambiguous about which runtime is loading the server.
 *
 * There is no Hermes- or OpenClaw-specific code path inside the MCP server
 * itself. The split into named adapters matches the target architecture
 * (Hermes MCP adapter, OpenClaw MCP/tool adapter, CLI/UI adapter) and gives
 * operators a stable mental model even though the runtime behaviour is
 * unified.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createInterface } from 'node:readline';

import { createSession, resolveAgentEnv, type AgentEnv, type AgentHost } from '../../core/runtime.js';
import { signChallenge } from '../../core/crypto.js';
import { TOOL_DEFINITIONS, handleTool, type ToolContext } from './tools.js';

export interface McpServerOptions {
  /** Fixed host tag used for the startup banner. Tool-layer detection is
   *  still the source of truth for host-specific hardening. */
  host: AgentHost;
  /** Banner prefix for stderr log lines. */
  banner: string;
}

export async function resolveAgentLabel(env: AgentEnv, useSSE: boolean): Promise<string> {
  if (env.agentLabel) return env.agentLabel;

  if (useSSE) {
    process.stderr.write('[F0X-chat-MCP] AGENT_LABEL env var is required in SSE/Render mode.\n');
    process.exit(1);
  }

  // When spawned via stdio (e.g. by Hermes or OpenClaw), stdin is the MCP
  // protocol pipe — not a TTY. Reading would consume MCP messages. Fall
  // back to a safe default instead.
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

/**
 * Start the MCP server. Dispatches between stdio (default) and SSE based on
 * `--sse` / `--sse-port=N` CLI args and the Render-injected `PORT` env var.
 */
export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  const { banner } = opts;
  const env = resolveAgentEnv();
  const cliArgs = process.argv.slice(2);

  const renderPort = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : undefined;
  const useSSE = cliArgs.includes('--sse') || renderPort !== undefined;
  const ssePortArg = cliArgs.find((a) => a.startsWith('--sse-port='));
  const SSE_PORT = renderPort ?? (ssePortArg ? parseInt(ssePortArg.split('=')[1]!, 10) : 3001);

  const label = await resolveAgentLabel(env, useSSE);
  const session = createSession(env, { label });
  const { relay, identity } = session;

  process.stderr.write(`${banner} Detected agent host: ${env.host}\n`);

  let shutdownStarted = false;
  async function logoutOnShutdown(reason: string): Promise<void> {
    if (shutdownStarted) return;
    shutdownStarted = true;
    try {
      await relay.logout();
      process.stderr.write(`${banner} Session revoked on ${reason}.\n`);
    } catch (e) {
      process.stderr.write(`${banner} Session revoke failed on ${reason}: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  process.once('SIGINT',  () => { void logoutOnShutdown('SIGINT').finally(()  => process.exit(0)); });
  process.once('SIGTERM', () => { void logoutOnShutdown('SIGTERM').finally(() => process.exit(0)); });

  // Auto-login
  try {
    const challenge = await relay.getChallenge(identity.agentId);
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
    process.stderr.write(`${banner} Login failed: ${msg}\n`);
    process.stderr.write(`${banner} Set RELAY_URL and call F0x_login to retry.\n`);
  }

  const server = new Server(
    { name: 'F0X-chat-MCP', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const requireActionApproval = env.securityProfile !== 'dev';
  const ctx: ToolContext = { relay, identity, identityDir: env.stateDir, requireActionApproval };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    return handleTool(name, args, ctx);
  });

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
        res.end(JSON.stringify({ status: 'ok', agentId: identity.agentId, label: identity.label, relayUrl: env.relayUrl }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    httpServer.listen(SSE_PORT, () => {
      process.stderr.write(`${banner} SSE ready on port ${SSE_PORT}\n`);
      process.stderr.write(`${banner} agentId: ${identity.agentId}  label: ${identity.label}\n`);
      process.stderr.write(`${banner} relay:   ${env.relayUrl}\n`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`${banner} stdio ready — agentId: ${identity.agentId}  label: ${identity.label}\n`);
  }
}
