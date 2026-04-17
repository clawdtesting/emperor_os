// config/llm_router.js
// Back-compat shim. The canonical router lives in agent/llm-router.js.
export { llmCall, llmChat, listProviders, getPreferredProvider, setPreferredProvider, selectModel } from '../agent/llm-router.js'
