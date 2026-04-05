import express from 'express'
import cors from 'cors'
import { spawn } from 'child_process'
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, renameSync } from 'fs'
import { dirname, resolve, join } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'

const app = express()
app.use(cors())
app.use(express.json())

const __dirname     = dirname(fileURLToPath(import.meta.url))
const MCP_ENDPOINT  = process.env.AGI_ALPHA_MCP || 'https://agialpha.com/api/mcp'
const PIPELINES_DIR = '/home/ubuntu/.openclaw/workspace/pipelines'
const TESTS_DIR     = resolve(__dirname, '..', 'tests')
const WORKSPACE_ROOT = resolve(__dirname, '..')
const ARTIFACTS_DIR = join(WORKSPACE_ROOT, 'artifacts')
const AGENT_STATE_DIR = join(WORKSPACE_ROOT, 'agent', 'state', 'jobs')
const PROC_ARTIFACTS_DIR = join(WORKSPACE_ROOT, 'agent', 'artifacts')
const NOTIF_STATE_DIR = resolve(__dirname, 'state')
const NOTIF_STATE_FILE = join(NOTIF_STATE_DIR, 'notifications.json')
const NOTIF_LOG_FILE = join(NOTIF_STATE_DIR, 'actions.log.jsonl')
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const MC_URL = process.env.MISSION_CONTROL_URL || 'http://100.104.194.128:3000'

mkdirSync(NOTIF_STATE_DIR, { recursive: true })

// ── Notification / Action Engine ──────────────────────────────────────────────

function readJsonSafe(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')) }
  catch { return fallback }
}

function atomicWriteJson(file, data) {
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

function loadNotifState() {
  return readJsonSafe(NOTIF_STATE_FILE, {
    lastNotified: {},
    actions: [],
    dismissed: {},
    lastScanAt: null,
  })
}

function saveNotifState(state) {
  state.lastScanAt = new Date().toISOString()
  const tmp = NOTIF_STATE_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, NOTIF_STATE_FILE)
}

function appendActionLog(entry) {
  appendFileSync(NOTIF_LOG_FILE, JSON.stringify(entry) + '\n')
}

function urgencyLabel(secsUntilDeadline) {
  if (secsUntilDeadline == null || secsUntilDeadline < 0) return { level: 'info', label: 'INFO', color: 'text-slate-400' }
  if (secsUntilDeadline < 3600) return { level: 'urgent', label: 'URGENT', color: 'text-red-400' }
  if (secsUntilDeadline < 4 * 3600) return { level: 'warning', label: 'WARNING', color: 'text-amber-400' }
  return { level: 'info', label: 'INFO', color: 'text-slate-400' }
}

function formatDuration(secs) {
  if (secs == null) return '—'
  const s = Math.abs(secs)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

function timeAgo(iso) {
  if (!iso) return '—'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    })
    const ok = res.ok
    if (!ok) console.error('[telegram] send failed:', res.status, await res.text().catch(() => ''))
    return ok
  } catch (err) {
    console.error('[telegram] error:', err.message)
    return false
  }
}

function buildTelegramMessage(action) {
  const urgency = urgencyLabel(action.secsUntilDeadline)
  const icon = urgency.level === 'urgent' ? '\uD83D\uDD34' : urgency.level === 'warning' ? '\uD83D\uDFE1' : '\u2699\uFE0F'
  const deadlineText = action.secsUntilDeadline != null
    ? (action.secsUntilDeadline < 0 ? `Deadline passed ${formatDuration(action.secsUntilDeadline)} ago` : `${formatDuration(action.secsUntilDeadline)} remaining`)
    : ''

  const sourceLabel = action.sourceType === 'procurement' ? `Proc #${action.sourceId}` : `Job #${action.sourceId}`
  const deepLink = action.sourceType === 'procurement'
    ? `${MC_URL}/?tab=ops&proc=${action.sourceId}`
    : `${MC_URL}/?tab=ops`

  let msg = `${icon} <b>${sourceLabel}</b> \u2014 ${action.action}\n`
  msg += `${action.summary}\n`
  if (deadlineText) msg += `\u23F1 ${deadlineText}\n`
  if (action.blockedReason) msg += `\u26A0\uFE0F ${action.blockedReason}\n`
  msg += `\nReview \u2192 ${deepLink}`
  return msg
}

