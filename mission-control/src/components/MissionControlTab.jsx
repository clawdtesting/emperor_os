import { RunnerToggle } from './RunnerToggle'

const CONTRACT_LANE_CHIPS = [
  { key: 'job-v1', label: 'Job v1', tone: 'text-cyan-200 border-cyan-700 bg-cyan-950/40' },
  { key: 'job-v2', label: 'Job v2', tone: 'text-fuchsia-200 border-fuchsia-700 bg-fuchsia-950/40' },
  { key: 'prime-discovery', label: 'Prime Discovery', tone: 'text-violet-200 border-violet-700 bg-violet-950/40' },
  { key: 'prime-settlement', label: 'Prime Settlement', tone: 'text-amber-200 border-amber-700 bg-amber-950/40' },
]

const STATUS_STYLES = {
  complete: 'border-emerald-700 bg-emerald-950/40 text-emerald-300',
  active: 'border-blue-700 bg-blue-950/40 text-blue-300',
  waiting_operator: 'border-amber-700 bg-amber-950/40 text-amber-300',
  waiting_chain: 'border-cyan-700 bg-cyan-950/40 text-cyan-300',
  partial: 'border-fuchsia-700 bg-fuchsia-950/40 text-fuchsia-300',
  planned: 'border-slate-700 bg-slate-900 text-slate-400',
}

const STATUS_LABELS = {
  complete: 'complete',
  active: 'active',
  waiting_operator: 'waiting on operator',
  waiting_chain: 'waiting on chain condition',
  partial: 'partial support',
  planned: 'planned / not yet implemented',
}

const LANE_BLUEPRINT = [
  {
    id: 'v1',
    title: 'AGIJobManager v1',
    subtitle: 'Established execution lane',
    tone: 'border-cyan-900/70 bg-cyan-950/20',
    tab: 'jobs-v1',
    steps: [
      ['Discover jobs', 'complete'],
      ['Evaluate', 'complete'],
      ['Apply', 'active'],
      ['Execute work', 'active'],
      ['Validate', 'active'],
      ['Publish artifacts', 'waiting_operator'],
      ['Build unsigned completion package', 'waiting_operator'],
    ],
  },
  {
    id: 'v2',
    title: 'AGIJobManager v2',
    subtitle: 'Updated manager lane (indexed lifecycle)',
    tone: 'border-fuchsia-900/70 bg-fuchsia-950/20',
    tab: 'jobs-v2',
    laneFlag: 'operator-assisted · lifecycle-ready',
    steps: [
      ['Contract-first reads', 'complete'],
      ['v2 state inspection', 'complete'],
      ['v2 lifecycle surface', 'active'],
      ['Execution controls', 'active'],
      ['Validation controls', 'active'],
      ['Unsigned completion package', 'waiting_operator'],
    ],
  },
  {
    id: 'prime-discovery',
    title: 'AGIJobDiscoveryPrime',
    subtitle: 'Procurement + commit/reveal lane',
    tone: 'border-violet-900/70 bg-violet-950/20',
    tab: 'prime',
    steps: [
      ['Procurement inspection', 'active'],
      ['Commit', 'waiting_operator'],
      ['Reveal', 'waiting_chain'],
      ['Shortlist', 'waiting_chain'],
      ['Finalist trial', 'waiting_operator'],
      ['Validator scoring', 'waiting_chain'],
      ['Winner selection', 'waiting_chain'],
    ],
  },
  {
    id: 'prime-settlement',
    title: 'AGIJobManagerPrime',
    subtitle: 'Prime settlement lane (post-selection)',
    tone: 'border-amber-900/70 bg-amber-950/20',
    tab: 'ops',
    laneFlag: 'monitored · partial',
    steps: [
      ['Prime settlement monitoring', 'active'],
      ['Assignment / acceptance boundary', 'waiting_operator'],
      ['Completion handoff', 'partial'],
      ['Validation / dispute checks', 'partial'],
      ['Finalization tracking', 'waiting_chain'],
      ['Native end-to-end settlement', 'planned'],
    ],
  },
]

