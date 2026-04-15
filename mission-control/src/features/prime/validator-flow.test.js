import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPrimeValidatorPrechecks,
  verifyRevealSafety,
  buildPrimeValidatorTimeline,
} from '../../../lib/prime-validator.js'

test('buildPrimeValidatorPrechecks evaluates role, window, allowance, and commitment consistency', () => {
  const checks = buildPrimeValidatorPrechecks({
    roleAssigned: true,
    windowStatus: 'open',
    bondRequiredRaw: '100',
    allowanceRaw: '120',
    commitPayload: { score: 88, salt: '0xabc', scoreCommitment: '0x123' },
    revealPayload: { score: 88, salt: '0xabc', expectedCommitment: '0x123' },
  })

  assert.equal(checks.summary.failed, 0)
  assert.equal(checks.summary.verdict, 'READY')
  assert.equal(checks.byName.prime_role_assignment.passed, true)
  assert.equal(checks.byName.prime_window_open.passed, true)
  assert.equal(checks.byName.prime_bond_allowance_ready.passed, true)
  assert.equal(checks.byName.prime_salt_commit_consistency.passed, true)
})

test('verifyRevealSafety blocks reveal on wallet/score/salt/context mismatch', () => {
  const guard = verifyRevealSafety({
    requestedWallet: '0x1111111111111111111111111111111111111111',
    commitPayload: {
      walletAddress: '0x2222222222222222222222222222222222222222',
      score: 90,
      salt: '0xsalt-a',
      procurementId: '42',
      finalistContextHash: 'ctx-a',
      scoreCommitment: '0xcommit-a',
    },
    revealPayload: {
      walletAddress: '0x1111111111111111111111111111111111111111',
      score: 91,
      salt: '0xsalt-b',
      procurementId: '43',
      finalistContextHash: 'ctx-b',
      expectedCommitment: '0xcommit-b',
      recomputedCommitment: '0xcommit-c',
    },
  })

  assert.equal(guard.allowed, false)
  assert.equal(guard.blockingReason.includes('wallet mismatch'), true)
  assert.equal(guard.blockingReason.includes('score mismatch'), true)
  assert.equal(guard.blockingReason.includes('salt mismatch'), true)
  assert.equal(guard.blockingReason.includes('procurement mismatch'), true)
  assert.equal(guard.blockingReason.includes('finalist context mismatch'), true)
  assert.equal(guard.blockingReason.includes('commitment mismatch'), true)
})

test('buildPrimeValidatorTimeline surfaces commit/reveal/winner states and tx links', () => {
  const timeline = buildPrimeValidatorTimeline({
    receipts: [
      { action: 'score_commit', txHash: '0xaaa', status: 'finalized', finalizedAt: '2026-01-01T00:00:00.000Z' },
      { action: 'score_reveal', txHash: '0xbbb', status: 'broadcast_pending' },
    ],
  })

  assert.equal(timeline.commit.submitted, true)
  assert.equal(timeline.reveal.submitted, true)
  assert.equal(timeline.winner.pending, true)
  assert.equal(timeline.commit.txHash, '0xaaa')
  assert.equal(timeline.reveal.txHash, '0xbbb')
})
