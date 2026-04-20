export function UnsignedTxFromAgentPanel({ review }) {
  const tx = review?.unsignedTx
  if (!tx) return <div className="text-xs text-slate-500">Unsigned tx preview appears after successful ingest.</div>
  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-3 text-xs space-y-2">
      <div>target contract: <span className="font-mono">{tx.to}</span></div>
      <div>function: <span className="font-mono">{tx.kind}</span></div>
      <div>packet hash: <span className="font-mono">{tx.packetHash || '(n/a)'}</span></div>
      <div>candidate digest: <span className="font-mono">{tx.candidateResultDigest || '(n/a)'}</span></div>
      <pre className="text-[11px] bg-slate-950 border border-slate-800 rounded p-2 overflow-auto max-h-40">{JSON.stringify(tx, null, 2)}</pre>
      <button className="px-2 py-1 rounded bg-blue-600 text-white">handoff for signing review</button>
    </div>
  )
}
