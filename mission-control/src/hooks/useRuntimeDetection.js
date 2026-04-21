import { useEffect, useMemo, useState } from 'react'

import { fetchRuntimeDetection } from '../api'

const EMPTY_DETECTION = Object.freeze({
  hermes: Object.freeze({ available: false }),
  openclaw: Object.freeze({ available: false }),
})

export function useRuntimeDetection() {
  const [data, setData] = useState(EMPTY_DETECTION)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadDetection() {
      try {
        const result = await fetchRuntimeDetection()
        if (cancelled) return
        setData({
          hermes: result?.hermes || { available: false },
          openclaw: result?.openclaw || { available: false },
        })
        setError('')
      } catch (err) {
        if (cancelled) return
        setData(EMPTY_DETECTION)
        setError(err instanceof Error ? err.message : String(err || 'runtime detection failed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDetection()
    const timer = setInterval(loadDetection, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const availableCount = useMemo(() => (
    Number(Boolean(data.hermes?.available)) + Number(Boolean(data.openclaw?.available))
  ), [data])

  return { data, loading, error, availableCount }
}
