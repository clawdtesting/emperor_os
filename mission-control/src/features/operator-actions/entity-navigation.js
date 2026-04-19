function extractNumericTail(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const m = raw.match(/(\d+)$/)
  return m ? m[1] : null
}

export function operatorActionFocusHint(actionItem) {
  return String(actionItem?.action || '').toLowerCase() === 'apply' ? 'apply-status' : ''
}

export function resolveOperatorEntityCandidate(jobs, actionItem) {
  const jobsDesc = Array.isArray(jobs) ? jobs : []
  const lane = String(actionItem?.lane || '').toLowerCase()
  const entityId = String(actionItem?.entityId || '').trim()
  const entityTail = extractNumericTail(entityId)
  const focus = operatorActionFocusHint(actionItem)

  let candidate = null

  if (lane === 'prime' || lane === 'prime-v2') {
    const sourceAllow = lane === 'prime-v2'
      ? new Set(['agijobmanagerprime', 'agijobmanager-prime'])
      : new Set(['agiprimediscovery'])
    candidate = jobsDesc.find((j) => {
      if (!sourceAllow.has(String(j?.source || '').toLowerCase())) return false
      const pId = String(j?.procurementId || '').trim()
      const jId = String(j?.jobId || '').trim()
      return pId === entityId || jId === entityId || jId === `P-${entityId}`
    }) || null
    return {
      job: candidate ? { ...candidate, __operatorFocus: focus } : null,
      tab: candidate ? 'detail' : (lane === 'prime-v2' ? 'prime-v2' : 'prime'),
      focus,
    }
  }

  const wantV2 = lane === 'v2'
  candidate = jobsDesc.find((j) => {
    const source = String(j?.source || '').toLowerCase()
    if (wantV2 && source !== 'agijobmanager-v2') return false
    if (!wantV2 && source === 'agijobmanager-v2') return false

    const jId = String(j?.jobId || '').trim()
    if (jId === entityId) return true

    const jTail = extractNumericTail(jId)
    return entityTail && jTail && jTail === entityTail
  }) || null

  return {
    job: candidate ? { ...candidate, __operatorFocus: focus } : null,
    tab: candidate ? 'detail' : (wantV2 ? 'jobs-v2' : 'jobs-v1'),
    focus,
  }
}
