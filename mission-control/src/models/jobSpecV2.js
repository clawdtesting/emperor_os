/**
 * AGI Job Spec v2 model helpers for Mission Control.
 *
 * This file is intentionally plain JS + JSDoc so it can be used today,
 * while remaining TS-friendly via IDE type inference.
 */

/** @typedef {'creative'|'development'|'research'|'analysis'|'operations'|'other'} JobCategory */

/**
 * @typedef {Object} JobSpecV2Properties
 * @property {'agijobmanager/job-spec/v2'} schema
 * @property {'job-spec'} kind
 * @property {'1.0.0'} version
 * @property {string} locale
 * @property {string} title
 * @property {JobCategory} category
 * @property {string} summary
 * @property {string} details
 * @property {string[]} tags
 * @property {string[]} deliverables
 * @property {string[]} acceptanceCriteria
 * @property {string[]} requirements
 * @property {number} payoutAGIALPHA
 * @property {number} durationSeconds
 * @property {number} chainId
 * @property {string} contract
 * @property {string} generatedAt
 * @property {string} createdVia
 * @property {string=} createdBy
 */

/**
 * @typedef {Object} JobSpecV2Attribute
 * @property {string} trait_type
 * @property {string|number} value
 * @property {'number'=} display_type
 */

/**
 * @typedef {Object} JobSpecV2
 * @property {string} name
 * @property {string} description
 * @property {string} image
 * @property {JobSpecV2Attribute[]} attributes
 * @property {JobSpecV2Properties} properties
 */

/**
 * Frontend request model for Mission Control's Job Request form.
 *
 * @typedef {Object} JobRequestDraft
 * @property {string} title
 * @property {string} summary
 * @property {string} details
 * @property {JobCategory} category
 * @property {string} locale
 * @property {string[]} tags
 * @property {string[]} deliverables
 * @property {string[]} acceptanceCriteria
 * @property {string[]} requirements
 * @property {number} payoutAGIALPHA
 * @property {number} durationSeconds
 * @property {number} chainId
 * @property {string} contract
 * @property {string} image
 * @property {string=} createdBy
 */

export const DURATION_SECONDS_BY_UI_VALUE = {
  '4h': 4 * 60 * 60,
  '8h': 8 * 60 * 60,
  '1d': 24 * 60 * 60,
  '3d': 3 * 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
}

export const DEFAULT_REQUEST_IMAGE = 'https://ipfs.io/ipfs/Qmc13BByj8xKnpgQtwBereGJpEXtosLMLq6BCUjK3TtAd1'

/**
 * @returns {JobRequestDraft}
 */
export function createDefaultJobRequestDraft() {
  return {
    title: '',
    summary: '',
    details: '',
    category: 'other',
    locale: 'en-US',
    tags: [],
    deliverables: [],
    acceptanceCriteria: [],
    requirements: [],
    payoutAGIALPHA: 100,
    durationSeconds: DURATION_SECONDS_BY_UI_VALUE['1d'],
    chainId: 1,
    contract: '',
    image: DEFAULT_REQUEST_IMAGE,
  }
}

/**
 * @param {JobRequestDraft} draft
 * @param {{ imageUri?: string, generatedAt?: string }} [opts]
 * @returns {JobSpecV2}
 */
export function toJobSpecV2(draft, opts = {}) {
  const generatedAt = opts.generatedAt || new Date().toISOString()
  const title = (draft.title || '').trim()
  const summary = (draft.summary || '').trim()
  const details = (draft.details || '').trim()

  const properties = {
    schema: 'agijobmanager/job-spec/v2',
    kind: 'job-spec',
    version: '1.0.0',
    locale: draft.locale || 'en-US',
    title: title || 'Untitled job request',
    category: draft.category || 'other',
    summary: summary || title || 'Job request generated from Mission Control',
    details: details || summary || title,
    tags: Array.isArray(draft.tags) ? draft.tags : [],
    deliverables: Array.isArray(draft.deliverables) ? draft.deliverables : [],
    acceptanceCriteria: Array.isArray(draft.acceptanceCriteria) ? draft.acceptanceCriteria : [],
    requirements: Array.isArray(draft.requirements) ? draft.requirements : [],
    payoutAGIALPHA: Number(draft.payoutAGIALPHA || 0),
    durationSeconds: Number(draft.durationSeconds || DURATION_SECONDS_BY_UI_VALUE['1d']),
    chainId: Number(draft.chainId || 1),
    contract: (draft.contract || '').trim(),
    generatedAt,
    createdVia: 'mission-control',
    ...(draft.createdBy ? { createdBy: draft.createdBy } : {}),
  }

  return {
    name: `AGI Job · ${properties.title}`,
    description: properties.details,
    image: opts.imageUri || draft.image || DEFAULT_REQUEST_IMAGE,
    attributes: [
      { trait_type: 'Kind', value: 'job-listing' },
      { trait_type: 'Category', value: properties.category },
      { trait_type: 'Locale', value: properties.locale },
      { display_type: 'number', trait_type: 'Payout ($AGIALPHA)', value: properties.payoutAGIALPHA },
      { display_type: 'number', trait_type: 'Duration (seconds)', value: properties.durationSeconds },
    ],
    properties,
  }
}

/**
 * Legacy MCP payload kept for backward compatibility with existing tools.
 *
 * @param {JobRequestDraft} draft
 * @param {{ durationUiValue: string, ipfsUri: string, imageUri: string, spec?: JobSpecV2 }} input
 */
export function toLegacyJobRequestPayload(draft, input) {
  const generatedAt = new Date().toISOString()
  const spec = input.spec || toJobSpecV2(draft, { imageUri: input.imageUri, generatedAt })

  return {
    title: spec.properties.title,
    summary: spec.properties.summary,
    category: spec.properties.category,
    locale: spec.properties.locale,
    tags: spec.properties.tags,
    deliverables: spec.properties.deliverables,
    acceptanceCriteria: spec.properties.acceptanceCriteria,
    requirements: spec.properties.requirements,
    duration: input.durationUiValue,
    payoutAGIALPHA: spec.properties.payoutAGIALPHA,
    chainId: spec.properties.chainId,
    contract: spec.properties.contract,
    ...(spec.properties.createdBy ? { createdBy: spec.properties.createdBy } : {}),
    brief: (spec.properties.summary || spec.properties.title || '').slice(0, 200),
    generatedAt,
    ipfsUri: input.ipfsUri,
    image: input.imageUri,
    spec,
  }
}
