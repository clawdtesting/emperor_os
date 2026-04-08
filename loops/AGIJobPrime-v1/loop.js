// loops/AGIJobPrime-v1/loop.js
// AGIJobDiscoveryPrime commit-reveal application flow for Emperor_OS
//
// Handles: discover → evaluate → commit → reveal → acceptFinalist → submitTrial
//
// Env vars required:
//   AGENT_PRIVATE_KEY      wallet private key
//   ETH_RPC_URL            Ethereum HTTP RPC endpoint
//   ANTHROPIC_API_KEY      Claude API key
//   PINATA_JWT             Pinata JWT for IPFS pinning
//   AGENT_SUBDOMAIN        e.g. emperor-os.alpha.agent.agi.eth
//   AGENT_MERKLE_PROOF     JSON array string of bytes32 proof elements
//   AGI_ALPHA_MCP          AGI Alpha MCP endpoint (for job spec fetch)

import { ethers } from 'ethers'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Constants ─────────────────────────────────────────────────────────────────

const __dir  = dirname(fileURLToPath(import.meta.url))
const DATA_DIR   = join(__dir, 'data')
const STATE_FILE = join(DATA_DIR, 'procurement_state.json')

const CONTRACT2 = '0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29'
const CONTRACT1 = '0xB3AAeb69b630f0299791679c063d68d6687481d1'
const MODEL     = 'claude-sonnet-4-20250514'
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 120_000)
const CLAUDE_LONG_TIMEOUT_MS = Number(process.env.CLAUDE_LONG_TIMEOUT_MS || 240_000)
const POLL_MS   = 60_000
const LOG_RANGE = 2000   // max blocks to scan per poll for new events

// ── ABI ───────────────────────────────────────────────────────────────────────

const ABI2 = [
  'function commitApplication(uint256 procurementId, bytes32 commitment, string subdomain, bytes32[] proof) external',
  'function revealApplication(uint256 procurementId, string subdomain, bytes32[] proof, bytes32 salt, string applicationURI) external',
  'function acceptFinalist(uint256 procurementId) external',
  'function submitTrial(uint256 procurementId, string trialURI) external',
  'function procurements(uint256 procurementId) external view returns (uint256 jobId, address employer, uint256 commitDeadline, uint256 revealDeadline, uint256 finalistAcceptDeadline, uint256 trialDeadline, uint256 scoreCommitDeadline, uint256 scoreRevealDeadline)',
  'function applicationView(uint256 procurementId, address agent) external view returns (uint8 phase, string applicationURI, bytes32 commitment, bool shortlisted)',
  'event ProcurementCreated(uint256 indexed procurementId, uint256 indexed jobId, address indexed employer)',
  'event ShortlistFinalized(uint256 indexed procurementId, address[] finalists)',
]

// ── Lazy ethers instances ─────────────────────────────────────────────────────

let _provider = null
let _wallet   = null
let _contract = null

function provider() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL)
  return _provider
}

function wallet() {
  if (!_wallet) _wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider())
  return _wallet
}

function contract() {
  if (!_contract) _contract = new ethers.Contract(CONTRACT2, ABI2, wallet())
  return _contract
}

// ── State ─────────────────────────────────────────────────────────────────────

function loadState() {
  try {
    if (!existsSync(STATE_FILE)) return emptyState()
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch (e) {
    log(`state load failed: ${e.message} — starting fresh`)
    return emptyState()
  }
}

function emptyState() {
  return {
    pending_reveals:       [],
    pending_trials:        [],
    seen_procurements:     [],
    lastProcurementBlock:  0,
    lastShortlistBlock:    0,
  }
}

function saveState(state) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  } catch (e) {
    log(`state save failed: ${e.message}`)
  }
}

// ── Pinata ────────────────────────────────────────────────────────────────────

async function pinMarkdown(content, filename) {
  const form = new FormData()
  form.append('file', new Blob([content], { type: 'text/markdown' }), filename)
  form.append('pinataMetadata', JSON.stringify({ name: filename }))

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method:  'POST',
    headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
    body:    form,
    signal:  AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`Pinata ${res.status}: ${await res.text()}`)
  const { IpfsHash } = await res.json()
  return `ipfs://${IpfsHash}`
}

