import { deriveJobStatus, formatAgialpha, formatDurationDays } from './contract-first.js'

export function buildV1OperatorViewModel({
  jobId,
  contract = '',
  rpc = '',
  context = {},
  createdEvent = null,
  specFetch = { ok: false, error: 'not attempted', source: null, data: null },
  applications = [],
  validations = [],
  completionRequests = [],
  completionEvents = [],
  disputeEvents = [],
  errors = [],
} = {}) {
  const detailsFromCreate = String(createdEvent?.args?.details || '').trim()
  const specURIFromCreate = String(createdEvent?.args?.jobSpecURI || '').trim()
  const specData = specFetch?.data && typeof specFetch.data === 'object' ? specFetch.data : null

  let memo = detailsFromCreate
  if (!memo && specData) {
    const p = specData?.properties && typeof specData.properties === 'object' ? specData.properties : {}
    memo = String(p.memo || p.details || p.description || specData.description || specData.summary || '').trim()
  }

  return {
    schema: 'mission-control/v1-operator-view/v1-onchain-only',
    manager: 'AGIJobManager-v1',
    jobId: String(jobId),
    rpc,
    generatedAt: new Date().toISOString(),
    contract: String(contract || '').toLowerCase(),
    jobRequest: {
      memo,
      specURI: String(context?.specURI || specURIFromCreate || ''),
      completionURI: String(context?.completionURI || ''),
      specFetch: {
        ok: Boolean(specFetch?.ok),
        error: specFetch?.error || '',
        source: specFetch?.source || null,
      },
      spec: specData,
    },
    applications,
    validations,
    completionRequests,
    completionEvents,
    disputeEvents,
    errors: Array.isArray(errors) ? errors : [],
    onchainSummary: {
      status: deriveJobStatus(context?.core, context?.validation),
      employer: String(context?.core?.employer || ''),
      assignedAgent: String(context?.core?.assignedAgent || ''),
      payoutRaw: String(context?.core?.payoutRaw || '0'),
      payout: formatAgialpha(context?.core?.payoutRaw || '0'),
      durationRaw: String(context?.core?.durationRaw || '0'),
      duration: formatDurationDays(context?.core?.durationRaw || '0'),
      approvals: Number(context?.validation?.approvals || 0),
      disapprovals: Number(context?.validation?.disapprovals || 0),
      completionRequested: Boolean(context?.validation?.completionRequested),
    },
  }
}
