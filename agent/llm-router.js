// agent/llm-router.js
// Canonical provider-agnostic LLM router for Emperor_OS.
//
// Supported providers: anthropic, openai, gemini, openrouter, ollama.
// The active provider is chosen from (in order):
//   1. explicit `provider` arg passed to llmChat
//   2. preference persisted in agent/state/llm-preference.json (set via mission-control)
//   3. env var LLM_PREFERRED_PROVIDER
//   4. first enabled provider in PROVIDERS order (anthropic → ollama)
//
// Each provider falls back to the next enabled one on failure, so jobs never
// hard-fail because a single key is missing or one backend is down.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dir            = dirname(fileURLToPath(import.meta.url))
const STATE_DIR        = join(__dir, 'state')
const PREFERENCE_FILE  = join(STATE_DIR, 'llm-preference.json')

// ── Tag / category routing (Ollama only — remote providers use their default) ─

const IMAGE_TAGS       = ['design', 'logo', 'illustration', 'branding', 'image', 'svg', 'png', 'figma']
const IMAGE_CATEGORIES = ['creative / design', 'design']

const OLLAMA_TAG_MODELS = {
  'solidity':                   'qwen2.5-coder:14b',
  'smart-contract':             'qwen2.5-coder:14b',
  'smart-contract-explainer':   'qwen2.5-coder:14b',
  'code':                       'qwen2.5-coder:14b',
  'development':                'qwen2.5-coder:14b',
  'education':                  'gemma3:12b',
  'documentation':              'gemma3:12b',
  'onboarding':                 'gemma3:12b',
  'research':                   'gemma3:12b',
  'analysis':                   'gemma3:12b',
  'writing':                    'glm4:9b',
  'creative':                   'glm4:9b',
}

const OLLAMA_CATEGORY_MODELS = {
  'development':                            'qwen2.5-coder:14b',
  'research':                               'gemma3:12b',
  'analysis':                               'gemma3:12b',
  'education / documentation / onboarding': 'gemma3:12b',
  'creative':                               'glm4:9b',
  'writing':                                'glm4:9b',
}

// ── Provider table ───────────────────────────────────────────────────────────

export const PROVIDERS = [
  {
    id:      'anthropic',
    label:   'Anthropic Claude',
    envKey:  'ANTHROPIC_API_KEY',
    defaultModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    kind:    'anthropic',
  },
  {
    id:      'openai',
    label:   'OpenAI',
    envKey:  'OPENAI_API_KEY',
    defaultModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    kind:    'openai',
  },
  {
    id:      'gemini',
    label:   'Google Gemini',
    envKey:  'GEMINI_API_KEY',
    defaultModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    kind:    'gemini',
  },
  {
    id:      'openrouter',
    label:   'OpenRouter',
    envKey:  'OPENROUTER_API_KEY',
    defaultModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4',
    kind:    'openai-compat',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    id:      'ollama',
    label:   'Ollama (local)',
    envKey:  null,                            // always available
    defaultModel: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
    kind:    'openai-compat',
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  },
]

export function listProviders() {
  const preferred = getPreferredProvider()
  return PROVIDERS.map(p => ({
    id:         p.id,
    label:      p.label,
    enabled:    isProviderEnabled(p),
    selected:   preferred === p.id,
    model:      p.defaultModel,
    envKey:     p.envKey,
  }))
}

function isProviderEnabled(p) {
  if (!p.envKey) return true
  return Boolean(process.env[p.envKey])
}

// ── Preference persistence ───────────────────────────────────────────────────

export function getPreferredProvider() {
  try {
    if (existsSync(PREFERENCE_FILE)) {
      const data = JSON.parse(readFileSync(PREFERENCE_FILE, 'utf8'))
      if (data?.providerId && PROVIDERS.some(p => p.id === data.providerId)) return data.providerId
    }
  } catch {}
  if (process.env.LLM_PREFERRED_PROVIDER) return process.env.LLM_PREFERRED_PROVIDER
  return ''
}

export function setPreferredProvider(providerId) {
  if (providerId && !PROVIDERS.some(p => p.id === providerId)) {
    throw new Error(`unknown provider: ${providerId}`)
  }
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(PREFERENCE_FILE, JSON.stringify({ providerId: providerId || '', updatedAt: new Date().toISOString() }, null, 2))
  return { providerId: providerId || '' }
}

// ── Model selection for a job spec ───────────────────────────────────────────

export function selectModel(spec, providerId) {
  const provider = PROVIDERS.find(p => p.id === providerId) || null
  const props    = spec?.properties || {}
  const category = (props.category || '').toLowerCase()
  const tags     = (props.tags || []).map(t => String(t).toLowerCase())

  // Hard block: image jobs are not LLM-solvable.
  if (IMAGE_CATEGORIES.some(c => category.includes(c)) || tags.some(t => IMAGE_TAGS.includes(t))) {
    return { model: null, decline: true, reason: 'Job requires image generation — outside LLM capability' }
  }

  // For Ollama, pick a size-appropriate local model based on tags/category.
  if (provider?.id === 'ollama') {
    for (const tag of tags) {
      if (OLLAMA_TAG_MODELS[tag]) return { model: OLLAMA_TAG_MODELS[tag], decline: false }
    }
    for (const [cat, model] of Object.entries(OLLAMA_CATEGORY_MODELS)) {
      if (category.includes(cat)) return { model, decline: false }
    }
    return { model: provider.defaultModel, decline: false }
  }

  return { model: provider?.defaultModel || '', decline: false }
}

