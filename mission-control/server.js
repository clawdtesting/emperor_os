import express from 'express'
import cors from 'cors'
import { spawn } from 'child_process'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'

const app = express()
app.use(cors())
app.use(express.json())

const __dirname     = dirname(fileURLToPath(import.meta.url))
const MCP_ENDPOINT  = process.env.AGI_ALPHA_MCP || 'https://agialpha.com/api/mcp'
const PIPELINES_DIR = '/home/ubuntu/.openclaw/workspace/pipelines'
const TESTS_DIR     = resolve(__dirname, '..', 'tests')

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

// ── Serve React frontend (production build) ───────────────────────────────────
const DIST = resolve(__dirname, 'dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('/{*path}', (req, res) => res.sendFile(resolve(DIST, 'index.html')))
}

const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'
app.listen(PORT, HOST, () => console.log(`MC running on ${HOST}:${PORT}`))
