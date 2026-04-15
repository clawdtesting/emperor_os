import { useState, useEffect, useCallback } from 'react'
import { fetchRunnerStatus, startRunner, stopRunner, fetchRunnerLogs } from '../api'

const POLL_INTERVAL = 60 * 60 * 1000

export function useRunner() {
  const [status, setStatus] = useState({ running: false, pid: null, startedAt: null, uptimeMs: null })
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toggling, setToggling] = useState(false)

  const poll = useCallback(async () => {
    try {
      const data = await fetchRunnerStatus()
      setStatus(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshLogs = useCallback(async () => {
    try {
      const data = await fetchRunnerLogs()
      setLogs(data.logs || [])
    } catch {}
  }, [])

  useEffect(() => {
    poll()
    const t = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(t)
  }, [poll])

  const start = useCallback(async () => {
    setToggling(true)
    setError(null)
    try {
      await startRunner()
      await poll()
    } catch (e) {
      setError(e.message)
    } finally {
      setToggling(false)
    }
  }, [poll])

  const stop = useCallback(async () => {
    setToggling(true)
    setError(null)
    try {
      await stopRunner()
      // Give process a moment to exit
      setTimeout(poll, 1000)
    } catch (e) {
      setError(e.message)
    } finally {
      setToggling(false)
    }
  }, [poll])

  return { status, logs, loading, error, toggling, start, stop, refreshLogs, refetch: poll }
}
