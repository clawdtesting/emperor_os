import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeV1JobForList,
  normalizeV2JobForList,
  resolveV1MetadataUri,
  buildUnsignedCreateJobTxPackage,
} from '../../../lib/contract-first.js'

test('normalizeV1JobForList builds stable list item from on-chain state', () => {
  const item = normalizeV1JobForList({
    jobId: 12,
    contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
    core: {
      employer: '0x1111111111111111111111111111111111111111',
      assignedAgent: '0x2222222222222222222222222222222222222222',
      payoutRaw: '5000000000000000000',
      durationRaw: '172800',
      completed: false,
      disputed: false,
      expired: false,
    },
    validation: { approvals: 2, disapprovals: 1, completionRequested: true },
    specURI: 'ipfs://bafybeispec',
  })

  assert.equal(item.source, 'agijobmanager')
  assert.equal(item.jobId, '12')
  assert.equal(item.status, 'CompletionRequested')
  assert.equal(item.approvals, 2)
  assert.equal(item.disapprovals, 1)
  assert.equal(item.specURI, 'ipfs://bafybeispec')
  assert.equal(typeof item.links.contract, 'string')
})

test('normalizeV2JobForList includes v2 lifecycle + indexing parity fields', () => {
  const item = normalizeV2JobForList({
    jobId: 44,
    contract: '0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2',
    core: {
      employer: '0x1111111111111111111111111111111111111111',
      assignedAgent: '0x0000000000000000000000000000000000000000',
      payoutRaw: '7000000000000000000',
      durationRaw: '86400',
      createdAt: '1710000000',
      completed: false,
      disputed: false,
      expired: false,
    },
    validation: { approvals: 3, disapprovals: 1, completionRequested: true },
    specURI: 'ipfs://bafy-v2-spec',
    completionURI: 'ipfs://bafy-v2-completion',
    localState: { status: 'application_pending_review' },
  })

  assert.equal(item.source, 'agijobmanager-v2')
  assert.equal(item.managerVersion, 'v2')
  assert.equal(item.jobId, 'V2-44')
  assert.equal(item.rawJobId, '44')
  assert.equal(item.status, 'application_pending_review')
  assert.equal(item.onchainStatus, 'CompletionRequested')
  assert.equal(item.runtimeStatus, 'application_pending_review')
  assert.equal(item.approvals, 3)
  assert.equal(item.disapprovals, 1)
  assert.equal(item.completionRequested, true)
  assert.equal(item.specURI, 'ipfs://bafy-v2-spec')
  assert.equal(item.completionURI, 'ipfs://bafy-v2-completion')
})

test('resolveV1MetadataUri picks correct URI by type', () => {
  const context = {
    specURI: 'ipfs://bafybeispec',
    completionURI: 'ipfs://bafybeicompletion',
  }

  assert.equal(resolveV1MetadataUri(context, 'spec'), 'ipfs://bafybeispec')
  assert.equal(resolveV1MetadataUri(context, 'completion'), 'ipfs://bafybeicompletion')
  assert.equal(resolveV1MetadataUri(context, 'other'), 'ipfs://bafybeicompletion')
})

test('buildUnsignedCreateJobTxPackage validates required inputs', () => {
  assert.throws(() => {
    buildUnsignedCreateJobTxPackage({
      contract: 'bad',
      chainId: '0x1',
      specURI: 'ipfs://bafybeispec',
      payoutRaw: '100',
      durationSec: 3600,
      details: 'memo',
    })
  }, /contract/i)

  const pkg = buildUnsignedCreateJobTxPackage({
    contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
    chainId: '0x1',
    specURI: 'ipfs://bafybeispec',
    payoutRaw: '1000000000000000000',
    durationSec: 3600,
    details: 'memo',
    calldata: '0xdeadbeef',
  })
  assert.equal(pkg.action, 'request')
  assert.equal(pkg.method, 'createJob(string,uint256,uint256,string)')
  assert.equal(pkg.args.jobSpecURI, 'ipfs://bafybeispec')
  assert.equal(pkg.data, '0xdeadbeef')
})

test('buildUnsignedCreateJobTxPackage sanitizes details for on-chain usage', () => {
  const pkg = buildUnsignedCreateJobTxPackage({
    contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
    chainId: '0x1',
    specURI: 'ipfs://bafybeispec',
    payoutRaw: '1000000000000000000',
    durationSec: 3600,
    details: `Human summary   with   extra spacing ${'x'.repeat(240)}`,
  })

  assert.equal(pkg.args.details.length <= 200, true)
  assert.equal(pkg.args.details.includes('{'), false)
  assert.equal(pkg.args.details.includes('"'), false)
  assert.equal(pkg.args.details.includes('"schema"'), false)
  assert.equal(pkg.args.details.includes('  '), false)
})

test('buildUnsignedCreateJobTxPackage rejects JSON-like details payloads', () => {
  assert.throws(() => {
    buildUnsignedCreateJobTxPackage({
      contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
      chainId: '0x1',
      specURI: 'ipfs://bafybeispec',
      payoutRaw: '1000000000000000000',
      durationSec: 3600,
      details: '{"schema":"agijobmanager/job-spec/v2"}',
    })
  }, /human-readable, not JSON/i)
})
