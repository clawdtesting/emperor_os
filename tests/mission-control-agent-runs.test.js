import assert from 'assert'
import { createPreparedPacketRecord, findPreparedPacket, createRun, getRun, updateRun } from '../mission-control/lib/agent-runs.js'

const packetHash = `pkt_${Date.now()}`
createPreparedPacketRecord({ packetHash, packet: { schema: 'emperor-os/agent-job-packet/v1', jobId: '1' }, jobId: '1', lane: 'job-v1', connectionId: 'c1' })
assert.equal(findPreparedPacket(packetHash).packetHash, packetHash)
const runId = `run_${Date.now()}`
createRun({ id: runId, status: 'submitted', adapter: 'webhook', submittedAt: new Date().toISOString() })
assert.equal(getRun(runId).id, runId)
updateRun(runId, { status: 'ingested' })
assert.equal(getRun(runId).status, 'ingested')
console.log('mission-control-agent-runs.test.js passed')
