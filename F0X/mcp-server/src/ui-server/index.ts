/**
 * Local UI server for the F0x dashboard.
 *
 * Security model:
 *   - Binds to 127.0.0.1 only — never reachable from the network.
 *   - One-time setup token in the URL sets an HttpOnly SameSite=Strict cookie.
 *   - All API calls validated against that cookie; relay token never sent to browser.
 *   - Request bodies capped at 64 KB.
 *   - No user data ever passed through innerHTML.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  type F0xSession,
  performLogin,
  listChannels,
  openChannel,
  fetchMessages,
  sendMessage
} from '../core/ops.js';
import { DASHBOARD_HTML } from './dashboard.js';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface UiServerOptions {
  port?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

async function readBody(req: IncomingMessage, maxBytes = 65536): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy(new Error('Payload too large'));
        reject(new Error('Payload too large'));
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function setCookieAndRedirect(res: ServerResponse, sessionId: string, port: number): void {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString();
  res.writeHead(302, {
    'Set-Cookie': `sid=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Expires=${expires}`,
    'Location': `http://127.0.0.1:${port}/`
  });
  res.end();
}

// ─── Server ───────────────────────────────────────────────────────────────────

export function startUiServer(
  session: F0xSession,
  relayUrl: string,
  opts: UiServerOptions = {}
): () => void {
  const port = opts.port ?? 7827;
  const setupToken = randomBytes(16).toString('hex');
  const sessionId  = randomBytes(16).toString('hex');
  let setupUsed = false;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    } catch {
      res.writeHead(400); res.end(); return;
    }

    const path   = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    // ── One-time browser setup ───────────────────────────────────────────────
    if (path === '/' && method === 'GET' && url.searchParams.has('_setup')) {
      const token = url.searchParams.get('_setup');
      if (!setupUsed && token === setupToken) {
        setupUsed = true;
        setCookieAndRedirect(res, sessionId, port);
      } else {
        res.writeHead(403);
        res.end('Forbidden — setup link already used or invalid.');
      }
      return;
    }

    const cookies = parseCookies(req.headers['cookie']);
    const authed  = cookies['sid'] === sessionId;

    // ── Dashboard HTML ───────────────────────────────────────────────────────
    if (path === '/' && method === 'GET') {
      if (!authed) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>F0x</title></head>' +
          '<body style="font-family:monospace;padding:2em;background:#0d1117;color:#c9d1d9">' +
          '<h2 style="color:#58a6ff">F0x Dashboard</h2>' +
          '<p>Open the one-time URL printed in your terminal to authenticate.</p>' +
          '</body></html>'
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(DASHBOARD_HTML);
      return;
    }

    // ── API routes ───────────────────────────────────────────────────────────
    if (!path.startsWith('/api/')) {
      res.writeHead(404); res.end('Not found'); return;
    }

    if (!authed) {
      json(res, 401, { error: 'Unauthorized' }); return;
    }

    try {
      // GET /api/status
      if (path === '/api/status' && method === 'GET') {
        let relayHealth: unknown = null;
        try { relayHealth = await session.relay.health(); } catch { /* relay unreachable */ }
        json(res, 200, {
          identity: {
            agentId:             session.identity.agentId,
            label:               session.identity.label,
            signingPublicKey:    session.identity.signingPublicKey,
            encryptionPublicKey: session.identity.encryptionPublicKey
          },
          relayUrl,
          authenticated: !!session.relay.token,
          relayHealth
        });
        return;
      }

      // POST /api/login
      if (path === '/api/login' && method === 'POST') {
        await performLogin(session);
        json(res, 200, { ok: true, agentId: session.identity.agentId });
        return;
      }

      // GET /api/channels
      if (path === '/api/channels' && method === 'GET') {
        const channels = await listChannels(session);
        json(res, 200, channels);
        return;
      }

      // POST /api/channels
      if (path === '/api/channels' && method === 'POST') {
        let body: string;
        try { body = await readBody(req); } catch { json(res, 413, { error: 'Payload too large' }); return; }
        let parsed: { targetAgentId?: unknown };
        try { parsed = JSON.parse(body); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
        if (!parsed.targetAgentId || typeof parsed.targetAgentId !== 'string') {
          json(res, 400, { error: 'targetAgentId is required' }); return;
        }
        const result = await openChannel(session, parsed.targetAgentId);
        json(res, 200, result);
        return;
      }

      // /api/channels/:id/messages
      const channelMsgRe = /^\/api\/channels\/([^/]+)\/messages$/;
      const m = channelMsgRe.exec(path);
      if (m) {
        const channelId = decodeURIComponent(m[1]!);

        if (method === 'GET') {
          const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
          const limit    = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
          const before   = url.searchParams.get('before') ?? undefined;
          const messages = await fetchMessages(session, channelId, { limit, before });
          json(res, 200, messages);
          return;
        }

        if (method === 'POST') {
          let body: string;
          try { body = await readBody(req, 65536); } catch { json(res, 413, { error: 'Payload too large' }); return; }
          let parsed: { text?: unknown };
          try { parsed = JSON.parse(body); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
          if (!parsed.text || typeof parsed.text !== 'string') {
            json(res, 400, { error: 'text is required' }); return;
          }
          const result = await sendMessage(session, channelId, parsed.text);
          json(res, 200, result);
          return;
        }
      }

      res.writeHead(404); res.end('Not found');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { error: message });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    const setupUrl = 'http://127.0.0.1:' + port + '/?_setup=' + setupToken;
    process.stderr.write('\n[F0x-UI] Dashboard ready on port ' + port + '\n');
    process.stderr.write('[F0x-UI] Open this one-time URL to authenticate:\n\n');
    process.stderr.write('  ' + setupUrl + '\n\n');
    process.stderr.write('[F0x-UI] After first visit the dashboard is at: http://127.0.0.1:' + port + '/\n\n');
  });

  return () => { server.close(); };
}
