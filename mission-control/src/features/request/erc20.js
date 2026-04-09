function strip0x(value) {
  return String(value || '').replace(/^0x/, '')
}

function padHex(value, bytes = 32) {
  return strip0x(value).padStart(bytes * 2, '0')
}

export function parseUnits(value, decimals = 18) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('Amount is required')
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('Invalid token amount')

  const [whole, frac = ''] = raw.split('.')
  const normalizedFrac = frac.slice(0, decimals).padEnd(decimals, '0')
  const combined = `${whole}${normalizedFrac}`.replace(/^0+/, '') || '0'
  return BigInt(combined)
}

export function formatUnits(value, decimals = 18, maxFrac = 6) {
  const amount = BigInt(value || 0n)
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  const frac = amount % base
  if (frac === 0n) return whole.toString()
  const trimmed = frac.toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole.toString()
}

async function rpc(method, params) {
  if (!window?.ethereum) throw new Error('MetaMask provider unavailable')
  return window.ethereum.request({ method, params })
}

export async function readTokenMeta(tokenAddress) {
  const target = String(tokenAddress || '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(target)) throw new Error('Invalid token address')

  const [decimalsHex, symbolHex] = await Promise.all([
    rpc('eth_call', [{ to: target, data: '0x313ce567' }, 'latest']),
    rpc('eth_call', [{ to: target, data: '0x95d89b41' }, 'latest']),
  ])

  const decimals = Number.parseInt(decimalsHex || '0x12', 16)
  let symbol = 'TOKEN'
  try {
    const data = strip0x(symbolHex)
    if (data.length >= 128) {
      const len = Number.parseInt(data.slice(64, 128), 16)
      const payload = data.slice(128, 128 + len * 2)
      symbol = (payload.match(/.{1,2}/g) || []).map(byte => String.fromCharCode(Number.parseInt(byte, 16))).join('') || 'TOKEN'
    }
  } catch {}

  return {
    tokenAddress: target,
    decimals: Number.isFinite(decimals) ? decimals : 18,
    symbol: symbol.trim() || 'TOKEN',
  }
}

export async function readAllowance({ tokenAddress, owner, spender }) {
  const data = `0xdd62ed3e${padHex(owner)}${padHex(spender)}`
  const hex = await rpc('eth_call', [{ to: tokenAddress, data }, 'latest'])
  return BigInt(hex || '0x0')
}

export async function approveToken({ tokenAddress, owner, spender, amountBaseUnits }) {
  const tx = {
    from: owner,
    to: tokenAddress,
    data: `0x095ea7b3${padHex(spender)}${padHex(amountBaseUnits.toString(16))}`,
  }
  return rpc('eth_sendTransaction', [tx])
}
