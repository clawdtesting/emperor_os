// audits/protocol/checks/contract_address_validation.js
// Validates canonical contract addresses are correctly checksummed and non-zero.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGI_JOB_MANAGER, AGI_JOB_DISCOVERY_PRIME, AGIALPHA_TOKEN } from "../../lib/constants.js";
import { normalizeAddress } from "../../lib/abi_utils.js";
 
const CHECK_NAME = "protocol.contract_address_validation";
 
const CONTRACTS = {
  AGI_JOB_MANAGER,
  AGI_JOB_DISCOVERY_PRIME,
  AGIALPHA_TOKEN,
};
 
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
 
export async function run(ctx) {
  const start = Date.now();
  const failures = [];
 
  for (const [name, address] of Object.entries(CONTRACTS)) {
    if (!address || address === ZERO_ADDRESS) {
      failures.push(`${name}: is zero address or empty`);
      continue;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      failures.push(`${name}: invalid format "${address}"`);
      continue;
    }
    const normalized = normalizeAddress(address);
    if (!normalized || normalized.toLowerCase() !== address.toLowerCase()) {
      failures.push(`${name}: normalization failed`);
    }
  }
 
  if (failures.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.FAIL,
      severity: SEVERITY.FAIL,
      details: failures.join("; "),
      durationMs: Date.now() - start,
      extra: { contracts: CONTRACTS },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${Object.keys(CONTRACTS).length} contract addresses are valid and checksummed`,
      durationMs: Date.now() - start,
      extra: { contracts: CONTRACTS },
    });
  }
 
  return ctx;
}