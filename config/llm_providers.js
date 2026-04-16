// config/llm_providers.js

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1'

// Tag/category model hints migrated from deprecated agent/llm-router.js
const IMAGE_TAGS = ['design', 'logo', 'illustration', 'branding', 'image', 'svg', 'png', 'figma']
const IMAGE_CATEGORIES = ['creative / design', 'design']
const TAG_MODELS = {
  solidity: 'qwen2.5-coder:14b',
  'smart-contract': 'qwen2.5-coder:14b',
  'smart-contract-explainer': 'qwen2.5-coder:14b',
  code: 'qwen2.5-coder:14b',
  development: 'qwen2.5-coder:14b',
  education: 'gemma3:12b',
  documentation: 'gemma3:12b',
  onboarding: 'gemma3:12b',
  research: 'gemma3:12b',
  analysis: 'gemma3:12b',
  writing: 'glm4:9b',
  creative: 'glm4:9b',
}
const CATEGORY_MODELS = {
  development: 'qwen2.5-coder:14b',
  research: 'gemma3:12b',
  analysis: 'gemma3:12b',
  'education / documentation / onboarding': 'gemma3:12b',
  creative: 'glm4:9b',
  writing: 'glm4:9b',
}

export function selectModelForSpec(spec, fallbackModel) {
  const props = spec?.properties || {}
  const category = String(props.category || '').toLowerCase()
  const tags = Array.isArray(props.tags) ? props.tags.map(t => String(t).toLowerCase()) : []

  if (IMAGE_CATEGORIES.some(c => category.includes(c)) || tags.some(t => IMAGE_TAGS.includes(t))) {
    return { model: null, decline: true, reason: 'Job requires image generation — outside LLM capability' }
  }

  for (const tag of tags) {
    if (TAG_MODELS[tag]) return { model: TAG_MODELS[tag], decline: false }
  }
  for (const [cat, model] of Object.entries(CATEGORY_MODELS)) {
    if (category.includes(cat)) return { model, decline: false }
  }

  return { model: fallbackModel, decline: false }
}

export const PROVIDERS = [
  {
    name: 'anthropic',
    label: 'Anthropic',
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    enabled: Boolean(process.env.ANTHROPIC_API_KEY),
  },
  {
    name: 'openai',
    label: 'OpenAI',
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4.1',
    enabled: Boolean(process.env.OPENAI_API_KEY),
  },
  {
    name: 'codex',
    label: 'Codex (OpenAI)',
    type: 'openai',
    apiKey: process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.CODEX_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.CODEX_MODEL || 'gpt-5-codex',
    enabled: Boolean(process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY),
  },
  {
    name: 'gemini',
    label: 'Gemini',
    type: 'openai',
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    enabled: Boolean(process.env.GEMINI_API_KEY),
  },
  {
    name: 'openrouter',
    label: 'OpenRouter',
    type: 'openai',
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free',
    enabled: Boolean(process.env.OPENROUTER_API_KEY),
  },
  {
    name: 'ollama',
    label: 'Ollama',
    type: 'openai',
    apiKey: 'ollama',
    baseURL: OLLAMA_BASE_URL,
    model: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
    enabled: true,
  },
]

export function listProviders() {
  return PROVIDERS.map((p) => ({
    name: p.name,
    label: p.label,
    enabled: Boolean(p.enabled),
    available: Boolean(p.enabled),
    model: p.model,
    type: p.type,
  }))
}

export function orderedProviders(preferredName) {
  const enabled = PROVIDERS.filter((p) => p.enabled)
  if (!preferredName) return enabled
  const preferred = enabled.find((p) => p.name === preferredName)
  if (!preferred) return enabled
  return [preferred, ...enabled.filter((p) => p.name !== preferredName)]
}
