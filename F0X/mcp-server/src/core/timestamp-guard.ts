export interface TimestampValidationResult {
  ok: boolean;
  skewSeconds: number;
}

export function validateSignedTimestamp(
  timestampIso: string,
  maxSkewSeconds = 300
): TimestampValidationResult {
  const parsed = Date.parse(timestampIso);
  if (!Number.isFinite(parsed)) return { ok: false, skewSeconds: Number.POSITIVE_INFINITY };
  const now = Date.now();
  const skewSeconds = Math.abs(now - parsed) / 1000;
  return { ok: skewSeconds <= maxSkewSeconds, skewSeconds };
}

