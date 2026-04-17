import { useState, useEffect } from 'react'
import {
  fetchOperatorActionFile,
  markOperatorActionSigned,
  markOperatorActionBroadcast,
  markOperatorActionFinalized,
  fetchLlmProviders,
  selectLlmProvider,
} from '../api'

const STAGES = [
  { key: 'ready_for_signature', label: 'Ready for Signature', color: 'border-amber-500', bg: 'bg-amber-950/30', text: 'text-amber-400' },
  { key: 'signed_awaiting_broadcast', label: 'Signed / Broadcast', color: 'border-purple-500', bg: 'bg-purple-950/30', text: 'text-purple-400' },
  { key: 'broadcast_pending', label: 'Broadcast Pending', color: 'border-cyan-500', bg: 'bg-cyan-950/30', text: 'text-cyan-400' },
  { key: 'awaiting_finalization', label: 'Awaiting Finalization', color: 'border-blue-500', bg: 'bg-blue-950/30', text: 'text-blue-400' },
  { key: 'finalized', label: 'Finalized', color: 'border-green-500', bg: 'bg-green-950/30', text: 'text-green-400' },
  { key: 'idle', label: 'Idle / Waiting', color: 'border-slate-600', bg: 'bg-slate-900/30', text: 'text-slate-400' },
]

const OPERATOR_QUEUE_TABS = [
  { key: 'needs_signature', label: 'Needs signature' },
  { key: 'signed_awaiting_broadcast', label: 'Signed awaiting broadcast' },
  { key: 'broadcast_awaiting_finalization', label: 'Broadcast awaiting finalization' },
]

function shortAddr(a) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—' }

