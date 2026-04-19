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
import { MissionControlTab } from './components/MissionControlTab'
import { useWallet } from './hooks/useWallet'
import { resolveOperatorEntityCandidate } from './features/operator-actions/entity-navigation'

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
  const [tab, setTab] = useState('mission')
  const wallet = useWallet()
  const enableTestMode = String(import.meta.env.VITE_ENABLE_TEST_MODE || '').toLowerCase() === 'true'

  const assigned  = jobs.filter(j => j.status === 'Assigned')
  const completed = jobs.filter(j => j.status === 'Completed')
  const disputed  = jobs.filter(j => j.status === 'Disputed')
  const jobsDesc  = [...jobs].sort(compareJobIdDesc)
  const jobsV2 = jobsDesc.filter(j => j.source === 'agijobmanager-v2')
  const jobsPrime = jobsDesc.filter(j => j.source === 'agiprimediscovery')
  const jobsPrimeV2 = jobsDesc.filter(j => j.source === 'agijobmanagerprime' || j.source === 'agijobmanager-prime')
  const jobsV1 = jobsDesc.filter(j =>
    j.source !== 'agijobmanager-v2'
    && j.source !== 'agiprimediscovery'
    && j.source !== 'agijobmanagerprime'
    && j.source !== 'agijobmanager-prime',
  )
  const jobsV2Display = jobsV2

  function handleSelectJob(job) {
    setSelected(job)
    if (window.innerWidth < 768) setTab('detail')
  }

  function handleOpenOperatorEntity(actionItem, jobsOverride = jobsDesc) {
    const { job: candidate, tab: nextTab } = resolveOperatorEntityCandidate(jobsOverride, actionItem)
    if (!candidate) {
      setTab(nextTab)
      return
    }

    setSelected(candidate)
    setTab(nextTab)
  }

  async function handleOperatorActionUpdated(actionItem) {
    const refreshedJobs = await refetch()
    const jobsSnapshot = Array.isArray(refreshedJobs) && refreshedJobs.length > 0
      ? [...refreshedJobs].sort(compareJobIdDesc)
      : jobsDesc
    handleOpenOperatorEntity(actionItem, jobsSnapshot)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">⬡</div>
          <div>
            <div className="text-sm font-semibold leading-tight">Emperor_OS Mission Control</div>
            <div className="text-xs text-slate-500 leading-tight break-words">Operator console for contract lanes, manifests, and unsigned transaction review</div>
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

        <div className="grid md:grid-cols-[220px,1fr] gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-2 h-fit">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 px-2 py-1">Main flow</div>
        <div className="flex flex-col gap-1 mb-3">
          {[
            { key: 'mission', label: 'System visual' },
            { key: 'request', label: 'Create job' },
            { key: 'jobs', label: 'Apply for job (4 lanes)', badge: jobsV1.length + jobsV2.length + jobsPrime.length + jobsPrimeV2.length },
            { key: selected ? 'detail' : 'jobs', label: 'Validate a job', badge: selected ? 1 : 0 },
            { key: 'actions', label: 'Operator queue', badge: unreadCount },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => setTab(item.key)}
              className={`w-full text-left px-3 py-2 text-xs rounded transition-colors ${
                tab === item.key ? 'text-white bg-blue-600/25 border border-blue-500/50' : 'text-slate-300 border border-transparent hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              {item.label}
              {item.badge > 0 && (
                <span className="ml-1 bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">{item.badge}</span>
              )}
            </button>
          ))}
        </div>

        <div className="text-[11px] uppercase tracking-wider text-slate-500 px-2 py-1">Lanes & tools</div>
        <div className="flex flex-col gap-1">
          {['jobs-v1', 'jobs-v2', 'prime', 'prime-v2', 'wallet', 'ops', 'pipelines', 'events', 'ipfs', 'workflows', enableTestMode ? 'test' : null].filter(Boolean).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`w-full text-left px-3 py-2 text-xs capitalize rounded transition-colors ${
                tab === t ? 'text-white bg-slate-700 border border-slate-500/50' : 'text-slate-500 border border-transparent hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              {t === 'jobs-v1' ? 'apply lane: v1' : t === 'jobs-v2' ? 'apply lane: v2' : t === 'prime' ? 'apply lane: prime v1' : t === 'prime-v2' ? 'apply lane: prime v2' : t}
              {t === 'jobs-v1' && jobsV1.length > 0 && (
                <span className="ml-1 bg-cyan-700 text-white text-xs rounded-full px-1.5 py-0.5">{jobsV1.length}</span>
              )}
              {t === 'jobs-v2' && jobsV2Display.length > 0 && (
                <span className="ml-1 bg-fuchsia-700 text-white text-xs rounded-full px-1.5 py-0.5">{jobsV2Display.length}</span>
              )}
              {t === 'prime' && jobsPrime.length > 0 && (
                <span className="ml-1 bg-violet-700 text-white text-xs rounded-full px-1.5 py-0.5">{jobsPrime.length}</span>
              )}
              {t === 'prime-v2' && jobsPrimeV2.length > 0 && (
                <span className="ml-1 bg-amber-700 text-white text-xs rounded-full px-1.5 py-0.5">{jobsPrimeV2.length}</span>
              )}
            </button>
          ))}
        </div>
        </div>
        <div className="min-w-0">

        {tab === 'mission' && (
          <MissionControlTab
            wallet={wallet}
            jobsCount={jobsDesc.length}
            jobsV1Count={jobsV1.length}
            jobsV2Count={jobsV2Display.length}
            jobsPrimeCount={jobsPrime.length}
            assignedCount={assigned.length}
            unreadCount={unreadCount}
            onOpenTab={setTab}
          />
        )}

        {tab === 'jobs' && (
          <div className="space-y-3">
            <div className="rounded border border-slate-800 bg-slate-900 p-3">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Apply for job</div>
              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-2 text-xs">
                <button onClick={() => setTab('jobs-v1')} className="rounded border border-cyan-900/70 bg-cyan-950/20 p-3 text-left hover:border-cyan-700">
                  <div className="text-cyan-300 font-semibold">Job-v1 lane</div>
                  <div className="text-slate-400 mt-1">Classic AGIJobManager jobs</div>
                  <div className="text-slate-200 mt-2">{jobsV1.length} jobs</div>
                </button>
                <button onClick={() => setTab('jobs-v2')} className="rounded border border-fuchsia-900/70 bg-fuchsia-950/20 p-3 text-left hover:border-fuchsia-700">
                  <div className="text-fuchsia-300 font-semibold">Job-v2 lane</div>
                  <div className="text-slate-400 mt-1">AGIJobManager v2 contract lane</div>
                  <div className="text-slate-200 mt-2">{jobsV2.length} jobs</div>
                </button>
                <button onClick={() => setTab('prime')} className="rounded border border-violet-900/70 bg-violet-950/20 p-3 text-left hover:border-violet-700">
                  <div className="text-violet-300 font-semibold">Prime-v1 lane</div>
                  <div className="text-slate-400 mt-1">Discovery / procurement competitions</div>
                  <div className="text-slate-200 mt-2">{jobsPrime.length} jobs</div>
                </button>
                <button onClick={() => setTab('prime-v2')} className="rounded border border-amber-900/70 bg-amber-950/20 p-3 text-left hover:border-amber-700">
                  <div className="text-amber-300 font-semibold">Prime-v2 lane</div>
                  <div className="text-slate-400 mt-1">Prime settlement / manager lane</div>
                  <div className="text-slate-200 mt-2">{jobsPrimeV2.length} jobs</div>
                </button>
              </div>
            </div>

            {loading && <div className="text-slate-600 text-xs text-center py-8">Loading...</div>}
            {error && <div className="text-red-400 text-xs p-3 bg-red-950/30 rounded-lg border border-red-900">{error}</div>}

            <div className="text-xs text-slate-500 uppercase tracking-wider">Jobs by lane (click one to validate)</div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { key: 'jobs-v1', title: 'Job-v1 lane', tone: 'border-cyan-900/60 bg-cyan-950/10', jobs: jobsV1 },
                { key: 'jobs-v2', title: 'Job-v2 lane', tone: 'border-fuchsia-900/60 bg-fuchsia-950/10', jobs: jobsV2Display },
                { key: 'prime', title: 'Prime-v1 lane', tone: 'border-violet-900/60 bg-violet-950/10', jobs: jobsPrime },
                { key: 'prime-v2', title: 'Prime-v2 lane', tone: 'border-amber-900/60 bg-amber-950/10', jobs: jobsPrimeV2 },
              ].map(col => (
                <div key={col.key} className={`rounded border p-2 ${col.tone} min-w-0`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-slate-200">{col.title}</div>
                    <button onClick={() => setTab(col.key)} className="text-[11px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800">open</button>
                  </div>
                  <div className="space-y-2">
                    {col.jobs.map(j => (
                      <JobCard
                        key={`${j.source || 'agijobmanager'}-${j.jobId}`}
                        job={j}
                        selected={selected?.jobId === j.jobId && selected?.source === j.source}
                        onClick={() => handleSelectJob(j)}
                      />
                    ))}
                    {!col.jobs.length && <div className="text-[11px] text-slate-500 rounded border border-slate-800 bg-slate-950/40 p-2">No jobs indexed in this lane yet.</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}



        {tab === 'jobs-v1' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">AGIJobManager v1 lane</div>
            {jobsV1.map(j => (
              <JobCard
                key={`${j.source || 'agijobmanager'}-${j.jobId}`}
                job={j}
                selected={selected?.jobId === j.jobId && selected?.source === j.source}
                onClick={() => handleSelectJob(j)}
              />
            ))}
            {!jobsV1.length && <div className="text-slate-600 text-xs py-8 text-center">No v1 jobs found.</div>}
          </div>
        )}

        {tab === 'jobs-v2' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">AGIJobManager v2 lane</div>
            {!jobsV2.length && (
              <div className="rounded border border-fuchsia-900/60 bg-fuchsia-950/20 p-3 text-xs text-slate-300 space-y-2">
                <div className="font-semibold text-fuchsia-300">No v2 jobs discovered on-chain yet</div>
                <div className="text-slate-400">
                  v2 indexing is live for spec URI, payout, assignment, completion request, and validation counters.
                  When no rows appear here, no JobCreated events were detected for known v2 contracts.
                </div>
              </div>
            )}
            {jobsV2Display.map(j => (
              <JobCard
                key={`${j.source || 'agijobmanager'}-${j.jobId}`}
                job={j}
                selected={selected?.jobId === j.jobId && selected?.source === j.source}
                onClick={() => handleSelectJob(j)}
              />
            ))}
          </div>
        )}
        {tab === 'prime-v2' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">AGIJobManagerPrime / Prime-v2 lane</div>
            <div className="rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-slate-300 space-y-2">
              <div className="font-semibold text-amber-300">Prime-v2 lane is monitored/operator-assisted in current Mission Control.</div>
              <div className="text-slate-400">Settlement lifecycle visibility is available via Ops + review manifests. Native list indexing for Prime-v2 jobs is not fully wired in this tab yet.</div>
              <div className="rounded border border-amber-800/60 bg-slate-950/50 p-2">
                <div className="text-[11px] uppercase tracking-wider text-amber-300 mb-1">Prime-v2 implementation plan</div>
                <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                  <li>Index PremiumJobCreated + downstream settlement events into `/api/jobs` as `agijobmanagerprime` rows.</li>
                  <li>Attach settlement stage state from proc/job artifacts for assignment/acceptance/finalization visibility.</li>
                  <li>Add dedicated Prime-v2 operator actions so unsigned settlement tx + review manifests are first-class in queue.</li>
                </ul>
              </div>
            </div>
            {jobsPrimeV2.map(j => (
              <JobCard
                key={`${j.source || 'agijobmanagerprime'}-${j.jobId}`}
                job={j}
                selected={selected?.jobId === j.jobId && selected?.source === j.source}
                onClick={() => handleSelectJob(j)}
              />
            ))}
            {!jobsPrimeV2.length && <div className="text-slate-600 text-xs py-8 text-center">No prime-v2 jobs indexed yet.</div>}
          </div>
        )}
        {tab === 'detail' && (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setTab('jobs')} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-300">← back to apply lanes</button>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Validate job</div>
            </div>
            <JobDetail job={selected} wallet={wallet} onRunIntake={() => {}} />
          </div>
        )}


        {tab === 'request' && <JobRequestTab wallet={wallet} />}

        {tab === 'wallet' && <WalletPanel wallet={wallet} />}
        {tab === 'prime' && <PrimeContractTab wallet={wallet} jobs={jobs} />}

        {tab === 'ops' && (
          <div className="bg-slate-900 rounded-lg border border-slate-800">
            <OperationsLane onOpenEntity={handleOpenOperatorEntity} onActionUpdated={handleOperatorActionUpdated} />
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

        {tab === 'test' && enableTestMode && <TestTab />}

        {tab === 'ipfs' && <IpfsTab />}
        </div>
        </div>
      </div>
    </div>
  )
}
