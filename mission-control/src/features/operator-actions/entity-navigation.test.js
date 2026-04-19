import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveOperatorEntityCandidate, operatorActionFocusHint } from './entity-navigation.js'

test('resolveOperatorEntityCandidate returns refreshed v1 job for operator action entity', () => {
  const jobs = [
    { source: 'agijobmanager', jobId: '77', status: 'Applied' },
    { source: 'agijobmanager-v2', jobId: 'V2-77', status: 'Observed' },
  ]

  const result = resolveOperatorEntityCandidate(jobs, { lane: 'v1', entityId: '77', action: 'apply' })

  assert.equal(result?.job?.source, 'agijobmanager')
  assert.equal(result?.job?.jobId, '77')
  assert.equal(result?.job?.__operatorFocus, 'apply-status')
  assert.equal(result?.tab, 'detail')
})

test('resolveOperatorEntityCandidate returns refreshed prime procurement by procurementId', () => {
  const jobs = [
    { source: 'agiprimediscovery', procurementId: '42', jobId: 'P-42', status: 'PrimeWindowOpen' },
  ]

  const result = resolveOperatorEntityCandidate(jobs, { lane: 'prime', entityId: '42' })

  assert.equal(result?.job?.source, 'agiprimediscovery')
  assert.equal(result?.job?.procurementId, '42')
  assert.equal(result?.tab, 'detail')
})

test('resolveOperatorEntityCandidate supports prime-v2 lane entity lookup', () => {
  const jobs = [
    { source: 'agijobmanagerprime', procurementId: '9001', jobId: '321', status: 'PrimeV2Assigned' },
  ]

  const result = resolveOperatorEntityCandidate(jobs, { lane: 'prime-v2', entityId: '9001' })

  assert.equal(result?.job?.source, 'agijobmanagerprime')
  assert.equal(result?.job?.procurementId, '9001')
  assert.equal(result?.tab, 'detail')
})

test('resolveOperatorEntityCandidate falls back to lane tab when refreshed entity is missing', () => {
  const jobs = [{ source: 'agijobmanager-v2', jobId: 'V2-1', status: 'Observed' }]

  const result = resolveOperatorEntityCandidate(jobs, { lane: 'v1', entityId: '999' })

  assert.equal(result?.job, null)
  assert.equal(result?.tab, 'jobs-v1')
})

test('operatorActionFocusHint returns apply section focus for apply actions', () => {
  assert.equal(operatorActionFocusHint({ action: 'apply' }), 'apply-status')
  assert.equal(operatorActionFocusHint({ action: 'validate' }), '')
})
