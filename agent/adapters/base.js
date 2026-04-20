export class BaseAgentAdapter {
  constructor(connection = {}) {
    this.connection = connection
    this.id = 'base'
    this.capabilities = []
  }

  validateConfig() {
    throw new Error('validateConfig() must be implemented by adapter')
  }

  async submitJobPacket(_packet, _ctx = {}) {
    throw new Error('submitJobPacket() must be implemented by adapter')
  }

  async pollRun(_runId, _ctx = {}) {
    throw new Error('pollRun() must be implemented by adapter')
  }

  async fetchResult(_runId, _ctx = {}) {
    throw new Error('fetchResult() must be implemented by adapter')
  }

  async cancelRun(_runId, _ctx = {}) {
    throw new Error('cancelRun() must be implemented by adapter')
  }
}

export function normalizeAgentResult(payload, fallback = {}) {
  if (!payload || typeof payload !== 'object') {
    return {
      schema: 'emperor-os/agent-job-result/v1',
      jobId: String(fallback.jobId || ''),
      status: 'failed',
      summary: 'Adapter returned empty/non-object result',
      deliverables: [],
      evidence: [],
      warnings: ['adapter returned invalid result payload']
    }
  }

  const deliverables = Array.isArray(payload.deliverables)
    ? payload.deliverables
    : Array.isArray(payload.files)
      ? payload.files.map(file => ({ path: file.path || file.file, kind: file.kind || 'file', description: file.description || '' }))
      : []

  return {
    schema: 'emperor-os/agent-job-result/v1',
    jobId: String(payload.jobId || fallback.jobId || ''),
    status: String(payload.status || (payload.complete ? 'completed' : 'running')),
    summary: String(payload.summary || payload.message || ''),
    deliverables,
    evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    toolTrace: Array.isArray(payload.toolTrace) ? payload.toolTrace : undefined,
    agentMeta: payload.agentMeta || payload.meta || undefined,
    metrics: payload.metrics || undefined,
    proposedCompletion: payload.proposedCompletion || undefined,
    notes: payload.notes ? String(payload.notes) : undefined
  }
}
