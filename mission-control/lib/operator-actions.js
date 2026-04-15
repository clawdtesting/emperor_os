import { isAbsolute, normalize, join } from 'path'

const ACTION_PRIORITIES = {
  score_reveal: 95,
  reveal: 90,
  dispute: 88,
  score_commit: 85,
  commit: 80,
  completion: 75,
  validate: 70,
  apply: 60,
}

export function inferJobLane(state = {}, jobId = '') {
  const source = String(state?.source || '').toLowerCase()
  const managerVersion = String(state?.managerVersion || '').toLowerCase()
  const id = String(jobId || state?.jobId || '')
  if (source === 'agijobmanager-v2' || managerVersion === 'v2' || /^v2[_-]/i.test(id)) return 'v2'
  return 'v1'
}

export function normalizeActionName({ action = '', status = '', file = '' } = {}) {
  const actionRaw = String(action || '').toLowerCase()
  const statusRaw = String(status || '').toLowerCase()
  const fileRaw = String(file || '').toLowerCase()
  const blob = [actionRaw, statusRaw, fileRaw].join(' ')

  if (blob.includes('score_reveal')) return 'score_reveal'
  if (blob.includes('score_commit')) return 'score_commit'
  if (blob.includes('disapprove') || blob.includes('dispute')) return 'dispute'
  if (blob.includes('completion') || blob.includes('complete')) return 'completion'
  if (blob.includes('validate') || blob.includes('validation')) return 'validate'
  if (blob.includes('reveal')) return 'reveal'
  if (blob.includes('commit')) return 'commit'
  if (blob.includes('apply')) return 'apply'
  return null
}

export function phaseWindowStatusFromPkg(pkg = {}) {
  if (pkg?.expired === true) return 'closed'
  if (pkg?.fresh === true) return 'open'
  if (pkg?.expiresAt) {
    const ts = Date.parse(String(pkg.expiresAt))
    if (Number.isFinite(ts) && ts <= Date.now()) return 'closed'
  }
  return 'open'
}

export function actionQueueStage(pkg = {}) {
  if (pkg?.finalizedAt) return 'broadcast_awaiting_finalization'
  if (pkg?.broadcastTxHash) return 'broadcast_awaiting_finalization'
  if (pkg?.signed) return 'signed_awaiting_broadcast'
  return 'needs_signature'
}

export function priorityForAction(action, phaseWindowStatus = 'open', queueStage = 'needs_signature') {
  const base = ACTION_PRIORITIES[action] ?? 50
  const stageBump = queueStage === 'needs_signature' ? 0 : queueStage === 'signed_awaiting_broadcast' ? -5 : -10
  const windowPenalty = phaseWindowStatus === 'closed' ? 40 : 0
  return Math.max(1, base + stageBump - windowPenalty)
}

export function resolvePathMaybe(baseDir, maybePath) {
  const raw = String(maybePath || '').trim()
  if (!raw) return null
  if (isAbsolute(raw)) return normalize(raw)
  return normalize(join(baseDir, raw))
}

function deriveUnsignedTxPath(baseDir, pkg) {
  const explicit = pkg?.unsignedTxPath || pkg?.unsignedTx || null
  if (explicit) return resolvePathMaybe(baseDir, explicit)
  if (pkg?.file && String(pkg.file).toLowerCase().includes('unsigned')) return resolvePathMaybe(baseDir, pkg.file)
  return null
}

function deriveReviewManifestPath(baseDir, pkg) {
  const explicit = pkg?.reviewManifestPath || pkg?.reviewManifest || null
  if (explicit) return resolvePathMaybe(baseDir, explicit)
  return null
}

export function deriveDeadlineAt(action, state = {}, pkg = {}) {
  if (pkg?.expiresAt) return String(pkg.expiresAt)
  const deadlines = state?.deadlines || {}
  const map = {
    commit: deadlines.commitDeadline,
    reveal: deadlines.revealDeadline,
    score_commit: deadlines.scoreCommitDeadline,
    score_reveal: deadlines.scoreRevealDeadline,
    completion: deadlines.completionDeadline || deadlines.trialDeadline,
    apply: deadlines.applyDeadline || deadlines.commitDeadline,
    validate: deadlines.validationDeadline || deadlines.revealDeadline,
    dispute: deadlines.disputeDeadline || deadlines.validationDeadline || deadlines.revealDeadline,
  }
  return map[action] ? String(map[action]) : null
}

export function buildOperatorAction({ lane, entityId, status, pkg, state = {}, baseDir, blockingReason = null } = {}) {
  const action = normalizeActionName({ action: pkg?.action, status, file: pkg?.file })
  if (!action) return null
  const phaseWindowStatus = phaseWindowStatusFromPkg(pkg)
  const queueStage = actionQueueStage(pkg)
  return {
    lane,
    entityId: String(entityId),
    action,
    queueStage,
    phaseWindowStatus,
    deadlineAt: deriveDeadlineAt(action, state, pkg),
    unsignedTxPath: deriveUnsignedTxPath(baseDir, pkg),
    reviewManifestPath: deriveReviewManifestPath(baseDir, pkg),
    priority: priorityForAction(action, phaseWindowStatus, queueStage),
    blockingReason: blockingReason || null,
  }
}
