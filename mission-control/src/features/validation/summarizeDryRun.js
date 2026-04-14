function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function summarizeDryRunReport(report) {
  if (!report || typeof report !== 'object') {
    return {
      status: 'error',
      message: 'No validation report available yet.',
      passed: 0,
      failed: 0,
      total: 0,
      failedChecks: [],
      recommendation: '',
      generatedAt: null,
      verdict: null,
    }
  }

  const verdict = report?.summary?.verdict || null
  const passed = safeNumber(report?.summary?.passed)
  const failed = safeNumber(report?.summary?.failed)
  const total = safeNumber(report?.summary?.totalChecks, passed + failed)
  const failedChecks = Array.isArray(report?.checks)
    ? report.checks.filter(c => c && c.passed === false).map(c => ({
      name: c.name || 'unnamed_check',
      detail: c.detail || '',
    }))
    : []

  const status = verdict === 'DRY_RUN_PASSED'
    ? 'pass'
    : verdict === 'DRY_RUN_FAILED'
      ? 'fail'
      : 'error'

  return {
    status,
    message: status === 'error' ? 'Validation did not produce a usable verdict.' : '',
    passed,
    failed,
    total,
    failedChecks,
    recommendation: report?.summary?.recommendation || '',
    generatedAt: report?.generatedAt || null,
    verdict,
  }
}
