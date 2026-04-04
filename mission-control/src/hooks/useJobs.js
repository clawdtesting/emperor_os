import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchJobs } from '../api'

const POLL_INTERVAL = 30000

export function useJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [countdown, setCountdown] = useState(30)
  const [events, setEvents] = useState([])
  const seenIds = useRef(new Set())
  const isFirstFetch = useRef(true)

  const addEvent = useCallback((type, msg) => {
    const d = new Date()
    const ts = `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    setEvents(prev => [{ ts, type, msg, id: Date.now() + Math.random() }, ...prev].slice(0, 100))
  }, [])

  const poll = useCallback(async () => {
    addEvent('fetch', 'Polling agialpha.com/api/mcp...')
    try {
      const data = await fetchJobs()
      const getJobKey = (job) => `${job?.source || 'agijobmanager'}:${job?.jobId ?? job?.procurementId ?? 'unknown'}`
      setJobs(prev => {
        if (isFirstFetch.current) {
          // Silently register all existing jobs on first load — don't spam "new"
          isFirstFetch.current = false
          data.forEach(j => seenIds.current.add(getJobKey(j)))
          addEvent('fetch', `Fetched ${data.length} job(s)`)
          return data
        }
        const newJobs = data.filter(j => !seenIds.current.has(getJobKey(j)))
        newJobs.forEach(j => {
          seenIds.current.add(getJobKey(j))
          addEvent('new', `[${j.source || 'agijobmanager'}] Job #${j.jobId} — ${j.payout} — ${j.status}`)
        })
        if (!newJobs.length && prev.length) {
          addEvent('fetch', `${data.length} jobs — no changes`)
        } else if (newJobs.length) {
          addEvent('fetch', `${newJobs.length} new job(s) detected`)
        } else {
          addEvent('fetch', `Fetched ${data.length} jobs`)
        }
        return data
      })
      setError(null)
      setCountdown(30)
    } catch (e) {
      setError(e.message)
      addEvent('error', e.message)
    } finally {
      setLoading(false)
    }
  }, [addEvent])

  useEffect(() => {
    poll()
    const pollTimer = setInterval(poll, POLL_INTERVAL)
    const cdTimer = setInterval(() => setCountdown(c => {
      if (c <= 1) return 30
      return c - 1
    }), 1000)
    return () => { clearInterval(pollTimer); clearInterval(cdTimer) }
  }, [poll])

  return { jobs, loading, error, countdown, events, refetch: poll }
}
