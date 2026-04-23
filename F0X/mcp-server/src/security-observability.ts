import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

type ReplaySignal = {
  channelId: string;
  senderAgentId?: string;
  context: 'mcp' | 'ui';
  detail: string;
};

const replayRejectionCounts = new Map<string, number>();
const replayAnomalyCounts = new Map<string, number>();
const ALERT_THRESHOLD = 5;
const auditDir = process.env['AGENT_IDENTITY_DIR'] ?? join(homedir(), '.f0x-chat');
const auditPath = join(auditDir, 'security-audit.log');

function keyFor(signal: ReplaySignal): string {
  return `${signal.context}:${signal.channelId}:${signal.senderAgentId ?? 'unknown'}`;
}

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(token|signingSecretKey|encryptionSecretKey|privateKey)\b\s*[:=]\s*["']?[^"',\s]+/gi, '$1=[REDACTED]');
}

function appendAudit(payload: Record<string, unknown>): void {
  mkdirSync(auditDir, { recursive: true, mode: 0o700 });
  appendFileSync(auditPath, JSON.stringify(payload) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'a' });
}

function logSecurityEvent(event: string, signal: ReplaySignal, extra: Record<string, string | number> = {}): void {
  const payload: Record<string, unknown> = {
    event,
    ts: new Date().toISOString(),
    context: signal.context,
    channelId: signal.channelId,
    senderAgentId: signal.senderAgentId ?? 'unknown',
    detail: redact(signal.detail),
    ...extra
  };
  const stderrPayload = JSON.stringify(payload);
  process.stderr.write(`[F0X-security] ${stderrPayload}\n`);
  appendAudit(payload);
}

export function recordReplayRejection(signal: ReplaySignal): void {
  const key = keyFor(signal);
  const count = (replayRejectionCounts.get(key) ?? 0) + 1;
  replayRejectionCounts.set(key, count);
  logSecurityEvent('replay_rejected', signal, { count });
  if (count >= ALERT_THRESHOLD) {
    logSecurityEvent('replay_rejected_alert', signal, { count, threshold: ALERT_THRESHOLD });
  }
}

export function recordReplayAnomaly(signal: ReplaySignal & { replayCounter: number; previousCounter: number }): void {
  const key = keyFor(signal);
  const count = (replayAnomalyCounts.get(key) ?? 0) + 1;
  replayAnomalyCounts.set(key, count);
  logSecurityEvent('replay_anomaly', signal, {
    count,
    replayCounter: signal.replayCounter,
    previousCounter: signal.previousCounter
  });
  if (count >= ALERT_THRESHOLD) {
    logSecurityEvent('replay_anomaly_alert', signal, { count, threshold: ALERT_THRESHOLD });
  }
}

export function recordAuthFailure(params: {
  context: 'mcp' | 'ui';
  status: 401 | 403;
  detail: string;
}): void {
  const event = params.status === 403 ? 'authorization_denied' : 'auth_failure';
  logSecurityEvent(event, {
    context: params.context,
    channelId: 'n/a',
    senderAgentId: 'n/a',
    detail: params.detail
  }, { status: params.status });
}

export function recordRateLimitIncident(params: {
  context: 'mcp' | 'ui';
  channelId?: string;
  detail: string;
  retryAfterSeconds?: number;
}): void {
  logSecurityEvent('rate_limit_incident', {
    context: params.context,
    channelId: params.channelId ?? 'n/a',
    senderAgentId: 'n/a',
    detail: params.detail
  }, { retryAfterSeconds: params.retryAfterSeconds ?? -1 });
}

export function recordSignatureFailure(params: {
  context: 'mcp' | 'ui';
  channelId: string;
  senderAgentId: string;
  detail: string;
}): void {
  logSecurityEvent('signature_failure', {
    context: params.context,
    channelId: params.channelId,
    senderAgentId: params.senderAgentId,
    detail: params.detail
  });
}

export function recordTimestampSkew(params: {
  context: 'mcp' | 'ui';
  channelId: string;
  senderAgentId: string;
  skewSeconds: number;
}): void {
  logSecurityEvent('timestamp_skew', {
    context: params.context,
    channelId: params.channelId,
    senderAgentId: params.senderAgentId,
    detail: `envelope timestamp skew ${Math.floor(params.skewSeconds)}s exceeds allowed window`
  }, { skewSeconds: Math.floor(params.skewSeconds) });
}
