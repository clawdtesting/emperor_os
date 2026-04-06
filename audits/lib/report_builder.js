// audits/lib/report_builder.js
// Creates consistent JSON and Markdown report objects for all audit families.

import { severityEmoji, highestSeverity, SEVERITY_ORDER } from "./severity.js";
import { nowIso, formatDuration } from "./time_utils.js";

export function buildAuditReport(auditType, checks, metrics = {}) {
  const startedAt = metrics.startedAt || nowIso();
  const completedAt = nowIso();
  const durationMs = metrics.durationMs || (Date.parse(completedAt) - Date.parse(startedAt));

  const summary = {
    pass: checks.filter(c => c.status === "pass").length,
    warn: checks.filter(c => c.status === "warn").length,
    fail: checks.filter(c => c.status === "fail").length,
    critical: checks.filter(c => c.status === "critical").length,
  };

  const status = highestSeverity(checks);

  return {
    auditType,
    status,
    startedAt,
    completedAt,
    durationMs,
    summary,
    checks,
    metrics: {
      ...metrics,
      durationMs,
    },
  };
}

export function buildMasterReport(auditResults) {
  const allChecks = auditResults.flatMap(r => r.checks || []);
  const summary = {
    pass: allChecks.filter(c => c.status === "pass").length,
    warn: allChecks.filter(c => c.status === "warn").length,
    fail: allChecks.filter(c => c.status === "fail").length,
    critical: allChecks.filter(c => c.status === "critical").length,
  };

  const status = highestSeverity(allChecks);
  const startedAt = auditResults.length > 0 ? auditResults[0].startedAt : nowIso();
  const completedAt = nowIso();
  const totalDurationMs = auditResults.reduce((sum, r) => sum + (r.durationMs || 0), 0);

  return {
    reportType: "master",
    status,
    startedAt,
    completedAt,
    totalDurationMs,
    summary,
    audits: auditResults.map(r => ({
      auditType: r.auditType,
      status: r.status,
      durationMs: r.durationMs,
      summary: r.summary,
    })),
    checks: allChecks,
  };
}

export function reportToMarkdown(report) {
  const isMaster = report.reportType === "master";
  const lines = [];

  lines.push(`# ${isMaster ? "Master Audit Report" : `${report.auditType} Audit Report`}`);
  lines.push("");
  lines.push(`${severityEmoji(report.status)} **Status: ${report.status.toUpperCase()}**`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Started | ${report.startedAt} |`);
  lines.push(`| Completed | ${report.completedAt} |`);
  lines.push(`| Duration | ${formatDuration(report.durationMs || report.totalDurationMs || 0)} |`);
  lines.push(`| Pass | ${report.summary.pass} |`);
  lines.push(`| Warn | ${report.summary.warn} |`);
  lines.push(`| Fail | ${report.summary.fail} |`);
  lines.push(`| Critical | ${report.summary.critical} |`);
  lines.push("");

  if (isMaster && report.audits) {
    lines.push("## Audit Family Breakdown");
    lines.push("");
    lines.push("| Audit | Status | Duration | Pass | Warn | Fail | Critical |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const a of report.audits) {
      lines.push(`| ${a.auditType} | ${severityEmoji(a.status)} ${a.status} | ${formatDuration(a.durationMs || 0)} | ${a.summary.pass} | ${a.summary.warn} | ${a.summary.fail} | ${a.summary.critical} |`);
    }
    lines.push("");
  }

  if (report.checks && report.checks.length > 0) {
    lines.push("## Checks");
    lines.push("");
    for (const c of report.checks) {
      lines.push(`### ${severityEmoji(c.status)} ${c.name} — ${c.status}`);
      if (c.details) lines.push("");
      if (c.details) lines.push(c.details);
      if (c.durationMs) lines.push(`_Duration: ${formatDuration(c.durationMs)}_`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
