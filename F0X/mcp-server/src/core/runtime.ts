/**
 * Shared runtime bootstrap for the F0X MCP server.
 *
 * Centralises environment resolution, state-directory selection, and session
 * construction so that all entry points (the MCP server in `index.ts`, the CLI
 * in `cli.ts`, and alternative host adapters such as OpenClaw) compose the
 * same session graph. Host-specific adapters should never re-read env vars
 * directly — they should go through `resolveAgentEnv()`.
 *
 * Agent host identification
 * -------------------------
 * The F0X MCP server is host-agnostic but some operators run it under
 * different agent runtimes (Hermes, OpenClaw, or a generic stdio MCP client).
 * `detectAgentHost()` sniffs well-known environment variables to give
 * security-relevant code a stable host tag. This MUST NOT be used to relax
 * controls — only to strengthen them (e.g. OpenClaw-specific prompt-boundary
 * addenda, or blocking interpreter-startup env keys when running under
 * OpenClaw's stdio spawner).
 *
 * State directory
 * ---------------
 * `F0X_STATE_DIR` is the preferred umbrella directory for all mutable F0X
 * state (identity, channel keys, tenant binding, audit logs, pending-send
 * journal). `AGENT_IDENTITY_DIR` is retained as a legacy alias. If both are
 * set they MUST agree; a mismatch is fail-closed because silently choosing
 * one of two configured state directories could route writes to an
 * operator-unexpected location.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { defaultIdentityDir, loadOrCreateIdentity, runLocalIntegrityChecks } from './identity.js';
import { RelayClient } from './relay-client.js';
import { enforceSecurityProfile, resolveSecurityProfile, type SecurityProfile } from './security-profile.js';
import { enforceTenantBinding } from './tenant-binding.js';
import { listPendingSends } from './send-recovery.js';
import type { F0XSession } from './ops.js';

// ─── Host detection ───────────────────────────────────────────────────────────

export type AgentHost = 'hermes' | 'openclaw' | 'generic';

/**
 * Determine which agent runtime is launching this MCP server.
 *
 * Signals checked (in priority order):
 *   1. Explicit `F0X_AGENT_HOST` env var (operator-set).
 *   2. OpenClaw-specific env prefixes (`OPENCLAW_*`).
 *   3. Hermes-specific env prefixes (`HERMES_*`).
 *   4. Fallback: 'generic' (a bare MCP client).
 *
 * Returning 'generic' MUST NOT be treated as more permissive than a known
 * host — it simply means we have no extra context to add to security
 * hardening.
 */
export function detectAgentHost(): AgentHost {
  const explicit = process.env['F0X_AGENT_HOST']?.toLowerCase().trim();
  if (explicit === 'hermes' || explicit === 'openclaw' || explicit === 'generic') {
    return explicit;
  }
  if (explicit) {
    throw new Error(
      `Invalid F0X_AGENT_HOST "${explicit}". Expected hermes|openclaw|generic.`
    );
  }

  for (const key of Object.keys(process.env)) {
    if (key.startsWith('OPENCLAW_')) return 'openclaw';
  }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('HERMES_')) return 'hermes';
  }
  return 'generic';
}

// ─── State directory ──────────────────────────────────────────────────────────

export interface StateDirResolution {
  stateDir: string;
  explicitlySet: boolean;
  source: 'F0X_STATE_DIR' | 'AGENT_IDENTITY_DIR' | 'default';
}

/**
 * Resolve the F0X state directory using the following precedence:
 *
 *   1. `F0X_STATE_DIR` — preferred.
 *   2. `AGENT_IDENTITY_DIR` — legacy alias, retained for backwards
 *      compatibility with pre-OpenClaw operators.
 *   3. Default: `~/.f0x-chat`.
 *
 * If both `F0X_STATE_DIR` and `AGENT_IDENTITY_DIR` are set they MUST resolve
 * to the same path. A mismatch throws — we refuse to silently pick one.
 *
 * All F0X persistent state (identity file, channel key cache, tenant-binding
 * record, audit log, pending-send journal) lives under this directory.
 */
