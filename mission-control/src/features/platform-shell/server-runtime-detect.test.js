import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { spawn } from 'child_process'
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

test('GET /api/runtime/detect returns hermes/openclaw availability shape', async (t) => {
  const port = 3133
  const proc = spawn('node', [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  t.after(() => {
    proc.kill('SIGTERM')
  })

  await waitForServer(`http://127.0.0.1:${port}/health`)

  const res = await fetch(`http://127.0.0.1:${port}/api/runtime/detect`)
  assert.equal(res.status, 200)
  const data = await res.json()

  assert.equal(typeof data, 'object')
  assert.equal(typeof data.hermes?.available, 'boolean')
  assert.equal(typeof data.openclaw?.available, 'boolean')

  if (data.hermes?.available) {
    assert.equal(typeof data.hermes.path, 'string')
    assert.ok(data.hermes.path.length > 0)
  }
  if (data.openclaw?.available) {
    assert.equal(typeof data.openclaw.path, 'string')
    assert.ok(data.openclaw.path.length > 0)
  }
})
