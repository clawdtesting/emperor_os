import { useEffect, useMemo, useState } from 'react'
import { resolveEns, shortAddr } from '../utils/ens'
import { PrimeProcurementHelperCard } from './prime/PrimeProcurementHelperCard'
import { normalizeProcurementTiming } from '../features/prime/windowStatus'

const PRIME_CONTRACT = '0xd5ef1dde7ac60488f697ff2a7967a52172a78f29'
const PREMIUM_JOB_CREATED_TOPIC = '0xcd958add2ab89c161b8e05f40140e87d03e664bd32eea370e4aec86096bcb3f6'
const PROCUREMENT_CREATED_TOPIC = '0xd88f0bdc06a889b3707026296f02b1cb95e0b68fc3b0cf11cb82bb0ecc805d53'
const DEFAULT_PREMIUM_TX = '0xe90422f666b87e4962dd976015c18ee7a592dc40ddd6070b0f000a9404f93d1b'
const NEXT_ACTION_SIG = '0xf47fbed6'
// NOTE: selector verified from ABI signature `procurements(uint256)` via external contract tooling.
const PROCUREMENTS_SIG = '0x85ad3150'

const READ_FUNCTIONS = [
  { key: 'owner', label: 'Owner', sig: '0x8da5cb5b', type: 'address' },
  { key: 'settlement', label: 'Settlement', sig: '0x51160630', type: 'address' },
  { key: 'agiToken', label: 'AGI Token', sig: '0x658bb543', type: 'address' },
  { key: 'paused', label: 'Paused', sig: '0x5c975abb', type: 'bool' },
  { key: 'intakePaused', label: 'Intake Paused', sig: '0xbf5fbc7a', type: 'bool' },
  { key: 'nextProcurementId', label: 'Next Procurement ID', sig: '0x01dfe59f', type: 'uint' },
  { key: 'MAX_APPLICANTS', label: 'Max Applicants', sig: '0x64765fd8', type: 'uint' },
  { key: 'MAX_FINALISTS', label: 'Max Finalists', sig: '0xa2509f3a', type: 'uint' },
  { key: 'MAX_VALIDATOR_REVEALS_PER_FINALIST', label: 'Max Validator Reveals / Finalist', sig: '0x21b24aa7', type: 'uint' },
]

function decodeValue(hex, type) {
  if (!hex || hex === '0x') return '—'
  if (type === 'address') return '0x' + hex.slice(-40)
  if (type === 'bool') return BigInt(hex) === 1n ? 'true' : 'false'
  if (type === 'uint') return BigInt(hex).toString()
  return hex
}

function topicToUint(topic) {
  return BigInt(topic).toString()
}

function topicToAddress(topic) {
  return `0x${topic.slice(-40)}`
}

function toHexBlock(n) {
  return `0x${n.toString(16)}`
}

function shortCid(uri) {
  const cid = uri?.replace('ipfs://', '') || ''
  return cid.length > 20 ? cid.slice(0, 8) + '...' + cid.slice(-6) : cid
}

function decodeDynamicString(raw) {
  const offset = Number.parseInt(raw.slice(2, 66), 16)
  const lenIndex = 2 + (offset * 2)
  const strLen = Number.parseInt(raw.slice(lenIndex, lenIndex + 64), 16)
  const strHex = raw.slice(lenIndex + 64, lenIndex + 64 + strLen * 2)
  const bytes = strHex.match(/.{1,2}/g) || []
  return bytes.map(b => String.fromCharCode(Number.parseInt(b, 16))).join('')
}

function decodeUintAtWord(raw, wordIndex) {
  const start = 2 + (wordIndex * 64)
  const end = start + 64
  const chunk = raw.slice(start, end)
  if (!chunk) return null
  return Number(BigInt(`0x${chunk}`))
}

function getJobField(job, keys) {
  for (const key of keys) {
    if (job?.[key] !== undefined && job?.[key] !== null && job?.[key] !== '') return job[key]
  }
  return null
}

function formatPercent(value) {
  if (value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n > 1 && n <= 100) return `${n}%`
  if (n > 100 && n <= 10000) return `${(n / 100).toFixed(2).replace(/\.0+$/, '').replace(/\.$/, '')}%`
  if (n >= 0 && n <= 1) return `${(n * 100).toFixed(2).replace(/\.0+$/, '').replace(/\.$/, '')}%`
  return `${n}%`
}

