// audits/protocol/checks/chainid_validation.js
// Validates the expected chain ID env variable matches the canonical mainnet chain ID.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "../../lib/constants.js";
import { getEnv } from "../../lib/env_utils.js";
 
const CHECK_NAME = "protocol.chainid_validation";
 
// Allowed chain IDs for production use
const ALLOWED_CHAIN_IDS = new Set([MAINNET_CHAIN_ID, BASE_CHAIN_ID]);
 
export async function run(ctx) {
  const start = Date.now();
 
  const rawChainId = getEnv("EXPECTED_CHAIN_ID");
 
  if (!rawChainId) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "EXPECTED_CHAIN_ID not set — chain ID validation skipped",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  const chainId = Number(rawChainId);
 
  if (!Number.isInteger(chainId) || chainId <= 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.FAIL,
      severity: SEVERITY.FAIL,
      details: `EXPECTED_CHAIN_ID is not a valid positive integer: "${rawChainId}"`,
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  if (!ALLOWED_CHAIN_IDS.has(chainId)) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.FAIL,
      severity: SEVERITY.FAIL,
      details: `Chain ID ${chainId} is not in allowed set [${[...ALLOWED_CHAIN_IDS].join(", ")}]`,
      durationMs: Date.now() - start,
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Chain ID ${chainId} is valid`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}