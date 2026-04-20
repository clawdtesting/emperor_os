import { useCallback, useEffect, useMemo, useState } from 'react'
import { resolveEns } from '../utils/ens'

const CHAIN_LABELS = {
  '0x1': 'Ethereum Mainnet',
  '0xaa36a7': 'Sepolia',
  '0x2105': 'Base Mainnet',
  '0x14a34': 'Base Sepolia',
}

const PRIME_CONTRACT = '0xd5ef1dde7ac60488f697ff2a7967a52172a78f29'

function getProvider() {
  if (typeof window === 'undefined') return null
  return window.ethereum || null
}

function formatUnits(raw, decimals = 18, maxFrac = 4) {
  if (!raw) return '0'
  const value = BigInt(raw)
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const frac = value % base
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '')
  return fracStr ? `${whole}.${fracStr}` : whole.toString()
}

function hexToAddress(hex) {
  if (!hex || hex === '0x') return null
  return `0x${hex.slice(-40)}`
}

export function useWallet() {
  const [account, setAccount] = useState(null)
  const [ensName, setEnsName] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [ethBalance, setEthBalance] = useState(null)
  const [agiBalance, setAgiBalance] = useState(null)
  const [agiToken, setAgiToken] = useState(null)
  const [agentReputation, setAgentReputation] = useState(null)
  const [reputationSource, setReputationSource] = useState(null)
  const [reputationContract, setReputationContract] = useState(null)
  const [ensHoldings, setEnsHoldings] = useState([])

  const providerAvailable = useMemo(() => Boolean(getProvider()), [])

  const refreshBalances = useCallback(async activeAccount => {
    const provider = getProvider()
    if (!provider || !activeAccount) {
      setEthBalance(null)
      setAgiBalance(null)
      return
    }

    try {
      const ethRaw = await provider.request({ method: 'eth_getBalance', params: [activeAccount, 'latest'] })
      setEthBalance(formatUnits(ethRaw, 18, 6))

      let tokenAddress = agiToken
      if (!tokenAddress) {
        const tokenRaw = await provider.request({
          method: 'eth_call',
          params: [{ to: PRIME_CONTRACT, data: '0x658bb543' }, 'latest'],
        })
        tokenAddress = hexToAddress(tokenRaw)
        setAgiToken(tokenAddress)
      }

      if (tokenAddress) {
        const padded = activeAccount.toLowerCase().replace('0x', '').padStart(64, '0')
        const [balRaw, decimalsRaw] = await Promise.all([
          provider.request({ method: 'eth_call', params: [{ to: tokenAddress, data: `0x70a08231${padded}` }, 'latest'] }),
          provider.request({ method: 'eth_call', params: [{ to: tokenAddress, data: '0x313ce567' }, 'latest'] }),
        ])
        const decimals = Number.parseInt(decimalsRaw, 16)
        setAgiBalance(formatUnits(balRaw, Number.isFinite(decimals) ? decimals : 18, 4))
      } else {
        setAgiBalance(null)
      }
    } catch (e) {
      setError(e.message || 'Unable to read wallet balances')
    }
  }, [agiToken])

  const refreshReputation = useCallback(async activeAccount => {
    if (!activeAccount) {
      setAgentReputation(null)
      setReputationSource(null)
      setReputationContract(null)
      return
    }

    try {
      const res = await fetch(`/api/agent-reputation/${activeAccount}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAgentReputation(data?.reputation ?? null)
      setReputationSource(data?.source || null)
      setReputationContract(data?.contract || null)
    } catch (e) {
      setAgentReputation(null)
      setReputationSource(null)
      setReputationContract(null)
      setError(e.message || 'Unable to read agent reputation')
    }
  }, [])

  const refreshEnsHoldings = useCallback(async activeAccount => {
    if (!activeAccount) {
      setEnsHoldings([])
      return
    }
    try {
      const res = await fetch(`/api/ens/${activeAccount}/holdings`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setEnsHoldings(Array.isArray(data?.holdings) ? data.holdings : [])
    } catch {
      setEnsHoldings([])
    }
  }, [])

  const refresh = useCallback(async () => {
    const provider = getProvider()
    if (!provider) return

    try {
      const [accounts, chain] = await Promise.all([
        provider.request({ method: 'eth_accounts' }),
        provider.request({ method: 'eth_chainId' }),
      ])
      const active = accounts?.[0] || null
      setAccount(active)
      setChainId(chain || null)
      setEnsName(null)
      resolveEns(active).then(setEnsName)
      await Promise.all([refreshBalances(active), refreshReputation(active), refreshEnsHoldings(active)])
    } catch (e) {
      setError(e.message || 'Unable to read wallet state')
    }
  }, [refreshBalances, refreshReputation, refreshEnsHoldings])

  const connect = useCallback(async () => {
    const provider = getProvider()
    if (!provider) {
      setError('MetaMask not detected')
      return
    }

    setStatus('connecting')
    setError(null)

    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      const chain = await provider.request({ method: 'eth_chainId' })
      const active = accounts?.[0] || null
      setAccount(active)
      setChainId(chain || null)
      setEnsName(null)
      resolveEns(active).then(setEnsName)
      await Promise.all([refreshBalances(active), refreshReputation(active), refreshEnsHoldings(active)])
      setStatus('connected')
    } catch (e) {
      setStatus('idle')
      setError(e.message || 'Wallet connection rejected')
    }
  }, [refreshBalances, refreshReputation, refreshEnsHoldings])

  useEffect(() => {
    const provider = getProvider()
    if (!provider) return

    const onAccounts = () => { refresh() }
    const onChain = () => { refresh() }

    provider.on?.('accountsChanged', onAccounts)
    provider.on?.('chainChanged', onChain)

    refresh()

    return () => {
      provider.removeListener?.('accountsChanged', onAccounts)
      provider.removeListener?.('chainChanged', onChain)
    }
  }, [refresh])

  return {
    providerAvailable,
    account,
    ensName,
    chainId,
    chainIdDecimal: chainId ? Number.parseInt(chainId, 16) : null,
    chainLabel: CHAIN_LABELS[chainId] || 'Unknown chain',
    status,
    error,
    isConnected: Boolean(account),
    ethBalance,
    agiBalance,
    agiToken,
    agentReputation,
    reputationSource,
    reputationContract,
    ensHoldings,
    connect,
    refresh,
  }
}
