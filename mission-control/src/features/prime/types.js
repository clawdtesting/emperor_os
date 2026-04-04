/**
 * Prime action helpers are in JS (repo convention), but keep explicit type unions through JSDoc
 * so decoding logic remains deterministic and maintainable.
 */

/** @typedef {'applicant' | 'finalist' | 'validator' | 'employer' | 'system' | 'unknown'} PrimeActionActor */

/** @typedef {'commit' | 'reveal' | 'selection' | 'finalist_accept' | 'trial' | 'validator_commit' | 'validator_reveal' | 'settlement' | 'idle' | 'unknown'} PrimeActionPhase */

/** @typedef {'verified' | 'inferred' | 'unknown'} PrimeActionProvenance */

/** @typedef {'open' | 'closed' | 'upcoming' | 'unknown'} PrimeWindowStatus */

/**
 * @typedef {object} PrimeActionDescriptor
 * @property {string} code
 * @property {string} label
 * @property {string} description
 * @property {PrimeActionActor} actor
 * @property {PrimeActionPhase} phase
 * @property {boolean} requiresSignature
 * @property {PrimeActionProvenance} provenance
 * @property {string=} likelyContractFunction
 * @property {string=} likelyWorkflowRoute
 * @property {string} operatorGuidance
 */

/**
 * @typedef {object} PrimeProcurementTiming
 * @property {number=} commitDeadline
 * @property {number=} revealDeadline
 * @property {number=} finalistAcceptDeadline
 * @property {number=} trialDeadline
 * @property {number=} scoreCommitDeadline
 * @property {number=} scoreRevealDeadline
 */
