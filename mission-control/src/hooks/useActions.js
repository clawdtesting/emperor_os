import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchActions, dismissAction } from '../api'

const POLL_INTERVAL = 15000

export function useActions() {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('pending')
  const [unreadCount, setUnreadCount] = useState(0)
  const dismissedIds = useRef(new Set())

  const poll = useCallback(async () => {
    try {
      const data = await fetchActions(filter)
      setActions(data.actions || [])
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

  useEffect(() => {
    poll()
    const timer = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [poll])

  useEffect(() => {
    const onSSE = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'actions' && Array.isArray(data.actions)) {
          setUnreadCount(prev => prev + data.actions.length)
          if (filter === 'pending' || filter === 'all') {
            setActions(prev => [...data.actions, ...prev])
          }
        }
      } catch {}
    }

    const evtSource = new EventSource('/api/live')
    evtSource.addEventListener('actions', onSSE)
    return () => evtSource.close()
  }, [filter])

  return { actions, loading, error, filter, setFilter, unreadCount, dismiss: handleDismiss, refetch: poll }
}
