// ENS reverse lookup — proxied through server to avoid browser CORS/rate-limits
const cache = new Map()

export async function resolveEns(address) {
  if (!address || address === 'unassigned') return null
  const key = address.toLowerCase()
  if (cache.has(key)) return cache.get(key)

  try {
    const res = await fetch(`/api/ens/${key}`, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const { name } = await res.json()
      cache.set(key, name || null)
      return name || null
    }
  } catch {}

  cache.set(key, null)
  return null
}

export function shortAddr(address) {
  if (!address) return '—'
  return address.slice(0, 6) + '...' + address.slice(-4)
}
