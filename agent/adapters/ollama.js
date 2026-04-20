import { BaseAgentAdapter, normalizeAgentResult } from './base.js'

export class OllamaAgentAdapter extends BaseAgentAdapter {
  constructor(connection = {}) {
    super(connection)
    this.id = 'ollama'
    this.capabilities = ['local-llm', 'sync-result']
  }

  validateConfig() {
    const cfg = this.connection?.config || {}
    if (!cfg.model) throw new Error('ollama adapter requires config.model')
    return true
  }

  async submitJobPacket(packet) {
    this.validateConfig()
    const cfg = this.connection.config
    const url = new URL(cfg.path || '/api/generate', cfg.baseUrl || 'http://127.0.0.1:11434')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        prompt: `Return strict JSON matching emperor-os/agent-job-result/v1 for this packet:\n${JSON.stringify(packet)}`
      })
    })
    if (!res.ok) throw new Error(`ollama submit failed: HTTP ${res.status}`)
    const data = await res.json()
    let parsed = {}
    try { parsed = JSON.parse(data.response || '{}') } catch { parsed = { summary: data.response || '', status: 'completed', deliverables: [] } }
    return { status: 'completed', sync: true, result: normalizeAgentResult(parsed, { jobId: packet.jobId }) }
  }

  async pollRun() { return { done: true, status: 'completed' } }
  async fetchResult() { throw new Error('ollama adapter returns sync result at submit time') }
  async cancelRun() { return { ok: false, reason: 'cancel_not_supported' } }
}
