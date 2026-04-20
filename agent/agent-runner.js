import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import path from 'path'
import { createAdapter } from './agent-registry.js'

const RUNS_STATE_PATH = path.resolve('mission-control/state/agent-runs.json')

function atomicWriteJson(filePath, data) {
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, filePath)
}

function loadRunState() {
  if (!existsSync(RUNS_STATE_PATH)) {
    mkdirSync(path.dirname(RUNS_STATE_PATH), { recursive: true })
    atomicWriteJson(RUNS_STATE_PATH, { runs: [], packets: [] })
  }
  return JSON.parse(readFileSync(RUNS_STATE_PATH, 'utf8'))
}

function saveRunState(state) {
  atomicWriteJson(RUNS_STATE_PATH, state)
}

export function computePacketHash(packet) {
  return createHash('sha256').update(JSON.stringify(packet)).digest('hex')
}

export async function startAgentRun({ connection, packet, context = {} }) {
  const adapter = createAdapter(connection.adapter, connection)
  adapter.validateConfig()
  const submitted = await adapter.submitJobPacket(packet, context)
  const state = loadRunState()
  const localRunId = `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  const record = {
    id: localRunId,
    jobId: packet.jobId,
    lane: packet.lane,
    connectionId: connection.id,
    adapter: connection.adapter,
    packetHash: computePacketHash(packet),
    externalRunId: submitted.externalRunId || null,
    status: submitted.status || 'submitted',
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: submitted.result || null,
    lastPollStatus: null,
    lastError: null
  }
  state.runs.push(record)
  saveRunState(state)
  return record
}

export async function pollAgentRun({ connection, runRecord, context = {} }) {
  const adapter = createAdapter(connection.adapter, connection)
  if (!runRecord.externalRunId) return { done: Boolean(runRecord.result), status: runRecord.status }
  return adapter.pollRun(runRecord.externalRunId, context)
}

export async function fetchAgentRunResult({ connection, runRecord, context = {} }) {
  const adapter = createAdapter(connection.adapter, connection)
  if (runRecord.result) return runRecord.result
  if (!runRecord.externalRunId) throw new Error('cannot fetch async result: missing externalRunId')
  return adapter.fetchResult(runRecord.externalRunId, context)
}

export async function cancelAgentRun({ connection, runRecord, context = {} }) {
  const adapter = createAdapter(connection.adapter, connection)
  if (!runRecord.externalRunId) return { ok: false, reason: 'no_external_run_id' }
  return adapter.cancelRun(runRecord.externalRunId, context)
}
