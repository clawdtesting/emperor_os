// Deterministic job scorer — zero LLM calls, zero tokens

const MIN_SCORE = 0.45
const MIN_PAYOUT = 500 // AGIALPHA

const WEIGHTS = { payout: 0.40, feasibility: 0.35, speed: 0.15, competition: 0.10 }

// Categories this agent can execute at quality level
const CAPABLE = {
  research:    0.95,
  analysis:    0.95,
  creative:    0.90,
  development: 0.85,
  other:       0.70
}

export function scoreJob(job, spec) {
  if (job.status !== 'Open') return fail('not open')

  const payout = parseFloat(String(job.payout).replace(/[^0-9.]/g, ''))
  if (isNaN(payout) || payout < MIN_PAYOUT) return fail(`payout ${payout} < min ${MIN_PAYOUT}`)

  const category = (spec?.properties?.category || spec?.attributes?.find(a => a.trait_type === 'Category')?.value || 'other').toLowerCase()
  const feasibility = CAPABLE[category] ?? 0.5

  // Payout score: log scale, normalized — 1k=0.3, 10k=0.6, 100k=0.9, 500k=1.0
  const payoutScore = Math.min(Math.log10(payout / 100) / Math.log10(5000), 1.0)

  // Speed score: more duration = more time to produce quality work
  const durationSec = spec?.properties?.durationSeconds || 259200
  const speedScore = Math.min(durationSec / (7 * 86400), 1.0)

  // Competition: assume low unless we can detect otherwise
  const competitionScore = 0.85

  const score = (
    WEIGHTS.payout      * payoutScore +
    WEIGHTS.feasibility * feasibility +
    WEIGHTS.speed       * speedScore +
    WEIGHTS.competition * competitionScore
  )

  const rounded = Math.round(score * 100) / 100
  return {
    score: rounded,
    payout,
    category,
    pass: rounded >= MIN_SCORE,
    reason: rounded >= MIN_SCORE ? 'pass' : `score ${rounded} below ${MIN_SCORE}`
  }
}

function fail(reason) {
  return { score: 0, pass: false, reason }
}

export function buildLaneScoringHints(lane) {
  return {
    lane,
    deterministicOnly: true,
    note: 'External agent output is candidate work only and must pass deterministic checks.'
  }
}
