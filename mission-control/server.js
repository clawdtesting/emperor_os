import express from 'express'
import cors from 'cors'
import { spawn } from 'child_process'
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, renameSync, unlinkSync } from 'fs'
import { dirname, resolve, join } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { inferJobLane, buildOperatorAction, resolvePathMaybe } from './lib/operator-actions.js'
import { buildPrimeValidatorPrechecks, buildPrimeValidatorTimeline, verifyRevealSafety } from './lib/prime-validator.js'
import { normalizeV1JobForList, resolveV1MetadataUri, buildUnsignedCreateJobTxPackage, buildUnsignedApplyJobTxPackage } from './lib/contract-first.js'
import { buildV1OperatorViewModel } from './lib/v1-operator-view.js'
import { buildAssignedJobRunner } from './lib/intake-runner.js'
import { listProviders, getPreferredProvider, setPreferredProvider } from '../agent/llm-router.js'

const app = express()
app.use(cors())
app.use(express.json())

const __dirname     = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolve(__dirname, '..')
const PIPELINES_DIR = join(WORKSPACE_ROOT, 'pipelines')
const TESTS_DIR     = resolve(__dirname, '..', 'tests')
const ARTIFACTS_DIR     = join(WORKSPACE_ROOT, 'artifacts')
const AGENT_STATE_DIR   = join(WORKSPACE_ROOT, 'agent', 'state', 'jobs')
const PROC_ARTIFACTS_DIR = join(WORKSPACE_ROOT, 'agent', 'artifacts')
const NOTIF_STATE_DIR   = resolve(__dirname, 'state')
const NOTIF_STATE_FILE  = join(NOTIF_STATE_DIR, 'notifications.json')
const NOTIF_LOG_FILE    = join(NOTIF_STATE_DIR, 'actions.log.jsonl')
const OPERATOR_TX_LOG_FILE = join(NOTIF_STATE_DIR, 'operator-action-transitions.jsonl')
const LLM_SELECTION_FILE = join(NOTIF_STATE_DIR, 'llm-selection.json')
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID
const MC_URL             = process.env.MISSION_CONTROL_URL || 'http://100.104.194.128:3000'
const GITHUB_OWNER  = process.env.GITHUB_REPO_OWNER || 'clawdtesting'
const GITHUB_REPO   = process.env.GITHUB_REPO_NAME || 'emperor_os_clean'
const GITHUB_TOKEN  = String(
  process.env.GITHUB_TOKEN
  || process.env.GH_TOKEN
  || process.env.GITHUB_PAT
  || ''
).trim()
const PINATA_JWT = String(process.env.PINATA_JWT || '').trim()
const ENABLE_TEST_MODE = String(process.env.ENABLE_TEST_MODE || '').toLowerCase() === 'true'
const AGI_JOB_MANAGER_V2 = '0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2'
const KNOWN_V2_CONTRACTS = [AGI_JOB_MANAGER_V2.toLowerCase()]
const AGI_PRIME_V2 = '0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e'
const ETH_RPC_URL = process.env.ETH_RPC_URL || process.env.RPC_URL || 'https://eth.llamarpc.com'
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
]

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

function readLlmSelection() {
  return readJsonSafe(LLM_SELECTION_FILE, {
    preferredProvider: '',
    updatedAt: null,
  })
}

function saveLlmSelection(selection) {
  const payload = {
    preferredProvider: String(selection?.preferredProvider || '').trim(),
    updatedAt: new Date().toISOString(),
  }
  atomicWriteJson(LLM_SELECTION_FILE, payload)
  return payload
}

function appendActionLog(entry) {
  appendFileSync(NOTIF_LOG_FILE, JSON.stringify(entry) + '\n')
}

function appendOperatorTransitionLog(entry) {
  appendFileSync(OPERATOR_TX_LOG_FILE, JSON.stringify({
    ...entry,
    loggedAt: new Date().toISOString(),
  }) + '\n')
}

function extractNumericJobId(rawJobId) {
  const raw = String(rawJobId || '').trim()
  if (!raw) return null
  const direct = raw.match(/^\d+$/)
  if (direct) return direct[0]
  const tail = raw.match(/(\d+)$/)
  return tail ? tail[1] : null
}

function buildFallbackValidationReport(jobId) {
  const checks = []
  const addCheck = (name, passed, detail = null) => checks.push({ name, passed, detail, checkedAt: new Date().toISOString() })

  const statePath = join(AGENT_STATE_DIR, `${jobId}.json`)
  const state = readJsonSafe(statePath, null)
  addCheck('job_state_exists', Boolean(state), state ? null : `Missing ${statePath}`)

  const status = String(state?.status || '').toLowerCase()
  const allowed = ['assigned', 'in_progress', 'deliverable_ready', 'completion_pending_review', 'completion_ready', 'submitted', 'completed', 'disputed']
  addCheck('job_status_known', Boolean(status) && allowed.includes(status), status || 'unknown')

  const artifactDir = join(ARTIFACTS_DIR, `job_${jobId}`)
  const briefPath = state?.briefPath || join(artifactDir, 'brief.json')
  const deliverablePath = state?.artifactPath || join(artifactDir, 'deliverable.md')

  const briefRaw = existsSync(briefPath) ? readFileSync(briefPath, 'utf8') : ''
  const deliverableRaw = existsSync(deliverablePath) ? readFileSync(deliverablePath, 'utf8') : ''

  addCheck('artifact_brief_exists', existsSync(briefPath), briefPath)
  addCheck('artifact_deliverable_exists', existsSync(deliverablePath), deliverablePath)
  addCheck('deliverable_nonempty', deliverableRaw.trim().length > 0, `${deliverableRaw.trim().length} chars`)
  addCheck('deliverable_has_headings', /##\s+/.test(deliverableRaw), 'Expected markdown section headings')

  let requiredSections = []
  try {
    const brief = briefRaw ? JSON.parse(briefRaw) : null
    requiredSections = Array.isArray(brief?.required_sections) ? brief.required_sections : []
  } catch {
    addCheck('brief_parseable_json', false, 'brief.json is not valid JSON')
  }

  if (requiredSections.length > 0) {
    const missing = requiredSections.filter(section => !deliverableRaw.toLowerCase().includes(String(section).toLowerCase()))
    addCheck('deliverable_includes_required_sections', missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : 'All present')
  }

  const passed = checks.filter(c => c.passed).length
  const failed = checks.length - passed
  const verdict = failed === 0 ? 'DRY_RUN_PASSED' : 'DRY_RUN_FAILED'

  return {
    schema: 'mission-control/fallback-dryrun/v1',
    jobId: String(jobId),
    generatedAt: new Date().toISOString(),
    checks,
    summary: {
      verdict,
      passed,
      failed,
      totalChecks: checks.length,
      overallPass: failed === 0,
      recommendation: failed === 0
        ? 'Fallback validation checks passed. Job appears ready for review.'
        : `${failed} fallback validation check(s) failed. Resolve issues before proceeding.`,
    },
  }
}

async function buildV2ValidationReport(jobId) {
  const checks = []
  const addCheck = (name, passed, detail = null) => checks.push({ name, passed, detail, checkedAt: new Date().toISOString() })

  const report = {
    schema: 'mission-control/v2-onchain-validation/v2-onchain-only',
    manager: 'AGIJobManager-v2',
    contract: AGI_JOB_MANAGER_V2,
    chainRpc: ETH_RPC_URL,
    jobId: String(jobId),
    generatedAt: new Date().toISOString(),
    checks,
    summary: null,
    onchain: null,
  }

  try {
    const reachable = await rpcIsReachable()
    addCheck('v2_rpc_reachable', reachable, ETH_RPC_URL)
    if (!reachable) throw new Error('RPC unreachable')

    const { ethers } = await import('ethers')
    const abiPath = join(WORKSPACE_ROOT, 'contracts', 'AGIJobManager-v2', 'AGIJobManager.v2.json')
    const abiRaw = readJsonSafe(abiPath, [])
    const abi = Array.isArray(abiRaw) ? abiRaw : (abiRaw?.abi || [])

    addCheck('v2_abi_loaded', Array.isArray(abi) && abi.length > 0, abiPath)
    if (!Array.isArray(abi) || abi.length === 0) throw new Error(`Missing or empty ABI at ${abiPath}`)

    const iface = new ethers.Interface(abi)
    addCheck('v2_has_request_job_completion', Boolean(iface.getFunction('requestJobCompletion(uint256,string)')))
    addCheck('v2_has_validate_job', Boolean(iface.getFunction('validateJob(uint256,string,bytes32[])')))

    let detectedContract = ''
    const topicJobId = ethers.zeroPadValue(ethers.toBeHex(BigInt(jobId)), 32)
    for (const contractAddr of KNOWN_V2_CONTRACTS) {
      try {
        const topic = iface.getEvent('JobCreated').topicHash
        const logs = await rpcGetLogs({ address: contractAddr, topics: [topic, topicJobId] })
        if (logs.length > 0) {
          detectedContract = contractAddr
          break
        }
      } catch {}
    }
    if (!detectedContract) detectedContract = AGI_JOB_MANAGER_V2.toLowerCase()
    report.contract = detectedContract
    addCheck('v2_contract_detected', Boolean(detectedContract), detectedContract)

    const state = await readV2JobOnchain(detectedContract, Number(jobId), iface)
    const employer = String(state?.core?.employer || '0x0000000000000000000000000000000000000000')
    const assignedAgent = String(state?.core?.assignedAgent || '0x0000000000000000000000000000000000000000')
    const payoutRaw = String(state?.core?.payoutRaw || '0')
    const specURI = String(state?.specURI || '')
    const completionURI = String(state?.completionURI || '')
    const approvals = Number(state?.validation?.approvals || 0)
    const disapprovals = Number(state?.validation?.disapprovals || 0)
    const completionRequested = Boolean(state?.validation?.completionRequested)

    addCheck('v2_job_exists_employer_nonzero', employer !== '0x0000000000000000000000000000000000000000', employer)
    addCheck('v2_job_has_payout', payoutRaw !== '0', payoutRaw)
    addCheck('v2_job_has_assigned_agent', assignedAgent !== '0x0000000000000000000000000000000000000000', assignedAgent)
    addCheck('v2_job_has_spec_uri', Boolean(specURI), specURI || '(empty)')
    addCheck('v2_completion_requested_or_uri_present', completionRequested || Boolean(completionURI), `requested=${completionRequested}, completionURI=${completionURI || '(empty)'}`)
    addCheck('v2_validation_signal_present', (approvals + disapprovals) >= 0, `${approvals} approve / ${disapprovals} disapprove`)

    report.onchain = {
      employer,
      assignedAgent,
      payoutRaw,
      payout: formatAgialpha(payoutRaw),
      status: deriveJobStatus(state?.core, state?.validation),
      durationRaw: String(state?.core?.durationRaw || '0'),
      duration: formatDurationDays(state?.core?.durationRaw || '0'),
      completed: Boolean(state?.core?.completed),
      disputed: Boolean(state?.core?.disputed),
      expired: Boolean(state?.core?.expired),
      specURI,
      completionURI,
      completionRequested,
      validatorApprovals: approvals,
      validatorDisapprovals: disapprovals,
      contract: detectedContract,
    }
  } catch (err) {
    addCheck('v2_validation_runtime_success', false, err.message)
  }

  const passed = checks.filter(c => c.passed).length
  const failed = checks.length - passed
  report.summary = {
    verdict: failed === 0 ? 'DRY_RUN_PASSED' : 'DRY_RUN_FAILED',
    passed,
    failed,
    totalChecks: checks.length,
    overallPass: failed === 0,
    recommendation: failed === 0
      ? 'V2 on-chain validation checks passed.'
      : `${failed} v2 validation check(s) failed. Review failed checks before progressing.`,
  }

  return report
}

function buildPrimeScoringValidationReport(jobId, inputJob = null) {
  const checks = []
  const addCheck = (name, passed, detail = null) => checks.push({ name, passed, detail, checkedAt: new Date().toISOString() })

  const nowSec = Math.floor(Date.now() / 1000)
  const raw = inputJob && typeof inputJob === 'object' ? inputJob : {}
  const procurementId = String(raw?.procurementId ?? extractNumericJobId(raw?.jobId ?? jobId) ?? jobId)

  const deadlines = {
    commitDeadline: normalizeTsSeconds(raw?.commitDeadline ?? raw?.deadlines?.commitDeadline),
    revealDeadline: normalizeTsSeconds(raw?.revealDeadline ?? raw?.deadlines?.revealDeadline),
    finalistAcceptDeadline: normalizeTsSeconds(raw?.finalistAcceptDeadline ?? raw?.deadlines?.finalistAcceptDeadline),
    trialDeadline: normalizeTsSeconds(raw?.trialDeadline ?? raw?.deadlines?.trialDeadline),
    scoreCommitDeadline: normalizeTsSeconds(raw?.scoreCommitDeadline ?? raw?.deadlines?.scoreCommitDeadline),
    scoreRevealDeadline: normalizeTsSeconds(raw?.scoreRevealDeadline ?? raw?.deadlines?.scoreRevealDeadline),
  }

  const rawActionCode = String(raw?.nextActionCode ?? raw?.nextAction ?? '').toUpperCase()
  const phase = decodePrimeActionPhase(rawActionCode)
  const windowStatus = inferPrimeWindowStatus(phase, deadlines, nowSec)

  addCheck('prime_procurement_id_present', Boolean(procurementId), `procurementId=${procurementId}`)
  addCheck('prime_score_commit_deadline_present', Boolean(deadlines.scoreCommitDeadline), String(deadlines.scoreCommitDeadline || 'missing'))
  addCheck('prime_score_reveal_deadline_present', Boolean(deadlines.scoreRevealDeadline), String(deadlines.scoreRevealDeadline || 'missing'))
  addCheck('prime_trial_deadline_present', Boolean(deadlines.trialDeadline), String(deadlines.trialDeadline || 'missing'))

  if (deadlines.trialDeadline && deadlines.scoreCommitDeadline && deadlines.scoreRevealDeadline) {
    const ordered = deadlines.trialDeadline <= deadlines.scoreCommitDeadline && deadlines.scoreCommitDeadline <= deadlines.scoreRevealDeadline
    addCheck('prime_score_windows_ordered', ordered, `trial=${deadlines.trialDeadline}, scoreCommit=${deadlines.scoreCommitDeadline}, scoreReveal=${deadlines.scoreRevealDeadline}`)
  } else {
    addCheck('prime_score_windows_ordered', false, 'missing one or more score/trial deadlines')
  }

  const scorePhaseKnown = ['validator_commit', 'validator_reveal'].includes(phase)
  addCheck('prime_scoring_phase_detectable', scorePhaseKnown, rawActionCode || 'missing action code')

  if (phase === 'validator_commit') {
    addCheck('prime_validator_commit_window_open', windowStatus === 'open', `window=${windowStatus}`)
    addCheck('prime_validator_not_scoring_before_trial_deadline', nowSec >= Number(deadlines.trialDeadline || 0), `now=${nowSec}, trialDeadline=${deadlines.trialDeadline || 'missing'}`)
  }

  if (phase === 'validator_reveal') {
    addCheck('prime_validator_reveal_window_open', windowStatus === 'open', `window=${windowStatus}`)
  }

  const procDir = join(PROC_ARTIFACTS_DIR, `proc_${procurementId}`)
  const scoringDir = join(procDir, 'scoring')
  const state = readJsonSafe(join(procDir, 'state.json'), null)
  const commitPayload = readJsonSafe(join(scoringDir, 'score_commit_payload.json'), null)
  const revealPayload = readJsonSafe(join(scoringDir, 'score_reveal_payload.json'), null)

  addCheck('prime_local_proc_state_exists', Boolean(state), state ? `status=${state.status || 'unknown'}` : `missing ${join(procDir, 'state.json')}`)
  addCheck('prime_local_score_commit_payload_exists', Boolean(commitPayload), commitPayload ? 'present' : `missing ${join(scoringDir, 'score_commit_payload.json')}`)
  addCheck('prime_local_score_reveal_payload_exists', Boolean(revealPayload), revealPayload ? 'present' : `missing ${join(scoringDir, 'score_reveal_payload.json')}`)

  if (commitPayload && revealPayload) {
    const sameScore = Number(commitPayload.score) === Number(revealPayload.score)
    const sameSalt = String(commitPayload.salt || '') === String(revealPayload.salt || '')
    addCheck('prime_commit_reveal_score_consistency', sameScore, `commit=${commitPayload.score}, reveal=${revealPayload.score}`)
    addCheck('prime_commit_reveal_salt_consistency', sameSalt, sameSalt ? 'match' : 'mismatch')
  }

  const passed = checks.filter(c => c.passed).length
  const failed = checks.length - passed

  return {
    schema: 'mission-control/prime-scoring-validation/v1',
    manager: 'AGIJobDiscoveryPrime',
    jobId: String(jobId),
    procurementId,
    generatedAt: new Date().toISOString(),
    checks,
    summary: {
      verdict: failed === 0 ? 'DRY_RUN_PASSED' : 'DRY_RUN_FAILED',
      passed,
      failed,
      totalChecks: checks.length,
      overallPass: failed === 0,
      recommendation: failed === 0
        ? 'Prime scoring validation checks passed.'
        : `${failed} prime scoring validation check(s) failed. Review deadlines, action code, and commit/reveal continuity before validator actions.`,
    },
    scoringContext: {
      actionCode: rawActionCode || null,
      phase,
      windowStatus,
      nowSec,
      deadlines,
      localArtifacts: {
        procDir,
        scoringDir,
      },
    },
  }
}

async function fetchIpfsJson(ipfsUri) {
  const raw = String(ipfsUri || '').trim()
  if (!raw.startsWith('ipfs://')) return { ok: false, error: 'spec URI missing or not ipfs://', source: null, data: null }
  const cid = raw.replace('ipfs://', '').split('/')[0]
  for (const gw of IPFS_GATEWAYS) {
    try {
      const res = await fetch(gw + cid, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const data = await res.json().catch(() => null)
      if (data && typeof data === 'object') return { ok: true, error: null, source: gw, data }
    } catch {}
  }
  return { ok: false, error: 'All IPFS gateways failed', source: null, data: null }
}

async function fetchIpfsPayload(ipfsUri) {
  const raw = String(ipfsUri || '').trim()
  if (!raw.startsWith('ipfs://')) return { ok: false, error: 'URI must start with ipfs://', source: null, text: '', json: null }
  const cid = raw.replace('ipfs://', '').split('/')[0]
  for (const gw of IPFS_GATEWAYS) {
    try {
      const res = await fetch(gw + cid, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) continue
      const text = await res.text()
      if (!text || !text.trim()) continue
      let json = null
      try { json = JSON.parse(text) } catch {}
      return { ok: true, error: null, source: gw, text, json }
    } catch {}
  }
  return { ok: false, error: 'All IPFS gateways failed', source: null, text: '', json: null }
}

function extractScoringTextFromPayload(payload) {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''

  const candidates = [
    payload.validatorNote,
    payload.details,
    payload.description,
    payload.summary,
    payload.content,
    payload.deliverable,
    payload.output,
    payload.report,
    payload.text,
    payload?.properties?.validatorNote,
    payload?.properties?.details,
    payload?.properties?.description,
    payload?.properties?.summary,
  ]

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c
  }

  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return ''
  }
}

