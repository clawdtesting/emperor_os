import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import path from 'path'
import { validateSchema } from './schema-validate.js'

const CONNECTION_STATE_PATH = path.resolve('mission-control/state/agent-connections.json')

function atomicWriteJson(file, data) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

function loadStore() {
  if (!existsSync(CONNECTION_STATE_PATH)) {
    mkdirSync(path.dirname(CONNECTION_STATE_PATH), { recursive: true })
    atomicWriteJson(CONNECTION_STATE_PATH, { connections: [] })
  }
  return JSON.parse(readFileSync(CONNECTION_STATE_PATH, 'utf8'))
}

function saveStore(store) {
  atomicWriteJson(CONNECTION_STATE_PATH, store)
}

function redactConfig(config = {}) {
  const redacted = { ...config }
  for (const key of Object.keys(redacted)) {
    if (/token|secret|key|password/i.test(key) && !/ref$/i.test(key)) redacted[key] = '[REDACTED]'
  }
  return redacted
}

function sanitizeConnection(connection) {
  return {
    ...connection,
    config: redactConfig(connection.config || {})
  }
}

export function listAgentConnections() {
  const store = loadStore()
  return store.connections.map(sanitizeConnection)
}

export function getAgentConnection(id) {
  const store = loadStore()
  return store.connections.find(item => item.id === id) || null
}

export function createAgentConnection(input) {
  const now = new Date().toISOString()
  const connection = {
    ...input,
    id: input.id || `conn_${Date.now()}`,
    enabled: Boolean(input.enabled),
    scopes: Array.isArray(input.scopes) ? input.scopes : [],
    config: input.config || {},
    createdAt: now,
    updatedAt: now
  }
  const check = validateSchema('agent-connection', connection)
  if (!check.valid) throw new Error(`invalid connection schema: ${check.errors.join('; ')}`)

  const store = loadStore()
  if (store.connections.some(item => item.id === connection.id)) throw new Error(`connection id already exists: ${connection.id}`)
  store.connections.push(connection)
  saveStore(store)
  return sanitizeConnection(connection)
}

export function updateAgentConnection(id, patch) {
  const store = loadStore()
  const idx = store.connections.findIndex(item => item.id === id)
  if (idx < 0) throw new Error(`unknown connection id: ${id}`)
  const updated = {
    ...store.connections[idx],
    ...patch,
    config: { ...(store.connections[idx].config || {}), ...(patch.config || {}) },
    updatedAt: new Date().toISOString()
  }
  const check = validateSchema('agent-connection', updated)
  if (!check.valid) throw new Error(`invalid connection schema: ${check.errors.join('; ')}`)
  store.connections[idx] = updated
  saveStore(store)
  return sanitizeConnection(updated)
}

export function deleteAgentConnection(id) {
  const store = loadStore()
  const next = store.connections.filter(item => item.id !== id)
  const removed = next.length !== store.connections.length
  if (removed) {
    store.connections = next
    saveStore(store)
  }
  return { removed }
}

export function resolveEnvRef(value) {
  if (!value || typeof value !== 'string') return ''
  const token = value.startsWith('env:') ? value.slice(4) : value
  return process.env[token] || ''
}

export function ensureConnectionStateFile() {
  loadStore()
}
