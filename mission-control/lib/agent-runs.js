import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import path from 'path'

const RUNS_STATE_PATH = path.resolve('mission-control/state/agent-runs.json')

function atomicWriteJson(file, data) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

function loadStore() {
  if (!existsSync(RUNS_STATE_PATH)) {
    mkdirSync(path.dirname(RUNS_STATE_PATH), { recursive: true })
    atomicWriteJson(RUNS_STATE_PATH, { runs: [], packets: [] })
  }
  return JSON.parse(readFileSync(RUNS_STATE_PATH, 'utf8'))
}

function saveStore(store) {
  atomicWriteJson(RUNS_STATE_PATH, store)
}

export function ensureAgentRunStateFile() {
  loadStore()
}

export function createPreparedPacketRecord(record) {
  const store = loadStore()
  store.packets.push({ ...record, createdAt: new Date().toISOString() })
  saveStore(store)
  return record
}

export function findPreparedPacket(packetHash) {
  const store = loadStore()
  return store.packets.find(item => item.packetHash === packetHash) || null
}

export function createRun(record) {
  const store = loadStore()
  store.runs.push(record)
  saveStore(store)
  return record
}

export function updateRun(runId, patch) {
  const store = loadStore()
  const idx = store.runs.findIndex(item => item.id === runId)
  if (idx < 0) return null
  store.runs[idx] = { ...store.runs[idx], ...patch, updatedAt: new Date().toISOString() }
  saveStore(store)
  return store.runs[idx]
}

export function getRun(runId) {
  const store = loadStore()
  return store.runs.find(item => item.id === runId) || null
}
