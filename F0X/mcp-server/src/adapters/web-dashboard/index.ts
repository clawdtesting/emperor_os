#!/usr/bin/env node

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { detectAgentHost, resolveAgentEnv } from '../../core/runtime.js';
import { RelayClient, type AgentProfile } from '../../core/relay-client.js';
import {
  fetchMessages,
  listChannels,
  performLogin,
  sendMessage,
  type F0xSession,
  type ChannelSummary
} from '../../core/ops.js';
import { loadOrCreateIdentity, saveIdentity, type AgentIdentityFile } from '../../core/identity.js';

interface DashboardSession {
  sid: string;
  session: F0xSession;
  lastHeartbeat: string;
}

const env = resolveAgentEnv();
const port = process.env['PORT'] ? Number.parseInt(process.env['PORT'], 10) : 8787;
const hostedStateDir = resolve(env.stateDir, 'web-dashboard');
mkdirSync(hostedStateDir, { recursive: true });

const sessions = new Map<string, DashboardSession>();

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

async function readBody(req: IncomingMessage, maxBytes = 256_000): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => resolveBody(body));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, code: number, payload: unknown): void {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function sessionFromRequest(req: IncomingMessage): DashboardSession | null {
  const sid = parseCookies(req.headers['cookie'])['f0x_sid'];
  if (!sid) return null;
  return sessions.get(sid) ?? null;
}

function validateIdentity(candidate: unknown, label?: string): AgentIdentityFile {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new Error('identityJson must be a JSON object');
  }
  const identity = candidate as Record<string, unknown>;
  const required = [
    'agentId',
    'label',
    'signingPublicKey',
    'signingSecretKey',
    'encryptionPublicKey',
    'encryptionSecretKey',
    'createdAt',
    'updatedAt'
  ];
  for (const key of required) {
    if (typeof identity[key] !== 'string' || !identity[key]) {
      throw new Error(`identityJson missing field: ${key}`);
    }
  }

  return {
    agentId: identity.agentId as string,
    label: label?.trim() || (identity.label as string),
    signingPublicKey: identity.signingPublicKey as string,
    signingSecretKey: identity.signingSecretKey as string,
    encryptionPublicKey: identity.encryptionPublicKey as string,
    encryptionSecretKey: identity.encryptionSecretKey as string,
    createdAt: identity.createdAt as string,
    updatedAt: identity.updatedAt as string
  };
}

function createUserSession(identity: AgentIdentityFile): DashboardSession {
  const sid = randomBytes(24).toString('hex');
  const userDir = join(hostedStateDir, sid);
  mkdirSync(userDir, { recursive: true });
  saveIdentity(userDir, identity);

  const relay = new RelayClient({ relayUrl: env.relayUrl });
  const session: F0xSession = {
    relay,
    identity,
    identityDir: userDir,
    relayUrl: env.relayUrl
  };

  const dashboardSession: DashboardSession = {
    sid,
    session,
    lastHeartbeat: new Date().toISOString()
  };
  sessions.set(sid, dashboardSession);
  return dashboardSession;
}

