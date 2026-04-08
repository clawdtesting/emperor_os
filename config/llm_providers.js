// config/llm_providers.js
export const PROVIDERS = [
    {
      name: "anthropic",
      baseURL: "https://api.anthropic.com/v1",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: "claude-sonnet-4-6",
      enabled: !!process.env.ANTHROPIC_API_KEY,
    },
    {
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: "mistralai/mistral-7b-instruct:free", // or any free model
      enabled: !!process.env.OPENROUTER_API_KEY,
    },
    {
      name: "ollama",
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama", // dummy, required by openai-compat client
      model: "qwen2.5-coder:7b",
      enabled: true, // always available
    },
  ];