async function scanProcurementActions() {
  const actions = []
  if (!existsSync(PROC_ARTIFACTS_DIR)) return actions

  const dirs = readdirSync(PROC_ARTIFACTS_DIR).filter(d => d.startsWith('proc_') && statSync(join(PROC_ARTIFACTS_DIR, d)).isDirectory())

  for (const dir of dirs) {
    const procId = dir.replace('proc_', '')
    const statePath = join(PROC_ARTIFACTS_DIR, dir, 'state.json')
    const nextActionPath = join(PROC_ARTIFACTS_DIR, dir, 'next_action.json')

    const state = readJsonSafe(statePath, null)
    const nextAction = readJsonSafe(nextActionPath, null)

    if (!state && !nextAction) continue

    const action = nextAction?.action || 'UNKNOWN'
    const status = state?.status || 'unknown'
    const secsUntilDeadline = nextAction?.secsUntilDeadline
    const blockedReason = nextAction?.blockedReason
    const summary = nextAction?.summary || status

    actions.push({
      sourceType: 'procurement',
      sourceId: procId,
      status,
      action,
      summary,
      secsUntilDeadline,
      blockedReason,
      urgency: urgencyLabel(secsUntilDeadline),
      updatedAt: state?.lastChainSync || nextAction?.generatedAt || null,
    })
  }

  return actions
}

async function scanJobActions() {
  const actions = []
  if (!existsSync(AGENT_STATE_DIR)) return actions

  const files = readdirSync(AGENT_STATE_DIR).filter(f => f.endsWith('.json'))

  for (const file of files) {
    const state = readJsonSafe(join(AGENT_STATE_DIR, file), null)
    if (!state) continue

    const jobId = state.jobId || file.replace('.json', '')
    const status = state.status || 'unknown'

    const needsAttention = ['assigned', 'in_progress', 'needs_review', 'completion_ready'].includes(status.toLowerCase())

    if (!needsAttention) continue

    actions.push({
      sourceType: 'job',
      sourceId: jobId,
      status,
      action: status.toUpperCase(),
      summary: `Job ${jobId} is ${status}`,
      secsUntilDeadline: state.deadlineSecs || null,
      blockedReason: null,
      urgency: urgencyLabel(state.deadlineSecs),
      updatedAt: state.updatedAt || state.lastSync || null,
    })
  }

  return actions
}

async function scanAndNotify() {
  const state = loadNotifState()
  const now = new Date().toISOString()

  try {
    const [procActions, jobActions] = await Promise.all([
      scanProcurementActions(),
      scanJobActions(),
    ])

    const allActions = [...procActions, ...jobActions]
    let newActions = []

    for (const action of allActions) {
      const key = `${action.sourceType}:${action.sourceId}`
      const lastNotified = state.lastNotified[key]

      if (!lastNotified || lastNotified.status !== action.status || lastNotified.action !== action.action) {
        const actionId = `${key}:${action.status}:${Date.now()}`
        const entry = {
          id: actionId,
          key,
          sourceType: action.sourceType,
          sourceId: action.sourceId,
          previousStatus: lastNotified?.status || null,
          newStatus: action.status,
          action: action.action,
          summary: action.summary,
          secsUntilDeadline: action.secsUntilDeadline,
          blockedReason: action.blockedReason,
          urgency: action.urgency.level,
          createdAt: now,
          dismissed: false,
        }

        state.actions.push(entry)
        state.lastNotified[key] = { status: action.status, action: action.action, at: now }
        newActions.push(entry)
        appendActionLog(entry)

        const tgMsg = buildTelegramMessage(action)
        const sent = await sendTelegramMessage(tgMsg)
        console.log(`[notify] ${action.sourceType} #${action.sourceId}: ${action.status} \u2192 ${action.action} (telegram: ${sent ? 'sent' : 'failed'})`)
      }
    }

    if (newActions.length > 0) {
      const msg = `data: ${JSON.stringify({ type: 'actions', actions: newActions })}\n\n`
      sseClients.forEach(c => c.write(msg))
    }

    if (state.actions.length > 500) {
      state.actions = state.actions.slice(-500)
    }

    saveNotifState(state)
  } catch (err) {
    console.error('[notify] scan error:', err.message)
  }
}

