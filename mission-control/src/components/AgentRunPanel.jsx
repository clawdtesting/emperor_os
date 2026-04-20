import { useState } from 'react'
import { fetchAgentRun, ingestAgentRun, prepareAgentRun, startAgentRun } from '../api'

export function AgentRunPanel({ selectedJob, selectedLane, selectedConnection, onPrepared, onReview }) {
  const [run, setRun] = useState(null)
  const [message, setMessage] = useState('')

  const prepare = async () => {
    if (!selectedJob || !selectedConnection) return
    const preview = await prepareAgentRun({ jobId: selectedJob.jobId, lane: selectedLane, connectionId: selectedConnection.id })
    onPrepared?.(preview)
    setMessage('packet prepared')
  }

  const start = async (packet) => {
    if (!selectedConnection) return
    const started = await startAgentRun({ connectionId: selectedConnection.id, packet })
    setRun(started)
    setMessage(`run started: ${started.runId}`)
  }

  const poll = async () => {
    if (!run?.runId) return
    const status = await fetchAgentRun(run.runId)
    setRun({ ...run, status })
  }

  const ingest = async (packet) => {
    if (!run?.runId) return
    const review = await ingestAgentRun(run.runId, { packet })
    onReview?.(review)
  }

  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-3 text-xs space-y-2">
      <div className="text-slate-400">connection: <span className="text-slate-200">{selectedConnection?.name || '(none selected)'}</span></div>
      <div className="flex gap-2">
        <button className="px-2 py-1 rounded border border-slate-700" onClick={prepare}>prepare packet</button>
        <button className="px-2 py-1 rounded border border-slate-700" onClick={() => start(selectedJob?.agentPacket)} disabled={!selectedJob?.agentPacket}>submit packet</button>
        <button className="px-2 py-1 rounded border border-slate-700" onClick={poll} disabled={!run}>poll</button>
        <button className="px-2 py-1 rounded border border-slate-700" onClick={() => ingest(selectedJob?.agentPacket)} disabled={!run}>ingest</button>
      </div>
      {message && <div className="text-blue-300">{message}</div>}
      {run && <pre className="text-[11px] bg-slate-950 border border-slate-800 rounded p-2 overflow-auto max-h-44">{JSON.stringify(run, null, 2)}</pre>}
    </div>
  )
}
