// audits/protocol/checks/function_selector_validation.js
// Validates that known AGI function selectors match their canonical keccak256 values.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { getSelector, encodeFunctionCall } from "../../lib/abi_utils.js";
 
const CHECK_NAME = "protocol.function_selector_validation";
 
// Canonical selectors — computed offline from keccak256(sig)[0:4]
const KNOWN_SELECTORS = [
  {
    name: "submitCompletion(uint256,string,bytes32)",
    selector: "0xd9d98ce4",
    abi: ["function submitCompletion(uint256 jobId, string ipfsHash, bytes32 contentHash)"],
    fn: "submitCompletion",
    args: [1n, "QmTest", "0x" + "aa".repeat(32)],
  },
  {
    name: "approve(address,uint256)",
    selector: "0x095ea7b3",
    abi: ["function approve(address spender, uint256 amount)"],
    fn: "approve",
    args: ["0x0000000000000000000000000000000000000001", 1000n],
  },
];
 
export async function run(ctx) {
  const start = Date.now();
  const failures = [];
  const passed = [];
 
  for (const tc of KNOWN_SELECTORS) {
    const encoded = encodeFunctionCall(tc.abi, tc.fn, tc.args);
    if (!encoded) {
      failures.push(`${tc.name}: encoding returned null`);
      continue;
    }
    const sel = getSelector(encoded);
    if (sel !== tc.selector) {
      failures.push(`${tc.name}: expected ${tc.selector}, got ${sel}`);
    } else {
      passed.push(`${tc.name}=${sel}`);
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
      details: `All ${passed.length} function selectors match canonical values: ${passed.join(", ")}`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}