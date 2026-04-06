// validation/config.js
// Validator-specific configuration.
//
// All validator parameters are sourced from environment with safe defaults.
// No private keys, no signing material.

import { CONFIG } from "../agent/config.js";

export const VALIDATOR_CONFIG = {
  ...CONFIG,

  // Validator identity (separate from agent identity when acting as validator)
  VALIDATOR_ADDRESS: (process.env.VALIDATOR_ADDRESS ?? process.env.AGENT_ADDRESS ?? "").toLowerCase(),

  // Scoring thresholds
  MIN_SCORE: Number(process.env.VALIDATOR_MIN_SCORE ?? "0"),
  MAX_SCORE: Number(process.env.VALIDATOR_MAX_SCORE ?? "100"),
  SCORE_PRECISION: Number(process.env.VALIDATOR_SCORE_PRECISION ?? "2"),

  // Adjudication thresholds
  CONSENSUS_THRESHOLD: Number(process.env.VALIDATOR_CONSENSUS_THRESHOLD ?? "0.7"),
  DISPUTE_SCORE_DELTA: Number(process.env.VALIDATOR_DISPUTE_SCORE_DELTA ?? "25"),
  MIN_VALIDATOR_COUNT: Number(process.env.VALIDATOR_MIN_COUNT ?? "3"),

  // Evidence fetch
  EVIDENCE_FETCH_TIMEOUT_MS: Number(process.env.VALIDATOR_EVIDENCE_TIMEOUT_MS ?? "30000"),
  EVIDENCE_MAX_RETRIES: Number(process.env.VALIDATOR_EVIDENCE_RETRIES ?? "3"),
  EVIDENCE_RETRY_DELAY_MS: Number(process.env.VALIDATOR_EVIDENCE_RETRY_DELAY_MS ?? "5000"),

  // Settlement
  SETTLEMENT_FINALITY_DEPTH: Number(process.env.VALIDATOR_SETTLEMENT_FINALITY ?? "12"),
  SETTLEMENT_POLL_INTERVAL_MS: Number(process.env.VALIDATOR_SETTLEMENT_POLL_MS ?? "60000"),

  // Multi-validator coordination
  COORDINATION_WINDOW_SECS: Number(process.env.VALIDATOR_COORD_WINDOW_SECS ?? "3600"),
  COLLUSION_DETECTION_ENABLED: String(process.env.VALIDATOR_COLLUSION_DETECTION ?? "true").toLowerCase() === "true",
  COLLUSION_SCORE_CORRELATION_THRESHOLD: Number(process.env.VALIDATOR_COLLUSION_CORRELATION ?? "0.95"),

  // Dispute resolution
  DISPUTE_ENABLED: String(process.env.VALIDATOR_DISPUTE_ENABLED ?? "true").toLowerCase() === "true",
  DISPUTE_EVIDENCE_DEADLINE_SECS: Number(process.env.VALIDATOR_DISPUTE_DEADLINE_SECS ?? "86400"),
};

export function requireValidatorEnv(name, value) {
  if (!value) {
    throw new Error(`Validator ${name} not set`);
  }
  return value;
}
