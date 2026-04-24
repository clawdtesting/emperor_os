export interface RateLimitRule {
  windowMs: number;
  maxInWindow: number;
  burstWindowMs?: number;
  burstMax?: number;
}

const buckets = new Map<string, number[]>();

function prune(timestamps: number[], now: number, windowMs: number): number[] {
  return timestamps.filter((ts) => now - ts <= windowMs);
}

export function assertRateLimit(key: string, rule: RateLimitRule): void {
  const now = Date.now();
  const existing = buckets.get(key) ?? [];
  const windowTimestamps = prune(existing, now, rule.windowMs);

  if (windowTimestamps.length >= rule.maxInWindow) {
    throw new Error(`Local rate limit exceeded for ${key}: max ${rule.maxInWindow}/${Math.floor(rule.windowMs / 1000)}s`);
  }

  if (rule.burstWindowMs && rule.burstMax) {
    const burstTimestamps = prune(windowTimestamps, now, rule.burstWindowMs);
    if (burstTimestamps.length >= rule.burstMax) {
      throw new Error(`Local burst limit exceeded for ${key}: max ${rule.burstMax}/${Math.floor(rule.burstWindowMs / 1000)}s`);
    }
  }

  windowTimestamps.push(now);
  buckets.set(key, windowTimestamps);
}

