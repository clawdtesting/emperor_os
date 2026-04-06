// audits/lib/time_utils.js
// Time utilities for audit checks.

export function nowIso() {
  return new Date().toISOString();
}

export function elapsedMs(startMs) {
  return Date.now() - startMs;
}

export function isFresh(isoTimestamp, maxAgeMs = 30 * 60 * 1000) {
  if (!isoTimestamp) return false;
  const ts = Date.parse(isoTimestamp);
  if (!Number.isFinite(ts)) return false;
  return (Date.now() - ts) <= maxAgeMs;
}

export function isExpired(isoTimestamp, maxAgeMs = 30 * 60 * 1000) {
  return !isFresh(isoTimestamp, maxAgeMs);
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
