import { decodePrimeActionCode } from '../../features/prime/actionCodes'
import { formatWindowStatus, getPrimeWindowStatus } from '../../features/prime/windowStatus'

function Badge({ label, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-700 bg-slate-900 text-slate-200',
    blue: 'border-blue-900/70 bg-blue-950/40 text-blue-300',
    amber: 'border-amber-900/70 bg-amber-950/30 text-amber-300',
    green: 'border-green-900/70 bg-green-950/30 text-green-300',
    red: 'border-red-900/70 bg-red-950/30 text-red-300',
  }
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${tones[tone] || tones.slate}`}>{label}</span>
}

function toneForWindow(status) {
  if (status === 'open') return 'green'
  if (status === 'upcoming') return 'amber'
  if (status === 'closed') return 'red'
  return 'slate'
}

function toneForProvenance(status) {
  if (status === 'verified') return 'green'
  if (status === 'inferred') return 'amber'
  return 'slate'
}

function niceLabel(value) {
  if (!value) return 'Unknown'
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function PrimeProcurementHelperCard({ procurementId, rawCode, procurementTiming }) {
  const decoded = decodePrimeActionCode(rawCode)
  const windowStatus = getPrimeWindowStatus(decoded.phase, procurementTiming)

  return (
    <div className="mt-3 rounded border border-slate-800 bg-slate-900/60 p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-slate-100 font-semibold">Procurement Helper</div>
          <div className="text-xs text-slate-500">Procurement ID: <span className="font-mono text-slate-300">{procurementId || '—'}</span></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge label={`Code ${decoded.code}`} tone="blue" />
          <Badge label={`Phase ${niceLabel(decoded.phase)}`} />
          <Badge label={`Actor ${niceLabel(decoded.actor)}`} />
          <Badge label={`Window ${formatWindowStatus(windowStatus)}`} tone={toneForWindow(windowStatus)} />
          <Badge label={`Provenance ${niceLabel(decoded.provenance)}`} tone={toneForProvenance(decoded.provenance)} />
        </div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950/70 p-2">
        <div className="text-xs text-slate-500 mb-1">Decoded action</div>
        <div className="text-sm text-slate-100 font-medium">{decoded.label}</div>
        <div className="text-xs text-slate-300 mt-1 leading-relaxed">{decoded.description}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
          <div className="text-slate-500 mb-1">Raw next action code</div>
          <div className="font-mono text-slate-200">{rawCode || '—'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
          <div className="text-slate-500 mb-1">Signature required</div>
          <div className="text-slate-200">{decoded.requiresSignature ? 'Yes' : 'No'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
          <div className="text-slate-500 mb-1">Likely contract function</div>
          <div className="text-slate-200 break-all">{decoded.likelyContractFunction || 'Not yet mapped'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
          <div className="text-slate-500 mb-1">Workflow route</div>
          <div className="text-slate-200 break-all">{decoded.likelyWorkflowRoute || 'Not yet wired'}</div>
        </div>
      </div>

      <div className="rounded border border-blue-900/50 bg-blue-950/25 p-2">
        <div className="text-xs text-blue-300 font-semibold mb-1">Operator next step</div>
        <div className="text-xs text-slate-200 leading-relaxed">{decoded.operatorGuidance}</div>
      </div>
    </div>
  )
}
