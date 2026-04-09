import { useState } from 'react'
import { useRunner } from '../hooks/useRunner'

function formatUptime(ms) {
  if (!ms || ms < 0) return '—'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return `${h}h ${m}m`
}

export function RunnerToggle() {
  const { status, logs, loading, error, toggling, start, stop, refreshLogs } = useRunner()
  const [showLogs, setShowLogs] = useState(false)
  const [confirm, setConfirm] = useState(null) // 'start' | 'stop' | null

  const running = status.running

  function handleToggle() {
    if (toggling) return
    setConfirm(running ? 'stop' : 'start')
  }

  async function handleConfirm() {
    const action = confirm
    setConfirm(null)
    if (action === 'start') await start()
    if (action === 'stop') await stop()
  }

  function handleShowLogs() {
    refreshLogs()
    setShowLogs(v => !v)
  }

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">JobManager V1 Runner</div>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-slate-600' : running ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
            <span className={`text-sm font-semibold ${running ? 'text-green-400' : 'text-slate-500'}`}>
              {loading ? 'checking...' : running ? 'RUNNING' : 'STOPPED'}
            </span>
            {running && status.uptimeMs != null && (
              <span className="text-xs text-slate-500 font-mono">uptime {formatUptime(status.uptimeMs)}</span>
            )}
            {running && status.pid && (
              <span className="text-xs text-slate-600 font-mono">pid {status.pid}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShowLogs}
            className="text-xs px-2 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            logs
          </button>
          <button
            onClick={handleToggle}
            disabled={toggling || loading}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none ${
              toggling || loading
                ? 'bg-slate-700 cursor-wait'
                : running
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                running ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">
          {error}
        </div>
      )}

      {confirm && (
        <div className="mt-3 flex items-center gap-3 p-3 rounded border border-amber-800 bg-amber-950/20">
          <span className="text-xs text-amber-300">
            {confirm === 'start'
              ? 'Start the AGIJobManager V1 loop? It will run discover/evaluate/apply/execute cycles.'
              : 'Stop the running AGIJobManager V1 loop?'}
          </span>
          <button
            onClick={handleConfirm}
            className={`text-xs font-semibold px-3 py-1.5 rounded ${
              confirm === 'start'
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {confirm === 'start' ? 'Start' : 'Stop'}
          </button>
          <button
            onClick={() => setConfirm(null)}
            className="text-xs px-2 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800"
          >
            cancel
          </button>
        </div>
      )}

      {showLogs && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Recent logs</span>
            <button
              onClick={refreshLogs}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              refresh
            </button>
          </div>
          <div className="bg-slate-950 rounded border border-slate-800 p-2 max-h-48 overflow-y-auto font-mono text-xs">
            {logs.length === 0 && (
              <div className="text-slate-600 text-center py-2">No logs yet</div>
            )}
            {logs.map((l, i) => (
              <div key={i} className={`py-0.5 ${l.level === 'stderr' || l.level === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
                <span className="text-slate-600">{l.ts?.slice(11, 19)}</span>{' '}
                {l.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