function formatAgialpha(amountRaw) {
  try {
    const n = BigInt(String(amountRaw || 0))
    const whole = n / 10n**18n
    const frac = n % 10n**18n
    if (frac === 0n) return `${whole.toString()} AGIALPHA`
    const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '').slice(0, 4)
    return `${whole.toString()}.${fracStr} AGIALPHA`
  } catch {
    return '—'
  }
}

function formatDurationDays(secondsRaw) {
  try {
    const s = Number(secondsRaw)
    if (!Number.isFinite(s) || s <= 0) return '—'
    const days = Math.round((s / 86400) * 100) / 100
    return `${days} days`
  } catch {
    return '—'
  }
}

function deriveJobStatus(core, validation) {
  const zero = '0x0000000000000000000000000000000000000000'
  const assigned = String(core?.assignedAgent || zero).toLowerCase() !== zero
  if (core?.completed) return 'Completed'
  if (core?.disputed) return 'Disputed'
  if (core?.expired) return 'Expired'
  if (validation?.completionRequested) return 'CompletionRequested'
  if (assigned) return 'Assigned'
  if (core?.delisted) return 'Delisted'
  return 'Open'
}

function normalizeTsSeconds(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
}

function inferPrimeWindowStatus(phase, deadlines, nowSec = Math.floor(Date.now() / 1000)) {
  const c = normalizeTsSeconds(deadlines?.commitDeadline)
  const r = normalizeTsSeconds(deadlines?.revealDeadline)
  const fa = normalizeTsSeconds(deadlines?.finalistAcceptDeadline)
  const t = normalizeTsSeconds(deadlines?.trialDeadline)
  const sc = normalizeTsSeconds(deadlines?.scoreCommitDeadline)
  const sr = normalizeTsSeconds(deadlines?.scoreRevealDeadline)

  if (phase === 'validator_commit') {
    if (!t || !sc) return 'unknown'
    if (nowSec < t) return 'upcoming'
    return nowSec < sc ? 'open' : 'closed'
  }
  if (phase === 'validator_reveal') {
    if (!sc || !sr) return 'unknown'
    if (nowSec < sc) return 'upcoming'
    return nowSec < sr ? 'open' : 'closed'
  }
  if (phase === 'trial') {
    if (!fa || !t) return 'unknown'
    if (nowSec < fa) return 'upcoming'
    return nowSec < t ? 'open' : 'closed'
  }
  if (phase === 'commit') {
    if (!c) return 'unknown'
    return nowSec < c ? 'open' : 'closed'
  }
  if (phase === 'reveal') {
    if (!c || !r) return 'unknown'
    if (nowSec < c) return 'upcoming'
    return nowSec < r ? 'open' : 'closed'
  }
  return 'unknown'
}

function decodePrimeActionPhase(codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase()
  if (code === 'WSC') return 'validator_commit'
  if (code === 'WSR') return 'validator_reveal'
  if (code === 'WT') return 'trial'
  if (code === 'WC') return 'commit'
  if (code === 'WR' || code === 'RA') return 'reveal'
  return 'unknown'
}

async function readV2JobOnchain(contractAddr, jobId, iface) {
  const out = {
    core: null,
    validation: null,
    specURI: '',
    completionURI: '',
  }

  try {
    const data = iface.encodeFunctionData('getJobCore', [BigInt(jobId)])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult('getJobCore', raw)
    out.core = {
      employer: decoded[0],
      assignedAgent: decoded[1],
      payoutRaw: decoded[2].toString(),
      durationRaw: decoded[3].toString(),
      createdAt: decoded[4].toString(),
      completed: Boolean(decoded[5]),
      disputed: Boolean(decoded[6]),
      expired: Boolean(decoded[7]),
      delisted: Number(decoded[8]) !== 0,
      statusCode: Number(decoded[8]),
    }
  } catch {}

  try {
    const data = iface.encodeFunctionData('getJobValidation', [BigInt(jobId)])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult('getJobValidation', raw)
    out.validation = {
      completionRequested: Boolean(decoded[0]),
      approvals: Number(decoded[1] || 0),
      disapprovals: Number(decoded[2] || 0),
      approvedAt: decoded[3]?.toString?.() || '0',
      disapprovedAt: decoded[4]?.toString?.() || '0',
    }
  } catch {}

  try {
    const data = iface.encodeFunctionData('getJobSpecURI', [BigInt(jobId)])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult('getJobSpecURI', raw)
    out.specURI = String(decoded[0] || '')
  } catch {}

  try {
    const data = iface.encodeFunctionData('getJobCompletionURI', [BigInt(jobId)])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult('getJobCompletionURI', raw)
    out.completionURI = String(decoded[0] || '')
  } catch {}

  return out
}

async function buildV2OperatorView(jobId, options = {}) {
  const numericJobId = Number(jobId)
  const contractHint = String(options?.contractHint || '').toLowerCase()
  const hintIsKnownV2 = KNOWN_V2_CONTRACTS.includes(contractHint)
  const report = {
    schema: 'mission-control/v2-operator-view/v2-onchain-only',
    manager: 'AGIJobManager-v2',
    jobId: String(jobId),
    rpc: ETH_RPC_URL,
    generatedAt: new Date().toISOString(),
    contract: hintIsKnownV2 ? contractHint : AGI_JOB_MANAGER_V2.toLowerCase(),
    mcpJob: null,
    jobRequest: {
      memo: '',
      specURI: '',
      completionURI: '',
      specFetch: { ok: false, error: 'not attempted', source: null },
      spec: null,
    },
    procurement: null,
    applications: [],
    validations: [],
    completionRequests: [],
    completionEvents: [],
    disputeEvents: [],
    errors: [],
  }

  try {
    const reachable = await rpcIsReachable()
    if (!reachable) {
      report.errors.push('onchain scan skipped: RPC unreachable')
      return report
    }

    const { ethers } = await import('ethers')
    const abiPath = join(WORKSPACE_ROOT, 'contracts', 'AGIJobManager-v2', 'AGIJobManager.v2.json')
    const abiRaw = readJsonSafe(abiPath, [])
    const abi = Array.isArray(abiRaw) ? abiRaw : (abiRaw?.abi || [])
    const iface = new ethers.Interface(abi)
    const topicJobId = ethers.zeroPadValue(ethers.toBeHex(BigInt(numericJobId)), 32)

    const toSimple = (evt, address, rawLog) => {
      const named = {}
      try {
        const inputs = evt?.fragment?.inputs || []
        for (let i = 0; i < inputs.length; i++) {
          const key = String(inputs[i]?.name || '').trim()
          if (!key) continue
          named[key] = evt.args?.[i]
        }
      } catch {}
      return {
        blockNumber: Number(BigInt(rawLog.blockNumber || '0x0')),
        txHash: rawLog.transactionHash,
        contract: String(address || '').toLowerCase(),
        name: evt.name,
        args: named,
      }
    }

    const eventsToScan = ['JobCreated', 'JobApplied', 'JobCompletionRequested', 'JobValidated', 'JobDisapproved', 'JobCompleted', 'JobDisputed']
    const all = []

    for (const contractAddr of KNOWN_V2_CONTRACTS) {
      for (const eventName of eventsToScan) {
        try {
          const fragment = iface.getEvent(eventName)
          const logs = await rpcGetLogs({
            address: contractAddr,
            topics: [fragment.topicHash, topicJobId],
          })
          for (const log of logs) {
            const parsed = iface.parseLog(log)
            if (!parsed) continue
            all.push(toSimple(parsed, contractAddr, log))
          }
        } catch {}
      }
    }

    all.sort((a, b) => a.blockNumber - b.blockNumber)

    const created = all.find(e => e.name === 'JobCreated')
    if (created?.contract) report.contract = created.contract
    report.jobRequest.memo = String(created?.args?.details || '')
    report.jobRequest.specURI = String(created?.args?.jobSpecURI || '')

    const jobState = await readV2JobOnchain(report.contract, numericJobId, iface)
    report.jobRequest.specURI = jobState.specURI || report.jobRequest.specURI
    report.jobRequest.completionURI = jobState.completionURI || ''

    const specFetch = await fetchIpfsJson(report.jobRequest.specURI)
    report.jobRequest.specFetch = { ok: specFetch.ok, error: specFetch.error, source: specFetch.source }
    if (specFetch.data) {
      report.jobRequest.spec = specFetch.data
      if (!report.jobRequest.memo) {
        report.jobRequest.memo = String(specFetch.data?.details || specFetch.data?.description || specFetch.data?.summary || '')
      }
    }

    report.applications = await Promise.all(all
      .filter(e => e.name === 'JobApplied')
      .map(async (e) => {
        let ensSubdomain = ''
        try {
          const tx = await rpcGetTransactionByHash(e.txHash)
          const parsedTx = tx?.input ? iface.parseTransaction({ data: tx.input, value: tx.value || '0x0' }) : null
          ensSubdomain = String(parsedTx?.args?.[1] || '')
        } catch {}
        return {
          agent: String(e.args?.agent || ''),
          ensSubdomain,
          applicationIpfsURI: null,
          note: 'AGIJobManager-v2 applyForJob stores ENS/proof; no per-agent application IPFS URI in this contract event/state.',
          blockNumber: e.blockNumber,
          txHash: e.txHash,
          contract: e.contract,
        }
      }))

    report.validations = all
      .filter(e => e.name === 'JobValidated' || e.name === 'JobDisapproved')
      .map(e => ({
        verdict: e.name === 'JobValidated' ? 'approve' : 'disapprove',
        validator: String(e.args?.validator || ''),
        blockNumber: e.blockNumber,
        txHash: e.txHash,
      }))

    report.completionRequests = all
      .filter(e => e.name === 'JobCompletionRequested')
      .map(e => ({
        agent: String(e.args?.agent || ''),
        jobCompletionURI: String(e.args?.jobCompletionURI || ''),
        blockNumber: e.blockNumber,
        txHash: e.txHash,
      }))

    report.completionEvents = all
      .filter(e => e.name === 'JobCompleted')
      .map(e => ({
        agent: String(e.args?.agent || ''),
        reputationPoints: String(e.args?.reputationPoints || ''),
        blockNumber: e.blockNumber,
        txHash: e.txHash,
      }))

    report.disputeEvents = all
      .filter(e => e.name === 'JobDisputed')
      .map(e => ({
        disputant: String(e.args?.disputant || ''),
        blockNumber: e.blockNumber,
        txHash: e.txHash,
      }))

    report.onchainSummary = {
      status: deriveJobStatus(jobState.core, jobState.validation),
      employer: String(jobState.core?.employer || ''),
      assignedAgent: String(jobState.core?.assignedAgent || ''),
      payoutRaw: String(jobState.core?.payoutRaw || '0'),
      payout: formatAgialpha(jobState.core?.payoutRaw || '0'),
      durationRaw: String(jobState.core?.durationRaw || '0'),
      duration: formatDurationDays(jobState.core?.durationRaw || '0'),
      approvals: Number(jobState.validation?.approvals || 0),
      disapprovals: Number(jobState.validation?.disapprovals || 0),
      completionRequested: Boolean(jobState.validation?.completionRequested),
    }
  } catch (err) {
    report.errors.push(`onchain scan failed: ${err.message}`)
  }

  return report
}

async function buildV1OperatorView(jobId, options = {}) {
  const numericJobId = Number(jobId)
  const contractHint = String(options?.contractHint || '').toLowerCase()
  const report = {
    schema: 'mission-control/v1-operator-view/v1-onchain-only',
    manager: 'AGIJobManager-v1',
    jobId: String(jobId),
    rpc: ETH_RPC_URL,
    generatedAt: new Date().toISOString(),
    contract: /^0x[a-f0-9]{40}$/.test(contractHint) ? contractHint : AGI_JOB_MANAGER_CONTRACT,
    jobRequest: {
      memo: '',
      specURI: '',
      completionURI: '',
      specFetch: { ok: false, error: 'not attempted', source: null },
      spec: null,
    },
    applications: [],
    validations: [],
    completionRequests: [],
    completionEvents: [],
    disputeEvents: [],
    errors: [],
  }

  try {
    const reachable = await rpcIsReachable()
    if (!reachable) {
      report.errors.push('onchain scan skipped: RPC unreachable')
      return report
    }

    const { ethers, iface } = await getV1ContractInterface()
    const topicJobId = ethers.zeroPadValue(ethers.toBeHex(BigInt(numericJobId)), 32)
    const eventsToScan = ['JobCreated', 'JobApplied', 'JobCompletionRequested', 'JobValidated', 'JobDisapproved', 'JobCompleted', 'JobDisputed']
    const all = []

    const toSimple = (evt, address, rawLog) => {
      const named = {}
      try {
        const inputs = evt?.fragment?.inputs || []
        for (let i = 0; i < inputs.length; i++) {
          const key = String(inputs[i]?.name || '').trim()
          if (!key) continue
          named[key] = evt.args?.[i]
        }
      } catch {}
      return {
        blockNumber: Number(BigInt(rawLog.blockNumber || '0x0')),
        txHash: rawLog.transactionHash,
        contract: String(address || '').toLowerCase(),
        name: evt.name,
        args: named,
      }
    }

    for (const eventName of eventsToScan) {
      try {
        const fragment = iface.getEvent(eventName)
        const logs = await rpcGetLogs({
          address: report.contract,
          topics: [fragment.topicHash, topicJobId],
        })
        for (const log of logs) {
          const parsed = iface.parseLog(log)
          if (!parsed) continue
          all.push(toSimple(parsed, report.contract, log))
        }
      } catch {}
    }

    all.sort((a, b) => a.blockNumber - b.blockNumber)
    const created = all.find((e) => e.name === 'JobCreated')
    const context = await fetchV1JobContext(numericJobId, report.contract)
    const specFetch = await fetchIpfsJson(context.specURI)

    report.contract = created?.contract || report.contract
    const view = buildV1OperatorViewModel({
      jobId: numericJobId,
      contract: report.contract,
      rpc: ETH_RPC_URL,
      context,
      createdEvent: created,
      specFetch,
      applications: await Promise.all(all
        .filter((e) => e.name === 'JobApplied')
        .map(async (e) => {
          let ensSubdomain = ''
          try {
            const tx = await rpcGetTransactionByHash(e.txHash)
            const parsedTx = tx?.input ? iface.parseTransaction({ data: tx.input, value: tx.value || '0x0' }) : null
            ensSubdomain = String(parsedTx?.args?.[1] || '')
          } catch {}
          return {
            agent: String(e.args?.agent || ''),
            ensSubdomain,
            applicationIpfsURI: null,
            note: 'AGIJobManager-v1 applyForJob stores agent address; ENS subdomain is inferred from tx calldata when available.',
            blockNumber: e.blockNumber,
            txHash: e.txHash,
            contract: e.contract,
          }
        })),
      validations: all
        .filter((e) => e.name === 'JobValidated' || e.name === 'JobDisapproved')
        .map((e) => ({
          verdict: e.name === 'JobValidated' ? 'approve' : 'disapprove',
          validator: String(e.args?.validator || ''),
          blockNumber: e.blockNumber,
          txHash: e.txHash,
        })),
      completionRequests: all
        .filter((e) => e.name === 'JobCompletionRequested')
        .map((e) => ({
          agent: String(e.args?.agent || ''),
          jobCompletionURI: String(e.args?.jobCompletionURI || ''),
          blockNumber: e.blockNumber,
          txHash: e.txHash,
        })),
      completionEvents: all
        .filter((e) => e.name === 'JobCompleted')
        .map((e) => ({
          agent: String(e.args?.agent || ''),
          reputationPoints: String(e.args?.reputationPoints || ''),
          blockNumber: e.blockNumber,
          txHash: e.txHash,
        })),
      disputeEvents: all
        .filter((e) => e.name === 'JobDisputed')
        .map((e) => ({
          disputant: String(e.args?.disputant || ''),
          blockNumber: e.blockNumber,
          txHash: e.txHash,
        })),
      errors: report.errors,
    })

    return view
  } catch (err) {
    report.errors.push(`onchain scan failed: ${err.message}`)
    return buildV1OperatorViewModel({
      jobId: numericJobId,
      contract: report.contract,
      rpc: ETH_RPC_URL,
      context: {},
      errors: report.errors,
    })
  }
}

