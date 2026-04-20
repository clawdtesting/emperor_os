const PHASE_REQUIRED = {
  commit: ['commit_bundle.json'],
  reveal: ['reveal_bundle.json'],
  shortlist: ['shortlist_notes.md'],
  finalist_accept: ['finalist_accept.json'],
  trial_submission: ['trial_submission.json'],
  validator_scoring: ['validator_scoring.json']
}

export function buildRequiredArtifacts({ jobId, phase = 'commit' }) {
  const names = PHASE_REQUIRED[phase] || PHASE_REQUIRED.commit
  return names.map(name => ({
    path: `jobs/${jobId}/deliverables/${name}`,
    kind: name.endsWith('.md') ? 'markdown' : 'json',
    required: true,
    description: `Prime v1 ${phase} artifact`
  }))
}

export function buildAcceptanceChecks({ phase = 'commit' } = {}) {
  return [
    { id: `prime_phase_${phase}_artifact_presence`, description: `Required ${phase} artifacts present` },
    { id: `prime_phase_${phase}_shape`, description: `Required ${phase} schema fields pass deterministic checks` }
  ]
}

export function validateResult(_result, { inventory = [], phase = 'commit' } = {}) {
  const required = PHASE_REQUIRED[phase] || PHASE_REQUIRED.commit
  const missing = required.filter(name => !inventory.some(item => item.path.endsWith(`/${name}`)))
  return { ok: missing.length === 0, errors: missing.map(name => `missing prime artifact ${name}`), warnings: [] }
}

export function buildPublicationHints({ phase = 'commit' } = {}) {
  return { phase, primeLane: 'v1' }
}

export function buildCompletionHints({ phase = 'commit' } = {}) {
  return { phase, unsignedBuilder: 'agent/prime-tx-builder.js' }
}