async function callMcp(tool, args = {}) {
  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: tool, arguments: args } }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) {
    const text = await res.text()
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue
      try {
        const d = JSON.parse(line.slice(5).trim())
        if (d.result !== undefined) return unpackMcp(d.result)
      } catch {}
    }
    throw new Error('No result in SSE stream')
  }
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return unpackMcp(data.result)
}


function normalizeAssetUri(value) {
  const trimmed = String(value || '').trim()
  return trimmed.startsWith('ipfs://') || trimmed.startsWith('https://') || trimmed.startsWith('http://')
    ? trimmed
    : ''
}

function unpackMcp(result) {
  if (!result) return result
  if (result.content && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.type === 'text') { try { return JSON.parse(item.text) } catch { return item.text } }
    }
  }
  return result
}

const PIPELINE_META = {
  'intake.lobster.yaml':      { desc: 'fetch -> extract -> analyze -> approve', status: 'active' },
  'creative.lobster.yaml':    { desc: 'research -> draft -> review -> approve',  status: 'ready'  },
  'development.lobster.yaml': { desc: 'plan -> implement -> review -> approve',  status: 'ready'  },
  'research.lobster.yaml':    { desc: 'gather -> analyze -> approve',            status: 'ready'  },
  'analysis.lobster.yaml':    { desc: 'audit -> report -> approve',              status: 'ready'  },
}

app.get('/health', (_, res) => res.json({ ok: true, endpoint: MCP_ENDPOINT }))

// ── ENS reverse lookup proxy (avoids browser CORS / rate-limits) ──────────────
app.get('/api/ens/:address', async (req, res) => {
  const address = req.params.address.toLowerCase()
  // ensideas
  try {
    const r = await fetch(`https://api.ensideas.com/ens/resolve/${address}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (r.ok) {
      const d = await r.json()
      if (d?.name) return res.json({ name: d.name })
    }
  } catch {}
  // web3.bio fallback
  try {
    const r = await fetch(`https://api.web3.bio/profile/${address}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (r.ok) {
      const d = await r.json()
      if (Array.isArray(d)) {
        const ens = d.find(p => p.platform === 'ENS')
        if (ens?.identity) return res.json({ name: ens.identity })
      }
    }
  } catch {}
  res.json({ name: null })
})

app.get('/api/agent', (_, res) => res.json({
  ens:   process.env.ENS_SUBDOMAIN || null,
  chain: 'Base Sepolia',
  infra: 'GitHub Actions + Render',
}))


const AGI_JOB_MANAGER_CONTRACT = (process.env.AGI_JOB_MANAGER_CONTRACT || '0xB3AAeb69b630f0299791679c063d68d6687481d1').toLowerCase()

function readNumericCandidate(value) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value)
  if (typeof value === 'object') {
    for (const key of ['reputation', 'score', 'value', 'agentReputation', 'agent_score']) {
      const parsed = readNumericCandidate(value[key])
      if (parsed != null) return parsed
    }
  }
  return null
}

