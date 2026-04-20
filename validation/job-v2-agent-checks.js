import { buildRequiredArtifacts as v1Req, buildAcceptanceChecks as v1Checks, validateResult as v1Validate } from './job-v1-agent-checks.js'

export function buildRequiredArtifacts(ctx) {
  return [
    ...v1Req(ctx),
    { path: `jobs/${ctx.jobId}/deliverables/validation_notes.md`, kind: 'markdown', required: false, description: 'Optional v2 validation notes' }
  ]
}

export function buildAcceptanceChecks() {
  return [
    ...v1Checks(),
    { id: 'v2_compatibility', description: 'Result package is compatible with v2 completion path' }
  ]
}

export function validateResult(result, ctx = {}) {
  return v1Validate(result, ctx)
}

export function buildPublicationHints() {
  return { preferredPrimaryArtifact: 'deliverable.md', managerVersion: 'v2' }
}

export function buildCompletionHints() {
  return { managerVersion: 'v2' }
}
