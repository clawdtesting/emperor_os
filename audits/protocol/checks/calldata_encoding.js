// audits/protocol/checks/calldata_encoding.js
// Verifies ABI encoding produces correct calldata for AGI contract calls.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { encodeFunctionCall, getSelector } from "../../lib/abi_utils.js";
 
const CHECK_NAME = "protocol.calldata_encoding";
 
const AGI_JOB_MANAGER_ABI = [
  "function submitCompletion(uint256 jobId, string ipfsHash, bytes32 contentHash)",
  "function applyForJob(uint256 jobId, bytes applicationData)",
];
 
// submitCompletion selector = keccak256("submitCompletion(uint256,string,bytes32)")[0:4]
const SUBMIT_COMPLETION_SELECTOR = "0xd9d98ce4";
const APPLY_FOR_JOB_SELECTOR     = "0x6c83a5b7";
 
export async function run(ctx) {
  const start = Date.now();
  const failures = [];
 
  // Test submitCompletion encoding
  const encoded = encodeFunctionCall(AGI_JOB_MANAGER_ABI, "submitCompletion", [
    1n,
    "QmTestHash",
    "0x" + "ab".repeat(32),
  ]);
 
  if (!encoded) {
    failures.push("encodeFunctionCall returned null for submitCompletion");
  } else {
    const sel = getSelector(encoded);
    if (sel !== SUBMIT_COMPLETION_SELECTOR) {
      failures.push(`submitCompletion selector mismatch: expected ${SUBMIT_COMPLETION_SELECTOR}, got ${sel}`);
    }
    if (!encoded.startsWith("0x")) {
      failures.push("Encoded calldata does not start with 0x");
    }
    if (encoded.length < 10) {
      failures.push("Encoded calldata too short");
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
      details: `ABI encoding verified for submitCompletion — selector=${SUBMIT_COMPLETION_SELECTOR}`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}