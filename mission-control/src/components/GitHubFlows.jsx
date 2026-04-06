import { useEffect, useMemo, useRef, useState } from 'react'

const REPO     = 'https://github.com/clawdtesting/emperor_os_clean'
const GH_API   = 'https://api.github.com/repos/clawdtesting/emperor_os_clean/actions'
const AUDIT_WF = 'audit.yml'

const AUDIT_PROFILES = ['fast', 'full', 'runtime']

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function conclusionStyle(run) {
  if (!run) return { dot: 'bg-slate-600', text: 'text-slate-500', label: 'no runs' }
  if (run.status === 'in_progress') return { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400', label: 'running' }
  if (run.status === 'queued')      return { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-400', label: 'queued' }
  if (run.conclusion === 'success') return { dot: 'bg-green-400', text: 'text-green-400', label: 'success' }
  if (run.conclusion === 'failure') return { dot: 'bg-red-400',   text: 'text-red-400',   label: 'failed' }
  if (run.conclusion === 'cancelled') return { dot: 'bg-slate-500', text: 'text-slate-500', label: 'cancelled' }
  return { dot: 'bg-slate-500', text: 'text-slate-400', label: run.conclusion || run.status || '?' }
}

// ── Dedicated Audit Panel ─────────────────────────────────────────────────────
function AuditPanel() {
  const [runs, setRuns]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [profile, setProfile]     = useState('fast')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchMsg, setDispatchMsg] = useState(null)
  const pollRef = useRef(null)

  const latestRun = runs[0] || null
  const hasActive = runs.some(r => r.status === 'in_progress' || r.status === 'queued')
  const style = conclusionStyle(latestRun)

  async function fetchRuns() {
    try {
      const r = await fetch(`/api/workflow-runs/${AUDIT_WF}?per_page=8`)
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`) }
      const data = await r.json()
      setRuns(data.workflow_runs || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Poll: 10s when active, 30s otherwise
  useEffect(() => {
    fetchRuns()
    const interval = hasActive ? 10000 : 30000
    pollRef.current = setInterval(fetchRuns, interval)
    return () => clearInterval(pollRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive])

  async function dispatch() {
    setDispatching(true)
    setDispatchMsg(null)
    try {
      const r = await fetch('/api/workflow-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: AUDIT_WF, ref: 'main', inputs: { profile } }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setDispatchMsg(`Dispatched — profile: ${profile}`)
      setTimeout(fetchRuns, 4000)
    } catch (e) {
      setDispatchMsg(`Error: ${e.message}`)
    } finally {
      setDispatching(false)
    }
  }

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className={`w-2 h-2 rounded-full ${style.dot}`} />
            <span className="text-sm font-semibold text-slate-100">Audit — Source &amp; Integration Health</span>
          </div>
          <div className="text-xs text-slate-500 font-mono ml-4">.github/workflows/{AUDIT_WF}</div>
        </div>
        <a
          href={`${REPO}/actions/workflows/${AUDIT_WF}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
        >
          open ↗
        </a>
      </div>

      {/* Latest run summary */}
      {latestRun ? (
        <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`font-mono font-semibold ${style.text}`}>{style.label}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">run #{latestRun.run_number}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500 capitalize">{latestRun.event}</span>
            </div>
            <span className="text-slate-600">{timeAgo(latestRun.updated_at)}</span>
          </div>
          {latestRun.display_title && latestRun.display_title !== latestRun.name && (
            <div className="text-slate-500 truncate">{latestRun.display_title}</div>
          )}
          <a
            href={latestRun.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 font-mono text-[11px]"
          >
            view run →
          </a>
        </div>
      ) : (
        !loading && !error && (
          <div className="text-xs text-slate-600 italic">No runs yet</div>
        )
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">{error}</div>
      )}

      {/* Trigger controls */}
      <div className="flex items-center gap-2">
        <select
          value={profile}
          onChange={e => setProfile(e.target.value)}
          className="px-2 py-1.5 rounded border border-slate-700 bg-slate-950 text-slate-200 text-xs"
        >
          {AUDIT_PROFILES.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          onClick={dispatch}
          disabled={dispatching}
          className="flex-1 text-xs py-1.5 px-3 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium transition-colors"
        >
          {dispatching ? 'Dispatching…' : 'Run audit'}
        </button>
        <button
          onClick={fetchRuns}
          disabled={loading}
          className="text-xs px-2 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-50"
        >
          ↻
        </button>
      </div>

      {dispatchMsg && (
        <div className={`text-xs rounded p-2 ${dispatchMsg.startsWith('Error') ? 'text-red-400 bg-red-950/30 border border-red-900' : 'text-green-400 bg-green-950/30 border border-green-900'}`}>
          {dispatchMsg}
        </div>
      )}

      {/* Run history */}
      {runs.length > 1 && (
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Recent runs</div>
          <div className="space-y-1">
            {runs.slice(0, 8).map(run => {
              const s = conclusionStyle(run)
              return (
                <a
                  key={run.id}
                  href={run.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                    <span className={`font-mono ${s.text}`}>{s.label}</span>
                    <span className="text-slate-600">#{run.run_number}</span>
                    <span className="text-slate-600 capitalize">{run.event}</span>
                  </div>
                  <span className="text-slate-600">{timeAgo(run.updated_at)}</span>
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Generic workflow card (used for non-audit workflows) ──────────────────────
function RunBadge({ run }) {
  if (!run) return <span className="text-xs text-slate-600 font-mono">no runs</span>
  const s = conclusionStyle(run)
  return <span className={`text-xs font-mono ${s.text}`}>{s.label}</span>
}

function WorkflowCard({ flow }) {
  return (
    <a
      href={flow.html_url || `${REPO}/actions/workflows/${flow.path?.split('/').pop()}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-slate-900 rounded-lg border border-slate-800 p-4 hover:border-slate-600 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-200 truncate">{flow.name || flow.path || 'Unnamed workflow'}</div>
          <div className="text-xs text-slate-500 font-mono break-all mt-1">{flow.path || '—'}</div>
          <div className="text-[11px] text-slate-600 mt-2">state: {flow.state || 'unknown'}</div>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <RunBadge run={flow.latestRun} />
          <div className="text-xs text-slate-600 font-mono">{timeAgo(flow.latestRun?.updated_at)}</div>
        </div>
      </div>
    </a>
  )
}

// ── Main GitHubFlows tab ──────────────────────────────────────────────────────
export function GitHubFlows() {
  const [agent, setAgent] = useState(null)
  const [flows, setFlows] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/agent').then(r => r.json()).then(setAgent).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadWorkflows() {
      setError(null)
      try {
        const res = await fetch(`${GH_API}/workflows?per_page=100`, {
          headers: { Accept: 'application/vnd.github+json' },
        })
        if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
        const data = await res.json()
        const workflows = Array.isArray(data?.workflows) ? data.workflows : []

        const withRuns = await Promise.all(
          workflows.map(async wf => {
            try {
              const rr = await fetch(`${GH_API}/workflows/${wf.id}/runs?per_page=1`, {
                headers: { Accept: 'application/vnd.github+json' },
              })
              if (!rr.ok) return { ...wf, latestRun: null }
              const runData = await rr.json()
              return { ...wf, latestRun: runData?.workflow_runs?.[0] || null }
            } catch {
              return { ...wf, latestRun: null }
            }
          })
        )

        if (!cancelled) {
          withRuns.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          setFlows(withRuns)
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed loading workflows')
      }
    }

    loadWorkflows()
    const t = setInterval(loadWorkflows, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // Separate audit from the rest so it doesn't appear twice
  const otherFlows = useMemo(
    () => flows.filter(f => !f.path?.endsWith(AUDIT_WF)),
    [flows]
  )
  const activeCount = useMemo(() => flows.filter(f => f.state === 'active').length, [flows])

  return (
    <div className="space-y-3">
      {/* Dedicated audit panel */}
      <AuditPanel />

      {/* General workflow summary */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">All workflows</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded border border-slate-800 bg-slate-950 p-2">
            <div className="text-slate-600 mb-1">Total</div>
            <div className="text-slate-200 font-semibold">{flows.length}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-950 p-2">
            <div className="text-slate-600 mb-1">Active</div>
            <div className="text-green-400 font-semibold">{activeCount}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-950 p-2">
            <div className="text-slate-600 mb-1">Disabled</div>
            <div className="text-amber-400 font-semibold">{Math.max(0, flows.length - activeCount)}</div>
          </div>
          <a
            href={`${REPO}/actions`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-slate-800 bg-slate-950 p-2 hover:border-slate-600"
          >
            <div className="text-slate-600 mb-1">Actions</div>
            <div className="text-blue-400 font-semibold">open ↗</div>
          </a>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">{error}</div>}

      {otherFlows.map(flow => <WorkflowCard key={flow.id} flow={flow} />)}

      {/* Agent identity */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Agent identity</div>
        <div className="space-y-1 text-xs font-mono text-slate-400">
          <div><span className="text-slate-600">ens   </span> <span className="text-blue-400">{agent?.ens || '—'}</span></div>
          <div><span className="text-slate-600">chain </span> <span>{agent?.chain || 'Base Sepolia'}</span></div>
          <div><span className="text-slate-600">infra </span> <span>{agent?.infra || 'GitHub Actions + Render'}</span></div>
        </div>
      </div>
    </div>
  )
}
