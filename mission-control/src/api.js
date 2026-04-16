const BASE = ''

export async function fetchJobs() {
  const res = await fetch(BASE + '/api/jobs')
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const data = await res.json()
  if (Array.isArray(data)) return data
  throw new Error('unexpected: ' + JSON.stringify(data).slice(0, 80))
}

export async function fetchPipelines() {
  const res = await fetch(BASE + '/api/pipelines')
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

export async function fetchJobSpec(jobId) {
  const res = await fetch(BASE + '/api/job-spec/' + jobId)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

export async function createJobRequest(payload) {
  const res = await fetch(BASE + '/api/job-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Failed to create job request')
  return data
}


export async function pinJsonToIpfs(payload, name = 'mission-control-job-request.json') {
  const res = await fetch(BASE + '/api/ipfs/pin-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, name }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Failed to upload JSON to IPFS')
  return data
}

export async function fetchHealthStatus() {
  const res = await fetch(BASE + '/health')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch health status')
  return data
}

export async function fetchActions(filter = 'pending') {
  const res = await fetch(BASE + '/api/actions?filter=' + filter)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

export async function dismissAction(id) {
  const res = await fetch(BASE + '/api/actions/' + id + '/dismiss', {
    method: 'POST',
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

export async function fetchOperatorActions() {
  const res = await fetch(BASE + '/api/operator-actions')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch operator actions')
  return data
}

export async function fetchLlmProviders() {
  const res = await fetch(BASE + '/api/llm/providers')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch LLM providers')
  return data
}

export async function selectLlmProvider(provider) {
  const res = await fetch(BASE + '/api/llm/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: provider || '' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to select LLM provider')
  return data
}

export async function fetchOperatorActionFile(path) {
  const res = await fetch(BASE + '/api/operator-actions/file?path=' + encodeURIComponent(path || ''))
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to open operator action file')
  return data
}

export async function markOperatorActionSigned(id) {
  const res = await fetch(BASE + '/api/operator-actions/' + encodeURIComponent(id) + '/mark-signed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to mark operator action signed')
  return data
}

export async function markOperatorActionBroadcast(id, txHash) {
  const res = await fetch(BASE + '/api/operator-actions/' + encodeURIComponent(id) + '/mark-broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to mark operator action broadcast')
  return data
}

export async function markOperatorActionFinalized(id, txHash = '') {
  const res = await fetch(BASE + '/api/operator-actions/' + encodeURIComponent(id) + '/mark-finalized', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to mark operator action finalized')
  return data
}

export async function fetchRunnerStatus() {
  const res = await fetch(BASE + '/api/runner/status')
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

export async function startRunner() {
  const res = await fetch(BASE + '/api/runner/start', { method: 'POST' })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Failed to start runner')
  return data
}

export async function stopRunner() {
  const res = await fetch(BASE + '/api/runner/stop', { method: 'POST' })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Failed to stop runner')
  return data
}

export async function fetchRunnerLogs(since) {
  const qs = since ? '?since=' + encodeURIComponent(since) : ''
  const res = await fetch(BASE + '/api/runner/logs' + qs)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

export async function fetchV2OperatorView(jobId, options = {}) {
  const params = new URLSearchParams()
  if (options?.source) params.set('source', options.source)
  if (options?.managerVersion) params.set('managerVersion', options.managerVersion)
  if (options?.contractHint) params.set('contractHint', options.contractHint)
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(BASE + '/api/jobs/' + encodeURIComponent(jobId) + '/operator-view' + qs)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch operator view')
  return data
}

export async function fetchProcurementArtifacts(procurementId) {
  const res = await fetch(BASE + '/api/procurements/' + encodeURIComponent(procurementId) + '/artifacts')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch procurement artifacts')
  return data
}

export async function validateJobDryRun(jobId, options = {}) {
  const res = await fetch(BASE + '/api/jobs/' + encodeURIComponent(jobId) + '/validate-dryrun', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to run validation dry-run')
  return data
}

export async function prepareValidatorV1(payload) {
  const res = await fetch(BASE + '/api/validator/v1/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to prepare validator package')
  return data
}

export async function scoreCompletionUri(payload) {
  const res = await fetch(BASE + '/api/scoring/completion-uri', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to score completion URI')
  return data
}

export async function preparePrimeValidatorCommit(payload) {
  const res = await fetch(BASE + '/api/validator/prime/score-commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to prepare prime score commit package')
  return data
}

export async function preparePrimeValidatorReveal(payload) {
  const res = await fetch(BASE + '/api/validator/prime/score-reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to prepare prime score reveal package')
  return data
}

export async function fetchPrimeValidatorTimeline(procurementId) {
  const res = await fetch(BASE + '/api/validator/prime/' + encodeURIComponent(procurementId) + '/timeline')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch prime validator timeline')
  return data
}
