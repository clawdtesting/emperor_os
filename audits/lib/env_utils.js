// audits/lib/env_utils.js
// Environment variable utilities for audit checks.

import { AGI_JOB_MANAGER, AGI_JOB_DISCOVERY_PRIME, AGIALPHA_TOKEN, MAINNET_CHAIN_ID } from "./constants.js";

const REQUIRED_ENV_KEYS = [
  "RPC_URL",
  "AGENT_ADDRESS",
];

const OPTIONAL_ENV_KEYS = [
  "AGI_ALPHA_MCP",
  "EXPECTED_CHAIN_ID",
  "AGI_JOB_MANAGER_CONTRACT",
  "AGI_JOB_DISCOVERY_PRIME_CONTRACT",
  "AGIALPHA_TOKEN_ADDRESS",
  "IPFS_GATEWAY",
];

export function getEnv(key, fallback = null) {
  return process.env[key] || fallback;
}

export function checkRequiredEnv() {
  const missing = REQUIRED_ENV_KEYS.filter(k => !process.env[k]);
  return {
    ok: missing.length === 0,
    missing,
    present: REQUIRED_ENV_KEYS.filter(k => process.env[k]),
  };
}

export function checkEnvContracts() {
  const issues = [];

  const runtimeManager = process.env.AGI_JOB_MANAGER_CONTRACT;
  if (runtimeManager && runtimeManager.toLowerCase() !== AGI_JOB_MANAGER.toLowerCase()) {
    issues.push({ key: "AGI_JOB_MANAGER_CONTRACT", expected: AGI_JOB_MANAGER, got: runtimeManager });
  }

  const runtimePrime = process.env.AGI_JOB_DISCOVERY_PRIME_CONTRACT;
  if (runtimePrime && runtimePrime.toLowerCase() !== AGI_JOB_DISCOVERY_PRIME.toLowerCase()) {
    issues.push({ key: "AGI_JOB_DISCOVERY_PRIME_CONTRACT", expected: AGI_JOB_DISCOVERY_PRIME, got: runtimePrime });
  }

  const runtimeToken = process.env.AGIALPHA_TOKEN_ADDRESS;
  if (runtimeToken && runtimeToken.toLowerCase() !== AGIALPHA_TOKEN.toLowerCase()) {
    issues.push({ key: "AGIALPHA_TOKEN_ADDRESS", expected: AGIALPHA_TOKEN, got: runtimeToken });
  }

  const chainId = process.env.EXPECTED_CHAIN_ID;
  if (chainId && Number(chainId) !== MAINNET_CHAIN_ID) {
    issues.push({ key: "EXPECTED_CHAIN_ID", expected: MAINNET_CHAIN_ID, got: Number(chainId) });
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function getAllEnvVars() {
  const all = {};
  for (const key of [...REQUIRED_ENV_KEYS, ...OPTIONAL_ENV_KEYS]) {
    all[key] = process.env[key] || null;
  }
  return all;
}
