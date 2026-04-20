import { WebhookAgentAdapter } from './adapters/webhook.js'
import { HermesAgentAdapter } from './adapters/hermes.js'
import { OpenClawAgentAdapter } from './adapters/openclaw.js'
import { OpenAIAgentAdapter } from './adapters/openai.js'
import { OllamaAgentAdapter } from './adapters/ollama.js'

const REGISTRY = {
  webhook: WebhookAgentAdapter,
  hermes: HermesAgentAdapter,
  openclaw: OpenClawAgentAdapter,
  openai: OpenAIAgentAdapter,
  ollama: OllamaAgentAdapter
}

export function listAdapters() {
  return Object.keys(REGISTRY)
}

export function createAdapter(adapterId, connection) {
  const Adapter = REGISTRY[adapterId]
  if (!Adapter) throw new Error(`Unknown adapter: ${adapterId}`)
  return new Adapter(connection)
}
