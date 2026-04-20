import { DeterministicChecksPanel } from './DeterministicChecksPanel'
import { UnsignedTxFromAgentPanel } from './UnsignedTxFromAgentPanel'

export function AgentResultReviewPanel({ review }) {
  return (
    <div className="space-y-2">
      <DeterministicChecksPanel review={review} />
      <UnsignedTxFromAgentPanel review={review} />
      {review?.signingManifest && (
        <div className="rounded border border-slate-800 bg-slate-900 p-3 text-xs">
          <div className="mb-1">Signing manifest preview</div>
          <pre className="text-[11px] bg-slate-950 border border-slate-800 rounded p-2 overflow-auto max-h-40">{JSON.stringify(review.signingManifest, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
