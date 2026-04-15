import { useState, useEffect } from 'react'

const STAGES = [
  { key: 'ready_for_signature', label: 'Ready for Signature', color: 'border-amber-500', bg: 'bg-amber-950/30', text: 'text-amber-400' },
  { key: 'signed_awaiting_broadcast', label: 'Signed / Broadcast', color: 'border-purple-500', bg: 'bg-purple-950/30', text: 'text-purple-400' },
  { key: 'broadcast_pending', label: 'Broadcast Pending', color: 'border-cyan-500', bg: 'bg-cyan-950/30', text: 'text-cyan-400' },
  { key: 'awaiting_finalization', label: 'Awaiting Finalization', color: 'border-blue-500', bg: 'bg-blue-950/30', text: 'text-blue-400' },
  { key: 'finalized', label: 'Finalized', color: 'border-green-500', bg: 'bg-green-950/30', text: 'text-green-400' },
  { key: 'idle', label: 'Idle / Waiting', color: 'border-slate-600', bg: 'bg-slate-900/30', text: 'text-slate-400' },
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

function ProcurementCard({ proc }) {
  const hasExpiredPkg = proc.txPackages.some(p => p.expired)
  const hasFreshPkg = proc.txPackages.some(p => p.fresh && !p.expired)
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
  const hasExpiredPkg = job.txPackages.some(p => p.expired)
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

export default function OperationsLane() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState('prime')

  const fetchLane = async () => {
    try {
      const res = await fetch('/api/operations-lane')
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Failed to fetch operations lane:', err)
    } finally {
      setLoading(false)
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

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-100">Operations Lane</h2>
        <div className="flex gap-2">
          <button onClick={() => setTab('prime')} className={`px-3 py-1 rounded text-xs ${tab === 'prime' ? 'bg-cyan-900 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>Prime</button>
          <button onClick={() => setTab('jobs')} className={`px-3 py-1 rounded text-xs ${tab === 'jobs' ? 'bg-cyan-900 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>Jobs (v1/v2)</button>
        </div>
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

      <div className="mt-4 text-xs text-slate-600">Scanned: {data.scannedAt ? new Date(data.scannedAt).toLocaleTimeString() : '—'} · Auto-refresh: 1h</div>
    </div>
  )
}
