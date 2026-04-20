import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchActions,
  dismissAction,
  fetchOperatorActions,
} from '../api'

const POLL_INTERVAL = 30 * 1000

function normalizeOperatorAction(action) {
  const checklist = Array.isArray(action?.checklist) ? action.checklist : []
  const missing = Array.isArray(action?.missingRequiredArtifacts)
    ? action.missingRequiredArtifacts
    : []
  const queueStage = action?.queueStage || 'needs_signature'
  const summary = action?.nextActionSummary
    || action?.summary
    || action?.description
    || action?.action
    || 'Operator action pending'
  const sourceType = action?.entityType || (String(action?.lane || '').includes('prime') ? 'procurement' : 'job')
  const sourceId = action?.entityId || action?.jobId || action?.procurementId || action?.id
  const secsUntilDeadline = action?.deadlineAt
    ? Math.round((Date.parse(action.deadlineAt) - Date.now()) / 1000)
    : null

  return {
    ...action,
    id: action?.id || `${action?.lane || 'lane'}:${sourceId}:${action?.action || action?.nextAction || 'action'}`,
    sourceType,
    sourceId,
    queueStage,
    summary,
    checklist,
    missingRequiredArtifacts: missing,
    blockedReason: action?.blockedReason || '',
    nextAction: action?.nextAction || action?.action || '',
    nextActionSummary: action?.nextActionSummary || '',
    lifecycleStage: action?.lifecycleStage || action?.stateStatus || '',
    stateStatus: action?.stateStatus || action?.lifecycleStage || '',
    readyHandoffComplete: Boolean(action?.readyHandoffComplete),
    secsUntilDeadline,
    urgency: action?.urgency || (secsUntilDeadline != null && secsUntilDeadline < 0 ? 'urgent' : 'info'),
    createdAt: action?.createdAt || action?.updatedAt || new Date().toISOString(),
  }
}

function isTerminalAction(action) {
  const state = String(action?.stateStatus || action?.lifecycleStage || '').toLowerCase()
  const queueStage = String(action?.queueStage || '').toLowerCase()
  const doneTokens = ['done', 'closed', 'completed', 'finalized', 'rejected', 'cancelled', 'canceled']
  if (doneTokens.some((token) => state.includes(token))) return true
  if (doneTokens.some((token) => queueStage.includes(token))) return true
  return false
}

export function useActions() {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('pending')
  const [unreadCount, setUnreadCount] = useState(0)
  const dismissedIds = useRef(new Set())
  const knownIds = useRef(new Set())

  const poll = useCallback(async () => {
    try {
      const opData = await fetchOperatorActions().catch(() => null)
      if (Array.isArray(opData?.actions)) {
        const normalized = opData.actions
          .map(normalizeOperatorAction)
          .filter((item) => !isTerminalAction(item))
          .filter((item) => !dismissedIds.current.has(item.id))
        const filtered = normalized.filter((item) => {
          if (filter === 'urgent') return item.urgency === 'urgent' || (item.secsUntilDeadline != null && item.secsUntilDeadline < 0)
          if (filter === 'dismissed') return false
          return true
        })
        setActions(() => {
          const ids = new Set(normalized.map((a) => a.id))
          const fresh = normalized.filter((a) => !knownIds.current.has(a.id))
          knownIds.current = ids
          setUnreadCount((prev) => (filter === 'dismissed' ? prev : prev + fresh.length))
          return filtered
        })
      } else {
        const data = await fetchActions(filter)
        setActions((data.actions || []).filter((item) => !dismissedIds.current.has(item.id)))
      }
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  const handleDismiss = useCallback(async (id) => {
    try {
      await dismissAction(id)
      dismissedIds.current.add(id)
      setActions(prev => prev.filter(a => a.id !== id))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (e) {
      console.error('Failed to dismiss action:', e.message)
    }
  }, [])

  const dismissAll = useCallback(async () => {
    const ids = actions.map((a) => a.id)
    await Promise.all(ids.map(async (id) => {
      try { await dismissAction(id) } catch {}
      dismissedIds.current.add(id)
    }))
    setActions([])
    setUnreadCount(0)
  }, [actions])

  useEffect(() => {
    poll()
    const timer = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [poll])

  return { actions, loading, error, filter, setFilter, unreadCount, dismiss: handleDismiss, dismissAll, refetch: poll }
}
