import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CONFIG } from '../config.js'
import { ensureStateDirs, setJobState, getJobState } from '../state.js'
import { ensureJobArtifactDir, getJobArtifactPaths, writeJson } from '../artifact-manager.js'
import { execute } from '../execute.js'
import { validate } from '../validate.js'
import { submit } from '../submit.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..', '..')
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
]

function emit(step, tool, status, result = '') {
  console.log(JSON.stringify({ step, tool, status, result }))
}

function parseArgs(argv) {
  const out = {
    jobFile: '',
    jobId: '',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = String(argv[i] || '').trim()
    if (a === '--job-file') out.jobFile = String(argv[i + 1] || '').trim()
    if (a === '--job-id') out.jobId = String(argv[i + 1] || '').trim()
  }
  if (!out.jobFile) throw new Error('--job-file is required')
  return out
}

function normalizeIpfsUrl(uri) {
  const raw = String(uri || '').trim()
  if (!raw) return ''
  if (raw.startsWith('ipfs://')) return `${IPFS_GATEWAYS[0]}${raw.slice(7)}`
  return raw
}

async function fetchJsonMaybe(uri) {
  const raw = String(uri || '').trim()
  if (!raw) return null
  const urls = raw.startsWith('ipfs://')
    ? IPFS_GATEWAYS.map((base) => `${base}${raw.slice(7)}`)
    : [raw]

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const contentType = String(res.headers.get('content-type') || '').toLowerCase()
      if (!contentType.includes('json')) {
        const text = await res.text()
        return { text, url, json: null }
      }
      return { json: await res.json(), url }
    } catch {
      // try next gateway
    }
  }
  return null
}

function parseDurationSeconds(value, fallback = null) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return fallback
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(day|days|hour|hours|minute|minutes|second|seconds)$/)
  if (!match) return fallback
  const n = Number(match[1])
  const unit = match[2]
  if (unit.startsWith('day')) return Math.round(n * 86400)
  if (unit.startsWith('hour')) return Math.round(n * 3600)
  if (unit.startsWith('minute')) return Math.round(n * 60)
  return Math.round(n)
}

function firstText(...values) {
  for (const value of values) {
    const v = String(value || '').trim()
    if (v) return v
  }
  return ''
}

function inferCategory(spec, job) {
  const p = spec?.properties && typeof spec.properties === 'object' ? spec.properties : {}
  return String(p.category || spec?.category || job?.category || 'other').trim().toLowerCase() || 'other'
}

function inferTitle(spec, job, jobId) {
  const p = spec?.properties && typeof spec.properties === 'object' ? spec.properties : {}
  return firstText(p.title, spec?.title, job?.title, `Job ${jobId}`)
}

function inferDetails(spec, job) {
  const p = spec?.properties && typeof spec.properties === 'object' ? spec.properties : {}
  return firstText(p.details, p.summary, spec?.description, job?.details, job?.summary)
}

function shouldAttemptSubmit() {
  return Boolean(CONFIG.PINATA_JWT && CONFIG.AGENT_SUBDOMAIN && CONFIG.AGENT_ADDRESS && process.env.ETH_RPC_URL)
}

async function seedAssignedStateFromJob(jobId, job, specPayload) {
  await ensureStateDirs()
  await ensureJobArtifactDir(jobId)
  const artifactPaths = getJobArtifactPaths(jobId)

  const spec = specPayload?.json && typeof specPayload.json === 'object' ? specPayload.json : null
  if (spec) {
    await writeJson(artifactPaths.rawSpec, spec)
  }

  const now = new Date().toISOString()
  const details = inferDetails(spec, job)
  const patch = {
    jobId,
    source: String(job?.source || 'op-control-intake'),
    contractVersion: 'v2',
    status: 'assigned',
    title: inferTitle(spec, job, jobId),
    category: inferCategory(spec, job),
    payout: String(job?.payoutRaw || job?.payout || ''),
    durationSeconds: Number(spec?.properties?.durationSeconds || spec?.durationSeconds || job?.durationSeconds || parseDurationSeconds(job?.duration, null) || 0) || null,
    details,
    specUri: firstText(job?.specURI, job?.specUri),
    rawJob: job,
    rawSpec: spec,
    assignedAgent: String(job?.assignedAgent || ''),
    assignedAt: now,
    artifactDir: artifactPaths.dir,
  }

  await setJobState(jobId, patch)
  return getJobState(jobId)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const jobRaw = await fs.readFile(path.resolve(ROOT, args.jobFile), 'utf8')
  const job = JSON.parse(jobRaw)
  const jobId = String(args.jobId || job?.jobId || '').trim()
  if (!/^\d+$/.test(jobId)) throw new Error('jobId must be numeric')

  emit('load-job', 'filesystem', 'ok', `loaded ${args.jobFile}`)

  const specUri = firstText(job?.specURI, job?.specUri)
  const specPayload = specUri ? await fetchJsonMaybe(specUri) : null
  if (specUri) {
    if (specPayload?.json) emit('fetch-spec', 'ipfs', 'ok', normalizeIpfsUrl(specUri))
    else emit('fetch-spec', 'ipfs', 'warn', `spec fetch failed for ${specUri}`)
  }

  await seedAssignedStateFromJob(jobId, job, specPayload)
  emit('seed-state', 'agent-state', 'ok', `seeded assigned state for ${jobId}`)

  await execute()
  const afterExecute = await getJobState(jobId)
  emit('execute', 'agent-execute', afterExecute?.status === 'failed' ? 'error' : 'ok', afterExecute?.status || 'unknown')
  if (afterExecute?.status === 'failed') return

  await validate()
  const afterValidate = await getJobState(jobId)
  emit('validate', 'agent-validate', afterValidate?.status === 'failed' ? 'error' : 'ok', afterValidate?.status || 'unknown')
  if (afterValidate?.status === 'failed') return

  if (!shouldAttemptSubmit()) {
    const missing = [
      !CONFIG.PINATA_JWT ? 'PINATA_JWT' : '',
      !CONFIG.AGENT_SUBDOMAIN ? 'AGENT_SUBDOMAIN' : '',
      !CONFIG.AGENT_ADDRESS ? 'AGENT_ADDRESS' : '',
      !process.env.ETH_RPC_URL ? 'ETH_RPC_URL' : '',
    ].filter(Boolean)
    emit('submit', 'agent-submit', 'ok', `skipped unsigned completion packaging; missing ${missing.join(', ')}`)
    return
  }

  await submit()
  const afterSubmit = await getJobState(jobId)
  emit('submit', 'agent-submit', afterSubmit?.status === 'failed' ? 'error' : 'ok', afterSubmit?.status || 'unknown')
}

main().catch((err) => {
  emit('fatal', 'run_assigned_job_pipeline_v2', 'error', err.message)
  console.error(`[v2-assigned] fatal: ${err.message}`)
  process.exit(1)
})