async function relayListAgents(session: F0xSession): Promise<AgentProfile[]> {
  const res = await fetch(`${session.relayUrl.replace(/\/$/, '')}/api/relay/agents`, {
    headers: {
      Authorization: `Bearer ${session.relay.token ?? ''}`
    }
  });
  const body = (await res.json()) as { agents?: AgentProfile[]; error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Unable to list agents (${res.status})`);
  }
  return Array.isArray(body.agents) ? body.agents : [];
}

function dashboardDistDir(): string {
  const explicit = process.env['DASHBOARD_DIST_DIR'];
  if (explicit) return resolve(explicit);
  const candidates = [
    resolve(process.cwd(), '../dashboard/dist'),
    resolve(process.cwd(), 'dashboard/dist'),
    resolve(process.cwd(), '../../F0X/dashboard/dist')
  ];
  const found = candidates.find((candidate) => existsSync(join(candidate, 'index.html')));
  return found ?? candidates[0]!;
}

const mimeByExt: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(res: ServerResponse, reqPath: string): boolean {
  const dist = dashboardDistDir();
  const normalized = reqPath === '/' ? '/index.html' : reqPath;
  const file = resolve(join(dist, normalized.slice(1)));
  if (!file.startsWith(dist) || !existsSync(file)) return false;

  const ext = extname(file);
  res.writeHead(200, { 'Content-Type': mimeByExt[ext] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  const method = (req.method ?? 'GET').toUpperCase();
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const path = url.pathname;

  if (path === '/api/auth/login' && method === 'POST') {
    try {
      const rawBody = await readBody(req);
      const parsed = JSON.parse(rawBody) as {
        identityJson?: string;
        label?: string;
        mode?: 'upload' | 'generate';
      };

      let identity: AgentIdentityFile;
      if (parsed.mode === 'generate') {
        const tempUserDir = join(tmpdir(), `f0x-generate-${randomBytes(12).toString('hex')}`);
        identity = loadOrCreateIdentity(tempUserDir, parsed.label?.trim() || env.agentLabel || 'f0x-dashboard-agent');
      } else {
        if (!parsed.identityJson || typeof parsed.identityJson !== 'string') {
          sendJson(res, 400, { error: 'identityJson is required for upload mode' });
          return;
        }
        identity = validateIdentity(JSON.parse(parsed.identityJson), parsed.label);
      }

      const dashboardSession = createUserSession(identity);
      await performLogin(dashboardSession.session);
      dashboardSession.lastHeartbeat = new Date().toISOString();

      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toUTCString();
      res.writeHead(200, {
        'Set-Cookie': `f0x_sid=${dashboardSession.sid}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({ ok: true, agentId: identity.agentId, label: identity.label }));
      return;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return;
    }
  }

  if (path.startsWith('/api/')) {
    const current = sessionFromRequest(req);
    if (!current) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    current.lastHeartbeat = new Date().toISOString();

    try {
      if (path === '/api/f0x/status' && method === 'GET') {
        let relayHealth: Awaited<ReturnType<RelayClient['health']>> | null = null;
        try {
          relayHealth = await current.session.relay.health();
        } catch {
          relayHealth = null;
        }

        sendJson(res, 200, {
          identity: {
            agentId: current.session.identity.agentId,
            label: current.session.identity.label
          },
          relayUrl: current.session.relayUrl,
          authenticated: Boolean(current.session.relay.token),
          relayHealth,
          adapterStatus: {
            hermes: detectAgentHost() === 'hermes' ? 'available' : 'unavailable',
            openclaw: detectAgentHost() === 'openclaw' ? 'available' : 'unavailable'
          },
          host: detectAgentHost(),
          lastHeartbeat: current.lastHeartbeat
        });
        return;
      }

      if (path === '/api/f0x/agents' && method === 'GET') {
        const agents = await relayListAgents(current.session);
        sendJson(res, 200, agents.map((agent) => ({
          agentId: agent.agentId,
          label: agent.label,
          status: 'online'
        })));
        return;
      }

      if (path === '/api/f0x/channels' && method === 'GET') {
        const channels = await listChannels(current.session);
        sendJson(res, 200, channels);
        return;
      }

      const channelDetails = /^\/api\/f0x\/channel\/([^/]+)$/.exec(path);
      if (channelDetails && method === 'GET') {
        const channelId = decodeURIComponent(channelDetails[1]!);
        const channels = await listChannels(current.session);
        const channel = channels.find((entry: ChannelSummary) => entry.channelId === channelId);
        if (!channel) {
          sendJson(res, 404, { error: 'Channel not found' });
          return;
        }
        sendJson(res, 200, channel);
        return;
      }

      const messagesMatch = /^\/api\/f0x\/messages\/([^/]+)$/.exec(path);
      if (messagesMatch && method === 'GET') {
        const channelId = decodeURIComponent(messagesMatch[1]!);
        const messages = await fetchMessages(current.session, channelId, { limit: 100 });
        sendJson(res, 200, messages);
        return;
      }

      if (path === '/api/f0x/send' && method === 'POST') {
        const parsed = JSON.parse(await readBody(req)) as { channelId?: string; content?: string };
        if (!parsed.channelId || !parsed.content) {
          sendJson(res, 400, { error: 'channelId and content are required' });
          return;
        }
        const sent = await sendMessage(current.session, parsed.channelId, parsed.content);
        sendJson(res, 200, sent);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (serveStatic(res, path)) {
    return;
  }

  const dist = dashboardDistDir();
  const fallback = join(dist, 'index.html');
  if (existsSync(fallback)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readFileSync(fallback, 'utf8'));
    return;
  }

  res.writeHead(404);
  res.end('Dashboard build not found');
});

server.listen(port, '0.0.0.0', () => {
  process.stderr.write(`[F0X Dashboard] listening on :${port}\n`);
  process.stderr.write(`[F0X Dashboard] relay: ${env.relayUrl}\n`);
});