async function listV2JobsFromChain() {
  try {
    const reachable = await rpcIsReachable()
    if (!reachable) return []

    const { ethers } = await import('ethers')
    const abiPath = join(WORKSPACE_ROOT, 'contracts', 'AGIJobManager-v2', 'AGIJobManager.v2.json')
    const abiRaw = readJsonSafe(abiPath, [])
    const abi = Array.isArray(abiRaw) ? abiRaw : (abiRaw?.abi || [])
    const iface = new ethers.Interface(abi)
    const createdTopic = iface.getEvent('JobCreated').topicHash

    const discovered = []

    for (const contractAddr of KNOWN_V2_CONTRACTS) {
      try {
        const logs = await rpcGetLogs({
          address: contractAddr,
          topics: [createdTopic],
        })
        for (const log of logs) {
          const parsed = iface.parseLog(log)
          if (!parsed) continue
          const id = Number(parsed.args?.jobId ?? -1)
          if (!Number.isFinite(id) || id < 0) continue
          discovered.push({
            contract: contractAddr,
            jobId: id,
          })
        }
      } catch {}
    }

    const dedup = new Map()
    for (const row of discovered) {
      const key = `${row.contract}:${row.jobId}`
      if (!dedup.has(key)) dedup.set(key, row)
    }

    const out = []
    for (const row of dedup.values()) {
      const state = await readV2JobOnchain(row.contract, row.jobId, iface)
      const core = state.core
      if (!core) continue
      if (String(core.employer || '').toLowerCase() === '0x0000000000000000000000000000000000000000') continue

      out.push({
        source: 'agijobmanager-v2',
        jobId: `V2-${row.jobId}`,
        sortId: Number(row.jobId),
        status: deriveJobStatus(core, state.validation),
        payout: formatAgialpha(core.payoutRaw),
        payoutRaw: String(core.payoutRaw || '0'),
        duration: formatDurationDays(core.durationRaw),
        employer: String(core.employer || '0x0000000000000000000000000000000000000000'),
        assignedAgent: String(core.assignedAgent || '0x0000000000000000000000000000000000000000'),
        specURI: String(state.specURI || ''),
        approvals: Number(state.validation?.approvals || 0),
        disapprovals: Number(state.validation?.disapprovals || 0),
        createdAt: core.createdAt ? `ts ${core.createdAt}` : '—',
        links: {
          contract: `https://etherscan.io/address/${row.contract}`,
        },
      })
    }

    out.sort((a, b) => Number(b.sortId || 0) - Number(a.sortId || 0))
    return out
  } catch {
    return []
  }
}

function urgencyLabel(secsUntilDeadline) {
  if (secsUntilDeadline == null || secsUntilDeadline < 0) return { level: 'info', label: 'INFO', color: 'text-slate-400' }
  if (secsUntilDeadline < 3600) return { level: 'urgent', label: 'URGENT', color: 'text-red-400' }
  if (secsUntilDeadline < 4 * 3600) return { level: 'warning', label: 'WARNING', color: 'text-amber-400' }
  return { level: 'info', label: 'INFO', color: 'text-slate-400' }
}

function formatDuration(secs) {
  if (secs == null) return '\u2014'
  const s = Math.abs(secs)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
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

async function rpcCall(method, params = [], timeoutMs = 12000) {
  const res = await fetch(ETH_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const data = await res.json().catch(() => ({}))
  if (data?.error) throw new Error(data.error?.message || JSON.stringify(data.error))
  return data?.result
}

async function rpcGetLogs({ address, topics, fromBlock = '0x0', toBlock = 'latest' }) {
  const result = await rpcCall('eth_getLogs', [{ address, topics, fromBlock, toBlock }], 8000)
  return Array.isArray(result) ? result : []
}

async function rpcGetTransactionByHash(txHash) {
  if (!txHash) return null
  return await rpcCall('eth_getTransactionByHash', [txHash], 8000)
}

async function rpcEthCall(to, data) {
  return await rpcCall('eth_call', [{ to, data }, 'latest'], 8000)
}

async function rpcIsReachable() {
  try {
    await rpcCall('eth_blockNumber', [], 3000)
    return true
  } catch {
    return false
  }
}


function normalizeAssetUri(value) {
  const trimmed = String(value || '').trim()
  return trimmed.startsWith('ipfs://') || trimmed.startsWith('https://') || trimmed.startsWith('http://')
    ? trimmed
    : ''
}



async function pinJsonViaPinata(payload, name) {
  if (!PINATA_JWT) throw new Error('PINATA_JWT is not configured on server')
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataMetadata: { name },
      pinataContent: payload,
    }),
    signal: AbortSignal.timeout(30000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.IpfsHash) {
    throw new Error(data?.error?.reason || data?.message || `Pinata HTTP ${res.status}`)
  }
  const cid = data.IpfsHash
  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    provider: 'pinata',
  }
}

const PIPELINE_META = {
  'intake.lobster.yaml':      { desc: 'v1 test intake -> execute -> validate -> unsigned completion', status: 'active' },
  'v1-test-job.lobster.yaml': { desc: 'local markdown job -> assigned -> execution pipeline dry-run', status: 'ready'  },
  'creative.lobster.yaml':    { desc: 'research -> draft -> review -> approve',                       status: 'ready'  },
  'development.lobster.yaml': { desc: 'plan -> implement -> review -> approve',                       status: 'ready'  },
  'research.lobster.yaml':    { desc: 'gather -> analyze -> approve',                                 status: 'ready'  },
  'analysis.lobster.yaml':    { desc: 'audit -> report -> approve',                                   status: 'ready'  },
}

app.get('/health', async (_, res) => {
  const [rpcReady] = await Promise.all([
    rpcIsReachable(),
  ])
  const pinataReady = Boolean(PINATA_JWT)
  res.json({
    ok: rpcReady,
    readiness: {
      rpc: rpcReady,
      ipfsPinata: pinataReady,
    },
    dependencies: {
      rpcUrl: ETH_RPC_URL,
      ipfsGateways: IPFS_GATEWAYS,
      pinataConfigured: pinataReady,
    },
  })
})

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

