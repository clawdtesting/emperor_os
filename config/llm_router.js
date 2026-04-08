// core/llm_router.js
import OpenAI from "openai";
import { PROVIDERS } from "../config/llm_providers.js";

export async function llmCall(messages, opts = {}) {
  const providers = PROVIDERS.filter(p => p.enabled);

  for (const provider of providers) {
    try {
      const client = new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
      });

      const res = await client.chat.completions.create({
        model: opts.model ?? provider.model,
        messages,
        max_tokens: opts.max_tokens ?? 4096,
        temperature: opts.temperature ?? 0.2,
      });

      const content = res.choices[0].message.content;
      console.log(`[llm_router] used: ${provider.name}`);
      return { content, provider: provider.name };

    } catch (err) {
      console.warn(`[llm_router] ${provider.name} failed: ${err.message}`);
      // falls through to next provider
    }
  }

  throw new Error("[llm_router] all providers exhausted");
}