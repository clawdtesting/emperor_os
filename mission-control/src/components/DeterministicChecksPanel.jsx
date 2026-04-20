export function DeterministicChecksPanel({ review }) {
  if (!review) return <div className="text-xs text-slate-500">No deterministic ingest report yet.</div>
  const checks = review?.deterministicChecks
  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-3 text-xs space-y-2">
      <div className={`font-semibold ${checks?.ok ? 'text-green-400' : 'text-red-400'}`}>{checks?.ok ? 'Validation passed' : 'Validation failed'}</div>
      <div>errors: {(checks?.errors || []).length}</div>
      <div>warnings: {(checks?.warnings || []).length}</div>
      <pre className="text-[11px] bg-slate-950 border border-slate-800 rounded p-2 overflow-auto max-h-52">{JSON.stringify(checks, null, 2)}</pre>
    </div>
  )
}