// ── Resolve the call order (preferred → fallbacks) ───────────────────────────

function resolveCallOrder(explicitProviderId) {
  const enabled = PROVIDERS.filter(isProviderEnabled)
  if (enabled.length === 0) throw new Error('[llm-router] no providers enabled (no keys, and Ollama disabled)')

  const preferred = explicitProviderId || getPreferredProvider()
  if (preferred) {
    const match = enabled.find(p => p.id === preferred)
    if (match) return [match, ...enabled.filter(p => p.id !== match.id)]
  }
  return enabled
}

// ── Chat entry points ────────────────────────────────────────────────────────

/**
 * @param {string} system
 * @param {string} user
 * @param {{ spec?: object, maxTokens?: number, temperature?: number, timeoutMs?: number, provider?: string, model?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function llmChat(system, user, opts = {}) {
  const {
    spec, maxTokens = 4096, temperature = 0.2,
    timeoutMs = 120_000, provider: explicitProvider, model: explicitModel,
  } = opts

  const order = resolveCallOrder(explicitProvider)
  let lastErr

  for (const provider of order) {
    try {
      const routing = selectModel(spec, provider.id)
      if (routing.decline) throw Object.assign(new Error(routing.reason), { decline: true })
      const model = explicitModel || routing.model || provider.defaultModel

      const text = await callProvider(provider, { system, user, model, maxTokens, temperature, timeoutMs })
      return sanitizeOutput(text)
    } catch (err) {
      if (err?.decline) throw err
      lastErr = err
      console.warn(`[llm-router] ${provider.id} failed: ${err.message}`)
    }
  }
  throw new Error(`[llm-router] all providers exhausted: ${lastErr?.message || 'unknown error'}`)
}

/**
 * OpenAI-style messages[] entrypoint retained for multi-turn callers.
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} opts
 */
export async function llmCall(messages, opts = {}) {
  const system = messages.find(m => m.role === 'system')?.content || ''
  const user   = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n\n')
  const content = await llmChat(system, user, opts)
  return { content, provider: opts.provider || getPreferredProvider() || '' }
}

// ── Provider implementations ─────────────────────────────────────────────────

async function callProvider(provider, { system, user, model, maxTokens, temperature, timeoutMs }) {
  if (provider.kind === 'anthropic')     return callAnthropic(provider, { system, user, model, maxTokens, timeoutMs })
  if (provider.kind === 'openai')        return callOpenAI(provider, { system, user, model, maxTokens, temperature, timeoutMs })
  if (provider.kind === 'gemini')        return callGemini(provider, { system, user, model, maxTokens, temperature, timeoutMs })
  if (provider.kind === 'openai-compat') return callOpenAICompat(provider, { system, user, model, maxTokens, temperature, timeoutMs })
  throw new Error(`unsupported provider kind: ${provider.kind}`)
}

async function callAnthropic(provider, { system, user, model, maxTokens, timeoutMs }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env[provider.envKey],
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('empty Anthropic response')
  return text.trim()
}

async function callOpenAI(provider, { system, user, model, maxTokens, temperature, timeoutMs }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env[provider.envKey]}`,
    },
    body: JSON.stringify({
      model,
      max_tokens:  maxTokens,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('empty OpenAI response')
  return text.trim()
}

async function callGemini(provider, { system, user, model, maxTokens, temperature, timeoutMs }) {
  const apiKey = process.env[provider.envKey]
  const url    = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { role: 'system', parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const data  = await res.json()
  const parts = data.candidates?.[0]?.content?.parts || []
  const text  = parts.map(p => p.text || '').join('').trim()
  if (!text) throw new Error('empty Gemini response')
  return text
}

async function callOpenAICompat(provider, { system, user, model, maxTokens, temperature, timeoutMs }) {
  const apiKey = provider.envKey ? process.env[provider.envKey] : 'local'
  const res = await fetch(`${provider.baseURL}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey || 'local'}`,
    },
    body: JSON.stringify({
      model,
      max_tokens:  maxTokens,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`${provider.id} ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error(`empty ${provider.id} response`)
  return text.trim()
}

function sanitizeOutput(text) {
  return String(text).replace(/^```(?:json|xml|svg)?\n?/, '').replace(/\n?```$/, '').trim()
}

// ── Back-compat: old signature was `llmCall(system, user, spec, opts)` ───────
// Some older code may still import this. Provide a named legacy helper.
export async function legacyLlmCall(system, user, spec, opts = {}) {
  return llmChat(system, user, { ...opts, spec })
}
