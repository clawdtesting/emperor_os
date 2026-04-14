import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDryRunReport } from './summarizeDryRun.js'

test('returns pass summary for DRY_RUN_PASSED report', () => {
  const report = {
    generatedAt: '2026-04-14T10:00:00.000Z',
    summary: {
      verdict: 'DRY_RUN_PASSED',
      passed: 18,
      failed: 0,
      totalChecks: 18,
      recommendation: 'All validation checks passed.'
    },
    checks: [],
  }

  const out = summarizeDryRunReport(report)
  assert.equal(out.status, 'pass')
  assert.equal(out.passed, 18)
  assert.equal(out.failed, 0)
  assert.equal(out.total, 18)
  assert.equal(out.failedChecks.length, 0)
})

test('returns fail summary and failed check names', () => {
  const report = {
    generatedAt: '2026-04-14T10:00:00.000Z',
    summary: {
      verdict: 'DRY_RUN_FAILED',
      passed: 10,
      failed: 2,
      totalChecks: 12,
      recommendation: '2 checks failed.'
    },
    checks: [
      { name: 'content_not_empty', passed: true },
      { name: 'tx_selector_correct', passed: false, detail: 'Expected 0x8d1bc00f' },
      { name: 'presign_chain_id_valid', passed: false, detail: 'Chain ID mismatch' }
    ],
  }

  const out = summarizeDryRunReport(report)
  assert.equal(out.status, 'fail')
  assert.equal(out.failedChecks.length, 2)
  assert.equal(out.failedChecks[0].name, 'tx_selector_correct')
  assert.equal(out.failedChecks[1].name, 'presign_chain_id_valid')
})

test('returns error summary for malformed report', () => {
  const out = summarizeDryRunReport(null)
  assert.equal(out.status, 'error')
  assert.match(out.message, /No validation report/i)
})