function timeAgo(iso) {
  if (!iso) return '—'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function countdown(deadlineAt) {
  if (!deadlineAt) return '—'
  const ts = Date.parse(deadlineAt)
  if (!Number.isFinite(ts)) return '—'
  const diff = ts - Date.now()
  const absSec = Math.floor(Math.abs(diff) / 1000)
  const d = Math.floor(absSec / 86400)
  const h = Math.floor((absSec % 86400) / 3600)
  const m = Math.floor((absSec % 3600) / 60)
  const body = d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`
  return diff >= 0 ? body : `expired ${body} ago`
}

function ProcurementCard({ proc }) {
  const finalizedReceipts = proc.receipts.filter(r => r.status === 'finalized')

  return (
    <div className="bg-slate-900 rounded-lg p-3 mb-2 border border-slate-800 hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-mono font-bold text-slate-100">Proc #{proc.procurementId}</span>
        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{proc.status}</span>
      </div>

      {proc.employer && (
        <div className="text-xs text-slate-500 mb-1">Employer: {shortAddr(proc.employer)}</div>
      )}
      {proc.linkedJobId && (
        <div className="text-xs text-slate-500 mb-1">Job: {proc.linkedJobId}</div>
      )}
      {proc.nextAction && (
        <div className="text-xs text-slate-400 mb-1">Next: <span className="font-mono text-cyan-400">{proc.nextAction}</span></div>
      )}

      {proc.txPackages.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-1">TX Packages:</div>
          {proc.txPackages.map((p, i) => (
            <div key={i} className={`text-xs flex items-center gap-2 ${p.expired ? 'text-red-400' : p.fresh ? 'text-green-400' : 'text-amber-400'}`}>
              <span className={p.expired ? '⚠' : p.fresh ? '✓' : '⏳'} />
              <span className="font-mono">{p.file}</span>
              <span className="text-slate-600">({p.ageMin}m)</span>
              {p.expired && <span className="text-red-500 font-bold">EXPIRED</span>}
            </div>
          ))}
        </div>
      )}

      {finalizedReceipts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-1">Receipts:</div>
          {finalizedReceipts.map((r, i) => (
            <div key={i} className="text-xs text-green-400 font-mono">
              ✓ {r.action}: {shortAddr(r.txHash)} {r.finalizedAt && <span className="text-slate-600">({timeAgo(r.finalizedAt)})</span>}
            </div>
          ))}
        </div>
      )}

      {proc.deadlines?.commitDeadline && (
        <div className="mt-2 pt-2 border-t border-slate-800 text-xs text-slate-500">
          <div>Commit: {new Date(proc.deadlines.commitDeadline).toLocaleString()}</div>
          {proc.deadlines.revealDeadline && <div>Reveal: {new Date(proc.deadlines.revealDeadline).toLocaleString()}</div>}
          {proc.deadlines.trialDeadline && <div>Trial: {new Date(proc.deadlines.trialDeadline).toLocaleString()}</div>}
        </div>
      )}
    </div>
  )
}

function JobCard({ job }) {
  const finalizedReceipts = job.receipts.filter(r => r.status === 'finalized')

  return (
    <div className="bg-slate-900 rounded-lg p-3 mb-2 border border-slate-800 hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-mono font-bold text-slate-100">Job #{job.jobId}</span>
        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{job.status}</span>
      </div>

      {job.txPackages.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-1">TX Packages:</div>
          {job.txPackages.map((p, i) => (
            <div key={i} className={`text-xs flex items-center gap-2 ${p.expired ? 'text-red-400' : p.fresh ? 'text-green-400' : 'text-amber-400'}`}>
              <span className={p.expired ? '⚠' : p.fresh ? '✓' : '⏳'} />
              <span className="font-mono">{p.file}</span>
              <span className="text-slate-600">({p.ageMin}m)</span>
              {p.expired && <span className="text-red-500 font-bold">EXPIRED</span>}
            </div>
          ))}
        </div>
      )}

      {finalizedReceipts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-1">Receipts:</div>
          {finalizedReceipts.map((r, i) => (
            <div key={i} className="text-xs text-green-400 font-mono">
              ✓ {r.action}: {shortAddr(r.txHash)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function queueStageLabel(stage) {
  if (stage === 'signed_awaiting_broadcast') return 'Signed awaiting broadcast'
  if (stage === 'broadcast_awaiting_finalization') return 'Broadcast awaiting finalization'
  return 'Needs signature'
}

function OperatorQueueRow({ item, onOpenFile, onTransition, onOpenEntity, busy }) {
  const laneColor = item.lane === 'prime'
    ? 'text-cyan-300 bg-cyan-950/40 border-cyan-700'
    : item.lane === 'v2'
      ? 'text-violet-300 bg-violet-950/40 border-violet-700'
      : 'text-amber-300 bg-amber-950/40 border-amber-700'

  const transitionLabel = item.queueStage === 'signed_awaiting_broadcast'
    ? 'Mark broadcast'
    : item.queueStage === 'broadcast_awaiting_finalization'
      ? 'Mark finalized'
      : 'Mark signed / attach tx hash'

  return (
    <div className="grid grid-cols-12 gap-2 items-center border border-slate-800 rounded-md p-2 text-xs">
      <div className="col-span-2 flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-2 text-left hover:opacity-90 disabled:opacity-50"
          onClick={() => onOpenEntity(item)}
          disabled={typeof onOpenEntity !== 'function' || busy}
          title="Open entity detail"
        >
          <span className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider ${laneColor}`}>{item.lane}</span>
          <span className="text-slate-500 font-mono underline decoration-dotted">{item.entityId}</span>
        </button>
      </div>
      <div className="col-span-2 text-slate-200 font-semibold">
        <div>{item.action}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          checklist: {Array.isArray(item.checklist) ? item.checklist.length : 0}
        </div>
      </div>
      <div className="col-span-2 text-slate-400">{countdown(item.deadlineAt)}</div>
      <div className="col-span-2">
        <button
          type="button"
          className="px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          disabled={!item.reviewManifestPath || busy}
          onClick={() => onOpenFile(item.reviewManifestPath)}
        >
          Open review
        </button>
      </div>
      <div className="col-span-2">
        <button
          type="button"
          className="px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          disabled={!item.unsignedTxPath || busy}
          onClick={() => onOpenFile(item.unsignedTxPath)}
        >
          Open unsigned tx
        </button>
      </div>
      <div className="col-span-2 flex justify-end">
        <button
          type="button"
          className="px-2 py-1 rounded bg-cyan-900 text-cyan-200 hover:bg-cyan-800 disabled:opacity-40"
          disabled={busy}
          onClick={() => onTransition(item)}
        >
          {transitionLabel}
        </button>
      </div>
    </div>
  )
}

