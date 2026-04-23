type ReplaySignal = {
  channelId: string;
  senderAgentId?: string;
  context: 'mcp' | 'ui';
  detail: string;
};

const replayRejectionCounts = new Map<string, number>();
const replayAnomalyCounts = new Map<string, number>();
const ALERT_THRESHOLD = 5;

function keyFor(signal: ReplaySignal): string {
  return `${signal.context}:${signal.channelId}:${signal.senderAgentId ?? 'unknown'}`;
}

function logSecurityEvent(event: string, signal: ReplaySignal, extra: Record<string, string | number> = {}): void {
  const payload = {
    event,
    context: signal.context,
    channelId: signal.channelId,
    senderAgentId: signal.senderAgentId ?? 'unknown',
    detail: signal.detail,
    ...extra
  };
  process.stderr.write(`[F0X-security] ${JSON.stringify(payload)}\n`);
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