app.get('/api/llm/providers', (_req, res) => {
  try {
    const providers = listProviders()
    const selection = readLlmSelection()
    const preferredProvider = selection.preferredProvider || ''
    return res.json({
      providers,
      preferredProvider,
      selectedProvider: preferredProvider || null,
      updatedAt: selection.updatedAt || null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed_to_list_providers' })
  }
})

app.post('/api/llm/select', (req, res) => {
  try {
    const requested = String(req.body?.provider || '').trim()
    const providers = listProviders()

    if (!requested) {
      const saved = saveLlmSelection({ preferredProvider: '' })
      try { setPreferredProvider('') } catch {}
      return res.json({
        ok: true,
        preferredProvider: saved.preferredProvider,
        selectedProvider: null,
        providers,
        updatedAt: saved.updatedAt,
      })
    }

    const provider = providers.find((p) => p.name === requested)
    if (!provider) return res.status(400).json({ error: `unknown_provider:${requested}` })
    if (!provider.enabled) return res.status(400).json({ error: `provider_disabled:${requested}` })

    const saved = saveLlmSelection({ preferredProvider: requested })
    try { setPreferredProvider(requested) } catch {}
    return res.json({
      ok: true,
      preferredProvider: saved.preferredProvider,
      selectedProvider: saved.preferredProvider,
      providers,
      updatedAt: saved.updatedAt,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed_to_select_provider' })
  }
})

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
const AGI_PRIME_CONTRACT = String(process.env.AGI_PRIME_CONTRACT || '0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29').toLowerCase()
const PRIME_DEFAULT_CHAIN_ID = String(process.env.PRIME_CHAIN_ID || '0x1').toLowerCase()

function getProcArtifactEntries(procurementId) {
  const procDir = join(PROC_ARTIFACTS_DIR, `proc_${procurementId}`)
  const entries = [
    { key: 'state', label: 'state.json', file: join(procDir, 'state.json') },
    { key: 'next_action', label: 'next_action.json', file: join(procDir, 'next_action.json') },
    { key: 'trial_manifest', label: 'trial/trial_artifact_manifest.json', file: join(procDir, 'trial', 'trial_artifact_manifest.json') },
    { key: 'trial_publication', label: 'trial/publication_record.json', file: join(procDir, 'trial', 'publication_record.json') },
    { key: 'score_commit', label: 'scoring/score_commit_payload.json', file: join(procDir, 'scoring', 'score_commit_payload.json') },
    { key: 'score_reveal', label: 'scoring/score_reveal_payload.json', file: join(procDir, 'scoring', 'score_reveal_payload.json') },
    { key: 'score_adjudication', label: 'scoring/adjudication_result.json', file: join(procDir, 'scoring', 'adjudication_result.json') },
    { key: 'score_evidence', label: 'scoring/evidence_bundle.json', file: join(procDir, 'scoring', 'evidence_bundle.json') },
  ]
  return { procDir, entries }
}

async function lookupReputationOnchain(address) {
  const jobs = await listV1JobsFromChain()
  const mine = jobs.filter((j) => String(j?.assignedAgent || '').toLowerCase() === address)
  const completed = mine.filter((j) => j?.status === 'Completed').length
  const disputed = mine.filter((j) => j?.status === 'Disputed').length
  const assigned = mine.filter((j) => j?.status === 'Assigned').length
  return {
    reputation: completed - disputed,
    source: 'derived:onchain-v1',
    breakdown: { completed, disputed, assigned },
  }
}



app.get('/api/agent-reputation/:address', async (req, res) => {
  const address = String(req.params.address || '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'invalid address' })
  }

  try {
    const computed = await lookupReputationOnchain(address)
    return res.json({
      reputation: computed.reputation,
      source: computed.source,
      contract: AGI_JOB_MANAGER_CONTRACT,
      breakdown: computed.breakdown,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to read agent reputation' })
  }
})

async function readV1JobOnchain(contractAddr, jobId, iface) {
  const out = {
    core: null,
    validation: null,
    specURI: '',
    completionURI: '',
  }

  try {
    const data = iface.encodeFunctionData('getJobCore', [BigInt(jobId)])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult('getJobCore', raw)
    out.core = {
      employer: String(decoded[0] || ''),
      assignedAgent: String(decoded[1] || ''),
      payoutRaw: String(decoded[2] || '0'),
      durationRaw: String(decoded[3] || '0'),
      createdAt: String(decoded[4] || '0'),
      completed: Boolean(decoded[5]),
      disputed: Boolean(decoded[6]),
      expired: Boolean(decoded[7]),
    }
  } catch {}

  try {
    const data = iface.encodeFunctionData('getJobValidation', [BigInt(jobId)])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult('getJobValidation', raw)
    out.validation = {
      completionRequested: Boolean(decoded[0]),
      approvals: Number(decoded[1] || 0),
      disapprovals: Number(decoded[2] || 0),
    }
  } catch {}

  try {
    const data = iface.encodeFunctionData('getJobSpecURI', [BigInt(jobId)])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult('getJobSpecURI', raw)
    out.specURI = String(decoded?.[0] || '')
  } catch {}

  try {
    const data = iface.encodeFunctionData('getJobCompletionURI', [BigInt(jobId)])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult('getJobCompletionURI', raw)
    out.completionURI = String(decoded?.[0] || '')
  } catch {}

  return out
}

async function listV1JobsFromChain() {
  try {
    const reachable = await rpcIsReachable()
    if (!reachable) return []

    const { ethers, iface } = await getV1ContractInterface()
    const topic = iface.getEvent('JobCreated').topicHash
    const logs = await rpcGetLogs({
      address: AGI_JOB_MANAGER_CONTRACT,
      topics: [topic],
    })

    const jobIds = new Set()
    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log)
        const id = Number(parsed?.args?.jobId ?? -1)
        if (Number.isFinite(id) && id >= 0) jobIds.add(id)
      } catch {}
    }

    const out = []
    for (const jobId of Array.from(jobIds.values())) {
      const state = await readV1JobOnchain(AGI_JOB_MANAGER_CONTRACT, jobId, iface)
      if (!state?.core) continue
      if (String(state.core.employer || '').toLowerCase() === ethers.ZeroAddress.toLowerCase()) continue
      out.push(normalizeV1JobForList({
        jobId,
        contract: AGI_JOB_MANAGER_CONTRACT,
        core: state.core,
        validation: state.validation,
        specURI: state.specURI,
      }))
    }

    out.sort((a, b) => Number(b.sortId || 0) - Number(a.sortId || 0))
    return out
  } catch {
    return []
  }
}

async function listPrimeJobsFromChain() {
  try {
    const reachable = await rpcIsReachable()
    if (!reachable) return []

    const { ethers } = await import('ethers')
    const abiPath = join(WORKSPACE_ROOT, 'agent', 'abi', 'AGIJobDiscoveryPrime.json')
    const abiRaw = readJsonSafe(abiPath, [])
    const abi = Array.isArray(abiRaw) ? abiRaw : (abiRaw?.abi || [])
    const iface = new ethers.Interface(abi)
    const PROCUREMENT_CREATED_TOPIC = '0xd88f0bdc06a889b3707026296f02b1cb95e0b68fc3b0cf11cb82bb0ecc805d53'
    const PREMIUM_JOB_CREATED_TOPIC = '0xcd958add2ab89c161b8e05f40140e87d03e664bd32eea370e4aec86096bcb3f6'

    let procurementCreatedTopic = PROCUREMENT_CREATED_TOPIC
    let premiumJobCreatedTopic = PREMIUM_JOB_CREATED_TOPIC
    try { procurementCreatedTopic = iface.getEvent('ProcurementCreated')?.topicHash || PROCUREMENT_CREATED_TOPIC } catch {}
    try { premiumJobCreatedTopic = iface.getEvent('PremiumJobCreated')?.topicHash || PREMIUM_JOB_CREATED_TOPIC } catch {}

    // Keep v1 discovery indexing resilient even when premium event ABI/signature is unavailable.
    // Do not let one event-family failure zero out all prime rows.
    const procurementLogs = procurementCreatedTopic
      ? await rpcGetLogs({ address: AGI_PRIME_CONTRACT, topics: [procurementCreatedTopic] }).catch(() => [])
      : []
    const premiumLogsPrimary = premiumJobCreatedTopic
      ? await rpcGetLogs({ address: AGI_PRIME_CONTRACT, topics: [premiumJobCreatedTopic] }).catch(() => [])
      : []
    const premiumLogsV2 = premiumJobCreatedTopic
      ? await rpcGetLogs({ address: AGI_PRIME_V2.toLowerCase(), topics: [premiumJobCreatedTopic] }).catch(() => [])
      : []
    const premiumLogs = [...premiumLogsPrimary, ...premiumLogsV2]

    const rows = []
    const seenKeys = new Set()

    function pushPrimeRow(next) {
      const key = `${next.source}:${next.procurementId}:${next.jobId}`
      if (seenKeys.has(key)) return
      seenKeys.add(key)
      rows.push(next)
    }

    function buildPrimeListRow({ parsed, source }) {
      const procurementId = String(parsed?.args?.procurementId ?? '')
      const jobIdRaw = String(parsed?.args?.jobId ?? '')
      const employer = String(parsed?.args?.employer || '').toLowerCase()
      if (!/^\d+$/.test(procurementId)) return null

      return {
        source,
        procurementId,
        jobId: /^\d+$/.test(jobIdRaw) ? jobIdRaw : `P-${procurementId}`,
        status: 'Prime',
        payout: '—',
        duration: '—',
        employer: employer || '0x0000000000000000000000000000000000000000',
        assignedAgent: '',
        approvals: 0,
        disapprovals: 0,
        specURI: '',
      }
    }

    for (const log of procurementLogs) {
      try {
        const parsed = iface.parseLog(log)
        const baseRow = buildPrimeListRow({ parsed, source: 'agiprimediscovery' })
        if (!baseRow) continue
        const procurementId = baseRow.procurementId

        let deadlines = {
          commitDeadline: null,
          revealDeadline: null,
          finalistAcceptDeadline: null,
          trialDeadline: null,
          scoreCommitDeadline: null,
          scoreRevealDeadline: null,
        }
        try {
          const data = iface.encodeFunctionData('procurements', [BigInt(procurementId)])
          const raw = await rpcEthCall(AGI_PRIME_CONTRACT, data)
          const decoded = iface.decodeFunctionResult('procurements', raw)
          deadlines = {
            commitDeadline: Number(decoded?.[2] || 0) || null,
            revealDeadline: Number(decoded?.[3] || 0) || null,
            finalistAcceptDeadline: Number(decoded?.[4] || 0) || null,
            trialDeadline: Number(decoded?.[5] || 0) || null,
            scoreCommitDeadline: Number(decoded?.[6] || 0) || null,
            scoreRevealDeadline: Number(decoded?.[7] || 0) || null,
          }
        } catch {}

        const localState = readJsonSafe(join(PROC_ARTIFACTS_DIR, `proc_${procurementId}`, 'state.json'), null) || {}
        const phase = decodePrimeActionPhase(localState?.nextActionCode || '')
        const windowStatus = inferPrimeWindowStatus(phase, deadlines)

        pushPrimeRow({
          ...baseRow,
          status: String(localState?.status || (windowStatus === 'open' ? 'PrimeWindowOpen' : 'Prime')),
          assignedAgent: String(localState?.selectedFinalist || ''),
          deadlines,
          nextActionCode: String(localState?.nextActionCode || ''),
          links: {
            contract: `https://etherscan.io/address/${AGI_PRIME_CONTRACT}`,
          },
        })
      } catch {}
    }

    for (const log of premiumLogs) {
      try {
        let parsed = null
        try {
          parsed = iface.parseLog(log)
        } catch {
          const topics = Array.isArray(log?.topics) ? log.topics : []
          if (topics.length < 4) continue
          parsed = {
            args: {
              procurementId: BigInt(topics[1]),
              jobId: BigInt(topics[2]),
              employer: `0x${String(topics[3]).slice(-40)}`,
            },
          }
        }
        const baseRow = buildPrimeListRow({ parsed, source: 'agijobmanagerprime' })
        if (!baseRow) continue
        const premiumAddress = String(log?.address || AGI_PRIME_V2).toLowerCase()
        pushPrimeRow({
          ...baseRow,
          status: 'PrimeSettlement',
          links: {
            contract: `https://etherscan.io/address/${premiumAddress}`,
          },
        })
      } catch {}
    }

    rows.sort((a, b) => Number(b.procurementId || 0) - Number(a.procurementId || 0))
    return rows
  } catch {
    return []
  }
}

// ── Real jobs (contract-first) ─────────────────────────────────────────────────
app.get('/api/jobs', async (req, res) => {
  try {
    const [v1Jobs, v2Jobs, primeJobs] = await Promise.all([
      listV1JobsFromChain(),
      listV2JobsFromChain(),
      listPrimeJobsFromChain(),
    ])
    res.json([...v1Jobs, ...v2Jobs, ...primeJobs])
  } catch (e) {
    console.error('onchain /api/jobs failed:', e.message)
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

// ── Job metadata (contract-first: on-chain URI + IPFS payload) ───────────────
app.get('/api/job-metadata/:jobId', async (req, res) => {
  try {
    const rawJobId = String(req.params.jobId || '').trim()
    const numericJobId = extractNumericJobId(rawJobId)
    if (!numericJobId) return res.status(400).json({ error: 'jobId must include numeric id' })

    const source = String(req.query.source || '').toLowerCase()
    const type = req.query.type === 'spec' ? 'spec' : 'completion'

    if (source === 'agijobmanager-v2' || /^v2-/i.test(rawJobId)) {
      const report = await buildV2OperatorView(numericJobId, {
        source: 'agijobmanager-v2',
      })
      const uri = type === 'spec' ? String(report?.jobRequest?.specURI || '') : String(report?.jobRequest?.completionURI || '')
      if (!uri) return res.status(404).json({ error: `${type} URI not found on-chain` })
      const payload = await fetchIpfsPayload(uri)
      if (!payload.ok) return res.status(502).json({ error: payload.error || `Failed to fetch ${type} payload` })
      return res.json({
        ...(payload.json && typeof payload.json === 'object' ? payload.json : {}),
        [type === 'spec' ? 'specURI' : 'completionURI']: uri,
      })
    }

    const context = await fetchV1JobContext(numericJobId, AGI_JOB_MANAGER_CONTRACT)
    const uri = resolveV1MetadataUri(context, type)
    if (!uri) return res.status(404).json({ error: `${type} URI not found on-chain` })

    const payload = await fetchIpfsPayload(uri)
    if (!payload.ok) return res.status(502).json({ error: payload.error || `Failed to fetch ${type} payload` })

    res.json({
      ...(payload.json && typeof payload.json === 'object' ? payload.json : {}),
      [type === 'spec' ? 'specURI' : 'completionURI']: uri,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Job spec (contract-first: on-chain URI + IPFS payload) ────────────────────
app.get('/api/job-spec/:jobId', async (req, res) => {
  try {
    const rawJobId = String(req.params.jobId || '').trim()
    const numericJobId = extractNumericJobId(rawJobId)
    if (!numericJobId) return res.status(400).json({ error: 'jobId must include numeric id' })

    const source = String(req.query.source || '').toLowerCase()
    if (source === 'agijobmanager-v2' || /^v2-/i.test(rawJobId)) {
      const report = await buildV2OperatorView(numericJobId, { source: 'agijobmanager-v2' })
      const specURI = String(report?.jobRequest?.specURI || '')
      if (!specURI) return res.status(404).json({ error: 'Spec URI not found on-chain' })
      const payload = await fetchIpfsPayload(specURI)
      if (!payload.ok) return res.status(502).json({ error: payload.error || 'Failed to fetch spec payload' })
      return res.json({
        ...(payload.json && typeof payload.json === 'object' ? payload.json : {}),
        specURI,
      })
    }

    const context = await fetchV1JobContext(numericJobId, AGI_JOB_MANAGER_CONTRACT)
    if (!context.specURI) return res.status(404).json({ error: 'Spec URI not found on-chain' })

    const payload = await fetchIpfsPayload(context.specURI)
    if (!payload.ok) return res.status(502).json({ error: payload.error || 'Failed to fetch spec payload' })

    res.json({
      ...(payload.json && typeof payload.json === 'object' ? payload.json : {}),
      specURI: context.specURI,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function buildExternalValidationDir(jobId) {
  const dir = join(ARTIFACTS_DIR, 'validation', `job_${jobId}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeJsonFile(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2))
}

async function getV1ContractInterface() {
  const { ethers } = await import('ethers')
  const abiPath = join(WORKSPACE_ROOT, 'contracts', 'AGIJobManager-v1', 'AGIJobManager.v1.json')
  const abiRaw = readJsonSafe(abiPath, [])
  const abi = Array.isArray(abiRaw) ? abiRaw : (abiRaw?.abi || [])
  if (!Array.isArray(abi) || abi.length === 0) throw new Error(`Missing v1 ABI at ${abiPath}`)
  return {
    ethers,
    iface: new ethers.Interface(abi),
    abiPath,
  }
}

async function fetchV1JobContext(jobId, contractAddr) {
  let core = null
  let validation = null
  let specURI = ''
  let completionURI = ''
  let chainId = ''
  let iface = null
  let hasValidateJob = false
  let hasDisputeJob = false
  let rpcError = ''

  try {
    const reachable = await rpcIsReachable()
    if (!reachable) throw new Error('RPC unreachable')

    const { iface: i } = await getV1ContractInterface()
    iface = i
    hasValidateJob = Boolean(iface.getFunction('validateJob(uint256,string,bytes32[])'))
    hasDisputeJob = Boolean(iface.getFunction('disputeJob(uint256)'))

    chainId = String(await rpcCall('eth_chainId', [], 5000) || '')

    const state = await readV1JobOnchain(contractAddr, jobId, iface)
    core = state.core
    validation = state.validation
    specURI = state.specURI
    completionURI = state.completionURI
  } catch (e) {
    rpcError = e.message || 'v1 on-chain lookup failed'
  }

  return {
    jobId: String(jobId),
    contract: String(contractAddr).toLowerCase(),
    chainId,
    core,
    validation,
    specURI,
    completionURI,
    iface,
    hasValidateJob,
    hasDisputeJob,
    rpcError,
  }
}

function parseMerkleProofInput(input) {
  if (Array.isArray(input)) return input
  const raw = String(input || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function readV1AgiTokenAddress(contractAddr, iface) {
  try {
    const fn = iface.getFunction('agiToken()')
    const data = iface.encodeFunctionData(fn, [])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult(fn, raw)
    const tokenAddress = String(decoded?.[0] || '').toLowerCase()
    if (/^0x[a-f0-9]{40}$/.test(tokenAddress)) return tokenAddress
  } catch {}
  return ''
}

async function readV1AgentBondRaw(contractAddr, iface) {
  try {
    const fn = iface.getFunction('agentBond()')
    const data = iface.encodeFunctionData(fn, [])
    const raw = await rpcEthCall(contractAddr, data)
    const decoded = iface.decodeFunctionResult(fn, raw)
    return String(decoded?.[0] || '0')
  } catch {
    return '0'
  }
}

async function readV1Allowance({ walletAddress, contractAddr, tokenAddress }) {
  const empty = { allowanceRaw: '0', tokenAddress: tokenAddress || '', source: 'unavailable' }
  if (!walletAddress || !/^0x[a-f0-9]{40}$/.test(contractAddr) || !/^0x[a-f0-9]{40}$/.test(tokenAddress)) return empty
  try {
    const owner = walletAddress.replace(/^0x/, '').padStart(64, '0')
    const spender = contractAddr.replace(/^0x/, '').padStart(64, '0')
    const allowanceRawHex = await rpcEthCall(tokenAddress, `0xdd62ed3e${owner}${spender}`)
    const allowanceRaw = BigInt(String(allowanceRawHex || '0x0')).toString()
    return { allowanceRaw, tokenAddress, source: 'onchain:erc20.allowance' }
  } catch {
    return empty
  }
}

function upsertV1ApplyTxPackage(jobId, pkg, patch = {}) {
  mkdirSync(AGENT_STATE_DIR, { recursive: true })
  const statePath = join(AGENT_STATE_DIR, `${jobId}.json`)
  const state = readJsonSafe(statePath, null) || {
    jobId: String(jobId),
    source: 'agijobmanager',
    txPackages: [],
    receipts: [],
    createdAt: new Date().toISOString(),
  }

  const txPackages = Array.isArray(state.txPackages) ? [...state.txPackages] : []
  const keep = txPackages.filter((entry) => !(String(entry?.action || '') === 'apply' && entry?.opControlPreparedApply))
  keep.push({
    action: 'apply',
    file: pkg.unsignedTxPath,
    unsignedTxPath: pkg.unsignedTxPath,
    reviewManifestPath: pkg.reviewManifestPath,
    createdAt: pkg.createdAt,
    expiresAt: pkg.expiresAt,
    fresh: Date.parse(pkg.expiresAt) > Date.now(),
    expired: Date.parse(pkg.expiresAt) <= Date.now(),
    signed: false,
    opControlPreparedApply: true,
    checklist: pkg.checklist,
  })

  const next = {
    ...state,
    ...patch,
    jobId: String(jobId),
    source: 'agijobmanager',
    status: 'application_pending_review',
    txPackages: keep,
    updatedAt: new Date().toISOString(),
  }
  atomicWriteJson(statePath, next)
  return { statePath, state: next }
}

function summarizeV1ApplyState(state = {}, context = null) {
  const applyPkg = Array.isArray(state?.txPackages)
    ? state.txPackages.find((entry) => String(entry?.action || '') === 'apply') || null
    : null
  const applyReceipt = Array.isArray(state?.receipts)
    ? state.receipts.find((entry) => String(entry?.action || '') === 'apply') || null
    : null
  const operatorTx = state?.operatorTx?.apply || null
  const applicantWallet = normalizeWalletAddress(state?.applyPackage?.walletAddress)
  const onchainAssignedAgent = normalizeWalletAddress(context?.core?.assignedAgent)
  const assignedToApplicant = Boolean(applicantWallet && onchainAssignedAgent && applicantWallet === onchainAssignedAgent)
  const onchainStatus = context?.core ? deriveJobStatus(context.core, context.validation) : ''

  return {
    jobId: String(state?.jobId || ''),
    status: String(state?.status || ''),
    applicantWallet: applicantWallet || null,
    agentSubdomain: String(state?.applyPackage?.agentSubdomain || ''),
    bondAmountRaw: String(state?.applyPackage?.bondAmountRaw || ''),
    operatorTx: operatorTx
      ? {
          txHash: String(operatorTx.txHash || ''),
          broadcastAt: operatorTx.broadcastAt || null,
          finalizedAt: operatorTx.finalizedAt || null,
        }
      : null,
    txPackage: applyPkg
      ? {
          unsignedTxPath: applyPkg.unsignedTxPath || null,
          reviewManifestPath: applyPkg.reviewManifestPath || null,
          signed: Boolean(applyPkg.signed),
          broadcastTxHash: applyPkg.broadcastTxHash || null,
          finalizedAt: applyPkg.finalizedAt || null,
        }
      : null,
    receipt: applyReceipt
      ? {
          txHash: applyReceipt.txHash || null,
          status: applyReceipt.status || null,
          broadcastAt: applyReceipt.broadcastAt || null,
          finalizedAt: applyReceipt.finalizedAt || null,
        }
      : null,
    onchain: {
      status: onchainStatus || null,
      assignedAgent: onchainAssignedAgent || null,
      approvals: Number(context?.validation?.approvals || 0),
      disapprovals: Number(context?.validation?.disapprovals || 0),
    },
    assignment: {
      assignedToApplicant,
      assignedToOther: Boolean(onchainAssignedAgent && applicantWallet && onchainAssignedAgent !== applicantWallet),
    },
  }
}

async function reconcileV1ApplyState(jobId, contractHint = '') {
  const statePath = join(AGENT_STATE_DIR, `${jobId}.json`)
  const state = readJsonSafe(statePath, null)
  if (!state) {
    const err = new Error('apply state not found')
    err.status = 404
    throw err
  }
  const applyPkg = Array.isArray(state.txPackages)
    ? state.txPackages.find((entry) => String(entry?.action || '') === 'apply') || null
    : null
  if (!applyPkg) {
    const err = new Error('apply package not found in state')
    err.status = 404
    throw err
  }

  const contract = /^0x[a-f0-9]{40}$/.test(String(contractHint || '').toLowerCase())
    ? String(contractHint).toLowerCase()
    : AGI_JOB_MANAGER_CONTRACT
  const context = await fetchV1JobContext(jobId, contract)
  const summaryBefore = summarizeV1ApplyState(state, context)
  const now = new Date().toISOString()
  const next = {
    ...state,
    source: 'agijobmanager',
    applyReconciledAt: now,
    applyReconciliation: summaryBefore,
    updatedAt: now,
  }

  const hasFinalizedApply = Boolean(summaryBefore.operatorTx?.finalizedAt || summaryBefore.receipt?.status === 'finalized' || applyPkg?.finalizedAt)
  if (summaryBefore.assignment.assignedToApplicant) {
    next.status = 'assigned'
    next.assignedAt = now
    next.assignedAgent = summaryBefore.onchain.assignedAgent || state.assignedAgent || ''
  } else if (hasFinalizedApply && ['application_pending_review', 'applied', 'assignment_pending', 'queued', 'scored'].includes(String(state.status || '').toLowerCase())) {
    next.status = 'applied'
  }

  atomicWriteJson(statePath, next)
  return {
    statePath,
    state: next,
    summary: summarizeV1ApplyState(next, context),
  }
}

function normalizeCompletionBriefPayload(payload, completionURI) {
  const data = payload && typeof payload === 'object' ? payload : {}
  const p = data.properties && typeof data.properties === 'object' ? data.properties : {}
  const title = String(data.title || data.name || p.title || 'Completion brief').trim()
  const summary = String(data.summary || p.summary || data.description || p.description || '').trim()
  const details = String(data.details || p.details || data.validatorNote || p.validatorNote || '').trim()
  const status = String(data.status || p.status || data.completionStatus || p.completionStatus || '').trim()
  return {
    title,
    summary,
    details,
    status,
    completionURI,
    raw: data,
  }
}

async function buildV1AdjudicationPayload(context, completionPayload) {
  const text = extractScoringTextFromPayload(completionPayload || '')
  if (!text.trim()) {
    return {
      schema: 'op-control/validator-adjudication/v1',
      score: 0,
      verdict: 'insufficient_payload',
      reason: 'Completion payload has no scoreable text',
      checks: [
        { name: 'completion_text_present', passed: false, detail: 'No scoreable text in payload' },
      ],
    }
  }

  try {
    const { adjudicateScore } = await import('../validation/scoring-adjudicator.js')
    const evidence = {
      procurementId: `v1-job-${context.jobId}`,
      procurement: {
        procStruct: { jobId: Number(context.jobId) },
        deadlines: {},
        isScorePhase: true,
      },
      trial: {
        trialSubmissions: [{
          cid: String(context.completionURI || '').replace('ipfs://', '').split('/')[0],
          trialURI: context.completionURI,
          content: text,
          contentLength: text.length,
        }],
      },
    }
    return adjudicateScore(evidence, text)
  } catch (e) {
    return {
      schema: 'op-control/validator-adjudication/v1-fallback',
      score: Math.min(100, Math.round(text.length / 20)),
      verdict: 'fallback',
      reason: `scoring-adjudicator unavailable: ${e.message}`,
      checks: [
        { name: 'completion_text_present', passed: true, detail: `${text.length} chars` },
      ],
    }
  }
}

function buildV1PrepareSummary(context, completionPayload, completionFetchOk) {
  const zero = '0x0000000000000000000000000000000000000000'
  const checks = []
  const add = (name, passed, detail = '') => checks.push({ name, passed, detail })

  add('job_id_numeric', /^\d+$/.test(String(context.jobId)), String(context.jobId))
  add('v1_contract_present', /^0x[a-f0-9]{40}$/.test(String(context.contract).toLowerCase()), context.contract)
  add('rpc_reachable', !context.rpcError, context.rpcError || 'ok')
  add('v1_validateJob_abi', context.hasValidateJob, 'validateJob(uint256,string,bytes32[])')
  add('v1_disputeJob_abi', context.hasDisputeJob, 'disputeJob(uint256)')
  add('job_exists_onchain', String(context.core?.employer || '').toLowerCase() !== zero, context.core?.employer || '(unknown)')
  add('completion_uri_present', Boolean(context.completionURI), context.completionURI || '(missing)')
  add('completion_payload_fetched', Boolean(completionFetchOk), completionFetchOk ? 'ok' : 'not fetched')
  add('completion_payload_json', Boolean(completionPayload && typeof completionPayload === 'object'), typeof completionPayload)
  add('completion_text_present', extractScoringTextFromPayload(completionPayload || '').trim().length > 0, 'validator-scoring text extraction')

  const passed = checks.filter((c) => c.passed).length
  const failed = checks.length - passed
  return {
    verdict: failed === 0 ? 'READY' : 'NEEDS_REVIEW',
    passed,
    failed,
    total: checks.length,
    checks,
    recommendation: failed === 0
      ? 'Validation package ready for operator review and signing.'
      : `Resolve ${failed} check(s) before signing validator tx.`,
  }
}

function buildUnsignedValidatePackage({ jobId, completionURI, contract, chainId, proof = [] }) {
  return {
    schema: 'op-control/unsigned-tx/v1',
    lane: 'v1',
    action: 'validate',
    jobId: String(jobId),
    to: contract,
    value: '0x0',
    chainId,
    method: 'validateJob(uint256,string,bytes32[])',
    args: {
      jobId: String(jobId),
      jobCompletionURI: completionURI,
      validatorProof: proof,
    },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    preconditions: [
      'Confirm this is the correct v1 AGIJobManager contract and chain.',
      'Verify completion URI payload and adjudication summary.',
      'Confirm validator proof requirement is satisfied for this wallet.',
    ],
  }
}

function buildUnsignedDisputePackage({ jobId, contract, chainId }) {
  return {
    schema: 'op-control/unsigned-tx/v1',
    lane: 'v1',
    action: 'dispute',
    jobId: String(jobId),
    to: contract,
    value: '0x0',
    chainId,
    method: 'disputeJob(uint256)',
    args: {
      jobId: String(jobId),
    },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    preconditions: [
      'Document dispute rationale in evidence snapshot and adjudication output.',
      'Confirm dispute timing window is still open on-chain.',
      'Confirm contract + chain match intended external v1 job.',
    ],
  }
}

function attachCalldata(pkg, iface) {
  if (!iface) return pkg
  try {
    const fn = iface.getFunction(pkg.method)
    const args = pkg.action === 'validate'
      ? [BigInt(pkg.args.jobId), pkg.args.jobCompletionURI, pkg.args.validatorProof || []]
      : [BigInt(pkg.args.jobId)]
    const data = iface.encodeFunctionData(fn, args)
    return { ...pkg, data }
  } catch {
    return { ...pkg, data: '' }
  }
}

function upsertExternalValidatorState(jobId, context, packages) {
  const statePath = join(AGENT_STATE_DIR, `${jobId}.json`)
  const existing = readJsonSafe(statePath, null) || {
    jobId: String(jobId),
    source: 'agijobmanager',
    createdAt: new Date().toISOString(),
    txPackages: [],
    receipts: [],
  }

  const keep = (existing.txPackages || []).filter((p) => !p.externalValidator)
  const mapped = packages.map((pkg) => ({
    action: pkg.action,
    file: pkg.unsignedTxPath,
    unsignedTxPath: pkg.unsignedTxPath,
    reviewManifestPath: pkg.reviewManifestPath,
    createdAt: pkg.createdAt,
    expiresAt: pkg.expiresAt,
    fresh: Date.parse(pkg.expiresAt) > Date.now(),
    expired: Date.parse(pkg.expiresAt) <= Date.now(),
    signed: false,
    externalValidator: true,
    checklist: pkg.checklist,
  }))

  const next = {
    ...existing,
    jobId: String(jobId),
    source: 'agijobmanager',
    status: existing.status || 'completion_pending_review',
    completionURI: context.completionURI || existing.completionURI || '',
    employer: context.core?.employer || existing.employer || '',
    assignedAgent: context.core?.assignedAgent || existing.assignedAgent || '',
    txPackages: [...keep, ...mapped],
    updatedAt: new Date().toISOString(),
  }

  atomicWriteJson(statePath, next)
  return statePath
}

app.post('/api/validator/v1/prepare', async (req, res) => {
  try {
    const rawJobId = String(req.body?.jobId || '').trim()
    const numericJobId = extractNumericJobId(rawJobId)
    if (!numericJobId) return res.status(400).json({ error: 'jobId must include a numeric id' })

    const contractHint = String(req.body?.contractHint || AGI_JOB_MANAGER_CONTRACT || '').toLowerCase()
    if (!/^0x[a-f0-9]{40}$/.test(contractHint)) {
      return res.status(400).json({ error: 'contract hint invalid; expected 0x-prefixed address' })
    }

    const context = await fetchV1JobContext(numericJobId, contractHint)
    if (!context.completionURI) {
      return res.status(422).json({ error: 'No completion URI found for this v1 job' })
    }

    const completionPayload = await fetchIpfsPayload(context.completionURI)
    const completionBrief = normalizeCompletionBriefPayload(completionPayload.json || {}, context.completionURI)
    const dryRunSummary = buildV1PrepareSummary(context, completionPayload.json, completionPayload.ok)
    const adjudication = await buildV1AdjudicationPayload(context, completionPayload.json || completionPayload.text || '')

    const baseDir = buildExternalValidationDir(numericJobId)
    const evidencePath = join(baseDir, 'evidence_snapshot.json')
    const adjudicationPath = join(baseDir, 'adjudication_output.json')

    const validatePkg = attachCalldata(buildUnsignedValidatePackage({
      jobId: numericJobId,
      completionURI: context.completionURI,
      contract: context.contract,
      chainId: context.chainId,
      proof: Array.isArray(req.body?.validatorProof) ? req.body.validatorProof : [],
    }), context.iface)

    const disputePkg = attachCalldata(buildUnsignedDisputePackage({
      jobId: numericJobId,
      contract: context.contract,
      chainId: context.chainId,
    }), context.iface)

    const validateTxPath = join(baseDir, 'unsigned_validate_tx.json')
    const disputeTxPath = join(baseDir, 'unsigned_dispute_tx.json')
    const validateReviewPath = join(baseDir, 'review_manifest_validate.json')
    const disputeReviewPath = join(baseDir, 'review_manifest_dispute.json')

    const guardrails = {
      expectedContract: context.contract,
      expectedChainId: context.chainId || '(unknown)',
      rpc: ETH_RPC_URL,
      validateMethod: 'validateJob(uint256,string,bytes32[])',
      disputeMethod: 'disputeJob(uint256)',
    }

    const validateChecklist = [
      'Confirm completion brief is acceptable and checks pass.',
      'Open review manifest and verify contract + chain guardrails.',
      'Sign unsigned validate tx with operator wallet only.',
    ]
    const disputeChecklist = [
      'Confirm dispute rationale from evidence + adjudication output.',
      'Open review manifest and verify contract + chain guardrails.',
      'Sign unsigned dispute tx with operator wallet only.',
    ]

    writeJsonFile(evidencePath, {
      schema: 'op-control/validator-evidence-snapshot/v1',
      generatedAt: new Date().toISOString(),
      context,
      completionPayload: {
        ok: completionPayload.ok,
        source: completionPayload.source,
        completionURI: context.completionURI,
        payload: completionPayload.json || null,
        payloadText: completionPayload.json ? null : completionPayload.text,
      },
      dryRunSummary,
    })
    writeJsonFile(adjudicationPath, adjudication)
    writeJsonFile(validateTxPath, validatePkg)
    writeJsonFile(disputeTxPath, disputePkg)

    writeJsonFile(validateReviewPath, {
      schema: 'op-control/review-manifest/v1',
      generatedAt: new Date().toISOString(),
      lane: 'v1',
      action: 'validate',
      jobId: String(numericJobId),
      checklist: validateChecklist,
      guardrails,
      attachments: [
        { role: 'evidence snapshot', file: evidencePath },
        { role: 'adjudication', file: adjudicationPath },
        { role: 'unsigned tx', file: validateTxPath },
      ],
    })

    writeJsonFile(disputeReviewPath, {
      schema: 'op-control/review-manifest/v1',
      generatedAt: new Date().toISOString(),
      lane: 'v1',
      action: 'dispute',
      jobId: String(numericJobId),
      checklist: disputeChecklist,
      guardrails,
      attachments: [
        { role: 'evidence snapshot', file: evidencePath },
        { role: 'adjudication', file: adjudicationPath },
        { role: 'unsigned tx', file: disputeTxPath },
      ],
    })

    const validateCandidate = {
      action: 'validate',
      unsignedTxPath: validateTxPath,
      reviewManifestPath: validateReviewPath,
      checklist: validateChecklist,
      createdAt: validatePkg.createdAt,
      expiresAt: validatePkg.expiresAt,
    }
    const disputeCandidate = {
      action: 'dispute',
      unsignedTxPath: disputeTxPath,
      reviewManifestPath: disputeReviewPath,
      checklist: disputeChecklist,
      createdAt: disputePkg.createdAt,
      expiresAt: disputePkg.expiresAt,
    }

    const stateFile = upsertExternalValidatorState(numericJobId, context, [validateCandidate, disputeCandidate])

    const result = {
      ok: true,
      schema: 'op-control/validator-v1-prepare/v1',
      jobId: String(numericJobId),
      contract: context.contract,
      chainId: context.chainId,
      completionURI: context.completionURI,
      completionBrief,
      dryRunSummary,
      guardrails,
      artifacts: {
        dir: baseDir,
        evidenceSnapshotPath: evidencePath,
        adjudicationPath,
      },
      txCandidates: {
        approve: validateCandidate,
        dispute: disputeCandidate,
      },
      stateTracking: {
        stateFile,
        trackedActions: ['validate', 'dispute'],
      },
    }

    writeJsonFile(join(baseDir, 'prepare_result.json'), result)
    res.json(result)
  } catch (e) {
    console.error('[validator-v1-prepare] failed:', e.message)
    res.status(500).json({ error: e.message || 'Failed to prepare external validator package' })
  }
})

app.get('/api/jobs/:jobId/operator-view', async (req, res) => {
  try {
    const rawJobId = String(req.params.jobId || '').trim()
    const numericJobId = extractNumericJobId(rawJobId)
    if (!numericJobId) return res.status(400).json({ error: 'jobId must include a numeric id' })

    const source = String(req.query?.source || '').toLowerCase()
    const managerVersion = String(req.query?.managerVersion || '').toLowerCase()
    const contractHint = String(req.query?.contractHint || '').trim()

    if (source === 'agijobmanager-v2' || managerVersion === 'v2') {
      const view = await buildV2OperatorView(numericJobId, { contractHint })
      return res.json({ ok: true, ...view })
    }

    const view = await buildV1OperatorView(numericJobId, { contractHint })
    return res.json({ ok: true, ...view })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to build operator view' })
  }
})

function primeProcDir(procurementId) {
  return join(PROC_ARTIFACTS_DIR, `proc_${procurementId}`)
}

function primeScoringDir(procurementId) {
  return join(primeProcDir(procurementId), 'scoring')
}

function normalizeWalletAddress(addr) {
  const v = String(addr || '').trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(v) ? v : ''
}

function buildPrimeFinalistContextHash(procState, inputJob) {
  const finalists = []
  for (const source of [procState?.finalists, procState?.shortlist, inputJob?.finalists, inputJob?.shortlistedAgents]) {
    if (Array.isArray(source)) {
      for (const item of source) {
        const v = String(item || '').trim().toLowerCase()
        if (v) finalists.push(v)
      }
    }
  }
  const unique = Array.from(new Set(finalists)).sort()
  if (!unique.length) return ''
  return createHash('sha256').update(JSON.stringify(unique), 'utf8').digest('hex')
}

function explorerTxUrl(txHash) {
  const h = String(txHash || '')
  if (!/^0x[a-fA-F0-9]{64}$/.test(h)) return ''
  return `https://etherscan.io/tx/${h}`
}

async function getPrimeContractInterface() {
  const { ethers } = await import('ethers')
  const abiPath = join(WORKSPACE_ROOT, 'agent', 'abi', 'AGIJobDiscoveryPrime.json')
  const abiRaw = readJsonSafe(abiPath, [])
  const abi = Array.isArray(abiRaw) ? abiRaw : (abiRaw?.abi || [])
  const fallback = [
    'function scoreCommit(uint256 procurementId, bytes32 scoreCommitment)',
    'function scoreReveal(uint256 procurementId, uint256 score, bytes32 salt)',
    'function isAssignedValidator(uint256 procurementId, address validator) view returns (bool)',
    'function validatorAssigned(uint256 procurementId, address validator) view returns (bool)',
    'function validatorAssignments(uint256 procurementId, address validator) view returns (bool)',
    'function agialpha() view returns (address)',
  ]
  const mergedAbi = [...(Array.isArray(abi) ? abi : []), ...fallback]
  return {
    ethers,
    iface: new ethers.Interface(mergedAbi),
  }
}

function upsertPrimeValidatorState(procurementId, patch = {}) {
  const procDir = primeProcDir(procurementId)
  mkdirSync(procDir, { recursive: true })
  const statePath = join(procDir, 'state.json')
  const state = readJsonSafe(statePath, null) || {
    procurementId: String(procurementId),
    source: 'agiprimediscovery',
    txPackages: [],
    receipts: [],
    createdAt: new Date().toISOString(),
  }
  const next = {
    ...state,
    ...patch,
    procurementId: String(procurementId),
    source: 'agiprimediscovery',
    updatedAt: new Date().toISOString(),
  }
  atomicWriteJson(statePath, next)
  return { statePath, state: next }
}

function upsertPrimeValidatorTxPackage(procurementId, pkg) {
  const { statePath, state } = upsertPrimeValidatorState(procurementId)
  const txPackages = Array.isArray(state.txPackages) ? [...state.txPackages] : []
  const keep = txPackages.filter((p) => !(p?.externalPrimeValidator && String(p?.action || '') === String(pkg.action || '')))
  keep.push({
    action: pkg.action,
    file: pkg.unsignedTxPath,
    unsignedTxPath: pkg.unsignedTxPath,
    reviewManifestPath: pkg.reviewManifestPath,
    createdAt: pkg.createdAt,
    expiresAt: pkg.expiresAt,
    fresh: Date.parse(pkg.expiresAt) > Date.now(),
    expired: Date.parse(pkg.expiresAt) <= Date.now(),
    signed: false,
    externalPrimeValidator: true,
    checklist: pkg.checklist,
  })
  const next = {
    ...state,
    status: pkg.action === 'score_reveal' ? 'validator_score_reveal_ready' : 'validator_score_commit_ready',
    txPackages: keep,
    updatedAt: new Date().toISOString(),
  }
  atomicWriteJson(statePath, next)
  return { statePath, state: next }
}

async function readPrimeRoleAssignment({ procurementId, walletAddress, contractAddr, iface }) {
  const out = { assigned: false, source: 'state' }
  if (!walletAddress) return out

  const probes = [
    'isAssignedValidator(uint256,address)',
    'validatorAssigned(uint256,address)',
    'validatorAssignments(uint256,address)',
  ]
  for (const sig of probes) {
    try {
      const fn = iface.getFunction(sig)
      const data = iface.encodeFunctionData(fn, [BigInt(procurementId), walletAddress])
      const raw = await rpcEthCall(contractAddr, data)
      const decoded = iface.decodeFunctionResult(fn, raw)
      if (Boolean(decoded?.[0])) return { assigned: true, source: `onchain:${sig}` }
    } catch {}
  }
  return out
}

async function readPrimeAllowance({ walletAddress, contractAddr }) {
  const empty = { allowanceRaw: '0', tokenAddress: '', source: 'unavailable' }
  if (!walletAddress || !/^0x[a-f0-9]{40}$/.test(contractAddr)) return empty
  try {
    const selectorAgialpha = '0x658bb543'
    const tokenRaw = await rpcEthCall(contractAddr, selectorAgialpha)
    const tokenAddress = `0x${String(tokenRaw || '').replace(/^0x/, '').slice(-40)}`.toLowerCase()
    if (!/^0x[a-f0-9]{40}$/.test(tokenAddress)) return empty

    const owner = walletAddress.replace(/^0x/, '').padStart(64, '0')
    const spender = contractAddr.replace(/^0x/, '').padStart(64, '0')
    const allowanceRawHex = await rpcEthCall(tokenAddress, `0xdd62ed3e${owner}${spender}`)
    const allowanceRaw = BigInt(String(allowanceRawHex || '0x0')).toString()
    return { allowanceRaw, tokenAddress, source: 'onchain:erc20.allowance' }
  } catch {
    return empty
  }
}

async function buildPrimeValidatorContext({ procurementId, requestedWallet = '', inputJob = null }) {
  const walletAddress = normalizeWalletAddress(requestedWallet)
  const procDir = primeProcDir(procurementId)
  const scoringDir = primeScoringDir(procurementId)
  mkdirSync(scoringDir, { recursive: true })

  const procState = readJsonSafe(join(procDir, 'state.json'), null) || {}
  const commitPayload = readJsonSafe(join(scoringDir, 'score_commit_payload.json'), null)
  const revealPayload = readJsonSafe(join(scoringDir, 'score_reveal_payload.json'), null)
  const adjudication = readJsonSafe(join(scoringDir, 'adjudication_result.json'), null)

  const deadlines = {
    commitDeadline: normalizeTsSeconds(inputJob?.commitDeadline ?? inputJob?.deadlines?.commitDeadline ?? procState?.deadlines?.commitDeadline),
    revealDeadline: normalizeTsSeconds(inputJob?.revealDeadline ?? inputJob?.deadlines?.revealDeadline ?? procState?.deadlines?.revealDeadline),
    finalistAcceptDeadline: normalizeTsSeconds(inputJob?.finalistAcceptDeadline ?? inputJob?.deadlines?.finalistAcceptDeadline ?? procState?.deadlines?.finalistAcceptDeadline),
    trialDeadline: normalizeTsSeconds(inputJob?.trialDeadline ?? inputJob?.deadlines?.trialDeadline ?? procState?.deadlines?.trialDeadline),
    scoreCommitDeadline: normalizeTsSeconds(inputJob?.scoreCommitDeadline ?? inputJob?.deadlines?.scoreCommitDeadline ?? procState?.deadlines?.scoreCommitDeadline),
    scoreRevealDeadline: normalizeTsSeconds(inputJob?.scoreRevealDeadline ?? inputJob?.deadlines?.scoreRevealDeadline ?? procState?.deadlines?.scoreRevealDeadline),
  }

  const actionCode = String(inputJob?.nextActionCode ?? inputJob?.nextAction ?? procState?.nextActionCode ?? '').toUpperCase()
  const phase = decodePrimeActionPhase(actionCode)
  const windowStatus = inferPrimeWindowStatus(phase, deadlines)

  const { iface } = await getPrimeContractInterface()
  const contractAddr = String(inputJob?.links?.contract || procState?.contract || AGI_PRIME_CONTRACT).toLowerCase()
  const role = await readPrimeRoleAssignment({ procurementId, walletAddress, contractAddr, iface })
  const allowance = await readPrimeAllowance({ walletAddress, contractAddr })

  const bondRequiredRaw = String(
    procState?.validatorScoreBond
    ?? procState?.validatorBond
    ?? procState?.procurement?.validatorScoreBond
    ?? inputJob?.validatorScoreBond
    ?? inputJob?.validatorBond
    ?? '0',
  )

  const prechecks = buildPrimeValidatorPrechecks({
    roleAssigned: role.assigned,
    windowStatus,
    bondRequiredRaw,
    allowanceRaw: allowance.allowanceRaw,
    commitPayload,
    revealPayload,
  })

  return {
    walletAddress,
    contractAddr,
    chainId: String(await rpcCall('eth_chainId', [], 5000).catch(() => PRIME_DEFAULT_CHAIN_ID) || PRIME_DEFAULT_CHAIN_ID),
    procDir,
    scoringDir,
    procState,
    commitPayload,
    revealPayload,
    adjudication,
    deadlines,
    phase,
    windowStatus,
    prechecks,
    role,
    allowance,
    bondRequiredRaw,
    finalistContextHash: buildPrimeFinalistContextHash(procState, inputJob),
    actionCode,
  }
}

function ensurePrimePackageFreshness(expiresAt) {
  const expiresMs = Date.parse(String(expiresAt || ''))
  return {
    fresh: Number.isFinite(expiresMs) ? expiresMs > Date.now() : true,
    expired: Number.isFinite(expiresMs) ? expiresMs <= Date.now() : false,
  }
}

app.post('/api/validator/prime/score-commit', async (req, res) => {
  try {
    const procurementId = String(req.body?.procurementId || '').trim()
    if (!/^\d+$/.test(procurementId)) return res.status(400).json({ error: 'procurementId must be numeric' })

    const context = await buildPrimeValidatorContext({
      procurementId,
      requestedWallet: req.body?.walletAddress,
      inputJob: req.body?.job || null,
    })

    const scoreValue = Number(
      req.body?.score
      ?? context?.commitPayload?.score
      ?? context?.adjudication?.score
      ?? context?.procState?.validatorScore
      ?? 0,
    )
    if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
      return res.status(422).json({ error: 'score must be numeric in [0,100]' })
    }

    const salt = String(
      req.body?.salt
      || context?.commitPayload?.salt
      || `0x${createHash('sha256').update(`${procurementId}:${scoreValue}:${Date.now()}`, 'utf8').digest('hex')}`,
    )

    const { computeScoreCommitment } = await import('../validation/scoring-adjudicator.js')
    const scoreCommitment = computeScoreCommitment(scoreValue, salt)

    const { iface } = await getPrimeContractInterface()
    const fn = iface.getFunction('scoreCommit(uint256,bytes32)')
    const calldata = iface.encodeFunctionData(fn, [BigInt(procurementId), scoreCommitment])

    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const unsignedTxPath = join(context.scoringDir, 'unsigned_score_commit_tx.json')
    const reviewManifestPath = join(context.scoringDir, 'review_manifest_score_commit.json')
    const commitPayloadPath = join(context.scoringDir, 'score_commit_payload.json')

    const txPkg = {
      schema: 'op-control/unsigned-tx/v1',
      lane: 'prime',
      action: 'score_commit',
      procurementId,
      to: context.contractAddr,
      chainId: context.chainId,
      value: '0x0',
      method: 'scoreCommit(uint256,bytes32)',
      args: { procurementId, scoreCommitment },
      data: calldata,
      createdAt,
      expiresAt,
      walletAddress: context.walletAddress || null,
      finalistContextHash: context.finalistContextHash,
      preconditions: [
        'Wallet is assigned validator for this procurement',
        'Score commit phase window is open',
        'AGIALPHA allowance covers validator bond requirement',
        'Commitment is derived from score + salt consistently',
      ],
    }

    writeJsonFile(commitPayloadPath, {
      procurementId,
      score: scoreValue,
      salt,
      scoreCommitment,
      walletAddress: context.walletAddress || '',
      finalistContextHash: context.finalistContextHash,
      generatedAt: createdAt,
    })
    writeJsonFile(unsignedTxPath, txPkg)

    const checklist = [
      'Confirm wallet role assignment and correct procurement id.',
      'Confirm commit window is open and allowance/bond check passes.',
      'Confirm commitment hash equals score + salt from score_commit_payload.json.',
      'Sign unsigned tx only after review manifest confirmation.',
    ]

    writeJsonFile(reviewManifestPath, {
      schema: 'op-control/review-manifest/v1',
      lane: 'prime',
      action: 'score_commit',
      procurementId,
      generatedAt: createdAt,
      guardrails: {
        contract: context.contractAddr,
        chainId: context.chainId,
        walletAddress: context.walletAddress || '(not provided)',
        phase: context.phase,
        windowStatus: context.windowStatus,
      },
      checklist,
      prechecks: context.prechecks,
      files: {
        scoreCommitPayload: commitPayloadPath,
        unsignedTxPath,
      },
    })

    upsertPrimeValidatorTxPackage(procurementId, {
      action: 'score_commit',
      unsignedTxPath,
      reviewManifestPath,
      createdAt,
      expiresAt,
      checklist,
      ...ensurePrimePackageFreshness(expiresAt),
    })

    const timelineState = readJsonSafe(join(context.procDir, 'state.json'), {})

    res.json({
      ok: true,
      schema: 'op-control/prime-validator-score-commit/v1',
      procurementId,
      txCandidate: {
        commit: {
          action: 'score_commit',
          unsignedTxPath,
          reviewManifestPath,
          createdAt,
          expiresAt,
        },
      },
      prechecks: context.prechecks,
      guardrails: {
        contract: context.contractAddr,
        chainId: context.chainId,
        walletAddress: context.walletAddress || '(not provided)',
        phase: context.phase,
        windowStatus: context.windowStatus,
        roleSource: context.role.source,
        allowanceSource: context.allowance.source,
      },
      timeline: buildPrimeValidatorTimeline(timelineState),
    })
  } catch (e) {
    console.error('[validator-prime-score-commit] failed:', e.message)
    res.status(500).json({ error: e.message || 'Failed to generate prime score commit package' })
  }
})

app.post('/api/validator/prime/score-reveal', async (req, res) => {
  try {
    const procurementId = String(req.body?.procurementId || '').trim()
    if (!/^\d+$/.test(procurementId)) return res.status(400).json({ error: 'procurementId must be numeric' })

    const context = await buildPrimeValidatorContext({
      procurementId,
      requestedWallet: req.body?.walletAddress,
      inputJob: req.body?.job || null,
    })

    if (!context.commitPayload) {
      return res.status(422).json({ error: 'Missing score_commit_payload.json; generate score commit package first' })
    }

    const scoreValue = Number(req.body?.score ?? context.commitPayload?.score)
    const salt = String(req.body?.salt || context.commitPayload?.salt || '')
    if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
      return res.status(422).json({ error: 'score must be numeric in [0,100]' })
    }
    if (!salt) return res.status(422).json({ error: 'salt missing for score reveal' })

    const { computeScoreCommitment } = await import('../validation/scoring-adjudicator.js')
    const recomputedCommitment = computeScoreCommitment(scoreValue, salt)

    const revealPayload = {
      procurementId,
      score: scoreValue,
      salt,
      walletAddress: context.walletAddress || normalizeWalletAddress(context.commitPayload?.walletAddress),
      finalistContextHash: context.finalistContextHash || String(context.commitPayload?.finalistContextHash || ''),
      expectedCommitment: String(context.commitPayload?.scoreCommitment || ''),
      recomputedCommitment,
      generatedAt: new Date().toISOString(),
    }

    const revealGuard = verifyRevealSafety({
      requestedWallet: context.walletAddress,
      commitPayload: context.commitPayload,
      revealPayload,
    })

    if (!revealGuard.allowed) {
      return res.status(422).json({
        error: `Reveal blocked: ${revealGuard.blockingReason}`,
        revealGuard,
        prechecks: context.prechecks,
      })
    }

    const { iface } = await getPrimeContractInterface()
    const fn = iface.getFunction('scoreReveal(uint256,uint256,bytes32)')
    const calldata = iface.encodeFunctionData(fn, [BigInt(procurementId), BigInt(Math.round(scoreValue)), salt])

    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const unsignedTxPath = join(context.scoringDir, 'unsigned_score_reveal_tx.json')
    const reviewManifestPath = join(context.scoringDir, 'review_manifest_score_reveal.json')
    const revealPayloadPath = join(context.scoringDir, 'score_reveal_payload.json')

    const txPkg = {
      schema: 'op-control/unsigned-tx/v1',
      lane: 'prime',
      action: 'score_reveal',
      procurementId,
      to: context.contractAddr,
      chainId: context.chainId,
      value: '0x0',
      method: 'scoreReveal(uint256,uint256,bytes32)',
      args: { procurementId, score: String(Math.round(scoreValue)), salt },
      data: calldata,
      createdAt,
      expiresAt,
      walletAddress: revealPayload.walletAddress || null,
      finalistContextHash: revealPayload.finalistContextHash || '',
      preconditions: [
        'Reveal must use same wallet as score commit package',
        'Reveal score and salt must match committed values',
        'Procurement and finalist context must match committed context',
        'Commitment recomputation must match committed hash before signing',
      ],
    }

    writeJsonFile(revealPayloadPath, revealPayload)
    writeJsonFile(unsignedTxPath, txPkg)

    const checklist = [
      'Confirm same wallet as score commit package.',
      'Confirm same score and same salt as committed values.',
      'Confirm procurement and finalist context hash match commit payload.',
      'Confirm recomputed commitment matches committed commitment.',
    ]

    writeJsonFile(reviewManifestPath, {
      schema: 'op-control/review-manifest/v1',
      lane: 'prime',
      action: 'score_reveal',
      procurementId,
      generatedAt: createdAt,
      revealGuard,
      guardrails: {
        contract: context.contractAddr,
        chainId: context.chainId,
        walletAddress: revealPayload.walletAddress || '(not provided)',
        phase: context.phase,
        windowStatus: context.windowStatus,
      },
      checklist,
      files: {
        scoreCommitPayload: join(context.scoringDir, 'score_commit_payload.json'),
        scoreRevealPayload: revealPayloadPath,
        unsignedTxPath,
      },
    })

    upsertPrimeValidatorTxPackage(procurementId, {
      action: 'score_reveal',
      unsignedTxPath,
      reviewManifestPath,
      createdAt,
      expiresAt,
      checklist,
      ...ensurePrimePackageFreshness(expiresAt),
    })

    const timelineState = readJsonSafe(join(context.procDir, 'state.json'), {})

    res.json({
      ok: true,
      schema: 'op-control/prime-validator-score-reveal/v1',
      procurementId,
      txCandidate: {
        reveal: {
          action: 'score_reveal',
          unsignedTxPath,
          reviewManifestPath,
          createdAt,
          expiresAt,
        },
      },
      prechecks: context.prechecks,
      revealGuard,
      guardrails: {
        contract: context.contractAddr,
        chainId: context.chainId,
        walletAddress: revealPayload.walletAddress || '(not provided)',
        phase: context.phase,
        windowStatus: context.windowStatus,
      },
      timeline: buildPrimeValidatorTimeline(timelineState),
    })
  } catch (e) {
    console.error('[validator-prime-score-reveal] failed:', e.message)
    res.status(500).json({ error: e.message || 'Failed to generate prime score reveal package' })
  }
})

app.get('/api/validator/prime/:procurementId/timeline', (req, res) => {
  try {
    const procurementId = String(req.params.procurementId || '').trim()
    if (!/^\d+$/.test(procurementId)) return res.status(400).json({ error: 'procurementId must be numeric' })

    const state = readJsonSafe(join(primeProcDir(procurementId), 'state.json'), null)
    if (!state) return res.status(404).json({ error: 'procurement state not found' })

    const timeline = buildPrimeValidatorTimeline(state)
    for (const key of ['commit', 'reveal', 'winner']) {
      timeline[key] = {
        ...timeline[key],
        txUrl: timeline[key]?.txHash ? explorerTxUrl(timeline[key].txHash) : '',
      }
    }

    res.json({
      ok: true,
      procurementId,
      timeline,
      status: state.status || 'unknown',
      updatedAt: state.updatedAt || state.lastChainSync || null,
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to build prime validator timeline' })
  }
})

app.get('/api/procurements/:procurementId/artifacts', (req, res) => {
  try {
    const procurementId = String(req.params.procurementId || '').trim()
    if (!/^\d+$/.test(procurementId)) return res.status(400).json({ error: 'procurementId must be numeric' })

    const { procDir, entries } = getProcArtifactEntries(procurementId)
    const artifacts = entries.map((entry) => ({
      key: entry.key,
      label: entry.label,
      exists: existsSync(entry.file),
      path: entry.file,
      url: `/api/procurements/${encodeURIComponent(procurementId)}/artifacts/${encodeURIComponent(entry.key)}`,
    }))

    res.json({
      ok: true,
      procurementId,
      rootDir: procDir,
      artifacts,
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to list procurement artifacts' })
  }
})

app.get('/api/procurements/:procurementId/artifacts/:key', (req, res) => {
  try {
    const procurementId = String(req.params.procurementId || '').trim()
    const key = String(req.params.key || '').trim()
    if (!/^\d+$/.test(procurementId)) return res.status(400).json({ error: 'procurementId must be numeric' })

    const { procDir, entries } = getProcArtifactEntries(procurementId)
    const entry = entries.find((x) => x.key === key)
    if (!entry) return res.status(404).json({ error: 'artifact key not found' })

    const resolved = resolve(entry.file)
    const procResolved = resolve(procDir)
    if (!resolved.startsWith(procResolved + '/')) {
      return res.status(400).json({ error: 'invalid artifact path' })
    }
    if (!existsSync(resolved)) return res.status(404).json({ error: 'artifact file not found' })

    const text = readFileSync(resolved, 'utf8')
    if (resolved.endsWith('.json')) {
      res.type('application/json; charset=utf-8')
      return res.send(text)
    }
    res.type('text/plain; charset=utf-8')
    return res.send(text)
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to read artifact file' })
  }
})

app.post('/api/scoring/completion-uri', async (req, res) => {
  try {
    const completionURI = String(req.body?.completionURI || '').trim()
    if (!completionURI) return res.status(400).json({ error: 'completionURI is required' })
    if (!completionURI.startsWith('ipfs://')) return res.status(400).json({ error: 'completionURI must start with ipfs://' })

    const payload = await fetchIpfsPayload(completionURI)
    if (!payload.ok) return res.status(502).json({ error: payload.error || 'Failed to fetch completion URI payload' })

    const textForScoring = extractScoringTextFromPayload(payload.json || payload.text || '')
    if (!textForScoring || textForScoring.trim().length === 0) {
      return res.status(422).json({ error: 'Completion payload does not contain scoreable text' })
    }

    const nowSec = Math.floor(Date.now() / 1000)
    const deadlines = {
      trial: normalizeTsSeconds(req.body?.trialDeadline),
      scoreCommit: normalizeTsSeconds(req.body?.scoreCommitDeadline),
      scoreReveal: normalizeTsSeconds(req.body?.scoreRevealDeadline),
    }

    const evidence = {
      procurementId: String(req.body?.procurementId || ''),
      procurement: {
        procStruct: {
          jobId: extractNumericJobId(req.body?.jobId || ''),
        },
        deadlines,
        isScorePhase: Boolean((deadlines.scoreCommit && nowSec >= deadlines.scoreCommit) || (deadlines.trial && nowSec >= deadlines.trial)),
      },
      trial: {
        trialSubmissions: [
          {
            cid: completionURI.replace('ipfs://', '').split('/')[0],
            trialURI: completionURI,
            content: textForScoring,
            contentLength: textForScoring.length,
          },
        ],
      },
    }

    const { adjudicateScore } = await import('../validation/scoring-adjudicator.js')
    const adjudication = adjudicateScore(evidence, textForScoring)

    res.json({
      ok: true,
      schema: 'mission-control/completion-uri-score/v1',
      completionURI,
      fetchedFrom: payload.source,
      payloadType: payload.json ? 'json' : 'text',
      textLength: textForScoring.length,
      adjudication,
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to score completion URI' })
  }
})

app.post('/api/jobs/:jobId/validate-dryrun', async (req, res) => {
  try {
    const rawJobId = String(req.params.jobId || '').trim()
    if (!rawJobId) return res.status(400).json({ error: 'jobId is required' })

    const numericJobId = extractNumericJobId(rawJobId)
    if (!numericJobId) {
      return res.status(400).json({ error: 'jobId must include a numeric id (examples: 12, V2-12)' })
    }

    const managerVersion = String(req.body?.managerVersion || '').toLowerCase()
    const source = String(req.body?.source || '').toLowerCase()

    let report
    let mode = 'contract1-dryrun'

    if (managerVersion === 'v2' || source === 'agijobmanager-v2') {
      mode = 'v2-onchain'
      report = await buildV2ValidationReport(numericJobId)
    } else if (source === 'agiprimediscovery') {
      mode = 'prime-scoring'
      report = buildPrimeScoringValidationReport(numericJobId, req.body?.job || null)
    } else {
      try {
        const { dryRunContract1Validation } = await import('../validation/contract1-dryrun.js')
        report = await dryRunContract1Validation(numericJobId)
      } catch (err) {
        mode = 'fallback'
        console.warn('[validate-dryrun] using fallback validator:', err.message)
        report = buildFallbackValidationReport(numericJobId)
      }
    }

    const failedChecks = Array.isArray(report?.checks)
      ? report.checks.filter(c => c?.passed === false).map(c => ({ name: c?.name || 'unnamed_check', detail: c?.detail || '' }))
      : []

    res.json({
      ok: true,
      mode,
      managerVersion: managerVersion || (source === 'agijobmanager-v2' ? 'v2' : 'v1'),
      jobId: numericJobId,
      rawJobId,
      verdict: report?.summary?.verdict || 'UNKNOWN',
      summary: report?.summary || null,
      failedChecks,
      generatedAt: report?.generatedAt || null,
      report,
    })
  } catch (e) {
    console.error('[validate-dryrun] failed:', e.message)
    res.status(500).json({ error: e.message || 'Validation dry-run failed' })
  }
})

app.post('/api/ipfs/pin-json', async (req, res) => {
  try {
    const payload = req.body?.payload
    const name = String(req.body?.name || 'mission-control-job-request.json').trim()
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'payload object is required' })
    }
    if (!PINATA_JWT) {
      return res.status(500).json({ error: 'PINATA_JWT is not configured on server' })
    }

    const result = await pinJsonViaPinata(payload, name)
    return res.json({ ok: true, ...result })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'IPFS upload failed' })
  }
})

function parseDurationToSeconds(input, fallback = 86400) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return fallback
  if (/^\d+$/.test(raw)) return Number(raw)
  const m = raw.match(/^(\d+)(s|m|h|d)$/)
  if (!m) return fallback
  const n = Number(m[1])
  const unit = m[2]
  if (unit === 's') return n
  if (unit === 'm') return n * 60
  if (unit === 'h') return n * 3600
  if (unit === 'd') return n * 86400
  return fallback
}

function toWei18(amount) {
  const str = String(amount ?? '').trim()
  if (!str) return '0'
  if (/^\d+$/.test(str)) return str
  const [wholeRaw, fracRaw = ''] = str.split('.')
  const whole = /^\d+$/.test(wholeRaw) ? wholeRaw : '0'
  const frac = (fracRaw.replace(/\D/g, '') + '0'.repeat(18)).slice(0, 18)
  const wei = BigInt(whole) * 10n ** 18n + BigInt(frac || '0')
  return wei.toString()
}

app.post('/api/job-applications/prepare', async (req, res) => {
  try {
    const rawJobId = String(req.body?.jobId || '').trim()
    if (!/^\d+$/.test(rawJobId)) {
      return res.status(422).json({ error: 'jobId must be numeric' })
    }

    const agentSubdomain = String(req.body?.agentSubdomain || process.env.AGENT_SUBDOMAIN || '').trim()
    if (!agentSubdomain) {
      return res.status(422).json({ error: 'agentSubdomain is required to prepare apply package' })
    }

    const merkleProof = parseMerkleProofInput(req.body?.merkleProof ?? process.env.AGENT_MERKLE_PROOF)
    if (!Array.isArray(merkleProof) || merkleProof.length === 0) {
      return res.status(422).json({ error: 'merkleProof is required to prepare apply package' })
    }

    const contract = String(req.body?.contract || req.body?.contractHint || AGI_JOB_MANAGER_CONTRACT || '').toLowerCase()
    if (!/^0x[a-f0-9]{40}$/.test(contract)) {
      return res.status(422).json({ error: 'valid contract address is required' })
    }

    const { ethers, iface } = await getV1ContractInterface()
    const chainIdNum = Number(req.body?.chainId || 1)
    const chainId = Number.isFinite(chainIdNum) && chainIdNum > 0 ? `0x${Math.floor(chainIdNum).toString(16)}` : '0x1'

    let tokenAddress = String(req.body?.tokenAddress || '').trim().toLowerCase()
    if (!/^0x[a-f0-9]{40}$/.test(tokenAddress)) {
      tokenAddress = await readV1AgiTokenAddress(contract, iface)
    }
    if (!/^0x[a-f0-9]{40}$/.test(tokenAddress)) {
      return res.status(502).json({ error: 'failed to resolve AGIALPHA token address for v1 apply package' })
    }

    let bondAmountRaw = String(req.body?.bondAmountRaw || '').trim()
    if (!/^\d+$/.test(bondAmountRaw)) {
      bondAmountRaw = await readV1AgentBondRaw(contract, iface)
    }
    if (!/^\d+$/.test(bondAmountRaw)) {
      return res.status(502).json({ error: 'failed to resolve agent bond amount for v1 apply package' })
    }

    const walletAddress = normalizeWalletAddress(req.body?.walletAddress)
    const allowance = await readV1Allowance({ walletAddress, contractAddr: contract, tokenAddress })

    const existingStatePath = join(AGENT_STATE_DIR, `${rawJobId}.json`)
    const existingState = readJsonSafe(existingStatePath, null)
    const existingStatus = String(existingState?.status || '').trim().toLowerCase()
    const allowedExistingStatuses = new Set(['', 'queued', 'scored', 'application_pending_review', 'open'])
    if (existingState && !allowedExistingStatuses.has(existingStatus)) {
      return res.status(409).json({ error: `existing state is not open for apply packaging (status=${existingState.status || 'unknown'})` })
    }

    const requestedJobStatus = String(req.body?.job?.status || '').trim()
    if (requestedJobStatus && requestedJobStatus !== 'Open') {
      return res.status(409).json({ error: `job is not open for apply packaging (status=${requestedJobStatus})` })
    }

    const context = await fetchV1JobContext(rawJobId, contract)
    if (context?.core) {
      const onchainStatus = deriveJobStatus(context.core, context.validation)
      if (onchainStatus !== 'Open') {
        return res.status(409).json({ error: `job is not open for apply packaging (onchain status=${onchainStatus})` })
      }
    }

    const erc20Iface = new ethers.Interface(['function approve(address spender, uint256 amount)'])
    const approveCalldata = erc20Iface.encodeFunctionData('approve', [contract, BigInt(bondAmountRaw)])
    const applyFn = iface.getFunction('applyForJob(uint256,string,bytes32[])')
    if (!applyFn) return res.status(500).json({ error: 'applyForJob function missing in v1 ABI' })
    const applyCalldata = iface.encodeFunctionData(applyFn, [BigInt(rawJobId), agentSubdomain, merkleProof])

    const txPkg = buildUnsignedApplyJobTxPackage({
      contract,
      tokenAddress,
      chainId,
      jobId: rawJobId,
      bondAmountRaw,
      agentSubdomain,
      merkleProof,
      approveCalldata,
      applyCalldata,
    })

    const dir = join(ARTIFACTS_DIR, 'applications', `job_${rawJobId}`)
    mkdirSync(dir, { recursive: true })
    const unsignedTxPath = join(dir, 'unsigned_apply_tx.json')
    const reviewManifestPath = join(dir, 'review_manifest_apply.json')
    const payloadSnapshotPath = join(dir, 'prepare_apply_payload_snapshot.json')

    writeJsonFile(unsignedTxPath, txPkg)
    writeJsonFile(payloadSnapshotPath, req.body || {})

    const checklist = [
      'Confirm applicant wallet + agent subdomain are the intended identity for this job.',
      'Confirm merkle proof elements and jobId are correct before signing.',
      'Sign approve first, then applyForJob, with the applicant wallet only.',
    ]

    writeJsonFile(reviewManifestPath, {
      schema: 'op-control/review-manifest/v1',
      lane: 'v1',
      action: 'apply',
      generatedAt: new Date().toISOString(),
      guardrails: {
        contract,
        chainId,
        tokenAddress,
        agentSubdomain,
        jobId: rawJobId,
      },
      prechecks: {
        walletAddress: walletAddress || null,
        allowanceRaw: allowance.allowanceRaw,
        allowanceSource: allowance.source,
        bondAmountRaw,
        allowanceSufficient: walletAddress ? BigInt(allowance.allowanceRaw || '0') >= BigInt(bondAmountRaw) : null,
      },
      checklist,
      files: {
        unsignedTxPath,
        payloadSnapshotPath,
      },
      request: {
        jobId: rawJobId,
        agentSubdomain,
        merkleProof,
        tokenAddress,
        bondAmountRaw,
      },
    })

    const { statePath } = upsertV1ApplyTxPackage(rawJobId, {
      action: 'apply',
      unsignedTxPath,
      reviewManifestPath,
      createdAt: txPkg.createdAt,
      expiresAt: txPkg.expiresAt,
      checklist,
    }, {
      employer: String(req.body?.job?.employer || ''),
      assignedAgent: String(req.body?.job?.assignedAgent || ''),
      applyPreparedAt: new Date().toISOString(),
      applyPackage: {
        unsignedTxPath,
        reviewManifestPath,
        payloadSnapshotPath,
        walletAddress: walletAddress || null,
        tokenAddress,
        bondAmountRaw,
        agentSubdomain,
        allowance,
      },
    })

    return res.json({
      ok: true,
      action: 'apply',
      unsignedTxPath,
      reviewManifestPath,
      payloadSnapshotPath,
      statePath,
      tokenAddress,
      bondAmountRaw,
      agentSubdomain,
      merkleProof,
      allowance,
      checklist,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to prepare apply package' })
  }
})

app.get('/api/job-applications/:jobId/status', async (req, res) => {
  try {
    const jobId = String(req.params.jobId || '').trim()
    if (!/^\d+$/.test(jobId)) return res.status(400).json({ error: 'jobId must be numeric' })
    const contractHint = String(req.query.contract || '').trim().toLowerCase()
    const result = await reconcileV1ApplyState(jobId, contractHint)
    return res.json({ ok: true, state: result.state, summary: result.summary, statePath: result.statePath })
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Failed to load apply status' })
  }
})

app.post('/api/job-applications/:jobId/reconcile', async (req, res) => {
  try {
    const jobId = String(req.params.jobId || '').trim()
    if (!/^\d+$/.test(jobId)) return res.status(400).json({ error: 'jobId must be numeric' })
    const contractHint = String(req.body?.contract || req.body?.contractHint || '').trim().toLowerCase()
    const result = await reconcileV1ApplyState(jobId, contractHint)
    return res.json({ ok: true, state: result.state, summary: result.summary, statePath: result.statePath })
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Failed to reconcile apply state' })
  }
})

app.post('/api/job-requests', async (req, res) => {
  try {
    const specURI = normalizeAssetUri(req.body?.ipfsUri)
    if (!specURI.startsWith('ipfs://')) {
      return res.status(422).json({ error: 'ipfsUri must be an ipfs:// URI before generating request package' })
    }

    const contract = String(req.body?.contract || AGI_JOB_MANAGER_CONTRACT || '').toLowerCase()
    if (!/^0x[a-f0-9]{40}$/.test(contract)) {
      return res.status(422).json({ error: 'valid contract address is required' })
    }

    const chainIdNum = Number(req.body?.chainId || 1)
    const chainId = Number.isFinite(chainIdNum) && chainIdNum > 0 ? `0x${Math.floor(chainIdNum).toString(16)}` : '0x1'

    const payoutRaw = toWei18(req.body?.payoutAGIALPHA || 0)
    if (!/^\d+$/.test(payoutRaw) || BigInt(payoutRaw) <= 0n) {
      return res.status(422).json({ error: 'payoutAGIALPHA must be > 0' })
    }

    const durationSec = Number(req.body?.durationSeconds || parseDurationToSeconds(req.body?.duration, 86400))
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return res.status(422).json({ error: 'duration must resolve to positive seconds' })
    }

    const details = String(req.body?.brief || req.body?.summary || req.body?.title || 'Op-control job request').trim()

    const { iface } = await getV1ContractInterface()
    const fn = iface.getFunction('createJob(string,uint256,uint256,string)')
    if (!fn) return res.status(500).json({ error: 'createJob function missing in v1 ABI' })

    const calldata = iface.encodeFunctionData(fn, [specURI, BigInt(payoutRaw), BigInt(Math.round(durationSec)), details])
    const txPkg = buildUnsignedCreateJobTxPackage({
      contract,
      chainId,
      specURI,
      payoutRaw,
      durationSec: Math.round(durationSec),
      details,
      calldata,
    })

    const requestId = `request_${Date.now()}`
    const dir = join(ARTIFACTS_DIR, 'job_requests', requestId)
    mkdirSync(dir, { recursive: true })
    const unsignedTxPath = join(dir, 'unsigned_create_job_tx.json')
    const reviewManifestPath = join(dir, 'review_manifest_create_job.json')
    const payloadSnapshotPath = join(dir, 'request_payload_snapshot.json')

    writeJsonFile(unsignedTxPath, txPkg)
    writeJsonFile(payloadSnapshotPath, req.body || {})

    const checklist = [
      'Confirm contract and chain are correct for AGIJobManager v1.',
      'Confirm IPFS spec URI resolves and matches intended job request.',
      'Confirm payout and duration are correct before signing.',
      'Sign unsigned createJob transaction with operator wallet only.',
    ]

    writeJsonFile(reviewManifestPath, {
      schema: 'op-control/review-manifest/v1',
      lane: 'v1',
      action: 'request',
      generatedAt: new Date().toISOString(),
      guardrails: {
        contract,
        chainId,
      },
      checklist,
      files: {
        unsignedTxPath,
        payloadSnapshotPath,
      },
      request: {
        specURI,
        payoutRaw,
        durationSec: Math.round(durationSec),
        details,
      },
    })

    return res.json({
      ok: true,
      mode: 'unsigned_request_package',
      action: 'request',
      unsignedTxPath,
      reviewManifestPath,
      checklist,
      requestId,
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to generate unsigned request package' })
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
  if (!ENABLE_TEST_MODE) return res.status(403).json({ error: 'Test mode disabled. Real on-chain mode is active.' })
  try { res.json(findTestJobs()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/test-jobs/:folder/:file', (req, res) => {
  if (!ENABLE_TEST_MODE) return res.status(403).json({ error: 'Test mode disabled. Real on-chain mode is active.' })
  try {
    const specPath = resolve(TESTS_DIR, req.params.folder, req.params.file)
    res.json(JSON.parse(readFileSync(specPath, 'utf8')))
  } catch (e) { res.status(404).json({ error: 'not found' }) }
})

// Keep old flat route for backwards compat
app.get('/api/test-jobs/:file', (req, res) => {
  if (!ENABLE_TEST_MODE) return res.status(403).json({ error: 'Test mode disabled. Real on-chain mode is active.' })
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
  if (!ENABLE_TEST_MODE) {
    return res.status(403).json({ error: 'Test mode disabled. Real on-chain mode is active.' })
  }

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

// ── Assigned-job script runner ───────────────────────────────────────────────
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
  const runner = buildAssignedJobRunner({
    workspaceRoot: WORKSPACE_ROOT,
    jobFile: tmpFile,
    jobId: String(jobId || job.jobId || '').trim(),
  })

  if (!existsSync(runner.scriptPath)) {
    send('error', { message: `Assigned-job script not found at ${runner.scriptPath}` })
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

  send('start', { script: runner.scriptPath, jobId: safeJobId, ts: new Date().toISOString() })

  const proc = spawn(runner.command, runner.args, {
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
      ? `Node runtime not found while starting ${runner.scriptPath}`
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

function classifyLifecycleStage(status, txPackages, receipts) {
  const s = (status || '').toLowerCase()
  const pkgs = txPackages || []
  const rcpts = receipts || []

  // Terminal / finalized
  if (['completed', 'done', 'finalized', 'selected'].includes(s)) return 'finalized'

  // Check tx receipts for broadcast-pending (txHash exists but not yet finalized)
  const hasBroadcast = rcpts.some(r => r.txHash && r.status !== 'finalized')
  if (hasBroadcast) return 'broadcast_pending'

  // Check for signed packages awaiting broadcast
  const hasSigned = pkgs.some(p => p.signed && !p.broadcastTxHash)
  if (hasSigned) return 'signed_awaiting_broadcast'

  // Unsigned tx ready for operator signature
  if (['commit_ready', 'reveal_ready', 'finalist_accept_ready', 'trial_ready', 'completion_ready',
       'ready_for_signature', 'validator_score_commit_ready', 'validator_score_reveal_ready'].includes(s)) return 'ready_for_signature'

  // In-flight states
  if (['commit_submitted', 'reveal_submitted', 'finalist_accept_submitted', 'trial_submitted',
       'completion_submitted', 'validator_score_commit_submitted', 'validator_score_reveal_submitted',
       'awaiting_finalization', 'in_progress', 'assigned'].includes(s)) return 'awaiting_finalization'

  return 'idle'
}

function classifyTxLifecycle(txPkg) {
  if (!txPkg) return 'unknown'
  if (txPkg.finalizedAt) return 'finalized'
  if (txPkg.broadcastTxHash) return 'broadcast'
  if (txPkg.signed) return 'signed'
  if (txPkg.file || txPkg.unsignedTx) return 'ready'
  return 'unknown'
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
          lifecycleStage: classifyLifecycleStage(state.status, state.txPackages, state.receipts),
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
          lifecycleStage: classifyLifecycleStage(state.status, state.txPackages, state.receipts),
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

function findReviewManifestNearTx(unsignedTxPath) {
  try {
    if (!unsignedTxPath) return null
    const txPath = resolvePathMaybe(WORKSPACE_ROOT, unsignedTxPath)
    if (!txPath) return null
    const parent = dirname(txPath)
    if (!existsSync(parent) || !statSync(parent).isDirectory()) return null
    const files = readdirSync(parent)
    const review = files.find(name => /^review_manifest.*\.json$/i.test(name))
    if (!review) return null
    return join(parent, review)
  } catch {
    return null
  }
}

function actionBlockingReason(state, nextAction) {
  return (
    nextAction?.blockedReason
    || nextAction?.blockingReason
    || state?.blockingReason
    || state?.blockedReason
    || null
  )
}

function buildOperatorActionId({ lane, entityId, action, pkg, index = 0 }) {
  const seed = [
    String(lane || ''),
    String(entityId || ''),
    String(action || ''),
    String(pkg?.file || ''),
    String(pkg?.unsignedTxPath || pkg?.unsignedTx || ''),
    String(index),
  ].join('|')
  return `oa_${createHash('sha1').update(seed, 'utf8').digest('hex').slice(0, 20)}`
}

function extractChecklistFromManifest(reviewManifestPath) {
  try {
    if (!reviewManifestPath) return []
    const resolved = resolvePathMaybe(WORKSPACE_ROOT, reviewManifestPath)
    if (!resolved || !existsSync(resolved) || !statSync(resolved).isFile()) return []
    const obj = readJsonSafe(resolved, null)
    if (!obj || typeof obj !== 'object') return []
    const candidates = [
      obj.checklist,
      obj.reviewChecklist,
      obj.preconditions,
      obj.operatorChecklist,
      obj.review?.checklist,
    ]
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.map((v) => String(v)).filter(Boolean)
      }
    }
    return []
  } catch {
    return []
  }
}

function extractChecklist(pkg, reviewManifestPath) {
  const direct = [pkg?.checklist, pkg?.reviewChecklist, pkg?.preconditions].find((v) => Array.isArray(v))
  if (direct) return direct.map((v) => String(v)).filter(Boolean)
  return extractChecklistFromManifest(reviewManifestPath)
}

function normalizeChecklist(checklist, action) {
  const items = Array.isArray(checklist) ? checklist.map((v) => String(v)).filter(Boolean) : []
  if (items.length > 0) return items
  return [
    `Review unsigned ${action} transaction payload before signing`,
    'Confirm target contract, selector, and calldata match manifest',
  ]
}

function collectOperatorActions({ includeRefs = false } = {}) {
  const actions = []

  if (existsSync(PROC_ARTIFACTS_DIR)) {
    const dirs = readdirSync(PROC_ARTIFACTS_DIR).filter(d => d.startsWith('proc_') && statSync(join(PROC_ARTIFACTS_DIR, d)).isDirectory())
    for (const dir of dirs) {
      const root = join(PROC_ARTIFACTS_DIR, dir)
      const stateFile = join(root, 'state.json')
      const state = readJsonSafe(stateFile, null)
      if (!state) continue
      const nextAction = readJsonSafe(join(root, 'next_action.json'), null)
      const blockingReason = actionBlockingReason(state, nextAction)
      const procurementId = String(state.procurementId || dir.replace('proc_', ''))

      for (let idx = 0; idx < (state.txPackages || []).length; idx += 1) {
        const pkg = state.txPackages[idx]
        const normalized = buildOperatorAction({
          lane: 'prime',
          entityId: procurementId,
          status: state.status,
          pkg,
          state,
          baseDir: root,
          blockingReason,
        })
        if (!normalized) continue
        normalized.reviewManifestPath ||= findReviewManifestNearTx(normalized.unsignedTxPath)
        if (normalized.queueStage === 'needs_signature' && !normalized.unsignedTxPath) continue
        normalized.checklist = normalizeChecklist(extractChecklist(pkg, normalized.reviewManifestPath), normalized.action)
        normalized.id = buildOperatorActionId({ lane: 'prime', entityId: procurementId, action: normalized.action, pkg, index: idx })
        if (includeRefs) {
          normalized._ref = { stateFile, txPackageIndex: idx, lane: 'prime', entityId: procurementId, action: normalized.action }
        }
        actions.push(normalized)
      }
    }
  }

  if (existsSync(AGENT_STATE_DIR)) {
    const files = readdirSync(AGENT_STATE_DIR).filter(f => f.endsWith('.json'))
    for (const file of files) {
      const stateFile = join(AGENT_STATE_DIR, file)
      const state = readJsonSafe(stateFile, null)
      if (!state) continue
      const jobId = String(state.jobId || file.replace('.json', ''))
      const lane = inferJobLane(state, jobId)
      const root = dirname(stateFile)
      const blockingReason = actionBlockingReason(state, state?.nextAction || null)

      for (let idx = 0; idx < (state.txPackages || []).length; idx += 1) {
        const pkg = state.txPackages[idx]
        const normalized = buildOperatorAction({
          lane,
          entityId: jobId,
          status: state.status,
          pkg,
          state,
          baseDir: root,
          blockingReason,
        })
        if (!normalized) continue
        normalized.reviewManifestPath ||= findReviewManifestNearTx(normalized.unsignedTxPath)
        if (normalized.queueStage === 'needs_signature' && !normalized.unsignedTxPath) continue
        normalized.checklist = normalizeChecklist(extractChecklist(pkg, normalized.reviewManifestPath), normalized.action)
        normalized.id = buildOperatorActionId({ lane, entityId: jobId, action: normalized.action, pkg, index: idx })
        if (includeRefs) {
          normalized._ref = { stateFile, txPackageIndex: idx, lane, entityId: jobId, action: normalized.action }
        }
        actions.push(normalized)
      }
    }
  }

  actions.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const laneCmp = String(a.lane).localeCompare(String(b.lane))
    if (laneCmp !== 0) return laneCmp
    return String(a.entityId).localeCompare(String(b.entityId))
  })

  return actions
}

function findOperatorActionById(id) {
  const needle = String(id || '').trim()
  if (!needle) return null
  const actions = collectOperatorActions({ includeRefs: true })
  return actions.find((a) => a.id === needle) || null
}

app.get('/api/operator-actions', (req, res) => {
  try {
    const actions = collectOperatorActions({ includeRefs: false })
    const byLane = actions.reduce((acc, item) => {
      acc[item.lane] = (acc[item.lane] || 0) + 1
      return acc
    }, {})

    res.json({
      actions,
      total: actions.length,
      byLane,
      scannedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[operator-actions] error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

function isPathInsideWorkspace(targetPath) {
  const resolvedRoot = resolve(WORKSPACE_ROOT)
  const resolved = resolve(String(targetPath || ''))
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + '/')
}

app.get('/api/operator-actions/file', (req, res) => {
  try {
    const inputPath = String(req.query.path || '').trim()
    if (!inputPath) return res.status(400).json({ error: 'path query is required' })

    const resolved = resolve(inputPath)
    if (!isPathInsideWorkspace(resolved)) {
      return res.status(400).json({ error: 'path outside workspace not allowed' })
    }
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      return res.status(404).json({ error: 'file not found' })
    }

    const text = readFileSync(resolved, 'utf8')
    let json = null
    if (resolved.endsWith('.json')) {
      try { json = JSON.parse(text) } catch {}
    }

    res.json({
      ok: true,
      path: resolved,
      mime: resolved.endsWith('.json') ? 'application/json' : 'text/plain',
      json,
      text,
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to read operator action file' })
  }
})

function mutateOperatorActionState(actionId, mutator) {
  const found = findOperatorActionById(actionId)
  if (!found?._ref?.stateFile) {
    const err = new Error('operator action id not found')
    err.status = 404
    throw err
  }

  const stateFile = found._ref.stateFile
  const state = readJsonSafe(stateFile, null)
  if (!state) {
    const err = new Error('failed to load state file')
    err.status = 500
    throw err
  }

  const txPackages = Array.isArray(state.txPackages) ? [...state.txPackages] : []
  const idx = Number(found._ref.txPackageIndex)
  if (!Number.isInteger(idx) || idx < 0 || idx >= txPackages.length) {
    const err = new Error('tx package index out of range')
    err.status = 409
    throw err
  }

  const pkg = { ...(txPackages[idx] || {}) }
  const now = new Date().toISOString()
  const mutationResult = mutator({ now, pkg, state, action: found.action }) || {}

  txPackages[idx] = pkg
  const nextState = {
    ...state,
    txPackages,
    updatedAt: now,
  }

  if (mutationResult.receipts) {
    nextState.receipts = mutationResult.receipts
  }

  atomicWriteJson(stateFile, nextState)

  return {
    action: found,
    stateFile,
    updatedAt: now,
    state: nextState,
  }
}

function upsertReceipt(receipts, action, patch) {
  const out = Array.isArray(receipts) ? [...receipts] : []
  const idx = out.findIndex((r) => String(r?.action || '') === String(action || ''))
  if (idx >= 0) {
    out[idx] = { ...out[idx], ...patch, action: String(action || '') }
  } else {
    out.push({ action: String(action || ''), ...patch })
  }
  return out
}

app.post('/api/operator-actions/:id/mark-signed', (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id is required' })

    const result = mutateOperatorActionState(id, ({ now, pkg }) => {
      pkg.signed = true
      pkg.signedAt = pkg.signedAt || now
    })

    appendOperatorTransitionLog({
      transition: 'mark-signed',
      id,
      lane: result.action.lane,
      entityId: result.action.entityId,
      action: result.action.action,
      status: 'signed',
      stateFile: result.stateFile,
      signedAt: result.updatedAt,
    })

    res.json({
      ok: true,
      id,
      lane: result.action.lane,
      entityId: result.action.entityId,
      action: result.action.action,
      status: 'signed',
      signedAt: result.updatedAt,
      stateFile: result.stateFile,
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to mark operator action as signed' })
  }
})

app.post('/api/operator-actions/:id/mark-broadcast', (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    const txHashRaw = String(req.body?.txHash || '').trim().toLowerCase()
    if (!id) return res.status(400).json({ error: 'id is required' })
    if (!/^0x[a-f0-9]{64}$/.test(txHashRaw)) return res.status(400).json({ error: 'txHash must be 0x-prefixed 32-byte hash' })

    const result = mutateOperatorActionState(id, ({ now, pkg, state, action }) => {
      pkg.signed = true
      pkg.signedAt = pkg.signedAt || now
      pkg.broadcastTxHash = txHashRaw
      pkg.broadcastAt = pkg.broadcastAt || now
      const receipts = upsertReceipt(state.receipts, action, {
        txHash: txHashRaw,
        status: 'broadcast_pending',
        broadcastAt: now,
      })
      return { receipts }
    })

    appendOperatorTransitionLog({
      transition: 'mark-broadcast',
      id,
      lane: result.action.lane,
      entityId: result.action.entityId,
      action: result.action.action,
      status: 'broadcast_pending',
      txHash: txHashRaw,
      stateFile: result.stateFile,
      broadcastAt: result.updatedAt,
    })

    res.json({
      ok: true,
      id,
      lane: result.action.lane,
      entityId: result.action.entityId,
      action: result.action.action,
      status: 'broadcast_pending',
      txHash: txHashRaw,
      broadcastAt: result.updatedAt,
      stateFile: result.stateFile,
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to mark operator action as broadcast' })
  }
})

app.post('/api/operator-actions/:id/mark-finalized', (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    const txHashRaw = String(req.body?.txHash || '').trim().toLowerCase()
    if (!id) return res.status(400).json({ error: 'id is required' })
    if (txHashRaw && !/^0x[a-f0-9]{64}$/.test(txHashRaw)) return res.status(400).json({ error: 'txHash must be 0x-prefixed 32-byte hash' })

    const result = mutateOperatorActionState(id, ({ now, pkg, state, action }) => {
      pkg.signed = true
      pkg.signedAt = pkg.signedAt || now
      if (txHashRaw) {
        pkg.broadcastTxHash = pkg.broadcastTxHash || txHashRaw
        pkg.broadcastAt = pkg.broadcastAt || now
      }
      pkg.finalizedAt = now

      if (action === 'apply') {
        state.status = ['assigned', 'working', 'deliverable_ready', 'completion_pending_review', 'submitted', 'completed', 'disputed'].includes(String(state.status || '').toLowerCase())
          ? state.status
          : 'applied'
        state.operatorTx = {
          ...(state.operatorTx || {}),
          apply: {
            txHash: txHashRaw || pkg.broadcastTxHash || '',
            broadcastAt: pkg.broadcastAt || now,
            finalizedAt: now,
          },
        }
      }

      const receipts = upsertReceipt(state.receipts, action, {
        txHash: txHashRaw || pkg.broadcastTxHash || '',
        status: 'finalized',
        finalizedAt: now,
      })
      return { receipts }
    })

    appendOperatorTransitionLog({
      transition: 'mark-finalized',
      id,
      lane: result.action.lane,
      entityId: result.action.entityId,
      action: result.action.action,
      status: 'finalized',
      txHash: txHashRaw || null,
      stateFile: result.stateFile,
      finalizedAt: result.updatedAt,
    })

    res.json({
      ok: true,
      id,
      lane: result.action.lane,
      entityId: result.action.entityId,
      action: result.action.action,
      status: 'finalized',
      txHash: txHashRaw || null,
      finalizedAt: result.updatedAt,
      stateFile: result.stateFile,
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to mark operator action as finalized' })
  }
})

app.post('/api/operator-actions/mark-signed', (req, res) => {
  try {
    const id = String(req.body?.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id is required' })

    const result = mutateOperatorActionState(id, ({ now, pkg }) => {
      pkg.signed = true
      pkg.signedAt = pkg.signedAt || now
    })

    appendOperatorTransitionLog({
      transition: 'mark-signed',
      id,
      lane: result.action.lane,
      entityId: result.action.entityId,
      action: result.action.action,
      status: 'signed',
      stateFile: result.stateFile,
      signedAt: result.updatedAt,
      compatibilityRoute: true,
    })

    res.json({
      ok: true,
      id,
      lane: result.action.lane,
      entityId: result.action.entityId,
      action: result.action.action,
      status: 'signed',
      signedAt: result.updatedAt,
      stateFile: result.stateFile,
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to mark operator action as signed' })
  }
})

// ── TX Lifecycle Tracker ─────────────────────────────────────────────────

app.get('/api/tx-lifecycle', (req, res) => {
  try {
    const entries = []

    // Scan procurement tx packages
    if (existsSync(PROC_ARTIFACTS_DIR)) {
      const dirs = readdirSync(PROC_ARTIFACTS_DIR).filter(d => d.startsWith('proc_') && statSync(join(PROC_ARTIFACTS_DIR, d)).isDirectory())
      for (const dir of dirs) {
        const state = readJsonSafe(join(PROC_ARTIFACTS_DIR, dir, 'state.json'), null)
        if (!state) continue
        const procId = dir.replace('proc_', '')
        for (const pkg of (state.txPackages || [])) {
          entries.push({
            source: 'procurement',
            sourceId: procId,
            lane: state._contractVersion || 'prime',
            action: pkg.action || pkg.file || 'unknown',
            stage: classifyTxLifecycle(pkg),
            createdAt: pkg.createdAt || null,
            signedAt: pkg.signedAt || null,
            broadcastTxHash: pkg.broadcastTxHash || null,
            broadcastAt: pkg.broadcastAt || null,
            finalizedAt: pkg.finalizedAt || null,
            expired: pkg.expired || false,
            ageMin: pkg.ageMin ?? 0,
          })
        }
      }
    }

    // Scan job tx packages
    if (existsSync(AGENT_STATE_DIR)) {
      const files = readdirSync(AGENT_STATE_DIR).filter(f => f.endsWith('.json'))
      for (const file of files) {
        const state = readJsonSafe(join(AGENT_STATE_DIR, file), null)
        if (!state) continue
        const jobId = state.jobId || file.replace('.json', '')
        const version = /^v2_/.test(String(jobId)) ? 'v2' : 'v1'
        for (const pkg of (state.txPackages || [])) {
          entries.push({
            source: 'job',
            sourceId: jobId,
            lane: version,
            action: pkg.action || pkg.file || 'unknown',
            stage: classifyTxLifecycle(pkg),
            createdAt: pkg.createdAt || null,
            signedAt: pkg.signedAt || null,
            broadcastTxHash: pkg.broadcastTxHash || null,
            broadcastAt: pkg.broadcastAt || null,
            finalizedAt: pkg.finalizedAt || null,
            expired: pkg.expired || false,
            ageMin: pkg.ageMin ?? 0,
          })
        }
      }
    }

    // Summary counts by stage
    const summary = { ready: 0, signed: 0, broadcast: 0, finalized: 0, unknown: 0 }
    for (const e of entries) summary[e.stage] = (summary[e.stage] || 0) + 1

    res.json({ entries, summary, scannedAt: new Date().toISOString() })
  } catch (e) {
    console.error('[tx-lifecycle] error:', e.message)
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

// ── JobManager V1 Runner Process Management ─────────────────────────────────

const RUNNER_SCRIPT = resolve(WORKSPACE_ROOT, 'loops', 'AGIJobManager-v1', 'runner.js')
const WORKSPACE_NODE_MODULES = join(WORKSPACE_ROOT, 'node_modules')

let runnerProc = null
let runnerStartedAt = null
let runnerLogs = []          // ring buffer of last 200 lines
const RUNNER_LOG_MAX = 200

function pushRunnerLog(level, text) {
  const entry = { ts: new Date().toISOString(), level, text: text.trimEnd() }
  runnerLogs.push(entry)
  if (runnerLogs.length > RUNNER_LOG_MAX) runnerLogs.shift()
  return entry
}

function broadcastRunnerState() {
  const payload = getRunnerStatus()
  const msg = `data: ${JSON.stringify({ type: 'runner', ...payload })}\n\n`
  sseClients.forEach(c => c.write(msg))
}

function getRunnerStatus() {
  const running = runnerProc !== null && runnerProc.exitCode === null
  return {
    running,
    pid: running ? runnerProc.pid : null,
    startedAt: running ? runnerStartedAt : null,
    uptimeMs: running ? Date.now() - new Date(runnerStartedAt).getTime() : null,
  }
}

app.get('/api/runner/status', (req, res) => {
  res.json(getRunnerStatus())
})

app.get('/api/runner/logs', (req, res) => {
  const since = req.query.since ? new Date(req.query.since).getTime() : 0
  const filtered = since ? runnerLogs.filter(l => new Date(l.ts).getTime() > since) : runnerLogs
  res.json({ logs: filtered })
})

app.post('/api/runner/start', async (req, res) => {
  if (runnerProc && runnerProc.exitCode === null) {
    return res.status(409).json({ error: 'Runner is already running', pid: runnerProc.pid })
  }

  try {
    // Ensure root-level dependencies are installed before spawning
    if (!existsSync(WORKSPACE_NODE_MODULES)) {
      pushRunnerLog('info', 'Installing workspace dependencies (npm install)...')
      const install = spawn('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: WORKSPACE_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      await new Promise((resolve, reject) => {
        install.on('close', code => code === 0 ? resolve() : reject(new Error(`npm install exited ${code}`)))
        install.on('error', reject)
      })
      pushRunnerLog('info', 'Workspace dependencies installed')
    }

    runnerProc = spawn('node', [RUNNER_SCRIPT], {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, NODE_PATH: WORKSPACE_NODE_MODULES },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    runnerStartedAt = new Date().toISOString()
    runnerLogs = []
    pushRunnerLog('info', `Runner started (pid ${runnerProc.pid})`)

    runnerProc.stdout.on('data', chunk => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        pushRunnerLog('stdout', line)
      }
    })

    runnerProc.stderr.on('data', chunk => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        pushRunnerLog('stderr', line)
      }
    })

    runnerProc.on('close', (code, signal) => {
      pushRunnerLog('info', `Runner exited (code=${code}, signal=${signal})`)
      broadcastRunnerState()
    })

    runnerProc.on('error', err => {
      pushRunnerLog('error', `Runner error: ${err.message}`)
      broadcastRunnerState()
    })

    broadcastRunnerState()
    console.log(`[runner-mgr] started pid ${runnerProc.pid}`)
    res.json({ ok: true, pid: runnerProc.pid, startedAt: runnerStartedAt })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/runner/stop', (req, res) => {
  if (!runnerProc || runnerProc.exitCode !== null) {
    return res.status(409).json({ error: 'Runner is not running' })
  }

  const pid = runnerProc.pid
  pushRunnerLog('info', `Stopping runner (pid ${pid})`)

  // Graceful SIGTERM, then SIGKILL after 5s
  runnerProc.kill('SIGTERM')
  const forceKill = setTimeout(() => {
    try { runnerProc.kill('SIGKILL') } catch {}
  }, 5000)

  runnerProc.on('close', () => clearTimeout(forceKill))

  console.log(`[runner-mgr] stopping pid ${pid}`)
  res.json({ ok: true, pid, signal: 'SIGTERM' })
})

// ── Start notification scanner (after sseClients is available) ────────────────
const SCAN_INTERVAL_MS = 60 * 60 * 1000
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
