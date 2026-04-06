// employer-validation/config.js
// Employer-side validation configuration.
//
// All parameters sourced from environment with safe defaults.
// No private keys, no signing material.

import { CONFIG } from "../agent/config.js";

export const EMPLOYER_CONFIG = {
  ...CONFIG,

  // Employer identity
  EMPLOYER_ADDRESS: (process.env.EMPLOYER_ADDRESS ?? process.env.AGENT_ADDRESS ?? "").toLowerCase(),

  // Job discovery
  JOB_DISCOVERY_LOOKBACK_BLOCKS: Number(process.env.EMPLOYER_LOOKBACK_BLOCKS ?? "10000"),
  JOB_POLL_INTERVAL_MS: Number(process.env.EMPLOYER_POLL_INTERVAL_MS ?? "120000"),

  // Content validation thresholds
  MIN_DELIVERABLE_CHARS: Number(process.env.EMPLOYER_MIN_DELIVERABLE_CHARS ?? "500"),
  MIN_SUBSTANTIVE_CHARS: Number(process.env.EMPLOYER_MIN_SUBSTANTIVE_CHARS ?? "120"),

  // Spec compliance
  REQUIRED_SECTION_MATCH_THRESHOLD: Number(process.env.EMPLOYER_SECTION_MATCH ?? "0.7"),
  MIN_COMPLETION_SCORE: Number(process.env.EMPLOYER_MIN_COMPLETION_SCORE ?? "50"),

  // IPFS fetch
  IPFS_FETCH_TIMEOUT_MS: Number(process.env.EMPLOYER_IPFS_TIMEOUT_MS ?? "30000"),
  IPFS_MAX_RETRIES: Number(process.env.EMPLOYER_IPFS_RETRIES ?? "3"),
  IPFS_RETRY_DELAY_MS: Number(process.env.EMPLOYER_IPFS_RETRY_DELAY_MS ?? "5000"),

  // Review thresholds
  AUTO_ACCEPT_SCORE: Number(process.env.EMPLOYER_AUTO_ACCEPT_SCORE ?? "80"),
  AUTO_DISPUTE_SCORE: Number(process.env.EMPLOYER_AUTO_DISPUTE_SCORE ?? "30"),

  // Forbidden patterns (same as agent-side)
  FORBIDDEN_PATTERNS: [
    /as an ai/i,
    /i can't/i,
    /i cannot/i,
    /here'?s the final deliverable/i,
    /meta commentary/i,
  ],
};