function LlmProviderPicker() {
  const [providers, setProviders] = useState([])
  const [preferred, setPreferred] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    try {
      const data = await fetchLlmProviders()
      setProviders(Array.isArray(data?.providers) ? data.providers : [])
      setPreferred(data?.preferredProvider || '')
    } catch (err) {
      setMessage(`Load failed: ${err.message}`)
    }
  }

  useEffect(() => { refresh() }, [])

  const choose = async (provider) => {
    setBusy(true)
    try {
      const data = await selectLlmProvider(provider)
      setPreferred(data?.preferredProvider || '')
      setProviders(Array.isArray(data?.providers) ? data.providers : providers)
      setMessage(provider ? `Preferred provider: ${provider}` : 'Preference cleared — first available provider will be used')
    } catch (err) {
      setMessage(`Update failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const enabledCount = providers.filter(p => p.enabled).length

  return (
    <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-200">LLM provider</h3>
        <span className="text-xs text-slate-500">{enabledCount} of {providers.length} available</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => choose('')}
          className={`px-3 py-1 rounded text-xs border ${!preferred ? 'border-cyan-700 bg-cyan-950/40 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'}`}
          title="Auto: use the first enabled provider"
        >
          Auto
        </button>
        {providers.map(p => {
          const selected = preferred === p.id
          const base = p.enabled
            ? (selected ? 'border-emerald-600 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500')
            : 'border-slate-800 bg-slate-900/50 text-slate-500 cursor-not-allowed'
          return (
            <button
              key={p.id}
              type="button"
              disabled={!p.enabled || busy}
              onClick={() => choose(p.id)}
              className={`px-3 py-1 rounded text-xs border ${base}`}
              title={p.enabled ? `${p.label} (${p.model})` : `${p.label} — set ${p.envKey} to enable`}
            >
              {p.label}
              {!p.enabled && <span className="ml-1 text-[10px] text-slate-600">missing {p.envKey}</span>}
              {p.enabled && <span className="ml-1 text-[10px] text-slate-400">{p.model}</span>}
            </button>
          )
        })}
      </div>
      {message && <div className="text-xs text-amber-300">{message}</div>}
      {enabledCount === 0 && (
        <div className="text-xs text-red-400">No providers available. Set an API key (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY) or run Ollama locally.</div>
      )}
    </div>
  )
}

export default function OperationsLane({ onOpenEntity = () => {} }) {
  const [data, setData] = useState(null)
  const [operatorActions, setOperatorActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState('prime')
  const [queueTab, setQueueTab] = useState('needs_signature')
  const [busyActionKey, setBusyActionKey] = useState('')
  const [filePreview, setFilePreview] = useState(null)
  const [queueMessage, setQueueMessage] = useState('')
  const [llmProviders, setLlmProviders] = useState([])
  const [selectedProvider, setSelectedProvider] = useState('')

  const fetchLane = async () => {
    try {
      const [laneRes, actionRes] = await Promise.all([
        fetch('/api/operations-lane'),
        fetch('/api/operator-actions'),
      ])
      const laneJson = await laneRes.json()
      const actionJson = await actionRes.json().catch(() => ({ actions: [] }))
      const llmJson = await fetchLlmProviders().catch(() => ({ providers: [], selectedProvider: null }))
      setData(laneJson)
      setOperatorActions(Array.isArray(actionJson?.actions) ? actionJson.actions : [])
      setLlmProviders(Array.isArray(llmJson?.providers) ? llmJson.providers : [])
      setSelectedProvider(llmJson?.selectedProvider || '')
    } catch (err) {
      console.error('Failed to fetch operations lane:', err)
      setQueueMessage(`Queue refresh failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const openActionFile = async (path) => {
    if (!path) return
    try {
      const file = await fetchOperatorActionFile(path)
      setFilePreview(file)
    } catch (err) {
      setQueueMessage(`Open file failed: ${err.message}`)
    }
  }

  const transitionActionFlow = async (item) => {
    const key = `${item.lane}:${item.entityId}:${item.action}`
    setBusyActionKey(key)
    try {
      const stage = item.queueStage || 'needs_signature'
      if (!item.id) throw new Error('Missing operator action id')

      if (stage === 'signed_awaiting_broadcast') {
        const txHash = window.prompt('Broadcast tx hash (required, 0x...)', '')
        if (txHash === null) return
        await markOperatorActionBroadcast(item.id, String(txHash || '').trim())
      } else if (stage === 'broadcast_awaiting_finalization') {
        const txHash = window.prompt('Finalized tx hash (optional, leave blank to keep existing)', '')
        if (txHash === null) return
        await markOperatorActionFinalized(item.id, String(txHash || '').trim())
      } else {
        await markOperatorActionSigned(item.id)
      }

      setQueueMessage(`Updated: ${item.lane}/${item.entityId} ${item.action}`)
      await fetchLane()
    } catch (err) {
      setQueueMessage(`Transition failed: ${err.message}`)
    } finally {
      setBusyActionKey('')
    }
  }

  useEffect(() => {
    fetchLane()
    const interval = setInterval(fetchLane, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="p-8 text-slate-500">Loading operations lane...</div>
  if (!data) return <div className="p-8 text-red-400">Failed to load operations lane</div>

  const allItems = tab === 'prime'
    ? data.procurements.map(p => ({ ...p, type: 'procurement' }))
    : data.jobs.map(j => ({ ...j, type: 'job' }))

  const filtered = filter === 'all' ? allItems : allItems.filter(i => i.lifecycleStage === filter)

  const counts = STAGES.reduce((acc, s) => {
    acc[s.key] = allItems.filter(i => i.lifecycleStage === s.key).length
    return acc
  }, {})

  const queueCounts = OPERATOR_QUEUE_TABS.reduce((acc, q) => {
    acc[q.key] = operatorActions.filter((a) => (a.queueStage || 'needs_signature') === q.key).length
    return acc
  }, {})
  const queueRows = operatorActions.filter((a) => (a.queueStage || 'needs_signature') === queueTab)
  const enabledProviders = llmProviders.filter((p) => p.enabled)

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-100">Operations Lane</h2>
        <div className="flex gap-2">
          <button onClick={() => setTab('prime')} className={`px-3 py-1 rounded text-xs ${tab === 'prime' ? 'bg-cyan-900 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>Prime</button>
          <button onClick={() => setTab('jobs')} className={`px-3 py-1 rounded text-xs ${tab === 'jobs' ? 'bg-cyan-900 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>Jobs (v1/v2)</button>
        </div>
      </div>

      <LlmProviderPicker />

      <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">Operator Queue</h3>
          <span className="text-xs text-slate-500">{operatorActions.length} total</span>
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto">
          {OPERATOR_QUEUE_TABS.map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => setQueueTab(q.key)}
              className={`px-3 py-1 rounded text-xs whitespace-nowrap ${queueTab === q.key ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-slate-400'}`}
            >
              {q.label} ({queueCounts[q.key] || 0})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-2 px-2 py-1 text-[11px] text-slate-500 border-b border-slate-800 mb-2">
          <div className="col-span-2">Lane</div>
          <div className="col-span-2">Action</div>
          <div className="col-span-2">Deadline countdown</div>
          <div className="col-span-2">Review</div>
          <div className="col-span-2">Unsigned tx</div>
          <div className="col-span-2 text-right">Update</div>
        </div>

        {queueRows.length === 0 ? (
          <div className="text-xs text-slate-500 italic">No actions in “{queueStageLabel(queueTab)}”.</div>
        ) : (
          <div className="space-y-2">
            {queueRows.map((item, idx) => {
              const key = `${item.lane}:${item.entityId}:${item.action}:${idx}`
              const busy = busyActionKey === `${item.lane}:${item.entityId}:${item.action}`
              return (
                <OperatorQueueRow
                  key={key}
                  item={item}
                  busy={busy}
                  onOpenFile={openActionFile}
                  onTransition={transitionActionFlow}
                  onOpenEntity={onOpenEntity}
                />
              )
            })}
          </div>
        )}

        {queueMessage && <div className="mt-3 text-xs text-amber-300">{queueMessage}</div>}
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded text-xs whitespace-nowrap ${filter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
          All ({allItems.length})
        </button>
        {STAGES.map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)} className={`px-3 py-1.5 rounded text-xs whitespace-nowrap border-l-2 ${s.color} ${filter === s.key ? `${s.bg} ${s.text}` : 'bg-slate-800 text-slate-500'}`}>
            {s.label} ({counts[s.key]})
          </button>
        ))}
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAGES.map(stage => {
          const items = filtered.filter(i => i.lifecycleStage === stage.key)
          return (
            <div key={stage.key} className={`border-t-2 ${stage.color} rounded-b-lg ${stage.bg} p-2`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${stage.text}`}>{stage.label}</h3>
              {items.length === 0 ? (
                <div className="text-xs text-slate-600 italic p-2">Empty</div>
              ) : (
                items.map(item => (
                  item.type === 'procurement'
                    ? <ProcurementCard key={item.procurementId} proc={item} />
                    : <JobCard key={item.jobId} job={item} />
                ))
              )}
            </div>
          )
        })}
      </div>

      {filePreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setFilePreview(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
              <div className="text-xs text-slate-400 break-all">{filePreview.path}</div>
              <button type="button" className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300" onClick={() => setFilePreview(null)}>Close</button>
            </div>
            <pre className="p-4 text-xs text-slate-200 whitespace-pre-wrap break-words">{filePreview.text}</pre>
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-slate-600">Scanned: {data.scannedAt ? new Date(data.scannedAt).toLocaleTimeString() : '—'} · Auto-refresh: 1h</div>
    </div>
  )
}