async function pinWithRetry(content, filename) {
  try {
    return await pinMarkdown(content, filename)
  } catch (e) {
    log(`Pinata failed, retrying in 5s: ${e.message}`)
    await sleep(5000)
    return await pinMarkdown(content, filename)
  }
}

// ── Claude ────────────────────────────────────────────────────────────────────

async function claudeChat(system, user, maxTokens = 4096, timeoutMs = CLAUDE_TIMEOUT_MS) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('empty Anthropic response')
  return text.trim()
}

async function evaluateAndDraft(specContent, agentAddress) {
  const system = `You are Emperor_OS, an autonomous AI agent participating in the AGIJobManager marketplace on Ethereum. You evaluate job specs and, when suitable, draft the application — all in a single response to minimise API calls.`
  const user   = `Job spec:\n\n${specContent}\n\nAgent address: ${agentAddress}\n\nDecide whether Emperor_OS should apply, then draft the application if yes.\n\nRespond in this exact format:\n\n\`\`\`json\n{"shouldApply": true_or_false, "reason": "one sentence"}\n\`\`\`\n\nIf shouldApply is true, write the complete application document in Markdown immediately after the JSON block. Cover: who Emperor_OS is, why it suits this job, proposed approach, estimated timeline. Be specific, no filler.\n\nIf shouldApply is false, stop after the JSON block.`

  const raw      = await claudeChat(system, user, 4352)
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/)
  if (!jsonMatch) throw new Error('evaluateAndDraft: missing JSON block in response')

  const decision = JSON.parse(jsonMatch[1].trim())
  if (!decision.shouldApply) return { shouldApply: false, reason: decision.reason, application: null }

  const application = raw.slice(jsonMatch.index + jsonMatch[0].length).trim()
  if (!application) throw new Error('evaluateAndDraft: shouldApply=true but application body is empty')

  return { shouldApply: true, reason: decision.reason, application }
}

async function draftTrial(specContent, agentAddress) {
  const system = `You are Emperor_OS, an autonomous AI agent delivering paid work on the AGIJobManager marketplace. Produce the actual deliverable described in the job spec — not an application, but the real work product.`
  const user   = `Job spec:\n\n${specContent}\n\nAgent address: ${agentAddress}\n\nProduce the complete deliverable described in the job spec. Follow every acceptance criterion. Output clean Markdown.`

  return await claudeChat(system, user, 8192, CLAUDE_LONG_TIMEOUT_MS)
}

async function draftTrialWithRetry(specContent, agentAddress, retries = 2) {
  let lastError
  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) log(`Retrying draftTrial (${i}/${retries})...`)
      return await draftTrial(specContent, agentAddress)
    } catch (e) {
      lastError = e
      if (i === retries) break
      const timedOut = e?.name === 'TimeoutError' || /aborted due to timeout/i.test(String(e?.message))
      if (!timedOut) break
      await sleep(3000)
    }
  }
  throw lastError
}

// ── MCP (job spec fetch) ──────────────────────────────────────────────────────

