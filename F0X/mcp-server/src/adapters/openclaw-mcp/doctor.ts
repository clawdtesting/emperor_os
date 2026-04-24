/**
 * OpenClaw doctor — validates `~/.openclaw/openclaw.json` (or
 * `$OPENCLAW_CONFIG`) against the invariants F0X expects when running
 * under the OpenClaw agent runtime.
 *
 * Called from the CLI adapter's `doctor --openclaw` flow. Returns
 * `{ ok }` plus emits structured `[OK]`/`[FAIL]`/`[WARN]` lines through
 * the caller-provided reporter.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { AgentEnv } from '../../core/runtime.js';

/**
 * Env keys that OpenClaw rejects for stdio MCP servers because they alter
 * interpreter startup and can be used to inject code into the spawned
 * process (e.g. NODE_OPTIONS=--require=/path/to/malicious.js).
 *
 * If any of these appear in the MCP server's `env` block in openclaw.json,
 * the config is fail-closed — OpenClaw will refuse to start the server.
 * We mirror that check locally so operators catch it during doctor.
 */
export const OPENCLAW_FORBIDDEN_ENV_KEYS = [
  'NODE_OPTIONS',
  'NODE_PATH',
  'PYTHONSTARTUP',
  'PYTHONPATH',
  'PERL5OPT',
  'RUBYOPT',
  'SHELLOPTS',
  'PS4',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES'
];

interface McpServerEntry {
  command?: unknown;
  args?: unknown;
  transport?: unknown;
  url?: unknown;
  env?: Record<string, unknown>;
  headers?: unknown;
}

interface OpenClawConfig {
  mcpServers?: Record<string, McpServerEntry>;
  agents?: Record<string, { mcpServers?: Record<string, McpServerEntry> }>;
}

export function resolveOpenClawConfigPath(): string {
  const override = process.env['OPENCLAW_CONFIG']?.trim();
  if (override) return override;
  return join(homedir(), '.openclaw', 'openclaw.json');
}

export interface DoctorReporter {
  check: (ok: boolean, label: string, detail: string) => void;
  warn: (label: string, detail: string) => void;
}