function EnsAddress({ address }) {
  const [ens, setEns] = useState(null)

  useEffect(() => {
    let active = true
    if (!address || !address.startsWith('0x')) {
      setEns(null)
      return () => {
        active = false
      }
    }
    resolveEns(address).then(name => {
      if (active) setEns(name)
    })
    return () => {
      active = false
    }
  }, [address])

  if (!address) return <span className="font-mono">—</span>

  return (
    <span className="font-mono" title={address}>
      {ens ? <span className="text-slate-300">{ens}</span> : shortAddr(address)}
    </span>
  )
}

function EventJobBrief({ job }) {
  const [ipfsData, setIpfsData] = useState(null)

  useEffect(() => {
    let active = true
    const cid = job?.specURI?.replace('ipfs://', '')
    if (!cid) {
      setIpfsData(null)
      return () => {
        active = false
      }
    }

    fetch(`https://ipfs.io/ipfs/${cid}`, { signal: AbortSignal.timeout(5000) })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (active) setIpfsData(data)
      })
      .catch(() => {
        if (active) setIpfsData(null)
      })

    return () => {
      active = false
    }
  }, [job?.specURI])

  if (!job) {
    return <div className="text-slate-500 text-xs">Job details are not available in the current jobs snapshot.</div>
  }

  const payout = getJobField(job, ['payoutAGIALPHA', 'payout'])
  const agentBondPct = formatPercent(getJobField(job, ['agentBondPct', 'agentBondPercent', 'agentBondPercentage', 'agentBondBps']))
  const validatorBondPct = formatPercent(getJobField(job, ['validatorBondPct', 'validatorBondPercent', 'validatorBondPercentage', 'validatorBondBps']))
  const brief = ipfsData?.details || ipfsData?.description || job.details || 'No brief found in IPFS payload.'

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 font-mono">Job #{job.jobId}</span>
        <a
          href={`https://ipfs.io/ipfs/${job.specURI?.replace('ipfs://', '')}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-blue-400 font-mono"
        >
          {shortCid(job.specURI)}
        </a>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div>
          <div className="text-slate-600">Payout</div>
          <div className="text-blue-400">{payout ?? '—'}</div>
        </div>
        <div>
          <div className="text-slate-600">Duration</div>
          <div className="text-slate-300">{job.duration || '—'}</div>
        </div>
        <div>
          <div className="text-slate-600">Agent Bond</div>
          <div className="text-slate-300">{agentBondPct || '—'}</div>
        </div>
        <div>
          <div className="text-slate-600">Validator Bond</div>
          <div className="text-slate-300">{validatorBondPct || '—'}</div>
        </div>
      </div>
      <div className="text-xs text-slate-300 leading-relaxed">{brief}</div>
    </div>
  )
}


async function rpcRequest(method, params = []) {
  if (!window?.ethereum) throw new Error('Wallet RPC not detected')
  return window.ethereum.request({ method, params })
}

async function rpcCall(data) {
  return rpcRequest('eth_call', [{ to: PRIME_CONTRACT, data }, 'latest'])
}

export function PrimeContractTab({ wallet, jobs = [] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [values, setValues] = useState({})
  const [procurementId, setProcurementId] = useState('')
  const [nextAction, setNextAction] = useState('—')
  const [procurementTiming, setProcurementTiming] = useState(null)
  const [txHash, setTxHash] = useState(DEFAULT_PREMIUM_TX)
  const [txEvents, setTxEvents] = useState([])
  const [scanEvents, setScanEvents] = useState([])
  const [selectedTxData, setSelectedTxData] = useState(null)

  const assigned = useMemo(() => jobs.filter(j => j.status === 'Assigned').length, [jobs])
  const completed = useMemo(() => jobs.filter(j => j.status === 'Completed').length, [jobs])
  const disputed = useMemo(() => jobs.filter(j => j.status === 'Disputed').length, [jobs])

  function findJobById(jobId) {
    return jobs.find(j => String(j.jobId) === String(jobId)) || null
  }

  async function fetchNextActionForId(rawId) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id < 0) {
      setError('Enter a valid procurement ID')
      setProcurementTiming(null)
      return
    }
    try {
      const hexId = id.toString(16).padStart(64, '0')
      const raw = await rpcCall(`${NEXT_ACTION_SIG}${hexId}`)
      const code = decodeDynamicString(raw) || '—'
      setNextAction(code)

      // Deadline-aware helper reads procurement timing from on-chain struct.
      // If this call fails or the contract ABI differs, the helper card gracefully falls back to unknown window status.
      try {
        const procRaw = await rpcCall(`${PROCUREMENTS_SIG}${hexId}`)
        const timing = normalizeProcurementTiming({
          commitDeadline: decodeUintAtWord(procRaw, 2),
          revealDeadline: decodeUintAtWord(procRaw, 3),
          finalistAcceptDeadline: decodeUintAtWord(procRaw, 4),
          trialDeadline: decodeUintAtWord(procRaw, 5),
          scoreCommitDeadline: decodeUintAtWord(procRaw, 6),
          scoreRevealDeadline: decodeUintAtWord(procRaw, 7),
        })
        setProcurementTiming(timing)
      } catch {
        setProcurementTiming(null)
      }
    } catch (e) {
      setError(e.message || 'Failed reading next action')
    }
  }

  async function refreshReadViews() {
    setLoading(true)
    setError(null)
    try {
      const entries = await Promise.all(READ_FUNCTIONS.map(async f => {
        const raw = await rpcCall(f.sig)
        return [f.key, decodeValue(raw, f.type)]
      }))
      setValues(Object.fromEntries(entries))
    } catch (e) {
      setError(e.message || 'Failed reading Prime contract')
    } finally {
      setLoading(false)
    }
  }

  async function fetchNextAction() {
    setError(null)
    await fetchNextActionForId(procurementId)
  }

  async function scanTransaction() {
    setLoading(true)
    setError(null)
    try {
      const receipt = await rpcRequest('eth_getTransactionReceipt', [txHash.trim()])
      if (!receipt) {
        setTxEvents([])
        setError('Transaction receipt not found on the connected network')
        return
      }
      const normalized = PRIME_CONTRACT.toLowerCase()
      const parsed = (receipt.logs || [])
        .filter(log => log.address?.toLowerCase() === normalized)
        .flatMap(log => {
          if (log.topics?.[0] === PREMIUM_JOB_CREATED_TOPIC && log.topics.length >= 4) {
            return [{
              event: 'PremiumJobCreated',
              procurementId: topicToUint(log.topics[1]),
              jobId: topicToUint(log.topics[2]),
              employer: topicToAddress(log.topics[3]),
              txHash: receipt.transactionHash,
            }]
          }
          if (log.topics?.[0] === PROCUREMENT_CREATED_TOPIC && log.topics.length >= 4) {
            return [{
              event: 'ProcurementCreated',
              procurementId: topicToUint(log.topics[1]),
              jobId: topicToUint(log.topics[2]),
              employer: topicToAddress(log.topics[3]),
              txHash: receipt.transactionHash,
            }]
          }
          return []
        })
      setTxEvents(parsed)
      if (!parsed.length) setError('No Prime procurement creation events found in this transaction')
    } catch (e) {
      setError(e.message || 'Failed scanning transaction')
    } finally {
      setLoading(false)
    }
  }

  async function scanRecentPremiumEvents() {
    setLoading(true)
    setError(null)
    try {
      const latestHex = await rpcRequest('eth_blockNumber', [])
      const latest = Number.parseInt(latestHex, 16)
      const from = Math.max(0, latest - 50000)
      const logs = await rpcRequest('eth_getLogs', [{
        address: PRIME_CONTRACT,
        fromBlock: toHexBlock(from),
        toBlock: latestHex,
        topics: [PREMIUM_JOB_CREATED_TOPIC],
      }])
      const parsed = (logs || []).map(log => ({
        event: 'PremiumJobCreated',
        procurementId: topicToUint(log.topics[1]),
        jobId: topicToUint(log.topics[2]),
        employer: topicToAddress(log.topics[3]),
        blockNumber: Number.parseInt(log.blockNumber, 16),
        txHash: log.transactionHash,
      })).sort((a, b) => b.blockNumber - a.blockNumber)
      setScanEvents(parsed)
      if (parsed.length > 0) {
        const latestProcurementId = parsed[0].procurementId
        setProcurementId(latestProcurementId)
        await fetchNextActionForId(latestProcurementId)
      }
    } catch (e) {
      setError(e.message || 'Failed scanning recent premium events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!wallet?.providerAvailable) return
    refreshReadViews()
    scanRecentPremiumEvents()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.providerAvailable, wallet?.chainId])

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Prime contract</div>
          <div className="text-sm text-slate-200 font-semibold">AGI Job Discovery Prime</div>
          <div className="text-xs text-blue-400 font-mono break-all"><EnsAddress address={PRIME_CONTRACT} /></div>
        </div>
        <button
          onClick={refreshReadViews}
          disabled={loading}
          className="text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh views'}
        </button>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-3">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">AGIJobManager snapshot</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded border border-slate-800 bg-slate-900 p-2">
            <div className="text-slate-600 mb-1">Total</div>
            <div className="text-slate-200 font-semibold">{jobs.length}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900 p-2">
            <div className="text-slate-600 mb-1">Assigned</div>
            <div className="text-blue-400 font-semibold">{assigned}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900 p-2">
            <div className="text-slate-600 mb-1">Done</div>
            <div className="text-green-400 font-semibold">{completed}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900 p-2">
            <div className="text-slate-600 mb-1">Disputed</div>
            <div className="text-red-400 font-semibold">{disputed}</div>
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Network: <span className="font-mono text-slate-300">{wallet.chainLabel || 'Unknown'}</span>
        {wallet.chainId && <span className="ml-2 text-slate-400">({wallet.chainId})</span>}
      </div>
      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {READ_FUNCTIONS.map(fn => (
          <div key={fn.key} className="rounded border border-slate-800 bg-slate-950 p-2">
            <div className="text-slate-600 mb-1">{fn.label}</div>
            <div className="text-slate-200 break-all">
              {fn.type === 'address' && values[fn.key] && values[fn.key] !== '—'
                ? <EnsAddress address={values[fn.key]} />
                : <span className="font-mono">{values[fn.key] ?? '—'}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-3">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Procurement helper</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={procurementId}
            onChange={e => setProcurementId(e.target.value)}
            placeholder="procurement id"
            className="px-2 py-1.5 rounded border border-slate-700 bg-slate-900 text-slate-100 text-xs"
          />
          <button
            onClick={fetchNextAction}
            className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            nextActionForProcurement
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Contract helper: <span className="text-slate-200 font-mono">nextActionForProcurement</span>
        </div>
        <PrimeProcurementHelperCard
          procurementId={procurementId}
          rawCode={nextAction}
          procurementTiming={procurementTiming}
        />
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Scan Prime events</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={txHash}
            onChange={e => setTxHash(e.target.value)}
            placeholder="transaction hash"
            className="flex-1 px-2 py-1.5 rounded border border-slate-700 bg-slate-900 text-slate-100 text-xs font-mono"
          />
          <button onClick={scanTransaction} className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-200 hover:bg-slate-800">
            Scan tx
          </button>
          <button onClick={scanRecentPremiumEvents} className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-200 hover:bg-slate-800">
            Scan last 50k blocks
          </button>
        </div>

        {txEvents.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">Transaction events</div>
            {txEvents.map((event, idx) => (
              <div key={`${event.txHash}-${idx}`} className="rounded border border-slate-800 bg-slate-900 p-2 text-xs space-y-2">
                <div className="text-blue-400 font-semibold">{event.event}</div>
                <div className="text-slate-300">Procurement #{event.procurementId} · Job #{event.jobId}</div>
                <div className="text-slate-500 break-all">Employer: <EnsAddress address={event.employer} /></div>
                <EventJobBrief job={findJobById(event.jobId)} />
                <button
                  onClick={() => setSelectedTxData(event)}
                  className="text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  View tx data
                </button>
              </div>
            ))}
          </div>
        )}

        {scanEvents.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">Recent PremiumJobCreated events</div>
            {scanEvents.slice(0, 10).map(event => (
              <div key={`${event.txHash}-${event.procurementId}`} className="rounded border border-slate-800 bg-slate-900 p-2 text-xs space-y-2">
                <div className="text-slate-300">Block {event.blockNumber} · Procurement #{event.procurementId} · Job #{event.jobId}</div>
                <div className="text-slate-500 break-all">Employer: <EnsAddress address={event.employer} /></div>
                <EventJobBrief job={findJobById(event.jobId)} />
                <button
                  onClick={() => setSelectedTxData(event)}
                  className="text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  View tx data
                </button>
                <div className="text-slate-500 font-mono break-all">tx: {event.txHash}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTxData && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelectedTxData(null)}>
          <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-100">Prime tx data</div>
              <button onClick={() => setSelectedTxData(null)} className="text-xs px-2 py-1 border border-slate-700 rounded hover:bg-slate-800">Close</button>
            </div>
            <pre className="text-xs text-slate-300 overflow-auto max-h-[50vh] bg-slate-950 rounded border border-slate-800 p-3">
{JSON.stringify(selectedTxData, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