async function lookupReputationViaMcp(address) {
  const candidates = [
    ['get_agent_reputation', { agent: address }],
    ['get_agent_reputation', { address }],
    ['get_reputation', { agent: address }],
    ['get_reputation', { address }],
    ['agent_reputation', { address }],
    ['get_agent_profile', { address }],
  ]

  for (const [tool, args] of candidates) {
    try {
      const data = await callMcp(tool, args)
      const parsed = readNumericCandidate(data)
      if (parsed != null) return { reputation: parsed, source: `mcp:${tool}` }
    } catch {}
  }

  return null
}



app.get('/api/agent-reputation/:address', async (req, res) => {
  const address = String(req.params.address || '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'invalid address' })
  }

  try {
    const mcpValue = await lookupReputationViaMcp(address)
    if (mcpValue) {
      return res.json({
        reputation: mcpValue.reputation,
        source: mcpValue.source,
        contract: AGI_JOB_MANAGER_CONTRACT,
      })
    }

    const jobs = await callMcp('list_jobs')
    const list = Array.isArray(jobs) ? jobs : jobs?.jobs || jobs?.result || []
    const mine = list.filter(j => String(j?.assignedAgent || '').toLowerCase() === address)
    const completed = mine.filter(j => j?.status === 'Completed').length
    const disputed = mine.filter(j => j?.status === 'Disputed').length
    const assigned = mine.filter(j => j?.status === 'Assigned').length

    return res.json({
      reputation: completed - disputed,
      source: 'derived:list_jobs',
      contract: AGI_JOB_MANAGER_CONTRACT,
      breakdown: { completed, disputed, assigned },
    })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to read agent reputation' })
  }
})

// ── Debug: raw MCP response ───────────────────────────────────────────────────
app.get('/api/debug-mcp', async (req, res) => {
  try {
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_jobs', arguments: {} } }),
      signal: AbortSignal.timeout(20000),
    })
    const ct = response.headers.get('content-type') || ''
    const text = await response.text()
    res.json({ status: response.status, contentType: ct, body: text.slice(0, 2000) })
  } catch (e) {
    res.json({ error: e.message })
  }
})

// ── Real jobs from AGI Alpha ──────────────────────────────────────────────────
app.get('/api/jobs', async (req, res) => {
  try {
    const managerData = await callMcp('list_jobs')
    const managerJobs = (Array.isArray(managerData) ? managerData : managerData?.jobs || managerData?.result || []).map(job => ({
      ...job,
      source: 'agijobmanager',
    }))

    const primeToolCandidates = [
      'list_prime_jobs',
      'list_prime_procurements',
      'list_procurements',
      'list_discovery_jobs',
      'list_prime_discovery_jobs',
    ]

    let primeJobs = []
    for (const tool of primeToolCandidates) {
      try {
        const primeData = await callMcp(tool)
        const primeList = Array.isArray(primeData) ? primeData : primeData?.jobs || primeData?.procurements || primeData?.result || []
        if (!Array.isArray(primeList) || !primeList.length) continue

        primeJobs = primeList.map((entry, i) => {
          const procurementId = entry?.procurementId ?? entry?.id ?? entry?.procurement_id ?? i
          const jobId = entry?.jobId ?? entry?.job_id ?? `P-${procurementId}`
          return {
            ...entry,
            source: 'agiprimediscovery',
            procurementId: String(procurementId),
            jobId: String(jobId),
            status: entry?.status || entry?.phase || entry?.stage || 'Prime',
            payout: entry?.payout ?? entry?.payoutAGIALPHA ?? '—',
            specURI: entry?.specURI || entry?.applicationURI || entry?.uri || '',
          }
        })
        break
      } catch {}
    }

    res.json([...managerJobs, ...primeJobs])
  } catch (e) {
    console.error('MCP list_jobs failed:', e.message)
    res.json([])
  }
})

