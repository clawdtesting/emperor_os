import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_WORKSPACE_ROOT = path.resolve(__dirname, "..");

export const CONFIG = {
  WORKSPACE_ROOT:
    process.env.WORKSPACE_ROOT ??
    DEFAULT_WORKSPACE_ROOT,

  AGI_ALPHA_MCP: process.env.AGI_ALPHA_MCP ?? "",
  AGENT_ADDRESS: (process.env.AGENT_ADDRESS ?? "").toLowerCase(),
  AGENT_SUBDOMAIN: process.env.AGENT_SUBDOMAIN ?? "",
  PINATA_JWT: process.env.PINATA_JWT ?? "",

  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-5.4",

  MIN_PAYOUT_AGIALPHA: Number(process.env.MIN_PAYOUT_AGIALPHA ?? "500"),
  MAX_ACTIVE_JOBS: Number(process.env.MAX_ACTIVE_JOBS ?? "3"),
  DISCOVER_LIMIT: Number(process.env.DISCOVER_LIMIT ?? "50"),
  LOOP_BASE_DELAY_MS: Number(process.env.LOOP_BASE_DELAY_MS ?? "15000"),
  LOOP_MAX_DELAY_MS: Number(process.env.LOOP_MAX_DELAY_MS ?? "300000"),
  LOOP_BACKOFF_MULTIPLIER: Number(process.env.LOOP_BACKOFF_MULTIPLIER ?? "2"),
  LOOP_BACKOFF_JITTER_MS: Number(process.env.LOOP_BACKOFF_JITTER_MS ?? "1000"),
  STATE_TTL_DAYS: Number(process.env.STATE_TTL_DAYS ?? "30"),
  MAX_STATE_FILES: Number(process.env.MAX_STATE_FILES ?? "5000"),

  MIN_CONFIDENCE_TO_APPLY: Number(process.env.MIN_CONFIDENCE_TO_APPLY ?? "0.4"),
  MAX_ACCEPTABLE_DIFFICULTY: Number(process.env.MAX_ACCEPTABLE_DIFFICULTY ?? "0.75"),
  MIN_EXECUTION_CONFIDENCE: Number(process.env.MIN_EXECUTION_CONFIDENCE ?? "0.55"),
  ENABLE_RED_FLAG_HARD_SKIP:
    String(process.env.ENABLE_RED_FLAG_HARD_SKIP ?? "true").toLowerCase() === "true",

  CREATED_VIA: process.env.CREATED_VIA ?? "emperor-os-agent",
  LOCALE: process.env.LOCALE ?? "en-US",

  CONTRACT: "0xB3AAeb69b630f0299791679c063d68d6687481d1",
  CHAIN_ID: 1,

  MIN_ARTIFACT_CHARS: Number(process.env.MIN_ARTIFACT_CHARS ?? "500")
};

export function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} not set`);
  }
  return value;
}
