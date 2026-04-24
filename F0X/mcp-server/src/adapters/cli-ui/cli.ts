#!/usr/bin/env node
/**
 * f0x-chat CLI
 *
 * Commands:
 *   f0x-chat ui                 Start the local dashboard UI server
 *   f0x-chat status             Show identity + relay auth state
 *   f0x-chat login              Authenticate with the relay
 *   f0x-chat logout             Revoke current relay session token
 *   f0x-chat doctor [--openclaw]  Validate config, build artifacts, and relay connectivity
 *                                (with --openclaw: also validate OpenClaw integration)
 *   f0x-chat checklist          Run local security checklist checks
 *
 * Environment variables (same as MCP server):
 *   RELAY_URL           Relay base URL (default: http://localhost:3000)
 *   AGENT_LABEL         Agent display name (default: f0x-agent)
 *   F0X_STATE_DIR       Umbrella state directory (preferred; default: ~/.f0x-chat)
 *   AGENT_IDENTITY_DIR  Legacy alias for F0X_STATE_DIR
 *   F0X_UI_PORT         UI server port (default: 7827)
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { resolveIdentityPath } from '../../core/identity.js';
import { listPendingSends } from '../../core/send-recovery.js';
import { RelayClient } from '../../core/relay-client.js';
import { type F0XSession, performLogin } from '../../core/ops.js';
import { createSession, resolveAgentEnv } from '../../core/runtime.js';
import { startUiServer } from './ui-server/index.js';
import { resolveSecurityProfile } from '../../core/security-profile.js';
import { runOpenClawDoctor } from '../openclaw-mcp/doctor.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const env = resolveAgentEnv();
const RELAY_URL    = env.relayUrl;
const IDENTITY_DIR = env.stateDir;
const UI_PORT      = process.env['F0X_UI_PORT'] ? parseInt(process.env['F0X_UI_PORT'], 10) : 7827;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Session factory ──────────────────────────────────────────────────────────

function makeSession(): F0XSession {
  return createSession(env);
}

// ─── Browser opener ───────────────────────────────────────────────────────────

async function tryOpenBrowser(url: string): Promise<void> {
  try {
    const { execFile } = await import('node:child_process');
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return;
    if (process.platform === 'darwin') {
      execFile('open', [url]);
      return;
    }
    execFile('xdg-open', [url]);
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

async function cmdLogout(): Promise<void> {
  process.stderr.write('[F0X] Loading identity...\n');
  const session = makeSession();
  process.stderr.write('[F0X] Authenticating for logout with ' + RELAY_URL + '...\n');
  try {
    await performLogin(session);
    await session.relay.logout();
    console.log(JSON.stringify({
      ok: true,
      agentId: session.identity.agentId,
      revoked: true
    }, null, 2));
    process.stderr.write('[F0X] Session revoked.\n');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
    process.exit(1);
  }
}

async function cmdDoctor(): Promise<void> {
  const openClawMode = process.argv.includes('--openclaw');
  let allOk = true;

  function check(ok: boolean, label: string, detail: string): void {
    const prefix = ok ? '[OK]  ' : '[FAIL]';
    console.log(prefix + ' ' + label + ': ' + detail);
    if (!ok) allOk = false;
  }

  function warn(label: string, detail: string): void {
    console.log('[WARN] ' + label + ': ' + detail);
  }

  // Node.js version
  const nodeMajor = parseInt(process.versions.node.split('.')[0]!, 10);
  check(nodeMajor >= 20, 'Node.js version', process.versions.node + (nodeMajor < 20 ? ' (need >= 20)' : ''));

  // Build artifacts — __dirname is dist/adapters/cli-ui/ at runtime.
  const distRoot = join(__dirname, '..', '..');

  const distIndex = join(distRoot, 'index.js');
  check(existsSync(distIndex), 'MCP dispatcher entry', distIndex);

  const distCli = join(__dirname, 'cli.js');
  check(existsSync(distCli), 'CLI entry', distCli);

  const distHermes = join(distRoot, 'adapters', 'hermes-mcp', 'index.js');
  check(existsSync(distHermes), 'Hermes MCP adapter', distHermes);

  const distOpenClaw = join(distRoot, 'adapters', 'openclaw-mcp', 'index.js');
  check(existsSync(distOpenClaw), 'OpenClaw MCP adapter', distOpenClaw);

  const distOps = join(distRoot, 'core', 'ops.js');
  check(existsSync(distOps), 'Core ops', distOps);

  const distRuntime = join(distRoot, 'core', 'runtime.js');
  check(existsSync(distRuntime), 'Core runtime', distRuntime);

  const distUi = join(__dirname, 'ui-server', 'index.js');
  check(existsSync(distUi), 'UI server', distUi);

  // State directory
  check(existsSync(IDENTITY_DIR), 'State directory', IDENTITY_DIR + ' (source: ' + env.stateDirSource + ')');

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

  if (openClawMode) {
    console.log('');
    console.log('OpenClaw integration checks:');
    const result = runOpenClawDoctor(env, { check, warn });
    if (!result.ok) allOk = false;
  }

  console.log('');
  if (allOk) {
    console.log('All checks passed.');
  } else {
    console.log('One or more checks failed. See above.');
    process.exit(1);
  }
}


async function cmdChecklist(): Promise<void> {
  let allOk = true;
  function check(ok: boolean, label: string, detail: string): void {
    const prefix = ok ? '[OK]  ' : '[FAIL]';
    console.log(prefix + ' ' + label + ': ' + detail);
    if (!ok) allOk = false;
  }

  const identityPath = resolveIdentityPath(IDENTITY_DIR);
  check(existsSync(identityPath), 'Identity file exists', identityPath);

  if (existsSync(IDENTITY_DIR)) {
    const dirMode = statSync(IDENTITY_DIR).mode & 0o777;
    check(dirMode === 0o700, 'Identity dir permissions', `mode=0${dirMode.toString(8)}`);
  }
  if (existsSync(identityPath)) {
    const fileMode = statSync(identityPath).mode & 0o777;
    check(fileMode === 0o600, 'Identity file permissions', `mode=0${fileMode.toString(8)}`);
  }

  const profile = resolveSecurityProfile();
  check(true, 'Security profile', profile);

  const pending = listPendingSends(IDENTITY_DIR);
  check(pending.length === 0, 'Pending send recovery queue', `${pending.length} pending`);

  const tenantBindingPath = join(IDENTITY_DIR, 'tenant-binding.json');
  check(existsSync(tenantBindingPath), 'Tenant binding file', tenantBindingPath);

  const auditPath = join(IDENTITY_DIR, 'security-audit.log');
  if (existsSync(auditPath)) {
    const sample = readFileSync(auditPath, 'utf8').slice(-5000);
    const hasSecrets = /Bearer\s+[A-Za-z0-9._~-]+/.test(sample) || /(signingSecretKey|encryptionSecretKey)\s*[:=]\s*["']?[A-Za-z0-9+/=]+/.test(sample);
    check(!hasSecrets, 'Audit log redaction', hasSecrets ? 'potential secret pattern found' : 'no obvious secret pattern in recent tail');
  } else {
    check(true, 'Audit log redaction', 'audit file not present yet');
  }

  console.log('');
  if (!allOk) process.exit(1);
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

  case 'logout':
    cmdLogout().catch((e) => {
      process.stderr.write('[F0X] Fatal: ' + (e instanceof Error ? e.message : e) + '\n');
      process.exit(1);
    });
    break;

  case 'checklist':
    cmdChecklist().catch((e) => {
      process.stderr.write('[F0X] Fatal: ' + (e instanceof Error ? e.message : e) + '\n');
      process.exit(1);
    });
    break;

  default: {
    const validCommands = ['ui', 'status', 'login', 'logout', 'doctor', 'checklist'];
    if (command) {
      process.stderr.write('[F0X] Unknown command: ' + command + '\n\n');
    }
    console.log([
      'f0x-chat — F0X agent dashboard CLI',
      '',
      'Usage: f0x-chat <command> [options]',
      '',
      'Commands:',
      '  ui         Start the local dashboard UI (http://127.0.0.1:7827)',
      '             Options: --port=<n>  --no-open',
      '  status     Show identity and relay connectivity status',
      '  login      Authenticate with the relay',
      '  logout     Revoke relay session token (requires relay logout endpoint)',
      '  doctor     Validate build artifacts, config, and relay reachability',
      '             Options: --openclaw   Also validate OpenClaw integration',
      '                                    (reads ~/.openclaw/openclaw.json,',
      '                                    override via OPENCLAW_CONFIG)',
      '  checklist  Run operator security checklist checks',
      '',
      'Environment:',
      '  RELAY_URL           Relay base URL (default: http://localhost:3000)',
      '  AGENT_LABEL         Agent display name (default: f0x-agent)',
      '  F0X_STATE_DIR       Umbrella state directory (preferred; default: ~/.f0x-chat)',
      '  AGENT_IDENTITY_DIR  Legacy alias for F0X_STATE_DIR',
      '  F0X_AGENT_HOST      hermes|openclaw|generic (auto-detected if unset)',
      '  F0X_UI_PORT         Dashboard port (default: 7827)',
    ].join('\n'));
    if (command && !validCommands.includes(command)) process.exit(1);
    break;
  }
}
