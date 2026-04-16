// agent/llm-router.js
// Deprecated shim. Canonical entry point is config/llm_router.js.

import { llmCall as providerLlmCall, selectModel as providerSelectModel } from '../config/llm_router.js'

export function selectModel(spec) {
  return providerSelectModel(spec)
}

export async function llmCall(system, user, spec, opts = {}) {
  return providerLlmCall(system, user, spec, opts)
}
