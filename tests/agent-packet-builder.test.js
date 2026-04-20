import assert from 'assert'
import { createHash } from 'crypto'
import { buildAgentJobPacket } from '../agent/agent-packet-builder.js'
import { validateSchema } from '../mission-control/lib/schema-validate.js'

const job = { jobId: '1', status: 'Assigned', payout: '10', details: 'single markdown file', title: 'Test job', category: 'analysis' }
const packetA = buildAgentJobPacket({ job, lane: 'job-v1', workspaceRoot: process.cwd() })
const packetB = buildAgentJobPacket({ job, lane: 'job-v1', workspaceRoot: process.cwd() })

const schemaCheck = validateSchema('agent-job-packet', packetA)
assert.equal(schemaCheck.valid, true, schemaCheck.errors.join('; '))
assert.equal(packetA.requiredArtifacts.length > 0, true)
assert.equal(createHash('sha256').update(JSON.stringify(packetA)).digest('hex'), createHash('sha256').update(JSON.stringify(packetB)).digest('hex'))
console.log('agent-packet-builder.test.js passed')
