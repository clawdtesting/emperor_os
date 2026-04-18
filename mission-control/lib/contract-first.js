const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function formatAgialpha(raw) {
  try {
    const v = BigInt(String(raw || '0'))
    const whole = v / 10n ** 18n
    const frac = v % 10n ** 18n
    if (frac === 0n) return `${whole.toString()} AGIALPHA`
    const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '').slice(0, 4)
    return `${whole.toString()}.${fracStr} AGIALPHA`
  } catch {
    return '—'
  }
}

export function formatDurationDays(secondsRaw) {
  const n = Number(secondsRaw)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${Math.round((n / 86400) * 100) / 100} days`
}

export function deriveJobStatus(core = null, validation = null) {
  const assigned = String(core?.assignedAgent || ZERO_ADDRESS).toLowerCase() !== ZERO_ADDRESS
  if (core?.completed) return 'Completed'
  if (core?.disputed) return 'Disputed'
  if (core?.expired) return 'Expired'
  if (validation?.completionRequested) return 'CompletionRequested'
  if (assigned) return 'Assigned'
  return 'Open'
}

export function normalizeV1JobForList({ jobId, contract, core = null, validation = null, specURI = '' } = {}) {
  return {
    source: 'agijobmanager',
    jobId: String(jobId),
    sortId: Number(jobId),
    status: deriveJobStatus(core, validation),
    payout: formatAgialpha(core?.payoutRaw || '0'),
    payoutRaw: String(core?.payoutRaw || '0'),
    duration: formatDurationDays(core?.durationRaw || '0'),
    employer: String(core?.employer || ZERO_ADDRESS),
    assignedAgent: String(core?.assignedAgent || ZERO_ADDRESS),
    specURI: String(specURI || ''),
    approvals: Number(validation?.approvals || 0),
    disapprovals: Number(validation?.disapprovals || 0),
    links: {
      contract: /^0x[a-fA-F0-9]{40}$/.test(String(contract || ''))
        ? `https://etherscan.io/address/${String(contract).toLowerCase()}`
        : '',
    },
  }
}

export function resolveV1MetadataUri(context = {}, type = 'completion') {
  if (String(type || '').toLowerCase() === 'spec') return String(context?.specURI || '')
  return String(context?.completionURI || '')
}

