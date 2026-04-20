export function JobAgentPacketPanel({ packetPreview }) {
  if (!packetPreview) return <div className="text-xs text-slate-500">Prepare a packet to preview deterministic payload.</div>
  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-3 text-xs space-y-2">
      <div className="text-slate-400">lane: <span className="text-slate-200">{packetPreview.packet?.lane}</span></div>
      <div className="text-slate-400">job: <span className="text-slate-200">{packetPreview.packet?.jobId}</span></div>
      <div className="text-slate-400">packet hash: <span className="font-mono text-slate-200">{packetPreview.packetHash}</span></div>
      <div className="text-slate-400">required artifacts: {(packetPreview.requiredArtifacts || []).length}</div>
      <pre className="text-[11px] bg-slate-950 border border-slate-800 rounded p-2 overflow-auto max-h-48">{JSON.stringify(packetPreview.packet?.brief || {}, null, 2)}</pre>
    </div>
  )
}
