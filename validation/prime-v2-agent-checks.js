import * as primeV1 from './prime-v1-agent-checks.js'

export const PRIME_V2_ENABLED = false

export function buildRequiredArtifacts(ctx) {
  return primeV1.buildRequiredArtifacts(ctx)
}

export function buildAcceptanceChecks(ctx) {
  return primeV1.buildAcceptanceChecks(ctx)
}

export function validateResult(result, ctx) {
  return primeV1.validateResult(result, ctx)
}

export function buildPublicationHints(ctx) {
  return { ...primeV1.buildPublicationHints(ctx), primeLane: 'v2', gated: !PRIME_V2_ENABLED }
}

export function buildCompletionHints(ctx) {
  return { ...primeV1.buildCompletionHints(ctx), primeLane: 'v2', gated: !PRIME_V2_ENABLED }
}
