function normalizedHex(value) {
  return String(value || '').trim().toLowerCase()
}

function readBigInt(value, fallback = 0n) {
  try {
    if (value == null || value === '') return fallback
    return BigInt(String(value))
  } catch {
    return fallback
  }
}

export function buildPrimeValidatorPrechecks({
  roleAssigned = false,
  windowStatus = 'unknown',
  bondRequiredRaw = '0',
  allowanceRaw = '0',
  commitPayload = null,
  revealPayload = null,
} = {}) {
  const checks = []
  const add = (name, passed, detail = '') => checks.push({ name, passed: Boolean(passed), detail })

  const bondRequired = readBigInt(bondRequiredRaw, 0n)
  const allowance = readBigInt(allowanceRaw, 0n)

  add('prime_role_assignment', roleAssigned, roleAssigned ? 'wallet assigned as validator' : 'wallet not assigned as validator')
  add('prime_window_open', windowStatus === 'open', `window=${windowStatus}`)
  add(
    'prime_bond_allowance_ready',
    bondRequired === 0n ? allowance > 0n : allowance >= bondRequired,
    `allowance=${allowance.toString()} requiredBond=${bondRequired.toString()}`,
  )

  const commitScore = commitPayload?.score
  const revealScore = revealPayload?.score ?? commitScore
  const commitSalt = commitPayload?.salt
  const revealSalt = revealPayload?.salt ?? commitSalt
  const commitExpected = normalizedHex(commitPayload?.scoreCommitment || commitPayload?.expectedCommitment)
  const revealExpected = normalizedHex(
    revealPayload?.expectedCommitment
    || revealPayload?.scoreCommitment
    || revealPayload?.recomputedCommitment,
  )

  const scoreMatches = commitScore == null || revealScore == null ? false : Number(commitScore) === Number(revealScore)
  const saltMatches = Boolean(commitSalt) && Boolean(revealSalt) && String(commitSalt) === String(revealSalt)
  const commitmentMatches = Boolean(commitExpected) && Boolean(revealExpected) && commitExpected === revealExpected

  add(
    'prime_salt_commit_consistency',
    scoreMatches && saltMatches && commitmentMatches,
    `scoreMatch=${scoreMatches} saltMatch=${saltMatches} commitmentMatch=${commitmentMatches}`,
  )

  const passed = checks.filter((c) => c.passed).length
  const failed = checks.length - passed

  return {
    checks,
    byName: Object.fromEntries(checks.map((c) => [c.name, c])),
    summary: {
      passed,
      failed,
      total: checks.length,
      verdict: failed === 0 ? 'READY' : 'BLOCKED',
    },
  }
}

export function verifyRevealSafety({ requestedWallet = '', commitPayload = null, revealPayload = null } = {}) {
  const reasons = []
  const reqWallet = normalizedHex(requestedWallet)
  const commitWallet = normalizedHex(commitPayload?.walletAddress)
  const revealWallet = normalizedHex(revealPayload?.walletAddress || requestedWallet)

  if (reqWallet && commitWallet && reqWallet !== commitWallet) reasons.push('wallet mismatch')
  if (commitWallet && revealWallet && commitWallet !== revealWallet) reasons.push('wallet mismatch')

  const commitScore = commitPayload?.score
  const revealScore = revealPayload?.score
  if (commitScore != null && revealScore != null && Number(commitScore) !== Number(revealScore)) reasons.push('score mismatch')

  const commitSalt = String(commitPayload?.salt || '')
  const revealSalt = String(revealPayload?.salt || '')
  if (commitSalt && revealSalt && commitSalt !== revealSalt) reasons.push('salt mismatch')

  const commitProc = String(commitPayload?.procurementId || '')
  const revealProc = String(revealPayload?.procurementId || '')
  if (commitProc && revealProc && commitProc !== revealProc) reasons.push('procurement mismatch')

  const commitCtx = String(commitPayload?.finalistContextHash || '')
  const revealCtx = String(revealPayload?.finalistContextHash || '')
  if (commitCtx && revealCtx && commitCtx !== revealCtx) reasons.push('finalist context mismatch')

  const expectedCommit = normalizedHex(commitPayload?.scoreCommitment || commitPayload?.expectedCommitment)
  const revealCommit = normalizedHex(
    revealPayload?.expectedCommitment
    || revealPayload?.scoreCommitment
    || revealPayload?.recomputedCommitment,
  )
  if (expectedCommit && revealCommit && expectedCommit !== revealCommit) reasons.push('commitment mismatch')

  return {
    allowed: reasons.length === 0,
    reasons,
    blockingReason: reasons.join('; '),
  }
}

function pickReceipt(receipts, actions) {
  const set = new Set(actions.map((a) => String(a).toLowerCase()))
  return (Array.isArray(receipts) ? receipts : []).find((r) => set.has(String(r?.action || '').toLowerCase())) || null
}

export function buildPrimeValidatorTimeline(state = {}) {
  const receipts = Array.isArray(state?.receipts) ? state.receipts : []

  const commitReceipt = pickReceipt(receipts, ['score_commit', 'validator_score_commit'])
  const revealReceipt = pickReceipt(receipts, ['score_reveal', 'validator_score_reveal'])
  const winnerReceipt = pickReceipt(receipts, ['winner', 'winner_designated', 'settlement'])

  const commitSubmitted = Boolean(commitReceipt?.txHash)
  const revealSubmitted = Boolean(revealReceipt?.txHash)
  const winnerResolved = Boolean(winnerReceipt?.txHash || state?.winner || state?.winnerAddress)

  return {
    commit: {
      submitted: commitSubmitted,
      txHash: commitReceipt?.txHash || '',
      status: commitReceipt?.status || (commitSubmitted ? 'submitted' : 'pending'),
      finalizedAt: commitReceipt?.finalizedAt || null,
    },
    reveal: {
      submitted: revealSubmitted,
      txHash: revealReceipt?.txHash || '',
      status: revealReceipt?.status || (revealSubmitted ? 'submitted' : 'pending'),
      finalizedAt: revealReceipt?.finalizedAt || null,
    },
    winner: {
      pending: revealSubmitted && !winnerResolved,
      submitted: winnerResolved,
      txHash: winnerReceipt?.txHash || '',
      status: winnerReceipt?.status || (winnerResolved ? 'submitted' : (revealSubmitted ? 'pending' : 'not_started')),
      finalizedAt: winnerReceipt?.finalizedAt || null,
    },
  }
}
