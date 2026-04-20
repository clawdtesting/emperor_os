import { normalizeJob } from './job-normalize.js'
import { buildBrief } from './build-brief.js'
import { buildLaneArtifactsAndChecks } from '../validation/agent-lane-rules.js'

function defaultWorkspaceContract(jobId) {
  return {
    allowedOutputPrefixes: [
      `jobs/${jobId}/deliverables/`,
      `jobs/${jobId}/scratch/`,
      `jobs/${jobId}/candidate_result.json`
    ],
    prohibitedPrefixes: [
      'agent/state/',
      'mission-control/state/',
      'unsigned/',
      `jobs/${jobId}/final_manifest/`
    ],
    prohibitedPatterns: ['..', '/etc/', '/root/', '/home/']
  }
}

function buildConstraints({ lane }) {
  const common = [
    'candidate result is untrusted until deterministic checks pass',
    'no signing or broadcasting operations',
    'no mutation of canonical state files'
  ]
  return {
    rules: lane.startsWith('prime') ? [...common, 'respect phase-specific artifact rules'] : common,
    deadline: null
  }
}

export function buildAgentJobPacket({
  job,
  lane,
  workspaceRoot,
  retrievalPacket = null,
  requiredArtifacts,
  acceptanceChecks,
  connectionHints = {},
  phase
}) {
  const normalized = normalizeJob(job) || job
  if (!normalized?.jobId) throw new Error('buildAgentJobPacket requires job with jobId')
  const brief = buildBrief({ ...normalized, rawSpec: normalized.raw || normalized.rawSpec || {} })
  const laneDefaults = buildLaneArtifactsAndChecks({ lane, jobId: String(normalized.jobId), phase })
  const resolvedRequiredArtifacts = requiredArtifacts || laneDefaults.requiredArtifacts
  const resolvedAcceptanceChecks = acceptanceChecks || laneDefaults.acceptanceChecks

  return {
    schema: 'emperor-os/agent-job-packet/v1',
    jobId: String(normalized.jobId),
    lane,
    jobContext: normalized,
    brief,
    constraints: buildConstraints({ lane }),
    requiredArtifacts: resolvedRequiredArtifacts,
    acceptanceChecks: resolvedAcceptanceChecks,
    workspaceContract: defaultWorkspaceContract(String(normalized.jobId)),
    submissionContract: {
      authority: 'mission-control-deterministic-core',
      unsignedTxBuilder: 'agent/tx-builder.js',
      humanBoundary: 'metamask-ledger-signing-only'
    },
    retrievalPacket,
    capabilityHints: laneDefaults.publicationHints ? [JSON.stringify(laneDefaults.publicationHints)] : [],
    agentHints: connectionHints,
    attachments: [{ workspaceRoot }]
  }
}
