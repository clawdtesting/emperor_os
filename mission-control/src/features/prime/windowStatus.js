/** @typedef {import('./types').PrimeActionPhase} PrimeActionPhase */
/** @typedef {import('./types').PrimeProcurementTiming} PrimeProcurementTiming */
/** @typedef {import('./types').PrimeWindowStatus} PrimeWindowStatus */

function toValidNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Normalize timings from on-chain procurement struct (seconds unix timestamps).
 * @param {Partial<PrimeProcurementTiming> | null | undefined} raw
 * @returns {PrimeProcurementTiming | null}
 */
export function normalizeProcurementTiming(raw) {
  if (!raw) return null
  return {
    commitDeadline: toValidNumber(raw.commitDeadline) ?? undefined,
    revealDeadline: toValidNumber(raw.revealDeadline) ?? undefined,
    finalistAcceptDeadline: toValidNumber(raw.finalistAcceptDeadline) ?? undefined,
    trialDeadline: toValidNumber(raw.trialDeadline) ?? undefined,
    scoreCommitDeadline: toValidNumber(raw.scoreCommitDeadline) ?? undefined,
    scoreRevealDeadline: toValidNumber(raw.scoreRevealDeadline) ?? undefined,
  }
}

/**
 * @param {PrimeActionPhase} phase
 * @param {PrimeProcurementTiming | null | undefined} timing
 * @param {number} [nowSeconds]
 * @returns {PrimeWindowStatus}
 */
export function getPrimeWindowStatus(phase, timing, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!timing) return 'unknown'

  const c = toValidNumber(timing.commitDeadline)
  const r = toValidNumber(timing.revealDeadline)
  const fa = toValidNumber(timing.finalistAcceptDeadline)
  const t = toValidNumber(timing.trialDeadline)
  const sc = toValidNumber(timing.scoreCommitDeadline)
  const sr = toValidNumber(timing.scoreRevealDeadline)

  switch (phase) {
    case 'commit':
      if (!c) return 'unknown'
      return nowSeconds < c ? 'open' : 'closed'
    case 'reveal':
      if (!c || !r) return 'unknown'
      if (nowSeconds < c) return 'upcoming'
      return nowSeconds < r ? 'open' : 'closed'
    case 'finalist_accept':
      if (!r || !fa) return 'unknown'
      if (nowSeconds < r) return 'upcoming'
      return nowSeconds < fa ? 'open' : 'closed'
    case 'trial':
      if (!fa || !t) return 'unknown'
      if (nowSeconds < fa) return 'upcoming'
      return nowSeconds < t ? 'open' : 'closed'
    case 'validator_commit':
      if (!t || !sc) return 'unknown'
      if (nowSeconds < t) return 'upcoming'
      return nowSeconds < sc ? 'open' : 'closed'
    case 'validator_reveal':
      if (!sc || !sr) return 'unknown'
      if (nowSeconds < sc) return 'upcoming'
      return nowSeconds < sr ? 'open' : 'closed'
    case 'selection':
    case 'settlement':
      if (!sr) return 'unknown'
      return nowSeconds < sr ? 'upcoming' : 'open'
    case 'idle':
      return 'closed'
    case 'unknown':
    default:
      return 'unknown'
  }
}

export function formatWindowStatus(status) {
  return {
    open: 'Open',
    closed: 'Closed',
    upcoming: 'Upcoming',
    unknown: 'Unknown',
  }[status] || 'Unknown'
}
