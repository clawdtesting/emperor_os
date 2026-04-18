import { useState, useEffect } from 'react'
import { StatusBadge } from './StatusBadge'
import { resolveEns, shortAddr } from '../utils/ens'

function shortCid(uri) {
  const cid = uri?.replace('ipfs://', '') || ''
  return cid.length > 20 ? cid.slice(0, 8) + '...' + cid.slice(-6) : cid
}

function getPathValue(obj, path) {
  return path.split('.').reduce((acc, part) => (acc === undefined || acc === null ? undefined : acc[part]), obj)
}

function getJobField(job, keys) {
  for (const key of keys) {
    const value = key.includes('.') ? getPathValue(job, key) : job?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}


function formatPercent(value) {
  if (value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n > 1 && n <= 100) return `${n}%`
  if (n > 100 && n <= 10000) return `${(n / 100).toFixed(2).replace(/\.0+$/, '').replace(/\.$/, '')}%`
  if (n >= 0 && n <= 1) return `${(n * 100).toFixed(2).replace(/\.0+$/, '').replace(/\.$/, '')}%`
  return `${n}%`
}

function derivePctFromAmounts(amount, payout) {
  const a = Number(amount)
  const p = Number(payout)
  if (!Number.isFinite(a) || !Number.isFinite(p) || p <= 0) return null
  return `${((a / p) * 100).toFixed(2).replace(/\.0+$/, '').replace(/\.$/, '')}%`
}

function AddrLabel({ address }) {
  const [ens, setEns] = useState(null)
  useEffect(() => { resolveEns(address).then(setEns) }, [address])
  return (
    <span className="text-slate-500 font-mono" title={address}>
      {ens ? <span className="text-slate-300">{ens}</span> : shortAddr(address)}
    </span>
  )
}

export function JobCard({ job, selected, onClick }) {
  const approvals = Number(job.approvals || 0)
  const disapprovals = Number(job.disapprovals || 0)
  const payout = getJobField(job, ['payoutAGIALPHA', 'payout', 'job.payout', 'proc.payout'])
  const payoutPerValidator = getJobField(job, ['validatorRewardPerReveal', 'payoutPerValidator', 'proc.validatorRewardPerReveal'])

  const agentBondPct = formatPercent(getJobField(job, ['agentBondPct', 'agentBondPercent', 'agentBondPercentage', 'agentBondBps', 'proc.applicationStakeBps']))
    || derivePctFromAmounts(getJobField(job, ['agentBond', 'applicationStake', 'finalistStakeTotal', 'proc.applicationStake', 'proc.finalistStakeTotal']), payout)
  const validatorBondPct = formatPercent(getJobField(job, ['validatorBondPct', 'validatorBondPercent', 'validatorBondPercentage', 'validatorBondBps', 'proc.validatorScoreBondBps']))
    || derivePctFromAmounts(getJobField(job, ['validatorBond', 'validatorScoreBond', 'proc.validatorScoreBond']), payout)

  const votes = approvals + disapprovals

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg border p-4 transition-all ${
        selected
          ? 'border-blue-500 bg-blue-950/30'
          : 'border-slate-800 bg-slate-900 hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs text-slate-500 font-mono">
          #{job.jobId}
          {job.source === 'agiprimediscovery' && <span className="ml-1 text-[10px] text-fuchsia-400">prime</span>}
        </span>
        <StatusBadge status={job.status} />
      </div>
      {job.specURI ? (
        <a
          href={`https://ipfs.io/ipfs/${job.specURI?.replace('ipfs://', '')}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="block text-xs font-mono text-blue-500 hover:text-blue-400 mb-2 break-all"
        >
          {shortCid(job.specURI)}
        </a>
      ) : (
        <div className="block text-xs font-mono text-slate-600 mb-2 break-all">no spec URI</div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mb-3">
        <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Payout</div>
          <div className="text-blue-400 font-medium">{payout ?? '—'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Duration</div>
          <div className="text-slate-300">{job.duration || '—'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Agent Bond</div>
          <div className="text-slate-300">{agentBondPct || '—'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Validator Bond</div>
          <div className="text-slate-300">{validatorBondPct || '—'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Payout / Validator</div>
          <div className="text-slate-300">{payoutPerValidator ?? '—'}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mb-2">
        <span>{approvals}✓ {disapprovals}✗ ({votes})</span>
        {job.createdAt && <span>created {job.createdAt}</span>}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-slate-600">employer</span>
        <AddrLabel address={job.employer} />
        {job.assignedAgent && job.assignedAgent !== '0x0000000000000000000000000000000000000000' && (
          <>
            <span className="text-slate-700">·</span>
            <span className="text-slate-600">agent</span>
            <AddrLabel address={job.assignedAgent} />
          </>
        )}
      </div>
    </div>
  )
}
