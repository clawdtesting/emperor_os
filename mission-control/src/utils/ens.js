// ENS reverse lookup with in-memory cache and multiple provider fallbacks
const cache = new Map()

// ENS contracts on Ethereum mainnet
const ENS_REGISTRY   = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const REVERSE_SUFFIX = '.addr.reverse'

// Compute keccak256 of a UTF-8 string (using SubtleCrypto — no external deps)
async function keccak256(str) {
  // Use an inline implementation via the ENS namehash algorithm
  // We rely on SubtleCrypto for SHA-256 but ENS uses keccak256 which isn't natively available.
  // Skip direct on-chain approach; use API fallbacks instead.
  return null
}

// Fetch via ensideas.com
async function tryEnsIdeas(address) {
  const res = await fetch(`https://api.ensideas.com/ens/resolve/${address}`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data?.name || null
}

// Fetch via web3.bio (reliable fallback)
async function tryWeb3Bio(address) {
  const res = await fetch(`https://api.web3.bio/profile/${address}`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return null
  const data = await res.json()
  // web3.bio returns an array of identity objects
  if (Array.isArray(data)) {
    const ens = data.find(p => p.platform === 'ENS')
    return ens?.identity || null
  }
  return data?.ens || null
}

// Fetch via Cloudflare ENS worker (uses mainnet JSON-RPC under the hood)
async function tryEnsWorker(address) {
  const res = await fetch(`https://ens-worker.ens-ci.workers.dev/${address}`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return null
  const text = (await res.text()).trim()
  return text && text !== 'null' && text !== '' ? text : null
}

export async function resolveEns(address) {
  if (!address || address === 'unassigned') return null
  const key = address.toLowerCase()
  if (cache.has(key)) return cache.get(key)

  // Try each provider in order, stop on first success
  for (const fetcher of [tryEnsIdeas, tryWeb3Bio]) {
    try {
      const name = await fetcher(key)
      if (name) {
        cache.set(key, name)
        return name
      }
    } catch {
      // continue to next
    }
  }

  cache.set(key, null)
  return null
}

export function shortAddr(address) {
  if (!address) return '—'
  return address.slice(0, 6) + '...' + address.slice(-4)
}
