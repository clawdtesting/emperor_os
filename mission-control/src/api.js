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
