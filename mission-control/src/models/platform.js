/**
 * Platform domain model contracts for Op-control shell.
 * Plain JS + JSDoc to keep runtime lightweight while preserving type safety.
 */

/** @typedef {'active-legacy'|'planned'|'disabled'} ProjectStatus */
/** @typedef {'connected'|'degraded'|'planned'|'offline'} RuntimeStatus */
/** @typedef {'deterministic'|'llm-assisted'} SkillKind */
/** @typedef {'platform'|'emperor_os'|'polymarket'} SkillScope */
/** @typedef {'queued'|'running'|'succeeded'|'failed'|'awaiting_review'} ExecutionStatus */

/** @type {ReadonlyArray<ProjectStatus>} */
export const PROJECT_STATUS = Object.freeze(['active-legacy', 'planned', 'disabled'])
/** @type {ReadonlyArray<RuntimeStatus>} */
export const RUNTIME_STATUS = Object.freeze(['connected', 'degraded', 'planned', 'offline'])
/** @type {ReadonlyArray<SkillKind>} */
export const SKILL_KIND = Object.freeze(['deterministic', 'llm-assisted'])
/** @type {ReadonlyArray<SkillScope>} */
export const SKILL_SCOPE = Object.freeze(['platform', 'emperor_os', 'polymarket'])
/** @type {ReadonlyArray<ExecutionStatus>} */
export const EXECUTION_STATUS = Object.freeze(['queued', 'running', 'succeeded', 'failed', 'awaiting_review'])

export const PLATFORM_NAV_SECTIONS = Object.freeze([
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'projects', label: 'Projects' },
  { key: 'runtimes', label: 'Runtimes' },
  { key: 'skills', label: 'Skills' },
  { key: 'executions', label: 'Executions' },
  { key: 'settings', label: 'Settings' },
])

/**
 * @typedef {Object} PlatformProject
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {ProjectStatus} status
 * @property {string} adapterKey
 * @property {boolean} supportsDeterministic
 * @property {boolean} supportsAgentRuntime
 * @property {boolean} supportsHumanSigning
 * @property {string=} legacyUrl
 * @property {string=} description
 */

/**
 * @typedef {Object} PlatformRuntime
 * @property {string} id
 * @property {string} name
 * @property {string} provider
 * @property {'ssh'|'local'|'hosted'|'api'} endpointType
 * @property {RuntimeStatus} status
 * @property {string} workspaceRoot
 * @property {string[]} projectScopes
 * @property {boolean} supportsDeterministicOps
 * @property {boolean} supportsInteractiveAgentOps
 * @property {false} supportsSigning
 */

/**
 * @typedef {Object} PlatformSkill
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {SkillKind} kind
 * @property {SkillScope} scope
 * @property {string} version
 * @property {'active'|'planned'|'deprecated'} status
 */

/**
 * @typedef {Object} PlatformExecution
 * @property {string} id
 * @property {string} projectId
 * @property {string} runtimeId
 * @property {ExecutionStatus} status
 * @property {number} deterministicStepCount
 * @property {number} llmCallCount
 * @property {boolean} approvalRequired
 * @property {string} createdAt
 */

/**
 * @typedef {Object} PlatformDataset
 * @property {PlatformProject[]} projects
 * @property {PlatformRuntime[]} runtimes
 * @property {PlatformSkill[]} skills
 * @property {PlatformExecution[]} executions
 */

