import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const SERVER = join(ROOT, 'server.js')

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

test('POST /api/job-requests rejects invalid payloads and returns no false ok', async (t) => {
  const port = 3121
  const proc = spawn('node', [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  t.after(() => {
    proc.kill('SIGTERM')
  })

  await waitForServer(`http://127.0.0.1:${port}/health`)

  const res = await fetch(`http://127.0.0.1:${port}/api/job-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'bad request',
      ipfsUri: 'https://example.com/not-ipfs',
      payoutAGIALPHA: 100,
      duration: '1d',
      contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
      chainId: 1,
    }),
  })

  assert.equal(res.status, 422)
  const data = await res.json()
  assert.equal(Boolean(data?.ok), false)
  assert.match(String(data?.error || ''), /ipfsUri/i)
})

test('POST /api/job-requests returns unsigned package + review manifest on success', async (t) => {
  const port = 3122
  const proc = spawn('node', [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  t.after(() => {
    proc.kill('SIGTERM')
  })

  await waitForServer(`http://127.0.0.1:${port}/health`)

  const res = await fetch(`http://127.0.0.1:${port}/api/job-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'request package test',
      summary: 'test summary',
      brief: 'test details',
      ipfsUri: 'ipfs://bafybeigdyrztfakespec',
      payoutAGIALPHA: '42',
      duration: '1d',
      contract: '0xB3AAeb69b630f0299791679c063d68d6687481d1',
      chainId: 1,
    }),
  })

  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data?.ok, true)
  assert.equal(typeof data?.unsignedTxPath, 'string')
  assert.equal(typeof data?.reviewManifestPath, 'string')
  assert.equal(existsSync(data.unsignedTxPath), true)
  assert.equal(existsSync(data.reviewManifestPath), true)
})