async function fetchJobSpec(jobId) {
  const endpoint = process.env.AGI_ALPHA_MCP
  if (!endpoint) { log('AGI_ALPHA_MCP not set — cannot fetch spec'); return null }

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'fetch_job_metadata', arguments: { jobId: Number(jobId), type: 'spec' } } }),
    signal:  AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`)

  const contentType = res.headers.get('content-type') || ''
  const text        = await res.text()

  let result = null
  if (contentType.includes('text/event-stream')) {
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue
      try {
        const d = JSON.parse(line.slice(5).trim())
        if (d.result !== undefined) { result = unpackMcp(d.result); break }
      } catch {}
    }
  } else {
    const d = JSON.parse(text)
    if (d.error) throw new Error(d.error.message)
    result = unpackMcp(d.result)
  }

  if (!result) return null
  return typeof result === 'string' ? result : JSON.stringify(result)
}

function unpackMcp(result) {
  if (!result) return null
  if (result.content && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.type === 'text') {
        try { return JSON.stringify(JSON.parse(item.text), null, 2) } catch { return item.text }
      }
    }
  }
  return typeof result === 'string' ? result : JSON.stringify(result)
}

// ── IPFS fetch ────────────────────────────────────────────────────────────────

async function fetchIpfs(uri) {
  const url = uri.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`IPFS ${res.status}: ${uri}`)
  return await res.text()
}

// ── Commit hash ───────────────────────────────────────────────────────────────

function computeCommitment(procurementId, agentAddress, applicationURI, salt) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['uint256', 'address', 'string', 'bytes32'],
      [BigInt(procurementId), agentAddress, applicationURI, salt]
    )
  )
}

// ── Action: new procurement → evaluate → commit ───────────────────────────────

async function handleNewProcurement(state, procurementId, jobId) {
  try {
    log(`#${procurementId} evaluating job ${jobId}`)

    // Fetch procurement deadlines
    let commitDeadline = 0
    let revealDeadline = 0
    try {
      const p       = await contract().procurements(BigInt(procurementId))
      commitDeadline = Number(p.commitDeadline)
      revealDeadline = Number(p.revealDeadline)
    } catch (e) {
      log(`#${procurementId} could not read procurement struct: ${e.message} — skipping`)
      return
    }

    // Guard: must still be in commit window
    const now = Math.floor(Date.now() / 1000)
    if (now >= commitDeadline) {
      log(`#${procurementId} commit window already closed — skipping`)
      return
    }

    // Fetch job spec
    const specContent = await fetchJobSpec(jobId).catch(e => { log(`spec fetch failed: ${e.message}`); return null })
    if (!specContent) return

    // Evaluate and draft in one LLM call
    let result
    try {
      result = await evaluateAndDraft(specContent, wallet().address)
    } catch (e) {
      log(`#${procurementId} evaluateAndDraft error: ${e.message} — skipping`)
      return
    }

    if (!result.shouldApply) {
      log(`#${procurementId} skip — ${result.reason}`)
      notify(`⚫ Procurement #${procurementId} skipped\nJob ${jobId} — ${result.reason}`)
      state.seen_procurements.push(procurementId)
      return
    }

    log(`#${procurementId} applying — ${result.reason}`)
    notify(`🔍 Procurement #${procurementId} — applying\nJob ${jobId}: ${result.reason}`)

    const appMarkdown = result.application

    // Pin to IPFS
    const applicationURI = await pinWithRetry(appMarkdown, `application-${procurementId}.md`)
    log(`#${procurementId} pinned: ${applicationURI}`)

    // Compute commitment
    const salt       = ethers.hexlify(ethers.randomBytes(32))
    const commitment = computeCommitment(procurementId, wallet().address, applicationURI, salt)

    // Submit on-chain
    const subdomain = process.env.AGENT_SUBDOMAIN
    const proof     = JSON.parse(process.env.AGENT_MERKLE_PROOF || '[]')

    const tx = await contract().commitApplication(BigInt(procurementId), commitment, subdomain, proof)
    log(`#${procurementId} commitApplication tx: ${tx.hash}`)
    await tx.wait()
    log(`#${procurementId} commit confirmed`)
    notify(`✅ Procurement #${procurementId} — commit confirmed\n🔗 ${applicationURI}\n⛓️ ${tx.hash}`)

    state.seen_procurements.push(procurementId)
    state.pending_reveals.push({ procurementId, applicationURI, salt, commitDeadline, revealDeadline })

  } catch (e) {
    console.error(`[procurement] handleNewProcurement #${procurementId}:`, e.message)
  }
}

// ── Action: reveal phase ──────────────────────────────────────────────────────

