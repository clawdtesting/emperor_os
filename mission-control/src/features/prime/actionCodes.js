/** @typedef {import('./types').PrimeActionDescriptor} PrimeActionDescriptor */

function normalizeCode(code) {
  if (code === null || code === undefined) return ''
  if (typeof code !== 'string') return String(code).trim().toUpperCase()
  return code.trim().toUpperCase()
}

/**
 * Verified mappings come from existing Mission Control Prime tab labels.
 * Inferred mappings are explicitly marked, and should be replaced with canonical
 * contract-backed meaning as soon as a source enum/helper is available.
 *
 * @type {Record<string, PrimeActionDescriptor>}
 */
const PRIME_ACTIONS = {
  WC: {
    code: 'WC',
    label: 'Commit Window Active',
    description: 'Commit phase is active for applications into this procurement.',
    actor: 'applicant',
    phase: 'commit',
    requiresSignature: true,
    provenance: 'verified',
    likelyContractFunction: 'commitApplication(uint256,bytes32,string,bytes32[])',
    likelyWorkflowRoute: 'Prime procurement -> commitApplication unsigned tx handoff',
    operatorGuidance: 'If participating, prepare commitment material and submit commitApplication before commit deadline.',
  },
  WR: {
    code: 'WR',
    label: 'Reveal Window Active',
    description: 'Reveal phase is active for previously committed applications.',
    actor: 'applicant',
    phase: 'reveal',
    requiresSignature: true,
    provenance: 'verified',
    likelyContractFunction: 'revealApplication(uint256,string,bytes32[],bytes32,string)',
    likelyWorkflowRoute: 'Prime procurement -> revealApplication unsigned tx handoff',
    operatorGuidance: 'Confirm prior commit exists, verify payload/salt integrity, then submit revealApplication before reveal deadline.',
  },
  WS: {
    code: 'WS',
    label: 'Shortlist Evaluation',
    description: 'Procurement is in shortlist/selection progression.',
    actor: 'employer',
    phase: 'selection',
    requiresSignature: true,
    provenance: 'verified',
    likelyWorkflowRoute: 'Prime monitor -> shortlist/finalist observation',
    operatorGuidance: 'Monitor shortlist events and confirm whether the agent address is included in finalists.',
  },
  WA: {
    code: 'WA',
    label: 'Finalist Acceptance',
    description: 'Finalists are expected to accept their slot within the acceptance window.',
    actor: 'finalist',
    phase: 'finalist_accept',
    requiresSignature: true,
    provenance: 'verified',
    likelyContractFunction: 'acceptFinalist(uint256)',
    likelyWorkflowRoute: 'Prime procurement -> acceptFinalist unsigned tx handoff',
    operatorGuidance: 'If selected as finalist, sign and submit acceptFinalist before finalist acceptance deadline.',
  },
  WT: {
    code: 'WT',
    label: 'Trial Submission',
    description: 'Finalists are expected to submit trial deliverables in this phase.',
    actor: 'finalist',
    phase: 'trial',
    requiresSignature: true,
    provenance: 'verified',
    likelyContractFunction: 'submitTrial(uint256,string)',
    likelyWorkflowRoute: 'Prime procurement -> submitTrial unsigned tx handoff',
    operatorGuidance: 'Prepare trial artifact URI(s), verify integrity, and submit trial before trial deadline.',
  },
  WSC: {
    code: 'WSC',
    label: 'Validator Score Commit',
    description: 'Validators commit scores for submitted finalist trials.',
    actor: 'validator',
    phase: 'validator_commit',
    requiresSignature: true,
    provenance: 'verified',
    operatorGuidance: 'If acting as validator, commit score hash before score commit deadline.',
  },
  WSR: {
    code: 'WSR',
    label: 'Validator Score Reveal',
    description: 'Validators reveal scores for committed score hashes.',
    actor: 'validator',
    phase: 'validator_reveal',
    requiresSignature: true,
    provenance: 'verified',
    operatorGuidance: 'If acting as validator, reveal committed score values before score reveal deadline.',
  },
  WW: {
    code: 'WW',
    label: 'Winner Finalization',
    description: 'Selection/final settlement phase where winner outcome is finalized.',
    actor: 'system',
    phase: 'settlement',
    requiresSignature: false,
    provenance: 'verified',
    operatorGuidance: 'Monitor for winner designation and transition into linked job execution workflow if selected.',
  },
  DONE: {
    code: 'DONE',
    label: 'No Action Remaining',
    description: 'Contract reports no further action for this procurement path.',
    actor: 'system',
    phase: 'idle',
    requiresSignature: false,
    provenance: 'verified',
    operatorGuidance: 'No immediate protocol action required from this helper state.',
  },
  RA: {
    code: 'RA',
    label: 'Reveal Application',
    description: 'The procurement expects the applicant reveal step for a previously committed application payload.',
    actor: 'applicant',
    phase: 'reveal',
    requiresSignature: true,
    provenance: 'inferred',
    likelyContractFunction: 'revealApplication(uint256,string,bytes32[],bytes32,string) (inferred)',
    likelyWorkflowRoute: 'Prime procurement -> revealApplication unsigned tx handoff (inferred)',
    operatorGuidance: 'Use the applicant reveal flow: verify commit exists, verify reveal window status, then submit reveal transaction through the signed wallet path.',
  },
}

function unknownDescriptor(code) {
  return {
    code: code || '—',
    label: 'Unknown contract action',
    description: 'This code is not mapped in Mission Control Prime action decoder.',
    actor: 'unknown',
    phase: 'unknown',
    requiresSignature: false,
    provenance: 'unknown',
    likelyContractFunction: undefined,
    likelyWorkflowRoute: undefined,
    operatorGuidance: 'This code is not yet mapped in Mission Control. Check Prime contract bindings/ABI/contract source and extend the action-code decoder.',
  }
}

/**
 * @param {string | null | undefined} code
 * @returns {PrimeActionDescriptor}
 */
export function decodePrimeActionCode(code) {
  const normalized = normalizeCode(code)
  if (!normalized) return unknownDescriptor('—')
  return PRIME_ACTIONS[normalized] || unknownDescriptor(normalized)
}
