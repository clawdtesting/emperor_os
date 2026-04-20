import { BaseAgentAdapter, normalizeAgentResult } from './base.js'

function resolveAuthToken(config = {}) {
  if (config.authTokenRef && process.env[config.authTokenRef]) return process.env[config.authTokenRef]
  if (config.envKey && process.env[config.envKey]) return process.env[config.envKey]
  return ''
}

function buildHeaders(config = {}) {
  const headers = { 'content-type': 'application/json', ...(config.headers || {}) }
  const token = resolveAuthToken(config)
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

function templatePath(template, runId) {
  return String(template || '').replace('{runId}', encodeURIComponent(runId))
}

export class WebhookAgentAdapter extends BaseAgentAdapter {
  constructor(connection = {}) {
    super(connection)
    this.id = 'webhook'
    this.capabilities = ['sync-result', 'async-polling', 'cancel-run']
  }

  validateConfig() {
    const cfg = this.connection?.config || {}
    if (!cfg.baseUrl) throw new Error('webhook adapter requires config.baseUrl')
    if (!cfg.submitPath) throw new Error('webhook adapter requires config.submitPath')
    return true
  }

  async submitJobPacket(packet, _ctx = {}) {
    this.validateConfig()
    const cfg = this.connection.config
    const res = await fetch(new URL(cfg.submitPath, cfg.baseUrl), {
      method: 'POST',
      headers: buildHeaders(cfg),
      body: JSON.stringify({ packet })
    })
    if (!res.ok) throw new Error(`webhook submit failed: HTTP ${res.status}`)
    const data = await res.json().catch(() => ({}))

    if (data?.result || data?.deliverables || data?.status === 'completed') {
      return { status: 'completed', sync: true, result: normalizeAgentResult(data.result || data, { jobId: packet.jobId }) }
    }

    const externalRunId = String(data?.runId || data?.id || '')
    if (!externalRunId) throw new Error('webhook adapter response missing runId/result')
    return { status: 'submitted', sync: false, externalRunId, raw: data }
  }

  async pollRun(runId, _ctx = {}) {
    const cfg = this.connection.config
    if (!cfg.statusPathTemplate) throw new Error('webhook adapter missing statusPathTemplate for pollRun')
    const url = new URL(templatePath(cfg.statusPathTemplate, runId), cfg.baseUrl)
    const res = await fetch(url, { headers: buildHeaders(cfg) })
    if (!res.ok) throw new Error(`webhook status poll failed: HTTP ${res.status}`)
    const data = await res.json().catch(() => ({}))
    return {
      done: Boolean(data.done || data.completed || data.status === 'completed'),
      status: String(data.status || (data.done ? 'completed' : 'running')),
      raw: data
    }
  }

  async fetchResult(runId, _ctx = {}) {
    const cfg = this.connection.config
    const path = cfg.resultPathTemplate || cfg.statusPathTemplate
    if (!path) throw new Error('webhook adapter missing resultPathTemplate/statusPathTemplate')
    const url = new URL(templatePath(path, runId), cfg.baseUrl)
    const res = await fetch(url, { headers: buildHeaders(cfg) })
    if (!res.ok) throw new Error(`webhook result fetch failed: HTTP ${res.status}`)
    const data = await res.json().catch(() => ({}))
    return normalizeAgentResult(data.result || data, { jobId: data?.jobId })
  }

  async cancelRun(runId, _ctx = {}) {
    const cfg = this.connection.config
    if (!cfg.cancelPathTemplate) return { ok: false, reason: 'cancel_not_supported' }
    const url = new URL(templatePath(cfg.cancelPathTemplate, runId), cfg.baseUrl)
    const res = await fetch(url, { method: 'POST', headers: buildHeaders(cfg) })
    return { ok: res.ok, status: res.status }
  }
}