async function checkPendingReveals(state) {
  const now      = Math.floor(Date.now() / 1000)
  const toReveal = state.pending_reveals.filter(r => now > r.commitDeadline && now < r.revealDeadline)
  if (toReveal.length === 0) return

  const subdomain = process.env.AGENT_SUBDOMAIN
  const proof     = JSON.parse(process.env.AGENT_MERKLE_PROOF || '[]')

  for (const r of toReveal) {
    try {
      log(`#${r.procurementId} revealing application`)
      const tx = await contract().revealApplication(
        BigInt(r.procurementId), subdomain, proof, r.salt, r.applicationURI
      )
      log(`#${r.procurementId} revealApplication tx: ${tx.hash}`)
      await tx.wait()
      log(`#${r.procurementId} reveal confirmed`)
      notify(`📣 Procurement #${r.procurementId} — reveal confirmed\n🔗 ${r.applicationURI}\n⛓️ ${tx.hash}`)
      state.pending_reveals = state.pending_reveals.filter(x => x.procurementId !== r.procurementId)
    } catch (e) {
      console.error(`[procurement] reveal #${r.procurementId}:`, e.message)
    }
  }
}

// ── Action: ShortlistFinalized → acceptFinalist ───────────────────────────────

async function checkShortlists(state) {
  let currentBlock
  try { currentBlock = await provider().getBlockNumber() } catch (e) { log(`getBlockNumber failed: ${e.message}`); return }

  const fromBlock = state.lastShortlistBlock > 0
    ? state.lastShortlistBlock + 1
    : Math.max(0, currentBlock - LOG_RANGE)

  if (fromBlock > currentBlock) return

  const iface  = new ethers.Interface(ABI2)
  const filter = {
    address:   CONTRACT2,
    topics:    [iface.getEvent('ShortlistFinalized').topicHash],
    fromBlock,
    toBlock:   currentBlock,
  }

  let logs = []
  try { logs = await provider().getLogs(filter) } catch (e) { log(`getLogs (shortlist) failed: ${e.message}`); return }

  const agentAddr = wallet().address.toLowerCase()

  for (const logEntry of logs) {
    try {
      const decoded       = iface.parseLog(logEntry)
      const procurementId = decoded.args[0].toString()
      const finalists     = [...decoded.args[1]].map(f => f.toLowerCase())

      if (!finalists.includes(agentAddr)) continue

      const alreadyTracked = state.pending_trials.some(t => t.procurementId === procurementId)
      if (alreadyTracked) continue

      log(`#${procurementId} Emperor_OS is a finalist!`)
      notify(`🏆 Procurement #${procurementId} — Emperor_OS is a FINALIST!\nAccepting and preparing trial...`)

      const p = await contract().procurements(BigInt(procurementId))
      const jobId = p.jobId.toString()

      const tx = await contract().acceptFinalist(BigInt(procurementId))
      log(`#${procurementId} acceptFinalist tx: ${tx.hash}`)
      await tx.wait()
      log(`#${procurementId} acceptance confirmed`)
      notify(`✅ Procurement #${procurementId} — finalist acceptance confirmed\n⛓️ ${tx.hash}`)

      // Fetch job spec URI to store for trial generation
      const specContent = await fetchJobSpec(jobId).catch(() => null)

      state.pending_trials.push({
        procurementId,
        finalistAcceptDeadline: Number(p.finalistAcceptDeadline),
        trialDeadline:          Number(p.trialDeadline),
        jobId,
        specContent: specContent || '',
      })

    } catch (e) {
      console.error(`[procurement] acceptFinalist error:`, e.message)
    }
  }

  state.lastShortlistBlock = currentBlock
}

// ── Action: submit trial ──────────────────────────────────────────────────────

