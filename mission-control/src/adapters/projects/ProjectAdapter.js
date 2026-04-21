/**
 * @typedef {Object} ProjectAdapterMetadata
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {'active-legacy'|'planned'|'disabled'} status
 * @property {string} adapterKey
 * @property {string} description
 * @property {boolean} supportsDeterministic
 * @property {boolean} supportsAgentRuntime
 * @property {boolean} supportsHumanSigning
 * @property {string[]} requestTypes
 * @property {string|null=} legacyUrl
 * @property {{embeddedSectionKey?: string, externalUrl?: string}=} legacyEntry
 * @property {{deterministicCoreAuthoritative: boolean, externalOutputsUntrustedUntilIngested: boolean, signingAuthority: 'human-only', irreversibleActionsRequireHumanReview: boolean}} doctrine
 * @property {{supportsDeterministicExecutionPlanning: boolean, supportsDeterministicValidationHooks: boolean}} futureHooks
 * @property {string=} scaffoldNote
 * @property {number=} displayOrder
 */

function assertRequiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`ProjectAdapter metadata field ${fieldName} must be a non-empty string`)
  }
}

/**
 * Base class for project adapters.
 * Concrete adapters provide deterministic project metadata to the shell.
 */
export class ProjectAdapter {
  /**
   * @param {ProjectAdapterMetadata} metadata
   */
  constructor(metadata) {
    this.metadata = Object.freeze({
      ...metadata,
      requestTypes: Array.isArray(metadata.requestTypes) ? Object.freeze([...metadata.requestTypes]) : Object.freeze([]),
      legacyUrl: metadata.legacyUrl || null,
    })

    this.validateMetadata(this.metadata)
  }

  /**
   * @param {ProjectAdapterMetadata} metadata
   */
  validateMetadata(metadata) {
    assertRequiredString(metadata.id, 'id')
    assertRequiredString(metadata.slug, 'slug')
    assertRequiredString(metadata.name, 'name')
    assertRequiredString(metadata.adapterKey, 'adapterKey')
    assertRequiredString(metadata.description, 'description')

    if (!['active-legacy', 'planned', 'disabled'].includes(String(metadata.status || ''))) {
      throw new Error(`ProjectAdapter metadata field status must be active-legacy|planned|disabled for ${metadata.adapterKey}`)
    }

    if (!Array.isArray(metadata.requestTypes)) {
      throw new Error(`ProjectAdapter metadata field requestTypes must be an array for ${metadata.adapterKey}`)
    }

    if (typeof metadata.supportsDeterministic !== 'boolean') {
      throw new Error(`ProjectAdapter metadata field supportsDeterministic must be boolean for ${metadata.adapterKey}`)
    }
    if (typeof metadata.supportsAgentRuntime !== 'boolean') {
      throw new Error(`ProjectAdapter metadata field supportsAgentRuntime must be boolean for ${metadata.adapterKey}`)
    }
    if (typeof metadata.supportsHumanSigning !== 'boolean') {
      throw new Error(`ProjectAdapter metadata field supportsHumanSigning must be boolean for ${metadata.adapterKey}`)
    }
  }

  /**
   * Metadata consumed by shell views and typed platform data model.
   * @returns {ProjectAdapterMetadata}
   */
  getMetadata() {
    return this.metadata
  }

  /**
   * Placeholder: deterministic execution planning hook.
   * Implementations should return null until fully wired.
   * @returns {null}
   */
  planExecution() {
    return null
  }

  /**
   * Placeholder: deterministic validation hook.
   * Implementations should return null until fully wired.
   * @returns {null}
   */
  validateCandidate() {
    return null
  }
}
