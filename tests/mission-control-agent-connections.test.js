import assert from 'assert'
import { createAgentConnection, listAgentConnections, updateAgentConnection, deleteAgentConnection } from '../mission-control/lib/agent-connections.js'

const id = `test_conn_${Date.now()}`
const created = createAgentConnection({ id, name: 'Test', adapter: 'webhook', enabled: true, scopes: ['job-v1'], config: { baseUrl: 'http://localhost', submitPath: '/submit' } })
assert.equal(created.id, id)
assert.equal(listAgentConnections().some(c => c.id === id), true)
const updated = updateAgentConnection(id, { enabled: false })
assert.equal(updated.enabled, false)
assert.equal(deleteAgentConnection(id).removed, true)
console.log('mission-control-agent-connections.test.js passed')
