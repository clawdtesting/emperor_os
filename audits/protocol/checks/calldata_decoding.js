// audits/protocol/checks/calldata_decoding.js
// Tests that ABI decoding works correctly for known AGI contract function signatures.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { decodeCalldata, encodeFunctionCall, getSelector } from "../../lib/abi_utils.js";
 
const CHECK_NAME = "protocol.calldata_decoding";
 
// submitCompletion(uint256 jobId, string ipfsHash, bytes32 contentHash)
const AGI_JOB_MANAGER_ABI = [
  "function submitCompletion(uint256 jobId, string ipfsHash, bytes32 contentHash)",
  "function applyForJob(uint256 jobId, bytes calldata applicationData)",
];
 
const TEST_CASES = [
  {
    name: "submitCompletion",
    abi: AGI_JOB_MANAGER_ABI,
    expectedSelector: "0x5635b65d",
  },
];
 
export async function run(ctx) {
  const start = Date.now();
  const failures = [];
 
  for (const tc of TEST_CASES) {
    const encoded = encodeFunctionCall(tc.abi, tc.name, [
      1n,
      "QmTestHash",
      "0x" + "ab".repeat(32),
    ]);
    if (!encoded) {
      failures.push(`${tc.name}: encoding returned null`);
      continue;
    }

    const decoded = decodeCalldata(tc.abi, encoded);
    if (!decoded || decoded.selector !== tc.expectedSelector) {
      failures.push(`${tc.name}: decode/selector mismatch`);
    }
  }
 
  // Additional: verify getSelector handles known calldata shape
  const knownHex = "0x12345678aabbccdd";
  const sel = getSelector(knownHex);
  if (sel !== "0x12345678") {
    failures.push(`getSelector returned wrong result: ${sel}`);
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
      details: "ABI decoding utilities verified for AGI contract signatures",
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}
