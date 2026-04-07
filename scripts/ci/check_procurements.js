/**
 * check_procurements.js
 * Scans Contract 2 (AGIJobDiscoveryPrime) for ProcurementCreated events.
 * Uses a public RPC for log scanning (no block range limit),
 * falling back to chunked pagination if needed.
 */
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

// Prefer injected RPC; fall back to Ankr public endpoint (CI-safe, no Cloudflare block)
const SCAN_RPC  = process.env.ETH_RPC_URL?.trim() || 'https://rpc.ankr.com/eth'
const READ_RPC  = SCAN_RPC
const CONTRACT2 = '0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29'
const SCAN_BLOCKS = 50_000   // ~1 week of blocks at ~12s/block
const CHUNK_SIZE  = 2_000     // fallback chunk size if public RPC also limits

const ABI2 = [
  'function procurements(uint256) external view returns (uint256 jobId, address employer, uint256 commitDeadline, uint256 revealDeadline, uint256 finalistAcceptDeadline, uint256 trialDeadline, uint256 scoreCommitDeadline, uint256 scoreRevealDeadline)',
  'function applicationView(uint256 procurementId, address agent) external view returns (uint8 phase, string applicationURI, bytes32 commitment, bool shortlisted)',
  'event ProcurementCreated(uint256 indexed procurementId, uint256 indexed jobId, address indexed employer)',
]

const scanProvider = new ethers.JsonRpcProvider(SCAN_RPC)
const readProvider = new ethers.JsonRpcProvider(READ_RPC)
const contract     = new ethers.Contract(CONTRACT2, ABI2, readProvider)
const iface        = new ethers.Interface(ABI2)
const topic        = iface.getEvent('ProcurementCreated').topicHash

const agentAddress = process.env.AGENT_PRIVATE_KEY?.trim()
  ? new ethers.Wallet(process.env.AGENT_PRIVATE_KEY.trim()).address
  : null

const now = Math.floor(Date.now() / 1000)

function ts(unix) {
  if (!unix || unix === 0) return 'none'
  const d    = new Date(Number(unix) * 1000)
  const diff = Number(unix) - now
  const sign = diff > 0 ? `+${fmt(diff)}` : `EXPIRED ${fmt(-diff)} ago`
  return `${d.toISOString().slice(0, 16)}Z  (${sign})`
}
function fmt(secs) {
  if (secs < 3600)  return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}
function phase(p) {
  return ['None', 'Committed', 'Revealed', 'Shortlisted', 'TrialSubmitted'][p] || `phase${p}`
}
function procStatus(p) {
  if (now < Number(p.commitDeadline))         return '🟢 COMMIT OPEN'
  if (now < Number(p.revealDeadline))         return '🟡 REVEAL OPEN'
  if (now < Number(p.finalistAcceptDeadline)) return '🟠 FINALIST ACCEPT'
  if (now < Number(p.trialDeadline))          return '🔵 TRIAL OPEN'
  if (now < Number(p.scoreCommitDeadline))    return '⚪ SCORE COMMIT'
  if (now < Number(p.scoreRevealDeadline))    return '⚪ SCORE REVEAL'
  return '⛔ CLOSED'
}

// Chunked getLogs — handles RPCs with block range limits
async function getLogsPaginated(provider, filter, fromBlock, toBlock) {
  const logs = []
  let from = fromBlock
  while (from <= toBlock) {
    const to = Math.min(from + CHUNK_SIZE - 1, toBlock)
    try {
      const chunk = await provider.getLogs({ ...filter, fromBlock: from, toBlock: to })
      logs.push(...chunk)
    } catch (e) {
      if (e.message?.includes('block range')) {
        // Try smaller chunk
        const mid = Math.floor((from + to) / 2)
        const a = await provider.getLogs({ ...filter, fromBlock: from, toBlock: mid })
        const b = await provider.getLogs({ ...filter, fromBlock: mid + 1, toBlock: to })
        logs.push(...a, ...b)
      } else throw e
    }
    from = to + 1
  }
  return logs
}

console.log("=== Contract 2 Procurement Scanner ===")
console.log("Contract  :", CONTRACT2)
console.log("Scan RPC  :", SCAN_RPC)
if (agentAddress) console.log("Agent     :", agentAddress)
console.log("")

const currentBlock = await scanProvider.getBlockNumber()
const fromBlock    = Math.max(0, currentBlock - SCAN_BLOCKS)

console.log(`Scanning blocks ${fromBlock} → ${currentBlock} (~${SCAN_BLOCKS} blocks)...`)

const logs = await getLogsPaginated(
  scanProvider,
  { address: CONTRACT2, topics: [topic] },
  fromBlock,
  currentBlock
)

console.log(`Found ${logs.length} ProcurementCreated event(s)\n`)

if (logs.length === 0) {
  console.log("No procurements in scan range.")
  console.log(`Etherscan: https://etherscan.io/address/${CONTRACT2}`)
  process.exit(0)
}

for (const log of logs) {
  const decoded       = iface.parseLog(log)
  const procurementId = decoded.args[0].toString()
  const jobId         = decoded.args[1].toString()
  const employer      = decoded.args[2]

  let p
  try { p = await contract.procurements(BigInt(procurementId)) }
  catch (e) { console.log(`#${procurementId} read failed: ${e.message}`); continue }

  console.log(`── Procurement #${procurementId} ──────────────────────────`)
  console.log(`  Status          : ${procStatus(p)}`)
  console.log(`  Job ID          : ${jobId}`)
  console.log(`  Employer        : ${employer}`)
  console.log(`  Commit deadline : ${ts(p.commitDeadline)}`)
  console.log(`  Reveal deadline : ${ts(p.revealDeadline)}`)
  console.log(`  Finalist accept : ${ts(p.finalistAcceptDeadline)}`)
  console.log(`  Trial deadline  : ${ts(p.trialDeadline)}`)

  if (agentAddress) {
    try {
      const app = await contract.applicationView(BigInt(procurementId), agentAddress)
      console.log(`  Our status      : ${phase(app.phase)} | shortlisted=${app.shortlisted}`)
      if (app.applicationURI) console.log(`  Application URI : ${app.applicationURI}`)
    } catch {}
  }
  console.log("")
}