export function resolveStateDir(): StateDirResolution {
  const stateEnv = process.env['F0X_STATE_DIR']?.trim();
  const identityEnv = process.env['AGENT_IDENTITY_DIR']?.trim();

  if (stateEnv && identityEnv && stateEnv !== identityEnv) {
    throw new Error(
      'F0X_STATE_DIR and AGENT_IDENTITY_DIR are both set but point to different ' +
      `paths ("${stateEnv}" vs "${identityEnv}"). Set only one, or set them to ` +
      'the same value. Refusing to guess which directory to use.'
    );
  }

  if (stateEnv) {
    return { stateDir: stateEnv, explicitlySet: true, source: 'F0X_STATE_DIR' };
  }
  if (identityEnv) {
    return { stateDir: identityEnv, explicitlySet: true, source: 'AGENT_IDENTITY_DIR' };
  }
  return { stateDir: defaultIdentityDir(), explicitlySet: false, source: 'default' };
}

/**
 * Convenience wrapper that returns only the resolved path.
 */
export function stateDirPath(): string {
  return resolveStateDir().stateDir;
}

/**
 * Default state directory path.
 * Exposed for doctor/checklist consumers that want the canonical fallback.
 */
export function defaultStateDir(): string {
  return join(homedir(), '.f0x-chat');
}

// ─── Environment resolution ───────────────────────────────────────────────────

export interface AgentEnv {
  relayUrl: string;
  stateDir: string;
  stateDirExplicitlySet: boolean;
  stateDirSource: StateDirResolution['source'];
  agentLabel: string | undefined;
  agentLabelExplicitlySet: boolean;
  operatorId: string;
  operatorIdExplicitlySet: boolean;
  securityProfile: SecurityProfile;
  identityPassphrase: string | undefined;
  host: AgentHost;
}

/**
 * Resolve the complete agent environment. This is the single source of truth
 * for env-derived configuration; entry points must not read process.env for
 * these values directly.
 */
export function resolveAgentEnv(): AgentEnv {
  const { stateDir, explicitlySet: stateDirExplicitlySet, source: stateDirSource } = resolveStateDir();
  const rawPassphrase = process.env['F0X_IDENTITY_PASSPHRASE']?.trim();
  return {
    relayUrl: process.env['RELAY_URL']?.trim() || 'http://localhost:3000',
    stateDir,
    stateDirExplicitlySet,
    stateDirSource,
    agentLabel: process.env['AGENT_LABEL']?.trim() || undefined,
    agentLabelExplicitlySet: process.env['AGENT_LABEL'] !== undefined,
    operatorId: process.env['F0X_OPERATOR_ID']?.trim() || 'local-dev-operator',
    operatorIdExplicitlySet: process.env['F0X_OPERATOR_ID'] !== undefined,
    securityProfile: resolveSecurityProfile(),
    identityPassphrase: rawPassphrase && rawPassphrase.length > 0 ? rawPassphrase : undefined,
    host: detectAgentHost()
  };
}

// ─── Session factory ──────────────────────────────────────────────────────────

export interface SessionOptions {
  /**
   * Override the display label resolution. Used by `index.ts` after its
   * interactive prompt. When omitted, `env.agentLabel` is used or the
   * identity file's existing label is preserved on load.
   */
  label?: string;
}

/**
 * Build a fully-initialised `F0XSession` for the current process.
 *
 * Performs, in order:
 *   1. Security-profile enforcement (fail-closed on misconfigured staging/prod).
 *   2. Identity load/create under the resolved state directory.
 *   3. Tenant-binding enforcement.
 *   4. Local integrity checks on channel key cache.
 *   5. Pending-send journal inspection (logged to stderr only).
 *
 * The returned session shares the same shape used by both the MCP server and
 * the UI server, so host adapters can reuse all downstream ops.
 */
export function createSession(env: AgentEnv, opts: SessionOptions = {}): F0XSession {
  enforceSecurityProfile({
    profile: env.securityProfile,
    relayUrl: env.relayUrl,
    identityDirExplicitlySet: env.stateDirExplicitlySet,
    agentLabelExplicitlySet: env.agentLabelExplicitlySet,
    operatorIdExplicitlySet: env.operatorIdExplicitlySet,
    identityPassphraseSet: env.identityPassphrase !== undefined,
    identityPassphrase: env.identityPassphrase
  });

  const label = opts.label ?? env.agentLabel ?? 'f0x-agent';
  const identity = loadOrCreateIdentity(env.stateDir, label);
  enforceTenantBinding(env.stateDir, env.operatorId, identity.agentId);
  runLocalIntegrityChecks(env.stateDir);

  const pending = listPendingSends(env.stateDir);
  if (pending.length > 0) {
    process.stderr.write(
      `[F0X] Recovery: ${pending.length} pending send record(s) in ${env.stateDir}.\n`
    );
  }

  const relay = new RelayClient({ relayUrl: env.relayUrl });
  return { relay, identity, identityDir: env.stateDir, relayUrl: env.relayUrl };
}
