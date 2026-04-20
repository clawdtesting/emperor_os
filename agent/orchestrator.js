import { discover } from './discover.js'
import { evaluate } from './evaluate.js'
import { apply } from './apply.js'
import { confirm } from './confirm.js'
import { execute } from './execute.js'
import { validate } from './validate.js'
import { submit } from './submit.js'
import { reconcileCompletion } from './reconcile-completion.js'
import { getActiveAdapters } from '../contracts/registry.js'
import { buildAgentJobPacket } from './agent-packet-builder.js'
import { ingestAgentResult } from './agent-result-ingest.js'

const PIPELINE = [
  { name: 'discover', run: discover },
  { name: 'evaluate', run: evaluate },
  { name: 'apply', run: apply },
  { name: 'confirm', run: confirm },
  { name: 'execute', run: execute },
  { name: 'validate', run: validate },
  { name: 'submit', run: submit },
  { name: 'reconcile_completion', run: reconcileCompletion }
]

export async function runOrchestratorCycle({ mode = 'internal' } = {}) {
  if (mode !== 'internal') throw new Error(`Unsupported orchestrator mode: ${mode}`)
  for (const step of PIPELINE) await step.run()
}

export function getPipelineStepNames() {
  return PIPELINE.map((step) => step.name)
}

export function getActiveVersions() {
  return getActiveAdapters().map(({ version }) => version)
}

export function prepareExternalAgentRun(args) {
  return buildAgentJobPacket(args)
}

export async function ingestExternalAgentResult(args) {
  return ingestAgentResult(args)
}
