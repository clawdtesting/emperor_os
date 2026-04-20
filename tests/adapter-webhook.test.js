import assert from 'assert'
import { createServer } from 'http'
import { WebhookAgentAdapter } from '../agent/adapters/webhook.js'

function parseBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { resolve({}) }
    })
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  res.setHeader('content-type', 'application/json')
  if (req.method === 'POST' && url.pathname === '/submit-sync') {
    const body = await parseBody(req)
    res.end(JSON.stringify({ jobId: body.packet.jobId, status: 'completed', summary: 'ok', deliverables: [], evidence: [], warnings: [] }))
    return
  }
  if (req.method === 'POST' && url.pathname === '/submit-async') {
    res.end(JSON.stringify({ runId: 'ext-123', status: 'submitted' }))
    return
  }
  if (req.method === 'GET' && url.pathname === '/runs/ext-123') {
    res.end(JSON.stringify({ id: 'ext-123', done: true, status: 'completed' }))
    return
  }
  if (req.method === 'GET' && url.pathname === '/runs/ext-123/result') {
    res.end(JSON.stringify({ jobId: '1', status: 'completed', summary: 'done', deliverables: [{ path: 'jobs/1/deliverables/deliverable.md', kind: 'markdown' }], evidence: [], warnings: [] }))
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ error: 'not found' }))
})

await new Promise(resolve => server.listen(0, resolve))
const port = server.address().port

const syncAdapter = new WebhookAgentAdapter({ config: { baseUrl: `http://127.0.0.1:${port}`, submitPath: '/submit-sync' } })
const sync = await syncAdapter.submitJobPacket({ jobId: '1' })
assert.equal(sync.sync, true)

process.env.TEST_TOKEN = 'abc'
const asyncAdapter = new WebhookAgentAdapter({ config: { baseUrl: `http://127.0.0.1:${port}`, submitPath: '/submit-async', statusPathTemplate: '/runs/{runId}', resultPathTemplate: '/runs/{runId}/result', authTokenRef: 'TEST_TOKEN' } })
const submitted = await asyncAdapter.submitJobPacket({ jobId: '1' })
assert.equal(submitted.externalRunId, 'ext-123')
const polled = await asyncAdapter.pollRun('ext-123')
assert.equal(polled.done, true)
const result = await asyncAdapter.fetchResult('ext-123')
assert.equal(result.schema, 'emperor-os/agent-job-result/v1')

server.close()
console.log('adapter-webhook.test.js passed')