async function checkPendingTrials(state) {
  const now      = Math.floor(Date.now() / 1000)
  const toTrial  = state.pending_trials.filter(t => now > t.finalistAcceptDeadline && now < t.trialDeadline)
  if (toTrial.length === 0) return

  for (const t of toTrial) {
    try {
      log(`#${t.procurementId} drafting trial for job ${t.jobId}`)

      // Re-fetch spec if we didn't capture it earlier
      let specContent = t.specContent
      if (!specContent && t.jobId) {
        specContent = await fetchJobSpec(t.jobId).catch(() => '') || ''
      }

      const trialMarkdown = await draftTrialWithRetry(specContent, wallet().address)
      const trialURI      = await pinWithRetry(trialMarkdown, `trial-${t.procurementId}.md`)
      log(`#${t.procurementId} trial pinned: ${trialURI}`)

      const tx = await contract().submitTrial(BigInt(t.procurementId), trialURI)
      log(`#${t.procurementId} submitTrial tx: ${tx.hash}`)
      await tx.wait()
      log(`#${t.procurementId} trial confirmed`)
      notify(`🚀 Procurement #${t.procurementId} — trial submitted!\nJob ${t.jobId}\n🔗 ${trialURI}\n⛓️ ${tx.hash}`)

      state.pending_trials = state.pending_trials.filter(x => x.procurementId !== t.procurementId)

    } catch (e) {
      console.error(`[procurement] trial #${t.procurementId}:`, e.message)
    }
  }
}

// ── Action: check for new ProcurementCreated events ───────────────────────────

async function checkNewProcurements(state) {
  let currentBlock
  try { currentBlock = await provider().getBlockNumber() } catch (e) { log(`getBlockNumber failed: ${e.message}`); return }

  const fromBlock = state.lastProcurementBlock > 0
    ? state.lastProcurementBlock + 1
    : Math.max(0, currentBlock - LOG_RANGE)

  if (fromBlock > currentBlock) {
    state.lastProcurementBlock = currentBlock
    return
  }

  const iface  = new ethers.Interface(ABI2)
  const filter = {
    address:   CONTRACT2,
    topics:    [iface.getEvent('ProcurementCreated').topicHash],
    fromBlock,
    toBlock:   currentBlock,
  }

  let logs = []
  try { logs = await provider().getLogs(filter) } catch (e) { log(`getLogs (procurement) failed: ${e.message}`); return }

  for (const logEntry of logs) {
    try {
      const decoded       = iface.parseLog(logEntry)
      const procurementId = decoded.args[0].toString()
      const jobId         = decoded.args[1].toString()

      if (state.seen_procurements.includes(procurementId)) continue

      await handleNewProcurement(state, procurementId, jobId)
      saveState(state)

    } catch (e) {
      console.error(`[procurement] ProcurementCreated handler:`, e.message)
    }
  }

  state.lastProcurementBlock = currentBlock
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll(state) {
  try {
    await checkNewProcurements(state)
    await checkPendingReveals(state)
    await checkShortlists(state)
    await checkPendingTrials(state)
    saveState(state)
  } catch (e) {
    console.error('[procurement] poll error:', e.message)
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

export { poll, loadState, saveState }

export function start() {
  if (!process.env.AGENT_PRIVATE_KEY) { console.error('[procurement] AGENT_PRIVATE_KEY not set'); return }
  if (!process.env.ETH_RPC_URL)       { console.error('[procurement] ETH_RPC_URL not set'); return }
  if (!process.env.ANTHROPIC_API_KEY) { console.error('[procurement] ANTHROPIC_API_KEY not set'); return }
  if (!process.env.PINATA_JWT)        { console.error('[procurement] PINATA_JWT not set'); return }
  if (!process.env.AGENT_SUBDOMAIN)   { console.error('[procurement] AGENT_SUBDOMAIN not set'); return }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

  const state = loadState()
  log(`started — ${state.pending_reveals.length} pending reveals, ${state.pending_trials.length} pending trials`)

  poll(state)
  setInterval(() => poll(state), POLL_MS)
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function log(msg)         { console.log(`[procurement] ${msg}`) }
function sleep(ms)        { return new Promise(r => setTimeout(r, ms)) }

async function notify(msg) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const chat  = (process.env.TELEGRAM_CHAT_ID   || '').trim()
  if (!token || !chat) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chat, text: msg, parse_mode: 'HTML' }),
      signal:  AbortSignal.timeout(15_000),
    })
  } catch {}
}
