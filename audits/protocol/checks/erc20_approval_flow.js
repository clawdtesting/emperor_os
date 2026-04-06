// audits/protocol/checks/erc20_approval_flow.js
// Verifies ERC20 approve() calldata can be correctly encoded for the AGI token.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGIALPHA_TOKEN, AGI_JOB_MANAGER } from "../../lib/constants.js";
import { encodeFunctionCall, getSelector } from "../../lib/abi_utils.js";
 
const CHECK_NAME = "protocol.erc20_approval_flow";
 
const ERC20_ABI = [
  "function approve(address spender, uint256 amount)",
  "function allowance(address owner, address spender) view returns (uint256)",
];
 
// keccak256("approve(address,uint256)")[0:4]
const APPROVE_SELECTOR = "0x095ea7b3";
 
export async function run(ctx) {
  const start = Date.now();
  const failures = [];
 
  // Encode approve(AGI_JOB_MANAGER, maxUint256)
  const maxUint256 = (2n ** 256n) - 1n;
  const encoded = encodeFunctionCall(ERC20_ABI, "approve", [AGI_JOB_MANAGER, maxUint256]);
 
  if (!encoded) {
    failures.push("encodeFunctionCall returned null for ERC20 approve");
  } else {
    const sel = getSelector(encoded);
    if (sel !== APPROVE_SELECTOR) {
      failures.push(`approve selector mismatch: expected ${APPROVE_SELECTOR}, got ${sel}`);
    }
    // approve calldata should be: selector (4 bytes) + address (32 bytes) + uint256 (32 bytes) = 68 bytes = 136 hex chars + "0x"
    const expectedLength = 2 + 136; // "0x" + 68 bytes * 2
    if (encoded.length !== expectedLength) {
      failures.push(`approve calldata length mismatch: expected ${expectedLength}, got ${encoded.length}`);
    }
  }
 
  if (failures.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.FAIL,
      severity: SEVERITY.FAIL,
      details: failures.join("; "),
      durationMs: Date.now() - start,
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `ERC20 approve calldata encodes correctly — selector=${APPROVE_SELECTOR}, spender=${AGI_JOB_MANAGER}`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}