// audits/lib/severity.js
// Severity levels and escalation logic for audit results.

export const SEVERITY = {
  PASS: "pass",
  WARN: "warn",
  FAIL: "fail",
  CRITICAL: "critical",
};

export const SEVERITY_ORDER = {
  [SEVERITY.PASS]: 0,
  [SEVERITY.WARN]: 1,
  [SEVERITY.FAIL]: 2,
  [SEVERITY.CRITICAL]: 3,
};

export function highestSeverity(checks) {
  if (!checks || checks.length === 0) return SEVERITY.PASS;
  return checks.reduce((max, c) => {
    const level = SEVERITY_ORDER[c.status] ?? 0;
    const maxLevel = SEVERITY_ORDER[max] ?? 0;
    return level > maxLevel ? c.status : max;
  }, SEVERITY.PASS);
}

export function shouldBlockExecution(severity) {
  return severity === SEVERITY.CRITICAL || severity === SEVERITY.FAIL;
}

export function shouldBlockSigning(severity) {
  return severity === SEVERITY.CRITICAL;
}

export function severityEmoji(severity) {
  switch (severity) {
    case SEVERITY.PASS: return "✅";
    case SEVERITY.WARN: return "⚠️";
    case SEVERITY.FAIL: return "❌";
    case SEVERITY.CRITICAL: return "🚨";
    default: return "❓";
  }
}