function statusChip(label, ok) {
  return (
    <span className={`text-[11px] px-2 py-1 rounded border ${ok ? 'border-emerald-700 text-emerald-300 bg-emerald-950/40' : 'border-amber-800 text-amber-300 bg-amber-950/30'}`}>
      {label}: {ok ? 'ready' : 'attention'}
    </span>
  )
}

function LaneTimeline({ steps }) {
  return (
    <ol className="space-y-2">
      {steps.map(([label, state], idx) => (
        <li key={`${label}-${idx}`} className="grid grid-cols-[auto,1fr] gap-2 items-start text-xs">
          <span className={`mt-0.5 h-2 w-2 rounded-full ${STATUS_STYLES[state] || STATUS_STYLES.planned}`} />
          <div className="min-w-0">
            <div className="text-slate-100 break-words">{label}</div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">{STATUS_LABELS[state] || STATUS_LABELS.planned}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ArchitectureLane({ lane, onOpenTab }) {
  return (
    <div className={`rounded-lg border p-3 ${lane.tone} min-w-0`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100 break-words">{lane.title}</div>
          <div className="text-[11px] text-slate-400 uppercase tracking-wider">{lane.subtitle}</div>
        </div>
        {lane.laneFlag && <span className="text-[10px] px-2 py-1 rounded border border-slate-700 bg-slate-900 text-slate-300 uppercase tracking-wider">{lane.laneFlag}</span>}
      </div>
      <LaneTimeline steps={lane.steps} />
      <button
        onClick={() => onOpenTab(lane.tab)}
        className="mt-3 text-xs px-2 py-1.5 rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
      >
        Open lane
      </button>
    </div>
  )
}

function BridgeMap({ onOpenTab }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Prime bridge map</div>
      <div className="space-y-2 text-xs">
        <div className="rounded border border-violet-900/70 bg-violet-950/20 p-2 text-violet-200">
          AGIJobDiscoveryPrime winner selection
        </div>
        <div className="pl-2 text-slate-400 break-words">↳ Bridge A: Prime procurement outcome → AGIJobManagerPrime settlement lifecycle</div>
        <div className="pl-2 text-slate-400 break-words">↳ Bridge B: prime-execution-bridge route → AGIJobManager v1 execution lane (when selected winner maps to v1 execution flow)</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => onOpenTab('prime')} className="text-xs px-2 py-1 rounded border border-violet-700 bg-violet-950/30 text-violet-200 hover:bg-violet-900/40">Open Prime Discovery</button>
        <button onClick={() => onOpenTab('ops')} className="text-xs px-2 py-1 rounded border border-amber-700 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40">Open Prime Settlement Ops</button>
        <button onClick={() => onOpenTab('jobs-v1')} className="text-xs px-2 py-1 rounded border border-cyan-700 bg-cyan-950/30 text-cyan-200 hover:bg-cyan-900/40">Open v1 Execution</button>
      </div>
    </div>
  )
}

function BoundaryPanel({ onOpenTab }) {
  return (
    <div className="rounded-lg border-2 border-amber-700 bg-slate-950 p-4">
      <div className="text-xs text-amber-300 uppercase tracking-widest">Hard operator boundary</div>
      <div className="mt-2 grid md:grid-cols-3 gap-2 text-xs">
        {[
          'Artifacts first',
          'Manifest-first review',
          'Unsigned tx package only',
          'Human review required',
          'External wallet signing (MetaMask / Ledger)',
          'Runtime never signs',
        ].map(item => (
          <div key={item} className="rounded border border-amber-900/70 bg-amber-950/20 p-2 text-amber-100 break-words">{item}</div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => onOpenTab('ops')} className="text-xs px-2 py-1.5 rounded border border-amber-700 text-amber-200 hover:bg-amber-900/30">Open operator queue</button>
        <button onClick={() => onOpenTab('actions')} className="text-xs px-2 py-1.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800">Open action feed</button>
      </div>
    </div>
  )
}

export function MissionControlTab({ wallet, jobsCount, jobsV1Count, jobsV2Count, jobsPrimeCount, assignedCount, unreadCount, onOpenTab }) {
  const isMainnet = wallet.chainId === '0x1'
  const readinessChecks = [
    Boolean(wallet.providerAvailable),
    Boolean(wallet.isConnected),
    isMainnet,
    wallet.status !== 'connecting',
  ]
  const readiness = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100)

  return (
    <div className="space-y-4 min-w-0">
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Protocol header</div>
            <h2 className="text-lg font-semibold text-slate-100 break-words">Emperor_OS Mission Control</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl break-words">
              Multi-lane operator console across AGIJobManager v1 execution, AGIJobManager v2 contract-first reads, Prime procurement discovery, and Prime settlement monitoring.
            </p>
          </div>
          <div className="rounded border border-blue-900 bg-blue-950/30 px-3 py-2 shrink-0">
            <div className="text-[11px] text-blue-300 uppercase tracking-wider">Readiness</div>
            <div className="text-xl font-semibold text-blue-200">{readiness}%</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {statusChip('provider', wallet.providerAvailable)}
          {statusChip('wallet', wallet.isConnected)}
          {statusChip('chain mainnet', isMainnet)}
          {statusChip('operator mode', unreadCount === 0)}
          <span className="text-[11px] px-2 py-1 rounded border border-amber-700 bg-amber-950/30 text-amber-300">signing boundary: unsigned-only runtime</span>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {CONTRACT_LANE_CHIPS.map(chip => (
            <span key={chip.key} className={`text-[11px] px-2 py-1 rounded border ${chip.tone}`}>{chip.label}</span>
          ))}
        </div>
      </div>

      <RunnerToggle />

      <div className="grid lg:grid-cols-2 gap-3 min-w-0">
        {LANE_BLUEPRINT.map(lane => <ArchitectureLane key={lane.id} lane={lane} onOpenTab={onOpenTab} />)}
      </div>

      <BridgeMap onOpenTab={onOpenTab} />
      <BoundaryPanel onOpenTab={onOpenTab} />

      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Live lane pressure</div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-6 gap-2 text-xs">
          <button onClick={() => onOpenTab('jobs')} className="rounded border border-slate-800 bg-slate-950 p-3 text-left hover:border-blue-800 min-w-0">
            <div className="text-slate-500">Tracked jobs</div>
            <div className="text-slate-100 text-lg font-semibold">{jobsCount}</div>
          </button>
          <button onClick={() => onOpenTab('jobs-v1')} className="rounded border border-slate-800 bg-slate-950 p-3 text-left hover:border-cyan-800 min-w-0">
            <div className="text-slate-500">v1 lane jobs</div>
            <div className="text-cyan-300 text-lg font-semibold">{jobsV1Count}</div>
          </button>
          <button onClick={() => onOpenTab('jobs-v2')} className="rounded border border-slate-800 bg-slate-950 p-3 text-left hover:border-fuchsia-800 min-w-0">
            <div className="text-slate-500">v2 lane jobs</div>
            <div className="text-fuchsia-300 text-lg font-semibold">{jobsV2Count}</div>
          </button>
          <button onClick={() => onOpenTab('prime')} className="rounded border border-slate-800 bg-slate-950 p-3 text-left hover:border-violet-800 min-w-0">
            <div className="text-slate-500">Prime discovery jobs</div>
            <div className="text-violet-300 text-lg font-semibold">{jobsPrimeCount}</div>
          </button>
          <button onClick={() => onOpenTab('jobs')} className="rounded border border-slate-800 bg-slate-950 p-3 text-left hover:border-blue-800 min-w-0">
            <div className="text-slate-500">Assigned now</div>
            <div className="text-blue-300 text-lg font-semibold">{assignedCount}</div>
          </button>
          <button onClick={() => onOpenTab('actions')} className="rounded border border-slate-800 bg-slate-950 p-3 text-left hover:border-amber-800 min-w-0">
            <div className="text-slate-500">Pending operator actions</div>
            <div className="text-amber-300 text-lg font-semibold">{unreadCount}</div>
          </button>
        </div>
      </div>
    </div>
  )
}
