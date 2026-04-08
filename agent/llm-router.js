// agent/llm-router.js
// Routes each job to the best available local model based on category + tags.
// Zero external API calls — Ollama only.

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1'

// Categories/tags that require image generation — no LLM can handle these
const IMAGE_TAGS = ['design', 'logo', 'illustration', 'branding', 'image', 'svg', 'png', 'figma']
const IMAGE_CATEGORIES = ['creative / design', 'design']

// Tag → model mapping (checked before category)
const TAG_MODELS = {
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

// Category → model fallback
const CATEGORY_MODELS = {
  'development':                            'qwen2.5-coder:14b',
  'research':                               'gemma3:12b',
  'analysis':                               'gemma3:12b',
  'education / documentation / onboarding': 'gemma3:12b',
  'creative':                               'glm4:9b',
  'writing':                                'glm4:9b',
}

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b'

export function selectModel(spec) {
  const props    = spec?.properties || {}
  const category = (props.category || '').toLowerCase()
  const tags     = (props.tags || []).map(t => t.toLowerCase())

  // Hard block: image/design jobs — no model can produce this
  if (IMAGE_CATEGORIES.some(c => category.includes(c)) ||
      tags.some(t => IMAGE_TAGS.includes(t))) {
    return { model: null, decline: true, reason: 'Job requires image generation — outside LLM capability' }
  }

  // Tag-based routing (most specific)
  for (const tag of tags) {
    if (TAG_MODELS[tag]) return { model: TAG_MODELS[tag], decline: false }
  }

  // Category-based routing
  for (const [cat, model] of Object.entries(CATEGORY_MODELS)) {
    if (category.includes(cat)) return { model, decline: false }
  }

  return { model: DEFAULT_MODEL, decline: false }
}

export async function llmCall(system, user, spec, { maxTokens = 8192 } = {}) {
  const { model, decline, reason } = selectModel(spec)

  if (decline) throw Object.assign(new Error(reason), { decline: true })

  const res = await fetch(`${OLLAMA_BASE}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
    }),
    signal: AbortSignal.timeout(300_000),
  })

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty Ollama response')
  return text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
}
