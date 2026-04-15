import { useEffect, useMemo, useState } from 'react'

const REPO = 'https://github.com/clawdtesting/emperor_os_clean'

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function RunBadge({ run }) {
  if (!run) return <span className="text-xs text-slate-600 font-mono">no runs</span>
  if (run.status === 'in_progress') {
    return (
      <span className="flex items-center gap-1 text-xs font-mono text-blue-400">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
        running
      </span>
    )
  }
  if (run.status === 'queued') return <span className="text-xs font-mono text-amber-400">queued</span>
  if (run.conclusion === 'success') return <span className="text-xs font-mono text-green-400">success</span>
  if (run.conclusion === 'failure') return <span className="text-xs font-mono text-red-400">failed</span>
  if (run.conclusion === 'cancelled') return <span className="text-xs font-mono text-slate-500">cancelled</span>
  return <span className="text-xs font-mono text-slate-500">{run.conclusion || run.status || 'unknown'}</span>
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

export function GitHubFlows() {
  const [agent, setAgent] = useState(null)
  const [flows, setFlows] = useState([])
  const [repo, setRepo] = useState('clawdtesting/emperor_os_clean')
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/agent').then(r => r.json()).then(setAgent).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadWorkflows() {
      setError(null)
      try {
        const res = await fetch('/api/github/workflows')
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || `GitHub API HTTP ${res.status}`)
        }
        const data = await res.json()
        const workflows = Array.isArray(data?.workflows) ? data.workflows : []
        const repoName = String(data?.repo || 'clawdtesting/emperor_os_clean').trim()

        if (!cancelled) {
          workflows.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          setFlows(workflows)
          setRepo(repoName)
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed loading workflows')
      }
    }

    loadWorkflows()
    const t = setInterval(loadWorkflows, 60 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  const activeCount = useMemo(() => flows.filter(f => f.state === 'active').length, [flows])

  return (
    <div className="space-y-3">
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">GitHub Actions workflows</div>
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
            href={`https://github.com/${repo}/actions`}
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

      {flows.map(flow => <WorkflowCard key={flow.id} flow={flow} />)}

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