export function runOpenClawDoctor(env: AgentEnv, reporter: DoctorReporter): { ok: boolean } {
  const { check, warn } = reporter;
  let ok = true;

  if (env.host !== 'openclaw') {
    warn(
      'OpenClaw host detection',
      'F0x_AGENT_HOST is not "openclaw" and no OPENCLAW_* env vars were found. ' +
      'Set F0x_AGENT_HOST=openclaw in the server env block to enable host-specific hardening.'
    );
  } else {
    check(true, 'OpenClaw host detection', 'host detected as openclaw');
  }

  const cfgPath = resolveOpenClawConfigPath();
  if (!existsSync(cfgPath)) {
    check(false, 'OpenClaw config', 'not found at ' + cfgPath + ' (set OPENCLAW_CONFIG to override)');
    return { ok: false };
  }
  check(true, 'OpenClaw config', cfgPath);

  try {
    const mode = statSync(cfgPath).mode & 0o777;
    const worldReadable = (mode & 0o004) !== 0;
    if (worldReadable) {
      check(false, 'OpenClaw config permissions', `mode=0${mode.toString(8)} is world-readable; run: chmod 600 ${cfgPath}`);
      ok = false;
    } else {
      check(true, 'OpenClaw config permissions', `mode=0${mode.toString(8)}`);
    }
  } catch (e) {
    warn('OpenClaw config permissions', 'could not stat: ' + (e instanceof Error ? e.message : String(e)));
  }

  let cfg: OpenClawConfig;
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as OpenClawConfig;
  } catch (e) {
    check(false, 'OpenClaw config parse', (e instanceof Error ? e.message : String(e)));
    return { ok: false };
  }

  const servers = cfg.mcpServers ?? {};
  const ourNames = Object.keys(servers).filter((name) => /f0x|f0x-chat/i.test(name));
  if (ourNames.length === 0) {
    check(false, 'f0x-chat server registration', 'no mcpServers entry with name matching /f0x/i found in openclaw.json');
    return { ok: false };
  }
  check(true, 'f0x-chat server registration', `found: ${ourNames.join(', ')}`);

  for (const name of ourNames) {
    const entry = servers[name]!;
    const prefix = `[${name}]`;

    const transport = typeof entry.transport === 'string' ? entry.transport : 'stdio';
    if (transport !== 'stdio') {
      warn(`${prefix} transport`, `using "${transport}" — stdio is recommended for local OpenClaw gateways`);
    } else {
      check(true, `${prefix} transport`, transport);
    }

    if (transport === 'stdio') {
      if (typeof entry.command !== 'string' || !entry.command) {
        check(false, `${prefix} command`, 'missing or non-string "command" field');
        ok = false;
      } else {
        check(true, `${prefix} command`, entry.command);
      }
      if (!Array.isArray(entry.args) || entry.args.length === 0) {
        warn(`${prefix} args`, 'no "args" provided — OpenClaw will launch the command with no arguments');
      }
    }

    const envBlock = entry.env ?? {};
    const forbidden = Object.keys(envBlock).filter((k) => OPENCLAW_FORBIDDEN_ENV_KEYS.includes(k));
    if (forbidden.length > 0) {
      check(false, `${prefix} env interpreter-startup keys`,
        `forbidden keys present: ${forbidden.join(', ')}. OpenClaw rejects these.`);
      ok = false;
    } else {
      check(true, `${prefix} env interpreter-startup keys`, 'none of the forbidden keys present');
    }

    const hasStateDir = 'F0x_STATE_DIR' in envBlock;
    const hasLegacyDir = 'AGENT_IDENTITY_DIR' in envBlock;
    if (hasStateDir && hasLegacyDir) {
      const a = String(envBlock['F0x_STATE_DIR'] ?? '');
      const b = String(envBlock['AGENT_IDENTITY_DIR'] ?? '');
      if (a !== b) {
        check(false, `${prefix} state dir`,
          `F0x_STATE_DIR="${a}" conflicts with AGENT_IDENTITY_DIR="${b}"`);
        ok = false;
      } else {
        warn(`${prefix} state dir`, 'both F0x_STATE_DIR and AGENT_IDENTITY_DIR set — drop the legacy alias');
      }
    } else if (!hasStateDir && !hasLegacyDir) {
      warn(`${prefix} state dir`,
        'neither F0x_STATE_DIR nor AGENT_IDENTITY_DIR set in env; agent will use ~/.f0x-chat (shared across OpenClaw agents)');
    } else {
      check(true, `${prefix} state dir`,
        hasStateDir ? 'F0x_STATE_DIR set' : 'AGENT_IDENTITY_DIR set (legacy)');
    }

    const profile = envBlock['F0x_SECURITY_PROFILE'];
    if (!profile) {
      warn(`${prefix} F0x_SECURITY_PROFILE`, 'not set — defaults to "dev"');
    } else {
      check(true, `${prefix} F0x_SECURITY_PROFILE`, String(profile));
    }

    const relay = envBlock['RELAY_URL'];
    if (typeof relay === 'string' && relay.includes('your-relay-url.example.com')) {
      check(false, `${prefix} RELAY_URL`, 'still set to placeholder example.com value');
      ok = false;
    }

    if (envBlock['F0x_AGENT_HOST'] && String(envBlock['F0x_AGENT_HOST']).toLowerCase() !== 'openclaw') {
      warn(`${prefix} F0x_AGENT_HOST`, `set to "${envBlock['F0x_AGENT_HOST']}" — expected "openclaw"`);
    }
  }

  if (cfg.agents && typeof cfg.agents === 'object') {
    for (const [agentName, agentCfg] of Object.entries(cfg.agents)) {
      const agentServers = agentCfg?.mcpServers;
      if (agentServers && typeof agentServers === 'object') {
        const hasOurs = Object.keys(agentServers).some((n) => /f0x/i.test(n));
        if (hasOurs) {
          warn(`agent[${agentName}]`,
            'per-agent mcpServers override includes an f0x entry — ensure the override inherits your security env (F0x_AGENT_HOST, F0x_STATE_DIR, F0x_OPERATOR_ID).');
        }
      }
    }
  }

  return { ok };
}
