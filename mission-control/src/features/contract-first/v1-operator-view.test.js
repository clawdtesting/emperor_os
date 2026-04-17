import test from 'node:test'
import assert from 'node:assert/strict'

import { buildV1OperatorViewModel } from '../../../lib/v1-operator-view.js'

test('buildV1OperatorViewModel builds operator-friendly v1 report from on-chain context and events', () => {
  const report = buildV1OperatorViewModel({
    jobId: '77',
    contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
    rpc: 'https://eth.llamarpc.com',
    context: {
      core: {
        employer: '0x1111111111111111111111111111111111111111',
        assignedAgent: '0x2222222222222222222222222222222222222222',
        payoutRaw: '5000000000000000000',
        durationRaw: '172800',
      },
      validation: {
        approvals: 2,
        disapprovals: 1,
        completionRequested: true,
      },
      specURI: 'ipfs://bafy-spec',
      completionURI: 'ipfs://bafy-completion',
    },
    createdEvent: {
      args: {
        details: 'Write a short operator memo',
        jobSpecURI: 'ipfs://bafy-spec',
      },
    },
    specFetch: {
      ok: true,
      source: 'ipfs.io',
      error: '',
      data: {
        properties: {
          title: 'Research memo',
          details: 'Summarize the market in plain language',
        },
      },
    },
    applications: [
      { agent: '0xaaa', ensSubdomain: 'alpha.agent.agi.eth', blockNumber: 10, txHash: '0xapplied' },
    ],
    validations: [
      { validator: '0xbbb', verdict: 'approve', blockNumber: 12, txHash: '0xvalidated' },
    ],
    completionRequests: [
      { agent: '0xaaa', jobCompletionURI: 'ipfs://bafy-completion', blockNumber: 15, txHash: '0xcomplete' },
    ],
    completionEvents: [
      { agent: '0xaaa', reputationPoints: '12', blockNumber: 20, txHash: '0xdone' },
    ],
    disputeEvents: [],
  })

  assert.equal(report.manager, 'AGIJobManager-v1')
  assert.equal(report.jobRequest.memo, 'Write a short operator memo')
  assert.equal(report.jobRequest.specURI, 'ipfs://bafy-spec')
  assert.equal(report.jobRequest.specFetch.ok, true)
  assert.equal(report.applications.length, 1)
  assert.equal(report.validations.length, 1)
  assert.equal(report.completionRequests.length, 1)
  assert.equal(report.completionEvents.length, 1)
  assert.equal(report.onchainSummary.status, 'CompletionRequested')
  assert.equal(report.onchainSummary.payout, '5 AGIALPHA')
  assert.equal(report.onchainSummary.duration, '2 days')
})
