/**
 * Relay-side abuse detection model (client-side scoring and quarantine).
 *
 * The relay itself is responsible for server-side enforcement, but the MCP
 * client can observe local abuse signals and:
 *   1. Score individual agents based on anomaly indicators.
 *   2. Auto-quarantine agents that exceed a configurable threshold.
 *   3. Emit a separate append-only security audit stream distinct from
 *      application logs, suitable for forwarding to a SIEM or alerting system.
 *
 * Abuse signals tracked per peer agent:
 *   - invalid_signature: Ed25519 verification failures
 *   - authz_failure: 401/403 from relay (cross-channel or expired token)
 *   - replay_anomaly: non-monotonic replay counter
 *   - replay_rejected: relay explicitly rejected an envelope
 *   - rate_spike: burst above local rate-limit threshold
 *   - timestamp_skew: envelope outside allowed clock window
 *
 * When cumulative score >= QUARANTINE_THRESHOLD, the agent is quarantined:
 * all inbound envelopes from that agent are refused without decryption.
 * Quarantine has a configurable cooldown; operator can override via the
 * release function.
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AbuseSignal =
  | 'invalid_signature'
  | 'authz_failure'
  | 'replay_anomaly'
  | 'replay_rejected'
  | 'rate_spike'
  | 'timestamp_skew';

export interface AbuseScore {
  agentId: string;
  score: number;
  quarantined: boolean;
  quarantinedAt?: string;
  quarantineExpiresAt?: string;
  signals: Partial<Record<AbuseSignal, number>>;
  updatedAt: string;
}

export interface AbuseState {
  agents: Record<string, AbuseScore>;
  updatedAt: string;
}

// ─── Signal weights ───────────────────────────────────────────────────────────

const SIGNAL_WEIGHTS: Record<AbuseSignal, number> = {
  invalid_signature: 10,
  authz_failure: 5,
  replay_anomaly: 8,
  replay_rejected: 8,
  rate_spike: 3,
  timestamp_skew: 4
};

export const QUARANTINE_THRESHOLD = 20;
export const QUARANTINE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes default

// ─── Persistence ─────────────────────────────────────────────────────────────

const ABUSE_STATE_FILENAME = 'abuse-state.json';
const ABUSE_AUDIT_FILENAME = 'abuse-audit.log';

function abuseStatePath(identityDir: string): string {
  return join(identityDir, ABUSE_STATE_FILENAME);
}

function abuseAuditPath(identityDir: string): string {
  return join(identityDir, ABUSE_AUDIT_FILENAME);
}

function loadAbuseState(identityDir: string): AbuseState {
  const path = abuseStatePath(identityDir);
  if (!existsSync(path)) return { agents: {}, updatedAt: new Date().toISOString() };
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AbuseState;
  } catch {
    return { agents: {}, updatedAt: new Date().toISOString() };
  }
}

function saveAbuseState(identityDir: string, state: AbuseState): void {
  mkdirSync(identityDir, { recursive: true, mode: 0o700 });
  state.updatedAt = new Date().toISOString();
  writeFileSync(abuseStatePath(identityDir), JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function appendAuditEntry(identityDir: string, entry: Record<string, unknown>): void {
  const dir = identityDir ?? join(homedir(), '.f0x-chat');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  appendFileSync(abuseAuditPath(dir), line, { encoding: 'utf8', mode: 0o600, flag: 'a' });
}

// ─── Detector ─────────────────────────────────────────────────────────────────

export interface AbuseDetectorOptions {
  identityDir: string;
  quarantineThreshold?: number;
  quarantineCooldownMs?: number;
  /** Called when an agent is auto-quarantined. */
  onQuarantine?: (agentId: string, score: AbuseScore) => void;
}

export class AbuseDetector {
  private state: AbuseState;
  private readonly identityDir: string;
  private readonly quarantineThreshold: number;
  private readonly quarantineCooldownMs: number;
  private readonly onQuarantine?: (agentId: string, score: AbuseScore) => void;

  constructor(opts: AbuseDetectorOptions) {
    this.identityDir = opts.identityDir;
    this.quarantineThreshold = opts.quarantineThreshold ?? QUARANTINE_THRESHOLD;
    this.quarantineCooldownMs = opts.quarantineCooldownMs ?? QUARANTINE_COOLDOWN_MS;
    this.onQuarantine = opts.onQuarantine;
    this.state = loadAbuseState(opts.identityDir);
  }

