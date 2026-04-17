import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { spawn } from 'child_process'
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const SERVER = join(ROOT, 'server.js')
const APPLY_STATE_PATH = join(ROOT, '..', 'agent', 'state', 'jobs', '77.json')
const APPLY_ARTIFACT_DIR = join(ROOT, '..', 'artifacts', 'applications', 'job_77')

async function waitForServer(url, timeoutMs = 12000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 500) return
    } catch {
      // retry until server is ready
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server did not start in time')
}

function cleanupApplyArtifacts() {
  rmSync(APPLY_STATE_PATH, { force: true })
  rmSync(APPLY_ARTIFACT_DIR, { recursive: true, force: true })
}

function seedJobState(state) {
  mkdirSync(join(ROOT, '..', 'agent', 'state', 'jobs'), { recursive: true })
  writeFileSync(APPLY_STATE_PATH, JSON.stringify(state, null, 2))
}

test('POST /api/job-applications/prepare rejects missing agentSubdomain', async (t) => {
  cleanupApplyArtifacts()
  const port = 3123
  const proc = spawn('node', [SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      AGENT_SUBDOMAIN: '',
      AGENT_MERKLE_PROOF: '[]',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  t.after(() => {
    proc.kill('SIGTERM')
    cleanupApplyArtifacts()
  })

  await waitForServer(`http://127.0.0.1:${port}/health`)

  const res = await fetch(`http://127.0.0.1:${port}/api/job-applications/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: '77',
      contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
      tokenAddress: '0x5aFE3855358E112B5647B952709E6165e1c1eEEe',
      bondAmountRaw: '1000000000000000000',
      merkleProof: ['0x' + '11'.repeat(32)],
    }),
  })

  assert.equal(res.status, 422)
  const data = await res.json()
  assert.equal(Boolean(data?.ok), false)
  assert.match(String(data?.error || ''), /agentSubdomain/i)
})

test('POST /api/job-applications/prepare rejects missing merkle proof', async (t) => {
  cleanupApplyArtifacts()
  const port = 3125
  const proc = spawn('node', [SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      AGENT_SUBDOMAIN: 'lobster.agent.agi.eth',
      AGENT_MERKLE_PROOF: '[]',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  t.after(() => {
    proc.kill('SIGTERM')
    cleanupApplyArtifacts()
  })

  await waitForServer(`http://127.0.0.1:${port}/health`)

  const res = await fetch(`http://127.0.0.1:${port}/api/job-applications/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: '77',
      contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
      tokenAddress: '0x5aFE3855358E112B5647B952709E6165e1c1eEEe',
      bondAmountRaw: '1000000000000000000',
    }),
  })

  assert.equal(res.status, 422)
  const data = await res.json()
  assert.equal(Boolean(data?.ok), false)
  assert.match(String(data?.error || ''), /merkleProof/i)
})

test('POST /api/job-applications/prepare rejects non-open existing job state', async (t) => {
  cleanupApplyArtifacts()
  seedJobState({
    jobId: '77',
    source: 'agijobmanager',
    status: 'completed',
    txPackages: [],
    receipts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
  const port = 3126
  const proc = spawn('node', [SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      AGENT_SUBDOMAIN: 'lobster.agent.agi.eth',
      AGENT_MERKLE_PROOF: '["0x1111111111111111111111111111111111111111111111111111111111111111"]',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  t.after(() => {
    proc.kill('SIGTERM')
    cleanupApplyArtifacts()
  })

  await waitForServer(`http://127.0.0.1:${port}/health`)

  const res = await fetch(`http://127.0.0.1:${port}/api/job-applications/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: '77',
      contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
      tokenAddress: '0x5aFE3855358E112B5647B952709E6165e1c1eEEe',
      bondAmountRaw: '1000000000000000000',
    }),
  })

  assert.equal(res.status, 409)
  const data = await res.json()
  assert.equal(Boolean(data?.ok), false)
  assert.match(String(data?.error || ''), /not open|existing state/i)
})

test('POST /api/job-applications/prepare writes unsigned apply package, review manifest, and state entry', async (t) => {
  cleanupApplyArtifacts()
  const port = 3124
  const proc = spawn('node', [SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      AGENT_SUBDOMAIN: 'lobster.agent.agi.eth',
      AGENT_MERKLE_PROOF: '["0x1111111111111111111111111111111111111111111111111111111111111111"]',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  t.after(() => {
    proc.kill('SIGTERM')
    cleanupApplyArtifacts()
  })

  await waitForServer(`http://127.0.0.1:${port}/health`)

  const res = await fetch(`http://127.0.0.1:${port}/api/job-applications/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: '77',
      walletAddress: '0x2222222222222222222222222222222222222222',
      contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
      tokenAddress: '0x5aFE3855358E112B5647B952709E6165e1c1eEEe',
      bondAmountRaw: '1000000000000000000',
      chainId: 1,
    }),
  })

  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data?.ok, true)
  assert.equal(data?.action, 'apply')
  assert.equal(typeof data?.unsignedTxPath, 'string')
  assert.equal(typeof data?.reviewManifestPath, 'string')
  assert.equal(typeof data?.statePath, 'string')
  assert.equal(existsSync(data.unsignedTxPath), true)
  assert.equal(existsSync(data.reviewManifestPath), true)
  assert.equal(existsSync(data.statePath), true)

  const unsignedPkg = JSON.parse(readFileSync(data.unsignedTxPath, 'utf8'))
  assert.equal(unsignedPkg?.action, 'apply')
  assert.equal(unsignedPkg?.kind, 'requestJobApplication')
  assert.equal(unsignedPkg?.jobId, '77')
  assert.equal(unsignedPkg?.agentSubdomain, 'lobster.agent.agi.eth')
  assert.equal(Array.isArray(unsignedPkg?.transactions), true)
  assert.equal(unsignedPkg.transactions.length, 2)
  assert.equal(unsignedPkg.transactions[0]?.label, 'approve-bond')
  assert.equal(unsignedPkg.transactions[1]?.label, 'apply-for-job')

  const state = JSON.parse(readFileSync(data.statePath, 'utf8'))
  assert.equal(state?.jobId, '77')
  assert.equal(state?.status, 'application_pending_review')
  assert.equal(Array.isArray(state?.txPackages), true)
  assert.equal(state.txPackages.some((pkg) => pkg.action === 'apply' && pkg.unsignedTxPath === data.unsignedTxPath), true)
})

test('apply operator action finalization updates local apply state and reconcile returns summary', async (t) => {
  cleanupApplyArtifacts()
  const port = 3127
  const proc = spawn('node', [SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      AGENT_SUBDOMAIN: 'lobster.agent.agi.eth',
      AGENT_MERKLE_PROOF: '["0x1111111111111111111111111111111111111111111111111111111111111111"]',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  t.after(() => {
    proc.kill('SIGTERM')
    cleanupApplyArtifacts()
  })

  await waitForServer(`http://127.0.0.1:${port}/health`)

  const prepareRes = await fetch(`http://127.0.0.1:${port}/api/job-applications/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: '77',
      walletAddress: '0x2222222222222222222222222222222222222222',
      contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
      tokenAddress: '0x5aFE3855358E112B5647B952709E6165e1c1eEEe',
      bondAmountRaw: '1000000000000000000',
      chainId: 1,
    }),
  })
  assert.equal(prepareRes.status, 200)

  const actionsRes = await fetch(`http://127.0.0.1:${port}/api/operator-actions`)
  assert.equal(actionsRes.status, 200)
  const actionsData = await actionsRes.json()
  const applyAction = (actionsData.actions || []).find((item) => item.action === 'apply' && String(item.entityId) === '77')
  assert.equal(Boolean(applyAction?.id), true)

  const finalizeRes = await fetch(`http://127.0.0.1:${port}/api/operator-actions/${applyAction.id}/mark-finalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash: '0x' + 'ab'.repeat(32) }),
  })
  assert.equal(finalizeRes.status, 200)

  const state = JSON.parse(readFileSync(APPLY_STATE_PATH, 'utf8'))
  assert.equal(state?.status, 'applied')
  assert.equal(state?.operatorTx?.apply?.txHash, '0x' + 'ab'.repeat(32))

  const reconcileRes = await fetch(`http://127.0.0.1:${port}/api/job-applications/77/reconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1' }),
  })
  assert.equal(reconcileRes.status, 200)
  const reconcileData = await reconcileRes.json()
  assert.equal(reconcileData?.ok, true)
  assert.equal(reconcileData?.state?.status, 'applied')
  assert.equal(reconcileData?.summary?.jobId, '77')
  assert.equal(reconcileData?.summary?.operatorTx?.txHash, '0x' + 'ab'.repeat(32))
})
