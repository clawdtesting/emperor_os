import { useState, useEffect } from 'react'
import { StatusBadge } from './StatusBadge'
import { resolveEns, shortAddr } from '../utils/ens'
import { fetchProcurementArtifacts, fetchV2OperatorView, validateJobDryRun } from '../api'
import { summarizeDryRunReport } from '../features/validation/summarizeDryRun'

const IPFS_GW = 'https://ipfs.io/ipfs/'

function IpfsLink({ uri }) {
  if (!uri) return <span className="text-slate-500">—</span>
  const cid = uri.replace('ipfs://', '')
  const short = cid.slice(0, 10) + '...' + cid.slice(-6)
  return (
    <a href={IPFS_GW + cid} target="_blank" rel="noopener noreferrer"
       className="text-blue-400 hover:text-blue-300 font-mono break-all">
      {short}
    </a>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-slate-800 last:border-0 gap-4">
      <span className="text-xs text-slate-500 shrink-0 w-24">{label}</span>
      <span className="text-xs text-right break-all font-mono text-slate-300">{value}</span>
    </div>
  )
}

export function JobBrief({ spec, onClose }) {
  const p = spec?.properties || {}
  const durationDays = p.durationSeconds ? Math.round(p.durationSeconds / 86400) : null

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-screen overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Job Brief</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Title</div>
            <div className="text-base font-medium text-white leading-snug">{p.title || spec?.name || '—'}</div>
          </div>

          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Summary</div>
            <div className="text-sm text-slate-300 leading-relaxed">{p.summary || '—'}</div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Payout</div>
              <div className="text-sm font-semibold text-blue-400">
                {p.payoutAGIALPHA ? Number(p.payoutAGIALPHA).toLocaleString() : '—'}
              </div>
              <div className="text-xs text-slate-600">AGIALPHA</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Duration</div>
              <div className="text-sm font-semibold text-slate-200">{durationDays || '—'}</div>
              <div className="text-xs text-slate-600">days</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Category</div>
              <div className="text-xs font-semibold text-slate-200 capitalize leading-tight">{p.category || '—'}</div>
              <div className="text-xs text-slate-600">type</div>
            </div>
          </div>

          {p.details && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Details</div>
              <div className="text-sm text-slate-400 leading-relaxed bg-slate-800/50 rounded-lg p-3">{p.details}</div>
            </div>
          )}

          {p.deliverables?.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Deliverables</div>
              <ul className="space-y-1.5">
                {p.deliverables.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-blue-500 shrink-0 mt-0.5">→</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.acceptanceCriteria?.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Acceptance criteria</div>
              <ul className="space-y-1.5">
                {p.acceptanceCriteria.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.requirements?.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Requirements</div>
              <ul className="space-y-1.5">
                {p.requirements.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.tags.map(t => (
                <span key={t} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">{t}</span>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-5 py-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}



function CompletionBrief({ data, onClose }) {
  const maybeLinks = [
    ['Deliverable', data?.image || data?.outputURI || data?.deliverableURI],
    ['Metadata', data?.completionURI || data?.metadataURI || data?.uri],
    ['Attachment', data?.attachmentURI || data?.artifactURI],
  ].filter(([, value]) => value)

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-screen overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Completion Brief</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {data?.properties?.validatorNote && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Validator note</div>
              <div className="text-sm text-slate-300 leading-relaxed bg-slate-800/50 rounded-lg p-3">
                {typeof data.properties.validatorNote === 'string'
                  ? data.properties.validatorNote
                  : JSON.stringify(data.properties.validatorNote, null, 2)}
              </div>
            </div>
          )}

          {maybeLinks.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Linked assets</div>
              {maybeLinks.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border border-slate-800 rounded-lg p-2">
                  <span className="text-xs text-slate-500">{label}</span>
                  <IpfsLink uri={value} />
                </div>
              ))}
            </div>
          )}

          <details className="rounded border border-slate-700 bg-slate-900/60 p-2">
            <summary className="cursor-pointer text-slate-400">raw completion payload</summary>
            <pre className="mt-2 text-[11px] text-slate-300 overflow-auto max-h-48">{JSON.stringify(data, null, 2)}</pre>
          </details>
        </div>

        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-5 py-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function EnsRows({ job }) {
  const [empEns, setEmpEns]     = useState(null)
  const [agentEns, setAgentEns] = useState(null)

  useEffect(() => { resolveEns(job.employer).then(setEmpEns) },       [job.employer])
  useEffect(() => { resolveEns(job.assignedAgent).then(setAgentEns) }, [job.assignedAgent])

  const fmtAddr = (addr, ens) => {
    if (!addr) return '—'
    return (
      <a href={`https://etherscan.io/address/${addr}`} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200">
        {ens
          ? <><span>{ens}</span> <span className="text-slate-600">({shortAddr(addr)})</span></>
          : <span>{shortAddr(addr)}</span>}
      </a>
    )
  }

  return (
    <div>
      <Row label="Payout"     value={job.payout} />
      <Row label="Duration"   value={job.duration} />
      <Row label="Employer"   value={fmtAddr(job.employer, empEns)} />
      <Row label="Agent"      value={job.assignedAgent ? fmtAddr(job.assignedAgent, agentEns) : 'unassigned'} />
      <Row label="Spec URI"   value={<IpfsLink uri={job.specURI} />} />
      <Row label="Completion" value={job.completionRequested ? 'requested' : 'pending'} />
      <Row label="Votes"      value={(job.approvals || 0) + ' approve / ' + (job.disapprovals || 0) + ' dispute'} />
    </div>
  )
}

export function JobDetail({ job, onRunIntake }) {
  const [briefSpec, setBriefSpec]       = useState(null)
  const [loadingBrief, setLoadingBrief] = useState(false)
  const [briefError, setBriefError]     = useState(null)
  const [completionMeta, setCompletionMeta] = useState(null)
  const [loadingMeta, setLoadingMeta]   = useState(false)
  const [showCompletionBrief, setShowCompletionBrief] = useState(false)
  const [intakeRunning, setIntakeRunning] = useState(false)
  const [intakeLog, setIntakeLog]         = useState([])
  const [intakeDone, setIntakeDone]       = useState(false)
  const [intakeExitCode, setIntakeExitCode] = useState(null)
  const [validationRunning, setValidationRunning] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [validationSummary, setValidationSummary] = useState(null)
  const [operatorLoading, setOperatorLoading] = useState(false)
  const [operatorError, setOperatorError] = useState('')
  const [operatorView, setOperatorView] = useState(null)
  const [procArtifactsLoading, setProcArtifactsLoading] = useState(false)
  const [procArtifactsError, setProcArtifactsError] = useState('')
  const [procArtifacts, setProcArtifacts] = useState(null)

  const total       = (job?.approvals || 0) + (job?.disapprovals || 0)
  const approvalPct = total > 0 ? Math.round(((job?.approvals || 0) / total) * 100) : 0
  const ipfsCid     = job?.specURI?.replace('ipfs://', '')
  const canRunValidation = /\d+/.test(String(job?.jobId || ''))
  const isV2 = job?.source === 'agijobmanager-v2'
  const isPrime = job?.source === 'agiprimediscovery'
  const procurementId = String(
    job?.procurementId
      ?? (String(job?.jobId || '').match(/(\d+)/)?.[1] || '')
  )

  useEffect(() => {
    setValidationRunning(false)
    setValidationError('')
    setValidationSummary(null)
  }, [job?.jobId, job?.source])

  useEffect(() => {
    let cancelled = false
    if (!isV2 || !job?.jobId) {
      setOperatorLoading(false)
      setOperatorError('')
      setOperatorView(null)
      return
    }

    ;(async () => {
      setOperatorLoading(true)
      setOperatorError('')
      try {
        const linkAddr = String(job?.links?.contract || '').split('/').pop()
        const employerHint = String(job?.employer || '')
        const contractHint = /^0x[a-fA-F0-9]{40}$/.test(linkAddr)
          ? linkAddr
          : (/^0x[a-fA-F0-9]{40}$/.test(employerHint) ? employerHint : '')

        const data = await fetchV2OperatorView(job.jobId, {
          source: job.source,
          managerVersion: 'v2',
          contractHint,
        })
        if (!cancelled) setOperatorView(data)
      } catch (e) {
        if (!cancelled) {
          setOperatorView(null)
          setOperatorError(e.message || 'Failed to load operator view')
        }
      } finally {
        if (!cancelled) setOperatorLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [isV2, job?.jobId, job?.source])

  useEffect(() => {
    let cancelled = false
    if (!isPrime || !/^\d+$/.test(procurementId)) {
      setProcArtifactsLoading(false)
      setProcArtifactsError('')
      setProcArtifacts(null)
      return
    }

    ;(async () => {
      setProcArtifactsLoading(true)
      setProcArtifactsError('')
      try {
        const data = await fetchProcurementArtifacts(procurementId)
        if (!cancelled) setProcArtifacts(data)
      } catch (e) {
        if (!cancelled) {
          setProcArtifacts(null)
          setProcArtifactsError(e.message || 'Failed to load procurement artifacts')
        }
      } finally {
        if (!cancelled) setProcArtifactsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [isPrime, procurementId])

  if (!job) {
    return (
      <div className="h-full flex items-center justify-center text-slate-600 text-sm">
        Select a job to view details
      </div>
    )
  }

  async function fetchCompletion() {
    setLoadingMeta(true)
    try {
      const res = await fetch(`/api/job-metadata/${job.jobId}?type=completion`)
      if (res.ok) setCompletionMeta(await res.json())
      else {
        const err = await res.json().catch(() => ({}))
        setBriefError(err.error || `Failed to fetch completion metadata (HTTP ${res.status})`)
      }
    } catch {
      // no completion metadata available yet
    }
    finally { setLoadingMeta(false) }
  }

  async function openBrief() {
    setLoadingBrief(true)
    setBriefError(null)
    try {
      // Fetch the IPFS spec directly — this has title, summary, deliverables etc.
      const gateways = [
        'https://ipfs.io/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
      ]
      let spec = null
      for (const gw of gateways) {
        try {
          const res = await fetch(gw + ipfsCid, { signal: AbortSignal.timeout(8000) })
          if (res.ok) { spec = await res.json(); break }
        } catch { continue }
      }
      if (!spec) throw new Error('All IPFS gateways failed')
      setBriefSpec(spec)
    } catch (e) {
      setBriefError(e.message)
    } finally {
      setLoadingBrief(false)
    }
  }

  async function handleRunIntake(targetJob) {
    setIntakeRunning(true)
    setIntakeLog([])
    setIntakeDone(false)
    setIntakeExitCode(null)
    onRunIntake?.(targetJob)

    const addLog = (entry) => setIntakeLog(prev => [...prev, entry])

    try {
      const res = await fetch('/api/intake-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: targetJob.jobId, job: targetJob }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        addLog({ type: 'error', message: err.error || `HTTP ${res.status}` })
        setIntakeRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const data = JSON.parse(line.slice(5).trim())
            addLog(data)
            if (data.type === 'done') { setIntakeDone(true); setIntakeExitCode(data.code ?? null) }
          } catch {
            // ignore malformed streamed line
          }
        }
      }
    } catch (e) {
      addLog({ type: 'error', message: e.message })
    } finally {
      setIntakeRunning(false)
    }
  }

  async function handleRunValidation() {
    setValidationRunning(true)
    setValidationError('')
    try {
      const data = await validateJobDryRun(job.jobId, {
        source: job?.source || '',
        managerVersion: job?.source === 'agijobmanager-v2' ? 'v2' : undefined,
        job,
      })
      setValidationSummary(summarizeDryRunReport(data.report))
    } catch (e) {
      setValidationSummary(null)
      setValidationError(e.message || 'Validation failed')
    } finally {
      setValidationRunning(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto space-y-4">
      {briefSpec && <JobBrief spec={briefSpec} onClose={() => setBriefSpec(null)} />}
      {showCompletionBrief && completionMeta && <CompletionBrief data={completionMeta} onClose={() => setShowCompletionBrief(false)} />}

      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-slate-500">Job #{job.jobId}</span>
        <StatusBadge status={job.status} />
      </div>

      <EnsRows job={job} />

      {isV2 && (
        <div className="rounded-lg border border-fuchsia-800/60 bg-fuchsia-950/15 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-fuchsia-300">Operator view (v2)</div>
            {operatorLoading && <div className="text-[11px] text-slate-400">loading…</div>}
          </div>

          {operatorError && (
            <div className="text-xs text-red-300 border border-red-900 bg-red-950/30 rounded p-2">{operatorError}</div>
          )}

          {operatorView && (
            <>
              <div className="grid md:grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                  <div className="text-slate-500">Contract</div>
                  <div className="font-mono text-slate-200 break-all">{operatorView.contract || '—'}</div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                  <div className="text-slate-500">Procurement</div>
                  <div className="font-mono text-slate-200">{operatorView.procurement || 'not exposed on AGIJobManager-v2'}</div>
                </div>
              </div>

              {operatorView.onchainSummary && (
                <div className="grid md:grid-cols-3 gap-2 text-xs">
                  <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                    <div className="text-slate-500">Status</div>
                    <div className="text-slate-200">{operatorView.onchainSummary.status || '—'}</div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                    <div className="text-slate-500">Payout (on-chain)</div>
                    <div className="text-slate-200">{operatorView.onchainSummary.payout || '—'}</div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                    <div className="text-slate-500">Duration (on-chain)</div>
                    <div className="text-slate-200">{operatorView.onchainSummary.duration || '—'}</div>
                  </div>
                </div>
              )}

              <div className="rounded border border-slate-800 bg-slate-950/40 p-2 text-xs space-y-1">
                <div className="text-slate-500">Job request memo</div>
                <div className="text-slate-200 whitespace-pre-wrap">{operatorView?.jobRequest?.memo || 'No memo found in MCP/spec payload.'}</div>
                <div className="text-slate-500 font-mono break-all">Spec URI: {operatorView?.jobRequest?.specURI || '—'}</div>
                {!operatorView?.jobRequest?.specFetch?.ok && (
                  <div className="text-amber-300">Spec fetch warning: {operatorView?.jobRequest?.specFetch?.error || 'unknown'}</div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                  <div className="text-slate-500 mb-1">Applications ({operatorView.applications?.length || 0})</div>
                  {(operatorView.applications || []).length > 0 ? (
                    <div className="space-y-2">
                      {operatorView.applications.map((a, i) => (
                        <div key={`${a.txHash}-${i}`} className="rounded border border-slate-800 p-2">
                          <div className="text-slate-200 font-mono break-all">{a.agent || 'unknown agent'}</div>
                          <div className="text-slate-400">ENS: <span className="font-mono">{a.ensSubdomain || '—'}</span></div>
                          <div className="text-slate-400">Application IPFS: <span className="font-mono">{a.applicationIpfsURI || 'not available on AGIJobManager-v2'}</span></div>
                          <div className="text-slate-500">block {a.blockNumber}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-slate-600">No applications found for this job id.</div>}
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                  <div className="text-slate-500 mb-1">Validator actions ({operatorView.validations?.length || 0})</div>
                  {(operatorView.validations || []).length > 0 ? (
                    <div className="space-y-1">
                      {operatorView.validations.map((v, i) => (
                        <div key={`${v.txHash}-${i}`} className="text-slate-200 font-mono break-all">
                          {v.verdict} · {v.validator || 'unknown validator'} · block {v.blockNumber}
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-slate-600">No validator events yet.</div>}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                  <div className="text-slate-500 mb-1">Completion requests ({operatorView.completionRequests?.length || 0})</div>
                  {(operatorView.completionRequests || []).length > 0 ? (
                    <div className="space-y-1">
                      {operatorView.completionRequests.map((c, i) => (
                        <div key={`${c.txHash}-${i}`} className="text-slate-200 font-mono break-all">
                          {c.agent || 'unknown agent'} · {c.jobCompletionURI || 'no URI'}
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-slate-600">No completion requests yet.</div>}
                </div>

                <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                  <div className="text-slate-500 mb-1">Completions / disputes</div>
                  <div className="text-slate-300">completed: {operatorView.completionEvents?.length || 0}</div>
                  <div className="text-slate-300">disputed: {operatorView.disputeEvents?.length || 0}</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Approval ratio</span>
          <span>{approvalPct}%</span>
        </div>
        <div className="bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: approvalPct + '%' }} />
        </div>
      </div>

      {briefError && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">{briefError}</div>
      )}

      <div className="flex gap-2">
        <button
          onClick={openBrief}
          disabled={loadingBrief}
          className="flex-1 text-xs py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors font-medium"
        >
          {loadingBrief ? 'fetching IPFS...' : 'view brief'}
        </button>
        {ipfsCid ? (
          <a
            href={IPFS_GW + ipfsCid}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-xs py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors text-center"
          >
            spec on IPFS
          </a>
        ) : (
          <div className="flex-1 text-xs py-2 rounded-lg border border-slate-800 text-slate-600 text-center">spec unavailable</div>
        )}
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-400 font-medium">Validation lane</div>
          {validationSummary?.status && (
            <span className={`text-[11px] px-2 py-1 rounded border ${
              validationSummary.status === 'pass'
                ? 'border-emerald-700 text-emerald-300 bg-emerald-950/30'
                : validationSummary.status === 'fail'
                  ? 'border-amber-700 text-amber-300 bg-amber-950/30'
                  : 'border-red-700 text-red-300 bg-red-950/30'
            }`}>
              {validationSummary.status === 'pass' ? 'ready' : validationSummary.status === 'fail' ? 'needs fixes' : 'error'}
            </span>
          )}
        </div>

        <div className="text-xs text-slate-500">
          {job?.source === 'agiprimediscovery'
            ? 'Run Prime scoring validation (trial/score windows, action code, and commit↔reveal continuity) before validator actions.'
            : 'Run deterministic dry-run validation for this job and get immediate pass/fail checks before advancing.'}
        </div>

        <button
          onClick={handleRunValidation}
          disabled={validationRunning || !canRunValidation}
          className="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {validationRunning ? 'Running validation…' : canRunValidation ? 'Validate this job' : 'Validation unavailable for this lane'}
        </button>

        {!canRunValidation && (
          <div className="text-xs text-slate-500">Validation needs a detectable numeric job id (examples: 12, V2-12).</div>
        )}

        {validationError && (
          <div className="text-xs text-red-300 border border-red-800 bg-red-950/30 rounded p-2">{validationError}</div>
        )}

        {validationSummary && (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Verdict: <span className="text-slate-200 font-mono">{validationSummary.verdict || 'UNKNOWN'}</span></span>
              <span>{validationSummary.passed}/{validationSummary.total} checks passed</span>
            </div>
            {validationSummary.recommendation && (
              <div className="text-slate-400">{validationSummary.recommendation}</div>
            )}
            {validationSummary.failedChecks.length > 0 && (
              <div className="rounded border border-amber-900 bg-amber-950/20 p-2 space-y-1">
                {validationSummary.failedChecks.slice(0, 5).map((check) => (
                  <div key={check.name} className="text-amber-200">
                    • <span className="font-mono">{check.name}</span>{check.detail ? ` — ${check.detail}` : ''}
                  </div>
                ))}
                {validationSummary.failedChecks.length > 5 && (
                  <div className="text-amber-400">+{validationSummary.failedChecks.length - 5} more failed checks</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isPrime && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400 font-medium">Agent outputs for validation</div>
            <div className="text-[11px] text-slate-500">procurement #{/^\d+$/.test(procurementId) ? procurementId : 'unknown'}</div>
          </div>

          <div className="text-xs text-slate-500">
            Open these files directly to validate trial deliverables and scoring continuity (commit/reveal).
          </div>

          {procArtifactsLoading && <div className="text-xs text-slate-500">Loading artifact links…</div>}
          {procArtifactsError && <div className="text-xs text-red-300 border border-red-800 bg-red-950/30 rounded p-2">{procArtifactsError}</div>}

          {procArtifacts?.artifacts?.length > 0 && (
            <div className="grid md:grid-cols-2 gap-2 text-xs">
              {procArtifacts.artifacts.map((artifact) => (
                <div key={artifact.key} className="rounded border border-slate-800 bg-slate-950/40 p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-slate-300 truncate">{artifact.label}</div>
                    <div className={artifact.exists ? 'text-emerald-400' : 'text-amber-400'}>
                      {artifact.exists ? 'available' : 'missing'}
                    </div>
                  </div>
                  {artifact.exists ? (
                    <a
                      href={artifact.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-2 py-1 rounded border border-blue-800 text-blue-300 hover:bg-blue-950/30"
                    >
                      open
                    </a>
                  ) : (
                    <span className="shrink-0 px-2 py-1 rounded border border-slate-800 text-slate-500">n/a</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completion metadata for finished/disputed jobs */}
      {job.completionRequested && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-slate-400 font-medium">Completion output</div>
            {!completionMeta && (
              <button
                onClick={fetchCompletion}
                disabled={loadingMeta}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                {loadingMeta ? 'fetching...' : 'fetch metadata'}
              </button>
            )}
          </div>
          {completionMeta && (
            <div className="space-y-2 text-xs">
              {(completionMeta.image || completionMeta.outputURI || completionMeta.deliverableURI) && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-20 shrink-0">deliverable</span>
                  <IpfsLink uri={completionMeta.image || completionMeta.outputURI || completionMeta.deliverableURI} />
                </div>
              )}
              {(completionMeta.completionURI || completionMeta.metadataURI || completionMeta.uri) && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-20 shrink-0">metadata</span>
                  <IpfsLink uri={completionMeta.completionURI || completionMeta.metadataURI || completionMeta.uri} />
                </div>
              )}
              {completionMeta.properties?.validatorNote && (
                <div className="mt-2 text-slate-500 italic line-clamp-3">
                  {typeof completionMeta.properties.validatorNote === 'string'
                    ? completionMeta.properties.validatorNote
                    : JSON.stringify(completionMeta.properties.validatorNote).slice(0, 120)}
                </div>
              )}
              <button
                onClick={() => setShowCompletionBrief(true)}
                className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Open completion brief
              </button>
            </div>
          )}
        </div>
      )}

      {job.status === 'Assigned' && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 space-y-3">
          <div className="text-xs font-medium text-amber-400">Pipeline action available</div>
          <div className="text-xs text-amber-600">
            Job #{job.jobId} is active. Run the intake pipeline to analyze and process it.
          </div>
          <button
            onClick={() => handleRunIntake(job)}
            disabled={intakeRunning}
            className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            {intakeRunning ? 'Running pipeline…' : intakeDone ? 'Re-run intake pipeline' : 'Run intake pipeline'}
          </button>

          {(intakeLog.length > 0) && (
            <div className="rounded border border-slate-700 bg-slate-950 p-2 max-h-48 overflow-y-auto space-y-0.5 font-mono text-xs">
              {intakeLog.map((entry, i) => {
                if (entry.type === 'start') return (
                  <div key={i} className="text-slate-500">
                    &gt; start: {entry.pipeline?.split('/').pop() || 'pipeline'} · job #{entry.jobId}
                  </div>
                )
                if (entry.type === 'step') return (
                  <div key={i} className={`${entry.status === 'ok' ? 'text-green-400' : 'text-amber-400'}`}>
                    &gt; {entry.step} [{entry.tool}] — {entry.status}
                    {entry.result && <span className="text-slate-500 ml-1 truncate">{String(entry.result).slice(0, 80)}</span>}
                  </div>
                )
                if (entry.type === 'stream') return (
                  <div key={i} className={entry.level === 'stderr' ? 'text-amber-500' : 'text-slate-400'}>
                    {entry.text}
                  </div>
                )
                if (entry.type === 'error') return (
                  <div key={i} className="text-red-400">&gt; error: {entry.message}</div>
                )
                if (entry.type === 'done') return (
                  <div key={i} className={intakeExitCode === 0 ? 'text-green-400' : 'text-red-400'}>
                    &gt; done (exit {entry.code ?? '?'})
                  </div>
                )
                return null
              })}
              {intakeRunning && (
                <div className="text-blue-400 animate-pulse">&gt; running…</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}