// ── Pipelines ─────────────────────────────────────────────────────────────────
app.get('/api/pipelines', (req, res) => {
  try {
    const files = readdirSync(PIPELINES_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.lobster'))
    res.json(files.map(name => ({
      name,
      desc:   PIPELINE_META[name]?.desc   || 'custom pipeline',
      status: PIPELINE_META[name]?.status || 'ready',
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Job completion metadata via MCP ──────────────────────────────────────────
app.get('/api/job-metadata/:jobId', async (req, res) => {
  try {
    const type = req.query.type === 'spec' ? 'spec' : 'completion'
    const data = await callMcp('fetch_job_metadata', { jobId: Number(req.params.jobId), type })
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Job spec via MCP ──────────────────────────────────────────────────────────
app.get('/api/job-spec/:jobId', async (req, res) => {
  try {
    const data = await callMcp('get_job', { jobId: Number(req.params.jobId) })
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/job-requests', async (req, res) => {
  try {
    const payload = {
      title: req.body?.title || 'Untitled job request',
      duration: req.body?.duration || '1d',
      payoutAGIALPHA: Number(req.body?.payoutAGIALPHA || 0),
      brief: req.body?.brief || '',
      ipfsUri: normalizeAssetUri(req.body?.ipfsUri),
      image: normalizeAssetUri(req.body?.image) || normalizeAssetUri(req.body?.ipfsUri),
    }
    const richPayload = {
      ...payload,
      summary: req.body?.summary || '',
      category: req.body?.category || 'other',
      locale: req.body?.locale || 'en-US',
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      deliverables: Array.isArray(req.body?.deliverables) ? req.body.deliverables : [],
      acceptanceCriteria: Array.isArray(req.body?.acceptanceCriteria) ? req.body.acceptanceCriteria : [],
      requirements: Array.isArray(req.body?.requirements) ? req.body.requirements : [],
      chainId: Number(req.body?.chainId || 1),
      contract: String(req.body?.contract || '').trim(),
      ...(req.body?.createdBy ? { createdBy: String(req.body.createdBy).trim() } : {}),
      ...(req.body?.spec && typeof req.body.spec === 'object' ? { spec: req.body.spec } : {}),
    }

    const candidates = [
      ['request_job', richPayload],
      ['create_job', richPayload],
      ['post_job_request', richPayload],
      ['request_job', payload],
      ['create_job', payload],
      ['post_job_request', payload],
    ]

    let lastErr = null
    for (const [tool, args] of candidates) {
      try {
        const data = await callMcp(tool, args)
        return res.json({ ok: true, tool, ...(typeof data === 'object' ? data : { result: data }) })
      } catch (e) {
        lastErr = e
      }
    }

    res.status(501).json({
      error: 'No MCP job request tool available. Generated payload is still ready for manual posting.',
      generated: payload,
      reason: lastErr?.message || 'unsupported',
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// ── Test jobs — scan tests/**/job_spec.json ───────────────────────────────────
function findTestJobs() {
  if (!existsSync(TESTS_DIR)) return []
  const jobs = []
  for (const folder of readdirSync(TESTS_DIR)) {
    const specPath = resolve(TESTS_DIR, folder, 'job_spec.json')
    if (!existsSync(specPath)) continue
    try {
      const data = JSON.parse(readFileSync(specPath, 'utf8'))
      jobs.push({
        file:     `${folder}/job_spec.json`,
        folder,
        title:    data.properties?.title    || data.name || folder,
        category: data.properties?.category || '-',
        payout:   data.properties?.payoutAGIALPHA || '?',
        summary:  data.properties?.summary  || '',
        tags:     data.properties?.tags     || [],
      })
    } catch {}
  }
  return jobs
}

app.get('/api/test-jobs', (req, res) => {
  try { res.json(findTestJobs()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/test-jobs/:folder/:file', (req, res) => {
  try {
    const specPath = resolve(TESTS_DIR, req.params.folder, req.params.file)
    res.json(JSON.parse(readFileSync(specPath, 'utf8')))
  } catch (e) { res.status(404).json({ error: 'not found' }) }
})

// Keep old flat route for backwards compat
app.get('/api/test-jobs/:file', (req, res) => {
  try {
    const specPath = resolve(TESTS_DIR, req.params.file)
    res.json(JSON.parse(readFileSync(specPath, 'utf8')))
  } catch (e) { res.status(404).json({ error: 'not found' }) }
})

const sseClients = new Set()

app.get('/api/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

app.post('/api/event', (req, res) => {
  const msg = `data: ${JSON.stringify(req.body)}\n\n`
  sseClients.forEach(c => c.write(msg))
  res.json({ ok: true })
})

app.post('/api/test-run', (req, res) => {
  const { jobFile, pipeline } = req.body
  const pipelinePath = `${PIPELINES_DIR}/${pipeline || 'test-flow.yaml'}`
  const jobPath      = `${TESTS_DIR}/${jobFile}`

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)

  send('start', { pipeline, jobFile, ts: new Date().toISOString() })

  const proc = spawn('lobster', ['run', pipelinePath, '--json-input', jobPath], {
    cwd: '/home/ubuntu/.openclaw/workspace',
    env: { ...process.env, CANVAS_URL: 'http://100.104.194.128:3001' },
  })

  let buf = ''

  proc.stdout.on('data', chunk => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const p = JSON.parse(line)
        send('step', { step: p.step || p.id || '?', tool: p.tool || p.command || '?', status: p.status || 'ok', result: p.result || p.output || '' })
      } catch {
        send('stream', { text: line, ts: new Date().toISOString() })
      }
    }
  })

  proc.stderr.on('data', chunk => {
    chunk.toString().split('\n').filter(Boolean).forEach(line =>
      send('stream', { text: line, level: 'stderr', ts: new Date().toISOString() })
    )
  })

  proc.on('close', code => { send('done',  { code, ts: new Date().toISOString() }); res.end() })
  proc.on('error', err  => { send('error', { message: err.message });               res.end() })
  req.on('close',  ()   => proc.kill())
})

// ── Actions / Notifications API ───────────────────────────────────────────────

app.get('/api/actions', (req, res) => {
  const state = loadNotifState()
  const filter = req.query.filter
  let actions = state.actions

  if (filter === 'urgent') {
    actions = actions.filter(a => a.urgency === 'urgent' && !state.dismissed[a.id])
  } else if (filter === 'pending') {
    actions = actions.filter(a => !state.dismissed[a.id])
  } else if (filter === 'dismissed') {
    actions = actions.filter(a => state.dismissed[a.id])
  } else {
    actions = actions.filter(a => !state.dismissed[a.id])
  }

  res.json({
    actions: actions.reverse(),
    total: state.actions.length,
    dismissed: Object.keys(state.dismissed).length,
    lastScanAt: state.lastScanAt,
  })
})

app.post('/api/actions/:id/dismiss', (req, res) => {
  const state = loadNotifState()
  const id = req.params.id
  if (!state.actions.find(a => a.id === id)) {
    return res.status(404).json({ error: 'action not found' })
  }
  state.dismissed[id] = { dismissedAt: new Date().toISOString() }
  saveNotifState(state)
  res.json({ ok: true, dismissed: id })
})

// ── Start notification scanner (after sseClients is available) ────────────────
const SCAN_INTERVAL_MS = 30_000
console.log('[notify] starting scanner (interval: ' + (SCAN_INTERVAL_MS / 1000) + 's)')
scanAndNotify()
setInterval(scanAndNotify, SCAN_INTERVAL_MS)

// ── Serve React frontend (production build) ───────────────────────────────────
const DIST = resolve(__dirname, 'dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('/{*path}', (req, res) => res.sendFile(resolve(DIST, 'index.html')))
}

const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'
app.listen(PORT, HOST, () => console.log(`MC running on ${HOST}:${PORT}`))
