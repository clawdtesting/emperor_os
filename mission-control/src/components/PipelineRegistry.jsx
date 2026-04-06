import { useState, useEffect } from 'react'
import { fetchPipelines } from '../api'

const STATUS_STYLES = {
  active: 'bg-blue-950 text-blue-400 border-blue-800',
  ready:  'bg-green-950 text-green-400 border-green-800',
  error:  'bg-red-950 text-red-400 border-red-800',
}

export function PipelineRegistry() {
  const [pipelines, setPipelines] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    fetchPipelines()
      .then(data => setPipelines(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message || 'Failed to load pipelines'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Pipelines</div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'loading…' : 'refresh'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2 mb-3">
          {error}
        </div>
      )}

      {!loading && !error && pipelines.length === 0 && (
        <div className="text-xs text-slate-600 text-center py-6">
          No pipeline files found in <span className="font-mono text-slate-500">pipelines/</span>
        </div>
      )}

      {pipelines.length > 0 && (
        <div className="space-y-0">
          {pipelines.map(p => (
            <div
              key={p.name}
              className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-800 last:border-0"
            >
              <div className="min-w-0">
                <div className="text-xs font-mono text-slate-300 truncate">{p.name}</div>
                {p.desc && <div className="text-xs text-slate-600 mt-0.5">{p.desc}</div>}
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded border shrink-0 ${
                  STATUS_STYLES[p.status] || 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {p.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-slate-600 font-mono">
        source: <span className="text-slate-500">pipelines/*.yaml | *.lobster</span>
      </div>
    </div>
  )
}