function isString(value) {
  return typeof value === 'string' && value.length > 0
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

/**
 * @param {unknown} value
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validatePlatformDataset(value) {
  /** @type {string[]} */
  const errors = []
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: ['dataset must be an object'] }
  }

  /** @type {Record<string, unknown>} */
  const dataset = /** @type {Record<string, unknown>} */ (value)
  const projects = Array.isArray(dataset.projects) ? dataset.projects : null
  const runtimes = Array.isArray(dataset.runtimes) ? dataset.runtimes : null
  const skills = Array.isArray(dataset.skills) ? dataset.skills : null
  const executions = Array.isArray(dataset.executions) ? dataset.executions : null

  if (!projects) errors.push('projects must be an array')
  if (!runtimes) errors.push('runtimes must be an array')
  if (!skills) errors.push('skills must be an array')
  if (!executions) errors.push('executions must be an array')

  ;(projects || []).forEach((project, index) => {
    const prefix = `projects[${index}]`
    if (!project || typeof project !== 'object') {
      errors.push(`${prefix} must be an object`)
      return
    }
    const record = /** @type {Record<string, unknown>} */ (project)
    if (!isString(record.id)) errors.push(`${prefix}.id must be non-empty string`)
    if (!isString(record.slug)) errors.push(`${prefix}.slug must be non-empty string`)
    if (!isString(record.name)) errors.push(`${prefix}.name must be non-empty string`)
    if (!PROJECT_STATUS.includes(/** @type {ProjectStatus} */ (record.status))) errors.push(`${prefix}.status must be valid ProjectStatus`)
    if (!isString(record.adapterKey)) errors.push(`${prefix}.adapterKey must be non-empty string`)
    if (typeof record.supportsDeterministic !== 'boolean') errors.push(`${prefix}.supportsDeterministic must be boolean`)
    if (typeof record.supportsAgentRuntime !== 'boolean') errors.push(`${prefix}.supportsAgentRuntime must be boolean`)
    if (typeof record.supportsHumanSigning !== 'boolean') errors.push(`${prefix}.supportsHumanSigning must be boolean`)
    if (hasOwn(record, 'legacyUrl') && record.legacyUrl != null && typeof record.legacyUrl !== 'string') errors.push(`${prefix}.legacyUrl must be string when set`)
  })

  ;(runtimes || []).forEach((runtime, index) => {
    const prefix = `runtimes[${index}]`
    if (!runtime || typeof runtime !== 'object') {
      errors.push(`${prefix} must be an object`)
      return
    }
    const record = /** @type {Record<string, unknown>} */ (runtime)
    if (!isString(record.id)) errors.push(`${prefix}.id must be non-empty string`)
    if (!isString(record.name)) errors.push(`${prefix}.name must be non-empty string`)
    if (!isString(record.provider)) errors.push(`${prefix}.provider must be non-empty string`)
    if (!['ssh', 'local', 'hosted', 'api'].includes(String(record.endpointType || ''))) errors.push(`${prefix}.endpointType must be ssh|local|hosted|api`)
    if (!RUNTIME_STATUS.includes(/** @type {RuntimeStatus} */ (record.status))) errors.push(`${prefix}.status must be valid RuntimeStatus`)
    if (!isString(record.workspaceRoot)) errors.push(`${prefix}.workspaceRoot must be non-empty string`)
    if (!Array.isArray(record.projectScopes)) errors.push(`${prefix}.projectScopes must be array`)
    if (typeof record.supportsDeterministicOps !== 'boolean') errors.push(`${prefix}.supportsDeterministicOps must be boolean`)
    if (typeof record.supportsInteractiveAgentOps !== 'boolean') errors.push(`${prefix}.supportsInteractiveAgentOps must be boolean`)
    if (record.supportsSigning !== false) errors.push(`${prefix}.supportsSigning must be false`)
  })

  ;(skills || []).forEach((skill, index) => {
    const prefix = `skills[${index}]`
    if (!skill || typeof skill !== 'object') {
      errors.push(`${prefix} must be an object`)
      return
    }
    const record = /** @type {Record<string, unknown>} */ (skill)
    if (!isString(record.id)) errors.push(`${prefix}.id must be non-empty string`)
    if (!isString(record.slug)) errors.push(`${prefix}.slug must be non-empty string`)
    if (!isString(record.name)) errors.push(`${prefix}.name must be non-empty string`)
    if (!SKILL_KIND.includes(/** @type {SkillKind} */ (record.kind))) errors.push(`${prefix}.kind must be deterministic|llm-assisted`)
    if (!SKILL_SCOPE.includes(/** @type {SkillScope} */ (record.scope))) errors.push(`${prefix}.scope must be platform|emperor_os|polymarket`)
    if (!isString(record.version)) errors.push(`${prefix}.version must be non-empty string`)
    if (!['active', 'planned', 'deprecated'].includes(String(record.status || ''))) errors.push(`${prefix}.status must be active|planned|deprecated`)
  })

  ;(executions || []).forEach((execution, index) => {
    const prefix = `executions[${index}]`
    if (!execution || typeof execution !== 'object') {
      errors.push(`${prefix} must be an object`)
      return
    }
    const record = /** @type {Record<string, unknown>} */ (execution)
    if (!isString(record.id)) errors.push(`${prefix}.id must be non-empty string`)
    if (!isString(record.projectId)) errors.push(`${prefix}.projectId must be non-empty string`)
    if (!isString(record.runtimeId)) errors.push(`${prefix}.runtimeId must be non-empty string`)
    if (!EXECUTION_STATUS.includes(/** @type {ExecutionStatus} */ (record.status))) errors.push(`${prefix}.status must be valid ExecutionStatus`)
    if (!Number.isFinite(record.deterministicStepCount)) errors.push(`${prefix}.deterministicStepCount must be number`)
    if (!Number.isFinite(record.llmCallCount)) errors.push(`${prefix}.llmCallCount must be number`)
    if (typeof record.approvalRequired !== 'boolean') errors.push(`${prefix}.approvalRequired must be boolean`)
    if (!isString(record.createdAt)) errors.push(`${prefix}.createdAt must be non-empty string`)
  })

  return { ok: errors.length === 0, errors }
}

/**
 * @param {PlatformDataset} dataset
 */
export function buildPlatformSummary(dataset) {
  const projects = Array.isArray(dataset?.projects) ? dataset.projects : []
  const runtimes = Array.isArray(dataset?.runtimes) ? dataset.runtimes : []
  const skills = Array.isArray(dataset?.skills) ? dataset.skills : []
  const executions = Array.isArray(dataset?.executions) ? dataset.executions : []

  return {
    projectsTotal: projects.length,
    activeProjects: projects.filter((item) => item.status === 'active-legacy').length,
    plannedProjects: projects.filter((item) => item.status === 'planned').length,
    connectedRuntimes: runtimes.filter((item) => item.status === 'connected').length,
    plannedRuntimes: runtimes.filter((item) => item.status === 'planned').length,
    skillsTotal: skills.length,
    deterministicSkills: skills.filter((item) => item.kind === 'deterministic').length,
    llmAssistedSkills: skills.filter((item) => item.kind === 'llm-assisted').length,
    executionsTotal: executions.length,
    awaitingReviewExecutions: executions.filter((item) => item.status === 'awaiting_review').length,
    runningExecutions: executions.filter((item) => item.status === 'running').length,
  }
}

/**
 * @param {PlatformProject[]} projects
 * @param {string} slug
 */
export function findProjectBySlug(projects, slug) {
  return (Array.isArray(projects) ? projects : []).find((entry) => entry.slug === slug) || null
}