export function buildUnsignedCreateJobTxPackage({
  contract,
  chainId,
  specURI,
  payoutRaw,
  durationSec,
  details,
  calldata = '',
} = {}) {
  const to = String(contract || '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(to)) throw new Error('contract must be a valid address')
  const uri = String(specURI || '').trim()
  if (!uri.startsWith('ipfs://')) throw new Error('specURI must be ipfs://')

  const payout = String(payoutRaw || '').trim()
  if (!/^\d+$/.test(payout)) throw new Error('payoutRaw must be uint string')

  const duration = Number(durationSec)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('durationSec must be > 0')

  const cleanDetails = String(details || '')
    .replace(/\s+/g, ' ')
    .slice(0, 200)

  if (cleanDetails.startsWith('{') || cleanDetails.includes('"schema"')) {
    throw new Error('details field must be human-readable, not JSON')
  }

  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  return {
    schema: 'op-control/unsigned-tx/v1',
    lane: 'v1',
    action: 'request',
    to,
    chainId: String(chainId || '0x1'),
    value: '0x0',
    method: 'createJob(string,uint256,uint256,string)',
    args: {
      jobSpecURI: uri,
      payout,
      duration: String(Math.round(duration)),
      details: cleanDetails,
    },
    data: String(calldata || ''),
    createdAt,
    expiresAt,
    preconditions: [
      'Confirm contract + chain guardrails before signing.',
      'Open review manifest and verify request payload and IPFS URI.',
      'Sign with operator wallet only.',
    ],
  }
}

export function buildUnsignedApplyJobTxPackage({
  contract,
  tokenAddress,
  chainId,
  jobId,
  bondAmountRaw,
  agentSubdomain,
  merkleProof = [],
  approveCalldata = '',
  applyCalldata = '',
} = {}) {
  const manager = String(contract || '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(manager)) throw new Error('contract must be a valid address')

  const token = String(tokenAddress || '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(token)) throw new Error('tokenAddress must be a valid address')

  const normalizedJobId = String(jobId || '').trim()
  if (!/^\d+$/.test(normalizedJobId)) throw new Error('jobId must be numeric')

  const bond = String(bondAmountRaw || '').trim()
  if (!/^\d+$/.test(bond)) throw new Error('bondAmountRaw must be uint string')

  const subdomain = String(agentSubdomain || '').trim()
  if (!subdomain) throw new Error('agentSubdomain is required')

  const proof = Array.isArray(merkleProof)
    ? merkleProof.map((item) => String(item || '').trim().toLowerCase())
    : []
  if (!proof.length) throw new Error('merkleProof is required')
  if (proof.some((item) => !/^0x[a-f0-9]{64}$/.test(item))) {
    throw new Error('merkleProof must be an array of bytes32 hex values')
  }

  const cleanDetails = String(details || '')
    .replace(/\s+/g, ' ')
    .slice(0, 200)

  if (cleanDetails.startsWith('{') || cleanDetails.includes('"schema"')) {
    throw new Error('details field must be human-readable, not JSON')
  }

  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  return {
    schema: 'op-control/unsigned-tx/v1',
    lane: 'v1',
    action: 'apply',
    kind: 'requestJobApplication',
    jobId: normalizedJobId,
    agentSubdomain: subdomain,
    bondAmountRaw: bond,
    tokenAddress: token,
    to: manager,
    chainId: String(chainId || '0x1'),
    value: '0x0',
    transactions: [
      {
        label: 'approve-bond',
        to: token,
        value: '0x0',
        method: 'approve(address,uint256)',
        args: {
          spender: manager,
          amount: bond,
        },
        data: String(approveCalldata || ''),
      },
      {
        label: 'apply-for-job',
        to: manager,
        value: '0x0',
        method: 'applyForJob(uint256,string,bytes32[])',
        args: {
          jobId: normalizedJobId,
          subdomain,
          proof,
        },
        data: String(applyCalldata || ''),
      },
    ],
    createdAt,
    expiresAt,
    preconditions: [
      'Confirm AGIALPHA approve amount covers the required agent bond.',
      'Confirm jobId, agent subdomain, and merkle proof match the intended applicant identity.',
      'Sign the approve transaction first, then the applyForJob transaction, with the applicant wallet only.',
    ],
  }
}

export function buildUnsignedCreateJobV2TxPackage({
  contract,
  chainId,
  specURI,
  payoutRaw,
  durationSec,
  details,
  calldata = '',
} = {}) {
  const to = String(contract || '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(to)) throw new Error('contract must be a valid address')
  const uri = String(specURI || '').trim()
  if (!uri.startsWith('ipfs://')) throw new Error('specURI must be ipfs://')

  const payout = String(payoutRaw || '').trim()
  if (!/^\d+$/.test(payout)) throw new Error('payoutRaw must be uint string')

  const duration = Number(durationSec)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('durationSec must be > 0')

  const cleanDetails = String(details || '')
    .replace(/\s+/g, ' ')
    .slice(0, 200)

  if (cleanDetails.startsWith('{') || cleanDetails.includes('"schema"')) {
    throw new Error('details field must be human-readable, not JSON')
  }

  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  return {
    schema: 'op-control/unsigned-tx/v2',
    lane: 'v2',
    action: 'request',
    to,
    chainId: String(chainId || '0x1'),
    value: '0x0',
    method: 'createJob(string,uint256,uint256,string)',
    args: {
      jobSpecURI: uri,
      payout,
      duration: String(Math.round(duration)),
      details: cleanDetails,
    },
    data: String(calldata || ''),
    createdAt,
    expiresAt,
    preconditions: [
      'Confirm contract + chain guardrails before signing (AGIJobManager v2).',
      'Open review manifest and verify request payload and IPFS URI.',
      'Sign with operator wallet only.',
    ],
  }
}

export function buildUnsignedApplyJobV2TxPackage({
  contract,
  tokenAddress,
  chainId,
  jobId,
  bondAmountRaw,
  agentSubdomain,
  merkleProof = [],
  approveCalldata = '',
  applyCalldata = '',
} = {}) {
  const manager = String(contract || '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(manager)) throw new Error('contract must be a valid address')

  const token = String(tokenAddress || '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(token)) throw new Error('tokenAddress must be a valid address')

  const normalizedJobId = String(jobId || '').trim()
  if (!/^\d+$/.test(normalizedJobId)) throw new Error('jobId must be numeric')

  const bond = String(bondAmountRaw || '').trim()
  if (!/^\d+$/.test(bond)) throw new Error('bondAmountRaw must be uint string')

  const subdomain = String(agentSubdomain || '').trim()
  if (!subdomain) throw new Error('agentSubdomain is required')

  const proof = Array.isArray(merkleProof)
    ? merkleProof.map((item) => String(item || '').trim().toLowerCase())
    : []
  if (!proof.length) throw new Error('merkleProof is required')
  if (proof.some((item) => !/^0x[a-f0-9]{64}$/.test(item))) {
    throw new Error('merkleProof must be an array of bytes32 hex values')
  }

  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  return {
    schema: 'op-control/unsigned-tx/v2',
    lane: 'v2',
    action: 'apply',
    kind: 'requestJobApplication',
    jobId: normalizedJobId,
    agentSubdomain: subdomain,
    bondAmountRaw: bond,
    tokenAddress: token,
    to: manager,
    chainId: String(chainId || '0x1'),
    value: '0x0',
    transactions: [
      {
        label: 'approve-bond',
        to: token,
        value: '0x0',
        method: 'approve(address,uint256)',
        args: {
          spender: manager,
          amount: bond,
        },
        data: String(approveCalldata || ''),
      },
      {
        label: 'apply-for-job',
        to: manager,
        value: '0x0',
        method: 'applyForJob(uint256,string,bytes32[])',
        args: {
          jobId: normalizedJobId,
          subdomain,
          proof,
        },
        data: String(applyCalldata || ''),
      },
    ],
    createdAt,
    expiresAt,
    preconditions: [
      'Confirm AGIALPHA approve amount covers the required agent bond on the v2 contract.',
      'Confirm jobId, agent subdomain, and merkle proof match the intended applicant identity.',
      'Sign the approve transaction first, then the applyForJob transaction, with the applicant wallet only.',
    ],
  }
}
