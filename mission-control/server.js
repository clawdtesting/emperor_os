import express from 'express'
import cors from 'cors'
import { spawn } from 'child_process'
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, renameSync, unlinkSync } from 'fs'
import { dirname, resolve, join } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { tmpdir } from 'os'

const app = express()
app.use(cors())
app.use(express.json())

const __dirname     = dirname(fileURLToPath(import.meta.url))
const MCP_ENDPOINT  = process.env.AGI_ALPHA_MCP || 'https://agialpha.com/api/mcp'
const WORKSPACE_ROOT = resolve(__dirname, '..')
const PIPELINES_DIR = join(WORKSPACE_ROOT, 'pipelines')
const TESTS_DIR     = resolve(__dirname, '..', 'tests')
const GITHUB_OWNER  = process.env.GITHUB_REPO_OWNER || 'clawdtesting'
const GITHUB_REPO   = process.env.GITHUB_REPO_NAME || 'emperor_os_clean'
const GITHUB_TOKEN  = String(
  process.env.GITHUB_TOKEN
  || process.env.GH_TOKEN
  || process.env.GITHUB_PAT
  || ''
).trim()

function githubHeaders(withAuth = true) {
  return {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(withAuth && GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  }
}

async function githubFetch(path, { allowAnonymousFallback = true } = {}) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`
  let usedAuth = Boolean(GITHUB_TOKEN)
  let res = await fetch(url, {
    headers: githubHeaders(true),
    signal: AbortSignal.timeout(10000),
  })

  if (
    usedAuth
    && allowAnonymousFallback
    && (res.status === 401 || res.status === 403)
  ) {
    res = await fetch(url, {
      headers: githubHeaders(false),
      signal: AbortSignal.timeout(10000),
    })
    usedAuth = false
  }

  if (!res.ok) {
    const body = await res.text()
    const err = new Error(`GitHub API HTTP ${res.status}: ${body.slice(0, 200)}`)
    err.status = res.status
    err.usedAuth = usedAuth
    throw err
  }

  return { data: await res.json(), usedAuth }
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

app.get('/api/github/workflows', async (req, res) => {
  try {
    const { data } = await githubFetch('/actions/workflows?per_page=100')
    const workflows = Array.isArray(data?.workflows) ? data.workflows : []
    const withRuns = await Promise.all(workflows.map(async wf => {
      try {
        const runRes = await githubFetch(`/actions/workflows/${wf.id}/runs?per_page=1`)
        return { ...wf, latestRun: runRes.data?.workflow_runs?.[0] || null }
      } catch {
        return { ...wf, latestRun: null }
      }
    }))
    return res.json({
      workflows: withRuns,
      repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    })
  } catch (e) {
    const status = Number(e?.status || 500)
    if ((status === 401 || status === 403) && GITHUB_TOKEN) {
      return res.status(502).json({
        error: 'GitHub token rejected (expired or missing scope) — regenerate with workflow scope',
      })
    }
    return res.status(500).json({ error: e.message || 'Failed loading GitHub workflows' })
  }
})


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
    if (!existsSync(PIPELINES_DIR)) return res.json([])
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

// ── Intake pipeline runner (for real MCP jobs) ───────────────────────────────
app.post('/api/intake-run', (req, res) => {
  const { jobId, job } = req.body || {}
  if (!job || typeof job !== 'object') {
    return res.status(400).json({ error: 'job payload required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)

  const safeJobId = String(jobId || job.jobId || Date.now()).replace(/[^a-z0-9_-]/gi, '_')
  const tmpFile = join(tmpdir(), `intake-job-${safeJobId}.json`)

  // Find intake pipeline
  let pipelinePath = null
  if (existsSync(PIPELINES_DIR)) {
    const files = readdirSync(PIPELINES_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.lobster'))
    const intakeFile = files.find(f => f.toLowerCase().includes('intake')) || files[0] || null
    if (intakeFile) pipelinePath = join(PIPELINES_DIR, intakeFile)
  }

  if (!pipelinePath) {
    send('error', { message: 'No pipeline found in pipelines/. Add intake.lobster.yaml to enable autonomous intake.' })
    res.end()
    return
  }

  try {
    writeFileSync(tmpFile, JSON.stringify(job, null, 2))
  } catch (e) {
    send('error', { message: `Failed to write tmp job spec: ${e.message}` })
    res.end()
    return
  }

  send('start', { pipeline: pipelinePath, jobId: safeJobId, ts: new Date().toISOString() })

  const proc = spawn('lobster', ['run', pipelinePath, '--json-input', tmpFile], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env },
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

  proc.on('error', err => {
    const msg = err.code === 'ENOENT'
      ? 'lobster not found in PATH. Install lobster to enable pipeline execution.'
      : err.message
    send('error', { message: msg })
    try { unlinkSync(tmpFile) } catch {}
    res.end()
  })

  proc.on('close', code => {
    send('done', { code, ts: new Date().toISOString() })
    try { unlinkSync(tmpFile) } catch {}
    res.end()
  })

  req.on('close', () => {
    proc.kill()
    try { unlinkSync(tmpFile) } catch {}
  })
})

// ── Operations Lane ───────────────────────────────────────────────────────────

function classifyLifecycleStage(status) {
  const s = (status || '').toLowerCase()
  if (['commit_ready', 'reveal_ready', 'finalist_accept_ready', 'trial_ready', 'completion_ready', 'ready_for_signature'].includes(s)) return 'ready_for_signature'
  if (['awaiting_finalization', 'in_progress', 'assigned'].includes(s)) return 'awaiting_finalization'
  if (['completed', 'done', 'finalized', 'selected'].includes(s)) return 'finalized'
  return 'idle'
}

app.get('/api/operations-lane', async (req, res) => {
  try {
    const procurements = []
    if (existsSync(PROC_ARTIFACTS_DIR)) {
      const dirs = readdirSync(PROC_ARTIFACTS_DIR).filter(d => d.startsWith('proc_') && statSync(join(PROC_ARTIFACTS_DIR, d)).isDirectory())
      for (const dir of dirs) {
        const state = readJsonSafe(join(PROC_ARTIFACTS_DIR, dir, 'state.json'), null)
        const nextAction = readJsonSafe(join(PROC_ARTIFACTS_DIR, dir, 'next_action.json'), null)
        if (!state) continue
        const procId = dir.replace('proc_', '')
        procurements.push({
          procurementId: procId,
          status: state.status || 'unknown',
          phase: state.phase || '',
          employer: state.employer || null,
          linkedJobId: state.linkedJobId || null,
          nextAction: nextAction?.action || null,
          txPackages: (state.txPackages || []).map(p => ({
            file: p.file || 'unknown',
            ageMin: p.ageMin ?? 0,
            expired: p.expired ?? false,
            fresh: p.fresh ?? false,
          })),
          receipts: (state.receipts || []).map(r => ({
            action: r.action || '',
            txHash: r.txHash || '',
            status: r.status || '',
            finalizedAt: r.finalizedAt || null,
          })),
          deadlines: state.deadlines || null,
          lifecycleStage: classifyLifecycleStage(state.status),
          updatedAt: state.lastChainSync || state.updatedAt || null,
        })
      }
    }

    const jobs = []
    if (existsSync(AGENT_STATE_DIR)) {
      const files = readdirSync(AGENT_STATE_DIR).filter(f => f.endsWith('.json'))
      for (const file of files) {
        const state = readJsonSafe(join(AGENT_STATE_DIR, file), null)
        if (!state) continue
        const jobId = state.jobId || file.replace('.json', '')
        jobs.push({
          jobId,
          status: state.status || 'unknown',
          txPackages: (state.txPackages || []).map(p => ({
            file: p.file || 'unknown',
            ageMin: p.ageMin ?? 0,
            expired: p.expired ?? false,
            fresh: p.fresh ?? false,
          })),
          receipts: (state.receipts || []).map(r => ({
            action: r.action || '',
            txHash: r.txHash || '',
            status: r.status || '',
            finalizedAt: r.finalizedAt || null,
          })),
          lifecycleStage: classifyLifecycleStage(state.status),
          updatedAt: state.updatedAt || state.lastSync || null,
        })
      }
    }

    res.json({
      procurements,
      jobs,
      scannedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[ops-lane] error:', e.message)
    res.status(500).json({ error: e.message })
  }
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

// ── GitHub API proxy helpers ──────────────────────────────────────────────────

function ghHeaders(extra = {}) {
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  }
  if (GITHUB_TOKEN) h.Authorization = `Bearer ${GITHUB_TOKEN}`
  return h
}

async function ghGet(path) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: ghHeaders(),
    signal: AbortSignal.timeout(12000),
  })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    const err = new Error(`GitHub API ${r.status}`)
    err.status = r.status
    err.body = txt.slice(0, 400)
    err.noToken = !GITHUB_TOKEN
    throw err
  }
  return r.json()
}

function ghErrResponse(e) {
  if (e.status === 401 || e.status === 403) {
    return {
      error: e.noToken
        ? 'GitHub token not configured — set GITHUB_TOKEN in server env'
        : 'GitHub token rejected (expired or missing scope) — regenerate with workflow scope',
      noToken: e.noToken,
      needsToken: true,
      status: e.status,
    }
  }
  return { error: e.body || e.message }
}

// ── GitHub Actions — full workflow list with latest run per workflow ───────────
app.get('/api/github/workflows', async (req, res) => {
  try {
    const data = await ghGet(`/repos/${GH_REPO}/actions/workflows?per_page=100`)
    const workflows = Array.isArray(data?.workflows) ? data.workflows : []

    const withRuns = await Promise.all(
      workflows.map(async wf => {
        try {
          const runData = await ghGet(`/repos/${GH_REPO}/actions/workflows/${wf.id}/runs?per_page=1`)
          return { ...wf, latestRun: runData?.workflow_runs?.[0] || null }
        } catch {
          return { ...wf, latestRun: null }
        }
      })
    )

    res.json({ workflows: withRuns, fetchedAt: new Date().toISOString(), hasToken: Boolean(GITHUB_TOKEN) })
  } catch (e) {
    const status = e.status === 401 || e.status === 403 ? e.status : 500
    res.status(status).json(ghErrResponse(e))
  }
})

// ── GitHub Actions — recent runs for a specific workflow ──────────────────────
app.get('/api/workflow-runs/:workflow', async (req, res) => {
  const perPage = Math.min(Number(req.query.per_page) || 10, 30)
  try {
    const data = await ghGet(
      `/repos/${GH_REPO}/actions/workflows/${encodeURIComponent(req.params.workflow)}/runs?per_page=${perPage}`
    )
    res.json(data)
  } catch (e) {
    const status = e.status === 401 || e.status === 403 ? e.status : 500
    res.status(status).json(ghErrResponse(e))
  }
})

// ── GitHub Actions — workflow dispatch ───────────────────────────────────────
app.post('/api/workflow-dispatch', async (req, res) => {
  const { workflow, ref = 'main', inputs = {} } = req.body || {}
  if (!workflow) return res.status(400).json({ error: 'workflow required' })
  if (!GITHUB_TOKEN) {
    return res.status(401).json({
      error: 'GitHub token not configured — set GITHUB_TOKEN in server env',
      noToken: true,
      needsToken: true,
    })
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: ghHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ref, inputs }),
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      const err = new Error(`GitHub API ${r.status}`)
      err.status = r.status
      err.body = txt.slice(0, 400)
      err.noToken = false
      return res.status(r.status).json(ghErrResponse(err))
    }
    res.json({ ok: true, workflow, ref, inputs })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Serve React frontend (production build) ───────────────────────────────────
const DIST = resolve(__dirname, 'dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('/{*path}', (req, res) => res.sendFile(resolve(DIST, 'index.html')))
}

const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'
app.listen(PORT, HOST, () => console.log(`MC running on ${HOST}:${PORT}`))