  /**
   * Record an abuse signal for a peer agent.
   * If the accumulated score reaches the quarantine threshold, the agent is
   * automatically quarantined.
   */
  record(agentId: string, signal: AbuseSignal, detail: string): void {
    const now = new Date().toISOString();
    let entry = this.state.agents[agentId];
    if (!entry) {
      entry = { agentId, score: 0, quarantined: false, signals: {}, updatedAt: now };
      this.state.agents[agentId] = entry;
    }

    const weight = SIGNAL_WEIGHTS[signal];
    entry.score += weight;
    entry.signals[signal] = (entry.signals[signal] ?? 0) + 1;
    entry.updatedAt = now;

    appendAuditEntry(this.identityDir, {
      event: 'abuse_signal',
      agentId,
      signal,
      weight,
      cumulativeScore: entry.score,
      detail
    });

    process.stderr.write(
      `[F0X-abuse] signal=${signal} agent=${agentId} score=${entry.score} detail=${detail}\n`
    );

    if (!entry.quarantined && entry.score >= this.quarantineThreshold) {
      this.quarantine(agentId, entry);
    }

    saveAbuseState(this.identityDir, this.state);
  }

  /**
   * Returns true if the agent is currently quarantined (blocking inbound messages).
   * Automatically lifts expired quarantines.
   */
  isQuarantined(agentId: string): boolean {
    const entry = this.state.agents[agentId];
    if (!entry?.quarantined) return false;

    if (entry.quarantineExpiresAt && new Date(entry.quarantineExpiresAt) <= new Date()) {
      entry.quarantined = false;
      entry.score = Math.max(0, entry.score - this.quarantineThreshold);
      entry.updatedAt = new Date().toISOString();
      saveAbuseState(this.identityDir, this.state);
      appendAuditEntry(this.identityDir, { event: 'quarantine_expired', agentId });
      process.stderr.write(`[F0X-abuse] Quarantine expired for agent ${agentId}\n`);
      return false;
    }

    return true;
  }

  /** Return the current abuse score for an agent (0 if unknown). */
  getScore(agentId: string): AbuseScore | undefined {
    return this.state.agents[agentId];
  }

  /** Operator override: release a quarantined agent and reset its score. */
  release(agentId: string): void {
    const entry = this.state.agents[agentId];
    if (!entry) return;
    entry.quarantined = false;
    entry.score = 0;
    entry.quarantineExpiresAt = undefined;
    entry.updatedAt = new Date().toISOString();
    saveAbuseState(this.identityDir, this.state);
    appendAuditEntry(this.identityDir, { event: 'quarantine_released_by_operator', agentId });
    process.stderr.write(`[F0X-abuse] Agent ${agentId} released from quarantine by operator.\n`);
  }

  /** List all agents with non-zero scores. */
  listScoredAgents(): AbuseScore[] {
    return Object.values(this.state.agents).filter((a) => a.score > 0);
  }

  private quarantine(agentId: string, entry: AbuseScore): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.quarantineCooldownMs);
    entry.quarantined = true;
    entry.quarantinedAt = now.toISOString();
    entry.quarantineExpiresAt = expiresAt.toISOString();
    entry.updatedAt = now.toISOString();

    const msg = `[F0X-abuse] AUTO-QUARANTINE: agent ${agentId} score=${entry.score} expires=${expiresAt.toISOString()}\n`;
    process.stderr.write(msg);

    appendAuditEntry(this.identityDir, {
      event: 'agent_quarantined',
      agentId,
      score: entry.score,
      expiresAt: entry.quarantineExpiresAt
    });

    if (this.onQuarantine) this.onQuarantine(agentId, entry);
  }
}

// ─── Singleton (process-scoped) ───────────────────────────────────────────────

let _detector: AbuseDetector | undefined;

export function getAbuseDetector(identityDir?: string): AbuseDetector {
  if (!_detector) {
    const dir = identityDir ?? join(homedir(), '.f0x-chat');
    _detector = new AbuseDetector({ identityDir: dir });
  }
  return _detector;
}
