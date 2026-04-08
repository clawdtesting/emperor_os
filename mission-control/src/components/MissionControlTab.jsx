const PLAYBOOK = [
  {
    title: '1) Connect signing wallet',
    detail: 'Connect MetaMask and confirm the operator account + chain before any irreversible action.',
    tab: 'wallet',
    cta: 'Open Wallet',
  },
  {
    title: '2) Inspect active opportunities',
    detail: 'Triage jobs and procurements, then drill into detail for the exact phase and required artifacts.',
    tab: 'jobs',
    cta: 'Open Jobs',
  },
  {
    title: '3) Execute operator lane',
    detail: 'Use Prime + Ops + Actions tabs as the transaction package lifecycle lane. Never sign from runtime.',
    tab: 'prime',
    cta: 'Open Prime',
  },
  {
    title: '4) Publish and verify delivery',
    detail: 'Use request/IPFS utilities for structured payload creation, publication, and fetch-back verification.',
    tab: 'ipfs',
    cta: 'Open IPFS',
  },
]

function statusChip(label, ok) {
  return (
    <span className={`text-[11px] px-2 py-1 rounded border ${ok ? 'border-emerald-700 text-emerald-300 bg-emerald-950/40' : 'border-amber-800 text-amber-300 bg-amber-950/30'}`}>
      {label}: {ok ? 'ready' : 'attention'}
    </span>
  )
}

export function MissionControlTab({ wallet, jobsCount, assignedCount, unreadCount, onOpenTab }) {
  const isMainnet = wallet.chainId === '0x1'
  const readinessChecks = [
    Boolean(wallet.providerAvailable),
    Boolean(wallet.isConnected),
    isMainnet,
    wallet.status !== 'connecting',
  ]
  const readiness = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100)

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Mission Command</div>
            <h2 className="text-lg font-semibold text-slate-100">Top-level AGI operator cockpit</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Single go-to surface for discovery, execution, and handoff. Runtime prepares artifacts and unsigned tx packages;
              MetaMask + Ledger remain the human signing boundary.
            </p>
          </div>
          <div className="rounded border border-blue-900 bg-blue-950/30 px-3 py-2">
            <div className="text-[11px] text-blue-300 uppercase tracking-wider">Readiness</div>
            <div className="text-xl font-semibold text-blue-200">{readiness}%</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {statusChip('provider', wallet.providerAvailable)}
          {statusChip('wallet', wallet.isConnected)}
          {statusChip('chain mainnet', isMainnet)}
          {statusChip('operator lane', unreadCount === 0)}
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        {PLAYBOOK.map(step => (
          <div key={step.title} className="bg-slate-900 rounded-lg border border-slate-800 p-3 flex flex-col">
            <div className="text-sm font-semibold text-slate-100">{step.title}</div>
            <div className="text-xs text-slate-400 mt-2 flex-1">{step.detail}</div>
            <button
              onClick={() => onOpenTab(step.tab)}
              className="mt-3 text-xs px-2 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              {step.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Live pressure points</div>
        <div className="grid sm:grid-cols-3 gap-2 text-xs">
          <button onClick={() => onOpenTab('jobs')} className="rounded border border-slate-800 bg-slate-950 p-3 text-left hover:border-blue-800">
            <div className="text-slate-500">Tracked jobs</div>
            <div className="text-slate-100 text-lg font-semibold">{jobsCount}</div>
          </button>
          <button onClick={() => onOpenTab('jobs')} className="rounded border border-slate-800 bg-slate-950 p-3 text-left hover:border-blue-800">
            <div className="text-slate-500">Assigned now</div>
            <div className="text-blue-300 text-lg font-semibold">{assignedCount}</div>
          </button>
          <button onClick={() => onOpenTab('actions')} className="rounded border border-slate-800 bg-slate-950 p-3 text-left hover:border-blue-800">
            <div className="text-slate-500">Pending operator actions</div>
            <div className="text-amber-300 text-lg font-semibold">{unreadCount}</div>
          </button>
        </div>
      </div>
    </div>
  )
}
