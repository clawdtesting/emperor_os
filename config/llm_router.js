// config/llm_router.js
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import OpenAI from 'openai'
import { orderedProviders, selectModelForSpec } from './llm_providers.js'

const DEFAULT_SELECTION_FILE = resolve(process.cwd(), 'mission-control', 'state', 'llm-selection.json')

function readPreferredProvider() {
  const fromEnv = String(process.env.PREFERRED_LLM_PROVIDER || '').trim()
  if (fromEnv) return fromEnv

  const file = process.env.LLM_PROVIDER_SELECTION_FILE || DEFAULT_SELECTION_FILE
  if (!existsSync(file)) return ''

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return String(parsed?.preferredProvider || '').trim()
  } catch {
    return ''
  }
}

function normalizeMessages(messagesOrSystem, user) {
  if (Array.isArray(messagesOrSystem)) return messagesOrSystem
  return [
    { role: 'system', content: String(messagesOrSystem || '') },
    { role: 'user', content: String(user || '') },
  ]
}

async function callAnthropic(provider, messages, opts) {
  const system = messages.find((m) => m.role === 'system')?.content || ''
  const userParts = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.max_tokens,
      temperature: opts.temperature,
      system,
      messages: [{ role: 'user', content: userParts || 'Continue.' }],
    }),
    signal: AbortSignal.timeout(opts.timeout_ms),
  })

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.content?.[0]?.text?.trim()
  if (!text) throw new Error('Empty Anthropic response')
  return text
}

async function callOpenAICompat(provider, messages, opts) {
  const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL })
  const res = await client.chat.completions.create({
    model: opts.model,
    messages,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature,
  })
  const text = res?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error(`Empty ${provider.name} response`)
  return text
}

async function llmCallModern(messages, opts = {}) {
  const preferred = opts.provider || readPreferredProvider()
  const providers = orderedProviders(preferred)
  const spec = opts.spec

  for (const provider of providers) {
    const selection = selectModelForSpec(spec, provider.model)
    if (selection.decline) {
      const err = Object.assign(new Error(selection.reason), { decline: true, provider: provider.name })
      throw err
    }

    const requestOpts = {
      model: opts.model || selection.model || provider.model,
      max_tokens: opts.max_tokens ?? opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
      timeout_ms: opts.timeout_ms ?? opts.timeoutMs ?? 300_000,
    }

    try {
      const content = provider.type === 'anthropic'
        ? await callAnthropic(provider, messages, requestOpts)
        : await callOpenAICompat(provider, messages, requestOpts)

      console.log(`[llm_router] used: ${provider.name}/${requestOpts.model}`)
      return { content, provider: provider.name, model: requestOpts.model }
    } catch (err) {
      console.warn(`[llm_router] ${provider.name} failed: ${err.message}`)
    }
  }

  throw new Error('[llm_router] all providers exhausted')
}

// Supports both call styles:
//   1) llmCall(messagesArray, opts) => { content, provider, model }
//   2) llmCall(system, user, spec, opts) => string (compat for legacy handlers)
export async function llmCall(arg1, arg2, arg3, arg4) {
  if (Array.isArray(arg1)) {
    return llmCallModern(arg1, arg2 || {})
  }

  const messages = normalizeMessages(arg1, arg2)
  const result = await llmCallModern(messages, { ...(arg4 || {}), spec: arg3 })
  return result.content
}

export function selectModel(spec) {
  return selectModelForSpec(spec, process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b')
}
