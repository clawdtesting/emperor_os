import { useEffect, useState } from 'react'
import { resolveEns } from '../utils/ens'

function short(addr) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function EnsAddress({ address, className = 'text-blue-400' }) {
  const [ensState, setEnsState] = useState({ address: null, name: null })

  useEffect(() => {
    let canceled = false
    if (!address) return () => {
      canceled = true
    }

    resolveEns(address).then(name => {
      if (!canceled) setEnsState({ address, name: name || null })
    })

    return () => {
      canceled = true
    }
  }, [address])

  if (!address) return <span className="text-slate-500 font-mono">—</span>
  const ens = ensState.address === address ? ensState.name : null

  return (
    <span className="font-mono" title={address}>
      {ens
        ? <><span className={className}>{ens}</span> <span className="text-slate-500 text-[11px]">{short(address)}</span></>
        : <span className={className}>{short(address)}</span>}
    </span>
  )
}

export function WalletPanel({ wallet }) {
  const {
    providerAvailable,
    isConnected,
    account,
    ensName,
    chainId,
    chainIdDecimal,
    chainLabel,
    status,
    error,
    connect,
    ethBalance,
    agiBalance,
    agiToken,
    agentReputation,
    reputationSource,
    reputationContract,
    ensHoldings,
  } = wallet

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Wallet access</div>
          <div className="text-sm text-slate-200 font-semibold">MetaMask · AGI Alpha operator</div>
        </div>
        <button
          onClick={connect}
          disabled={!providerAvailable || status === 'connecting'}
          className="text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {isConnected ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Connect Wallet'}
        </button>
      </div>

      {!providerAvailable && (
        <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900 rounded p-2">
          MetaMask extension was not detected in this browser.
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded border border-slate-800 bg-slate-950 p-2">
          <div className="text-slate-600 mb-1">Account</div>
          {isConnected ? (
            <div className="font-mono" title={account}>
              {ensName
                ? <><span className="text-blue-400">{ensName}</span> <span className="text-slate-500 text-[11px]">{short(account)}</span></>
                : <span className="text-blue-400">{short(account)}</span>}
            </div>
          ) : (
            <div className="text-slate-500 font-mono">not connected</div>
          )}
        </div>
        <div className="rounded border border-slate-800 bg-slate-950 p-2">
          <div className="text-slate-600 mb-1">Chain</div>
          <div className="text-slate-300 font-mono">{chainLabel}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950 p-2">
          <div className="text-slate-600 mb-1">Chain ID</div>
          <div className="text-slate-300 font-mono">{chainIdDecimal ?? '—'} {chainId && <span className="text-slate-500">({chainId})</span>}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-slate-800 bg-slate-950 p-2">
          <div className="text-slate-600 mb-1">$ETH balance</div>
          <div className="text-slate-200 font-mono">{isConnected ? (ethBalance ?? '—') : 'not connected'}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950 p-2">
          <div className="text-slate-600 mb-1">$AGIALPHA balance</div>
          <div className="text-slate-200 font-mono">{isConnected ? (agiBalance ?? '—') : 'not connected'}</div>
          {agiToken && (
            <div className="text-[10px] text-slate-500 mt-1 break-all">
              token <EnsAddress address={agiToken} className="text-slate-400" />
            </div>
          )}
        </div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-2 text-xs">
        <div className="text-slate-600 mb-1">Agent reputation (AgiJobManager)</div>
        <div className="text-slate-200 font-mono">{isConnected ? (agentReputation ?? '—') : 'not connected'}</div>
        {reputationSource && <div className="text-[10px] text-slate-500 mt-1">source: {reputationSource}</div>}
        {reputationContract && (
          <div className="text-[10px] text-slate-500 mt-1 break-all">
            contract <EnsAddress address={reputationContract} className="text-slate-400" />
          </div>
        )}
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-2 text-xs">
        <div className="text-slate-600 mb-1">ENS holdings (agent / clubagi / agi)</div>
        {!isConnected && <div className="text-slate-500 font-mono">not connected</div>}
        {isConnected && (!Array.isArray(ensHoldings) || ensHoldings.length === 0) && (
          <div className="text-slate-500 font-mono">no matching ENS names found</div>
        )}
        {isConnected && Array.isArray(ensHoldings) && ensHoldings.length > 0 && (
          <ul className="space-y-1">
            {ensHoldings.map((name) => (
              <li key={name} className="font-mono text-slate-200 break-all">{name}</li>
            ))}
          </ul>
        )}
        <div className="text-[10px] text-slate-500 mt-1">
          matching suffixes: <span className="font-mono">.agent.agi.eth</span>, <span className="font-mono">.clubagi.eth</span>, <span className="font-mono">.agi.eth</span>
        </div>
      </div>
    </div>
  )
}
