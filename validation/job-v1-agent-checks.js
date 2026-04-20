export function buildRequiredArtifacts({ jobId }) {
  return [
    { path: `jobs/${jobId}/deliverables/deliverable.md`, kind: 'markdown', required: true, description: 'Primary deliverable' },
    { path: `jobs/${jobId}/candidate_result.json`, kind: 'json', required: true, description: 'Candidate result package copy' }
  ]
}

export function buildAcceptanceChecks() {
  return [
    { id: 'deliverable_exists', description: 'Primary deliverable is present and non-empty' },
    { id: 'completion_payload_present', description: 'Candidate completion payload fields are present' },
    { id: 'uri_fields_coherent', description: 'URI placeholders are not empty placeholder values' }
  ]
}

export function validateResult(result, { inventory = [] } = {}) {
  const errors = []
  const warnings = []
  if (!inventory.some(item => item.path.endsWith('/deliverable.md'))) {
    errors.push('missing required deliverable.md artifact')
  }
  const placeholders = ['TBD', 'TODO', 'placeholder']
  if (placeholders.some(token => (result.summary || '').toLowerCase().includes(token.toLowerCase()))) {
    warnings.push('summary contains placeholder-like content')
  }
  return { ok: errors.length === 0, errors, warnings }
}

export function buildPublicationHints() {
  return { preferredPrimaryArtifact: 'deliverable.md' }
}

export function buildCompletionHints() {
  return { compatibleUnsignedBuilder: 'agent/tx-builder.js:buildUnsignedTxPackage' }
}
