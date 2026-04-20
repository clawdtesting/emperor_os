import assert from 'assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { buildAgentJobPacket } from '../agent/agent-packet-builder.js'
import { ingestAgentResult } from '../agent/agent-result-ingest.js'

const root = mkdtempSync(path.join(tmpdir(), 'emperor-ingest-'))
mkdirSync(path.join(root, 'jobs/1/deliverables'), { recursive: true })
writeFileSync(path.join(root, 'jobs/1/deliverables/deliverable.md'), '# done')
writeFileSync(path.join(root, 'jobs/1/candidate_result.json'), '{}')

const packet = buildAgentJobPacket({ job: { jobId: '1', details: 'x' }, lane: 'job-v1', workspaceRoot: root })

const badSchema = await ingestAgentResult({ packet, result: { hello: 'world' }, workspaceRoot: root, connectionSummary: { id: 'c1', adapter: 'webhook' } })
assert.equal(badSchema.ok, false)

const badPath = await ingestAgentResult({
  packet,
  result: { schema: 'emperor-os/agent-job-result/v1', jobId: '1', status: 'completed', summary: '', deliverables: [{ path: '../escape.md', kind: 'markdown' }], evidence: [], warnings: [] },
  workspaceRoot: root,
  connectionSummary: { id: 'c1', adapter: 'webhook' }
})
assert.equal(badPath.ok, false)

const missing = await ingestAgentResult({
  packet,
  result: { schema: 'emperor-os/agent-job-result/v1', jobId: '1', status: 'completed', summary: '', deliverables: [], evidence: [], warnings: [] },
  workspaceRoot: root,
  connectionSummary: { id: 'c1', adapter: 'webhook' }
})
assert.equal(missing.ok, false)

const mismatch = await ingestAgentResult({
  packet,
  result: { schema: 'emperor-os/agent-job-result/v1', jobId: '2', status: 'completed', summary: '', deliverables: [{ path: 'jobs/1/deliverables/deliverable.md', kind: 'markdown' }], evidence: [], warnings: [] },
  workspaceRoot: root,
  connectionSummary: { id: 'c1', adapter: 'webhook' }
})
assert.equal(mismatch.ok, false)

const good = await ingestAgentResult({
  packet,
  result: { schema: 'emperor-os/agent-job-result/v1', jobId: '1', status: 'completed', summary: 'ok', deliverables: [{ path: 'jobs/1/deliverables/deliverable.md', kind: 'markdown' }, { path: 'jobs/1/candidate_result.json', kind: 'json' }], evidence: [], warnings: [] },
  workspaceRoot: root,
  connectionSummary: { id: 'c1', adapter: 'webhook' },
  runMeta: { externalRunId: 'ext-1' }
})
assert.equal(good.ok, true)
assert.ok(good.signingManifest)
assert.ok(good.unsignedTx)

rmSync(root, { recursive: true, force: true })
console.log('agent-result-ingest.test.js passed')
