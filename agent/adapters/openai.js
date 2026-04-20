import { BaseAgentAdapter, normalizeAgentResult } from './base.js'

export class OpenAIAgentAdapter extends BaseAgentAdapter {
  constructor(connection = {}) {
    super(connection)
    this.id = 'openai'
    this.capabilities = ['direct-llm', 'sync-result']
  }

  validateConfig() {
    const cfg = this.connection?.config || {}
    if (!(cfg.apiKeyRef && process.env[cfg.apiKeyRef])) throw new Error('openai adapter requires config.apiKeyRef environment variable')
    if (!cfg.model) throw new Error('openai adapter requires config.model')
    return true
  }

  async submitJobPacket(packet) {
    this.validateConfig()
    const cfg = this.connection.config
    const apiKey = process.env[cfg.apiKeyRef]
    const res = await fetch(cfg.baseUrl || 'https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: cfg.model,
        input: [
          { role: 'system', content: 'Return strict JSON only for emperor-os/agent-job-result/v1.' },
          { role: 'user', content: JSON.stringify(packet) }
        ],
        text: { format: { type: 'json_object' } }
      })
    })
    if (!res.ok) throw new Error(`openai submit failed: HTTP ${res.status}`)
    const data = await res.json()
    const output = data?.output?.[0]?.content?.[0]?.text || '{}'
    let parsed = {}
    try { parsed = JSON.parse(output) } catch { parsed = { summary: output, status: 'completed', deliverables: [] } }
    return { status: 'completed', sync: true, result: normalizeAgentResult(parsed, { jobId: packet.jobId }) }
  }

  async pollRun() { return { done: true, status: 'completed' } }
  async fetchResult() { throw new Error('openai adapter returns sync result at submit time') }
  async cancelRun() { return { ok: false, reason: 'cancel_not_supported' } }
}
