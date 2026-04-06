import { useState } from 'react'
import { useJobs } from './hooks/useJobs'
import { useActions } from './hooks/useActions'
import { MetricCard } from './components/MetricCard'
import { JobCard } from './components/JobCard'
import { JobDetail } from './components/JobDetail'
import { EventLog } from './components/EventLog'
import { GitHubFlows } from './components/GitHubFlows'
import { TestTab } from './components/TestTab'
import { WalletPanel } from './components/WalletPanel'
import { JobRequestTab } from './components/JobRequestTab'
import { PrimeContractTab } from './components/PrimeContractTab'
import { IpfsTab } from './components/IpfsTab'
import OperationsLane from './components/OperationsLane'
import { ActionsPanel } from './components/ActionsPanel'
import { PipelineRegistry } from './components/PipelineRegistry'
import { useWallet } from './hooks/useWallet'

function compareJobIdDesc(a, b) {
  try {
    const aId = BigInt(String(a.sortId ?? a.jobId ?? 0).replace(/^P-/, ''))
    const bId = BigInt(String(b.sortId ?? b.jobId ?? 0).replace(/^P-/, ''))
    if (bId === aId) return 0
    return bId > aId ? 1 : -1
  } catch {
    const bNum = Number(String(b.sortId ?? b.jobId ?? 0).replace(/^P-/, ''))
    const aNum = Number(String(a.sortId ?? a.jobId ?? 0).replace(/^P-/, ''))
    if (Number.isFinite(bNum) && Number.isFinite(aNum)) return bNum - aNum
    return String(b.jobId ?? '').localeCompare(String(a.jobId ?? ''))
  }
}

export default function App() {
  const { jobs, loading, error, countdown, events, refetch } = useJobs()
  const { unreadCount } = useActions()
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('jobs')
  const wallet = useWallet()

  const assigned  = jobs.filter(j => j.status === 'Assigned')
  const completed = jobs.filter(j => j.status === 'Completed')
  const disputed  = jobs.filter(j => j.status === 'Disputed')
  const jobsDesc  = [...jobs].sort(compareJobIdDesc)

  function handleSelectJob(job) {
    setSelected(job)
    if (window.innerWidth < 768) setTab('detail')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">⬡</div>
          <div>
            <div className="text-sm font-semibold leading-tight">AGI Alpha Mission Control</div>
            <div className="text-xs text-slate-500 leading-tight">Operator console for job requests, applies, and validation</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono hidden sm:block">{countdown}s</span>
          <button onClick={refetch} className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800">refresh</button>
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${error ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
            <span className="text-xs text-slate-500">{error ? 'error' : 'live'}</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="grid grid-cols-4 gap-2 mb-4">
          <MetricCard label="Total" value={loading ? '—' : jobsDesc.length} />
          <MetricCard label="Assigned" value={loading ? '—' : assigned.length} color="text-blue-400" />
          <MetricCard label="Done" value={loading ? '—' : completed.length} color="text-green-400" />
          <MetricCard label="Disputed" value={loading ? '—' : disputed.length} color="text-red-400" />
        </div>

        <div className="grid md:grid-cols-[180px,1fr] gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-2 h-fit">
        <div className="flex flex-col gap-1">
          {['jobs', selected ? 'detail' : null, 'request', 'wallet', 'prime', 'ops', 'actions', 'workflows', 'pipelines', 'events', 'test', 'ipfs'].filter(Boolean).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`w-full text-left px-3 py-2 text-xs capitalize rounded transition-colors ${
                tab === t ? 'text-white bg-blue-600/25 border border-blue-500/50' : 'text-slate-500 border border-transparent hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              {t}
              {t === 'jobs' && assigned.length > 0 && (
                <span className="ml-1 bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">{assigned.length}</span>
              )}
              {t === 'actions' && unreadCount > 0 && (
                <span className="ml-1 bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
        </div>
        <div>
        {tab === 'jobs' && (
          <div className="space-y-2">
            {loading && <div className="text-slate-600 text-xs text-center py-8">Loading...</div>}
            {error && <div className="text-red-400 text-xs p-3 bg-red-950/30 rounded-lg border border-red-900">{error}</div>}
            {jobsDesc.map(j => (
              <JobCard
                key={`${j.source || 'agijobmanager'}-${j.jobId}`}
                job={j}
                selected={selected?.jobId === j.jobId && selected?.source === j.source}
                onClick={() => handleSelectJob(j)}
              />
            ))}
          </div>
        )}

        {tab === 'detail' && (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
            <button onClick={() => setTab('jobs')} className="text-xs text-slate-500 mb-3 flex items-center gap-1 hover:text-slate-300">← back to jobs</button>
            <JobDetail job={selected} onRunIntake={() => {}} />
          </div>
        )}


        {tab === 'request' && <JobRequestTab />}

        {tab === 'wallet' && <WalletPanel wallet={wallet} />}
        {tab === 'prime' && <PrimeContractTab wallet={wallet} jobs={jobs} />}

        {tab === 'ops' && (
          <div className="bg-slate-900 rounded-lg border border-slate-800">
            <OperationsLane />
          </div>
        )}

        {tab === 'actions' && (
          <div className="bg-slate-900 rounded-lg border border-slate-800">
            <ActionsPanel />
          </div>
        )}

        {tab === 'workflows' && <GitHubFlows />}

        {tab === 'pipelines' && (
          <div className="space-y-3">
            <PipelineRegistry />
          </div>
        )}

        {tab === 'events' && (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Event log</div>
            <EventLog events={events} />
          </div>
        )}

        {tab === 'test' && <TestTab />}

        {tab === 'ipfs' && <IpfsTab />}
        </div>
        </div>
      </div>
    </div>
  )
}
