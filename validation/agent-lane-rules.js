import * as jobV1 from './job-v1-agent-checks.js'
import * as jobV2 from './job-v2-agent-checks.js'
import * as primeV1 from './prime-v1-agent-checks.js'
import * as primeV2 from './prime-v2-agent-checks.js'

const RULES = {
  'job-v1': jobV1,
  'job-v2': jobV2,
  'prime-v1': primeV1,
  'prime-v2': primeV2
}

export function getLaneRuleSet(lane) {
  const ruleSet = RULES[lane]
  if (!ruleSet) throw new Error(`Unsupported lane: ${lane}`)
  return ruleSet
}

export function buildLaneArtifactsAndChecks({ lane, jobId, phase }) {
  const ruleSet = getLaneRuleSet(lane)
  return {
    requiredArtifacts: ruleSet.buildRequiredArtifacts({ jobId, phase }),
    acceptanceChecks: ruleSet.buildAcceptanceChecks({ jobId, phase }),
    publicationHints: ruleSet.buildPublicationHints({ jobId, phase }),
    completionHints: ruleSet.buildCompletionHints({ jobId, phase })
  }
}
