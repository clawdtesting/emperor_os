#!/usr/bin/env node
/**
 * f0x-chat CLI
 *
 * Commands:
 *   f0x-chat ui       Start the local dashboard UI server
 *   f0x-chat status   Show identity + relay auth state
 *   f0x-chat login    Authenticate with the relay
 *   f0x-chat doctor   Validate config, build artifacts, and relay connectivity
 *
 * Environment variables (same as MCP server):
 *   RELAY_URL          Relay base URL (default: http://localhost:3000)
 *   AGENT_LABEL        Agent display name (default: f0x-agent)
 *   AGENT_IDENTITY_DIR Identity/channel-key directory (default: ~/.f0x-chat)
 *   F0X_UI_PORT        UI server port (default: 7827)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { loadOrCreateIdentity, defaultIdentityDir, resolveIdentityPath, runLocalIntegrityChecks } from './identity.js';
import { listPendingSends } from './send-recovery.js';
import { RelayClient } from './relay-client.js';
import { type F0XSession, performLogin } from './core/ops.js';
import { startUiServer } from './ui-server/index.js';
import { enforceSecurityProfile, resolveSecurityProfile } from './security-profile.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const RELAY_URL    = process.env['RELAY_URL']          ?? 'http://localhost:3000';
const IDENTITY_DIR = process.env['AGENT_IDENTITY_DIR'] ?? defaultIdentityDir();
const AGENT_LABEL  = process.env['AGENT_LABEL']        ?? 'f0x-agent';
const UI_PORT      = process.env['F0X_UI_PORT']        ? parseInt(process.env['F0X_UI_PORT'], 10) : 7827;
const SECURITY_PROFILE = resolveSecurityProfile();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Session factory ──────────────────────────────────────────────────────────

function makeSession(): F0XSession {
  enforceSecurityProfile({
    profile: SECURITY_PROFILE,
    relayUrl: RELAY_URL,
    identityDirExplicitlySet: process.env['AGENT_IDENTITY_DIR'] !== undefined,
    agentLabelExplicitlySet: process.env['AGENT_LABEL'] !== undefined
  });
  const identity = loadOrCreateIdentity(IDENTITY_DIR, AGENT_LABEL);
  runLocalIntegrityChecks(IDENTITY_DIR);
  const pendingSends = listPendingSends(IDENTITY_DIR);
  if (pendingSends.length > 0) {
    process.stderr.write(`[F0X] Recovery: found ${pendingSends.length} pending send record(s) in local state.\n`);
  }
  const relay    = new RelayClient({ relayUrl: RELAY_URL });
  return { relay, identity, identityDir: IDENTITY_DIR, relayUrl: RELAY_URL };
}

// ─── Browser opener ───────────────────────────────────────────────────────────

async function tryOpenBrowser(url: string): Promise<void> {
  try {
    const { exec } = await import('node:child_process');
    const cmd = process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}" 2>/dev/null`;
    exec(cmd);
  } catch {
    // ignore — URL is already printed to stderr
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdUi(): Promise<void> {
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  const port    = portArg ? parseInt(portArg.split('=')[1]!, 10) : UI_PORT;
  const noOpen  = process.argv.includes('--no-open');

  process.stderr.write('[F0X] Loading identity from ' + IDENTITY_DIR + '\n');
  const session = makeSession();
  process.stderr.write('[F0X] Agent: ' + session.identity.label + ' (' + session.identity.agentId + ')\n');
  process.stderr.write('[F0X] Relay: ' + RELAY_URL + '\n');

  process.stderr.write('[F0X] Authenticating...\n');
  try {
    await performLogin(session);
    process.stderr.write('[F0X] Authenticated.\n');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write('[F0X] Login failed: ' + msg + '\n');
    process.stderr.write('[F0X] Continuing — dashboard will start but relay calls may fail.\n');
  }

  startUiServer(session, RELAY_URL, { port });

  if (!noOpen) {
    // Give the server a moment to bind before opening the browser.
    // The setup URL is printed by startUiServer; we open the base URL
    // (unauthenticated landing page) — user copies the setup URL from stderr.
    setTimeout(() => {
      tryOpenBrowser('http://127.0.0.1:' + port + '/');
    }, 600);
  }
  // HTTP server keeps the process alive — no explicit wait needed.
}

async function cmdStatus(): Promise<void> {
  const identityPath = resolveIdentityPath(IDENTITY_DIR);
  const hasIdentity  = existsSync(identityPath);

  console.log('F0X Status');
  console.log('----------');
  console.log('identity dir : ' + IDENTITY_DIR);
  console.log('identity file: ' + (hasIdentity ? 'found' : 'NOT FOUND — run any command to create'));

  if (!hasIdentity) return;

  const session = makeSession();
  const { identity } = session;
  console.log('agentId      : ' + identity.agentId);
  console.log('label        : ' + identity.label);
  console.log('created      : ' + identity.createdAt);
  console.log('');
  console.log('relay        : ' + RELAY_URL);

  try {
    const health = await session.relay.health();
    console.log('relay status : ok');
    console.log('agents       : ' + health.stats.agents);
    console.log('channels     : ' + health.stats.channels);
    console.log('envelopes    : ' + health.stats.envelopes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('relay status : UNREACHABLE (' + msg + ')');
  }

  console.log('');
  process.stderr.write('[F0X] Run "f0x-chat login" to authenticate.\n');
}

async function cmdLogin(): Promise<void> {
  process.stderr.write('[F0X] Loading identity...\n');
  const session = makeSession();
  process.stderr.write('[F0X] Agent: ' + session.identity.label + ' (' + session.identity.agentId + ')\n');
  process.stderr.write('[F0X] Authenticating with ' + RELAY_URL + '...\n');

  try {
    await performLogin(session);
    console.log(JSON.stringify({
      ok: true,
      agentId: session.identity.agentId,
      label: session.identity.label
    }, null, 2));
    process.stderr.write('[F0X] Login successful. Token valid for 30 minutes.\n');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
    process.exit(1);
  }
}

async function cmdDoctor(): Promise<void> {
  let allOk = true;

  function check(ok: boolean, label: string, detail: string): void {
    const prefix = ok ? '[OK]  ' : '[FAIL]';
    console.log(prefix + ' ' + label + ': ' + detail);
    if (!ok) allOk = false;
  }

  // Node.js version
  const nodeMajor = parseInt(process.versions.node.split('.')[0]!, 10);
  check(nodeMajor >= 20, 'Node.js version', process.versions.node + (nodeMajor < 20 ? ' (need >= 20)' : ''));

  // dist/index.js (MCP entrypoint)
  const distIndex = join(__dirname, 'index.js');
  check(existsSync(distIndex), 'MCP entrypoint', distIndex);

  // dist/cli.js
  const distCli = join(__dirname, 'cli.js');
  check(existsSync(distCli), 'CLI entrypoint', distCli);

  // dist/core/ops.js
  const distOps = join(__dirname, 'core', 'ops.js');
  check(existsSync(distOps), 'Core ops', distOps);

  // dist/ui-server/index.js
  const distUi = join(__dirname, 'ui-server', 'index.js');
  check(existsSync(distUi), 'UI server', distUi);

  // Identity file
  const identityPath = resolveIdentityPath(IDENTITY_DIR);
  check(existsSync(identityPath), 'Identity file', identityPath);

  // RELAY_URL set
  const relaySet = process.env['RELAY_URL'] !== undefined;
  check(relaySet, 'RELAY_URL env var', relaySet ? RELAY_URL : 'not set — using default: ' + RELAY_URL);

  // Relay reachable
  try {
    const relay = new RelayClient({ relayUrl: RELAY_URL });
    const h = await relay.health();
    check(true, 'Relay health', 'ok — agents:' + h.stats.agents + ' channels:' + h.stats.channels);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(false, 'Relay health', 'UNREACHABLE — ' + msg);
  }

  console.log('');
  if (allOk) {
    console.log('All checks passed.');
  } else {
    console.log('One or more checks failed. See above.');
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case 'ui':
    cmdUi().catch((e) => {
      process.stderr.write('[F0X] Fatal: ' + (e instanceof Error ? e.message : e) + '\n');
      process.exit(1);
    });
    break;

  case 'status':
    cmdStatus().catch((e) => {
      process.stderr.write('[F0X] Fatal: ' + (e instanceof Error ? e.message : e) + '\n');
      process.exit(1);
    });
    break;

  case 'login':
    cmdLogin().catch((e) => {
      process.stderr.write('[F0X] Fatal: ' + (e instanceof Error ? e.message : e) + '\n');
      process.exit(1);
    });
    break;

  case 'doctor':
    cmdDoctor().catch((e) => {
      process.stderr.write('[F0X] Fatal: ' + (e instanceof Error ? e.message : e) + '\n');
      process.exit(1);
    });
    break;

  default: {
    const validCommands = ['ui', 'status', 'login', 'doctor'];
    if (command) {
      process.stderr.write('[F0X] Unknown command: ' + command + '\n\n');
    }
    console.log([
      'f0x-chat — F0X agent dashboard CLI',
      '',
      'Usage: f0x-chat <command> [options]',
      '',
      'Commands:',
      '  ui       Start the local dashboard UI (http://127.0.0.1:7827)',
      '           Options: --port=<n>  --no-open',
      '  status   Show identity and relay connectivity status',
      '  login    Authenticate with the relay',
      '  doctor   Validate build artifacts, config, and relay reachability',
      '',
      'Environment:',
      '  RELAY_URL          Relay base URL (default: http://localhost:3000)',
      '  AGENT_LABEL        Agent display name (default: f0x-agent)',
      '  AGENT_IDENTITY_DIR Identity directory (default: ~/.f0x-chat)',
      '  F0X_UI_PORT        Dashboard port (default: 7827)',
    ].join('\n'));
    if (command && !validCommands.includes(command)) process.exit(1);
    break;
  }
}
