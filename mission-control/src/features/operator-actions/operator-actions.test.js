import test from 'node:test'
import assert from 'node:assert/strict'

import {
  inferJobLane,
  inferProcLane,
  normalizeActionName,
  phaseWindowStatusFromPkg,
  priorityForAction,
  actionQueueStage,
  deriveDeadlineAt,
} from '../../../lib/operator-actions.js'

test('inferJobLane detects v2 from source and prefixed id', () => {
  assert.equal(inferJobLane({ source: 'agijobmanager-v2' }, '12'), 'v2')
  assert.equal(inferJobLane({ source: 'agijobmanagerprime' }, '12'), 'prime-v2')
  assert.equal(inferJobLane({}, 'v2_44'), 'v2')
  assert.equal(inferJobLane({ managerVersion: 'v2' }, '44'), 'v2')
  assert.equal(inferJobLane({}, '44'), 'v1')
})

test('inferProcLane detects prime-v2 procurement states', () => {
  assert.equal(inferProcLane({ source: 'agijobmanagerprime' }, '11'), 'prime-v2')
  assert.equal(inferProcLane({ managerVersion: 'prime-v2' }, '11'), 'prime-v2')
  assert.equal(inferProcLane({ contractAddress: '0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e' }, '11'), 'prime-v2')
  assert.equal(inferProcLane({ source: 'agiprimediscovery' }, '11'), 'prime')
})

test('normalizeActionName maps score commit/reveal and completion', () => {
  assert.equal(normalizeActionName({ status: 'validator_score_commit_ready' }), 'score_commit')
  assert.equal(normalizeActionName({ file: 'scoring/unsigned_score_reveal_tx.json' }), 'score_reveal')
  assert.equal(normalizeActionName({ status: 'completion_ready' }), 'completion')
  assert.equal(normalizeActionName({ action: 'validate' }), 'validate')
  assert.equal(normalizeActionName({ action: 'disputeJob' }), 'dispute')
  assert.equal(normalizeActionName({ status: 'n/a', file: 'random.json' }), null)
})

test('phaseWindowStatusFromPkg and priorityForAction derive queue metadata', () => {
  assert.equal(phaseWindowStatusFromPkg({ expired: true, fresh: false }), 'closed')
  assert.equal(phaseWindowStatusFromPkg({ expired: false, fresh: true }), 'open')
  assert.equal(phaseWindowStatusFromPkg({ expired: false, fresh: false }), 'open')

  assert.equal(actionQueueStage({}), 'needs_signature')
  assert.equal(actionQueueStage({ signed: true }), 'signed_awaiting_broadcast')
  assert.equal(actionQueueStage({ broadcastTxHash: '0xabc' }), 'broadcast_awaiting_finalization')

  assert.equal(priorityForAction('score_reveal', 'open', 'needs_signature'), 95)
  assert.equal(priorityForAction('commit', 'closed', 'needs_signature'), 40)
  assert.equal(priorityForAction('apply', 'open', 'signed_awaiting_broadcast'), 55)
})

test('deriveDeadlineAt uses package expiresAt then state deadlines by action', () => {
  assert.equal(
    deriveDeadlineAt('commit', { deadlines: { commitDeadline: '2026-01-01T00:00:00Z' } }, { expiresAt: '2026-02-01T00:00:00Z' }),
    '2026-02-01T00:00:00Z',
  )
  assert.equal(
    deriveDeadlineAt('score_reveal', { deadlines: { scoreRevealDeadline: 1700000000 } }, {}),
    '1700000000',
  )
  assert.equal(deriveDeadlineAt('validate', {}, {}), null)
})
