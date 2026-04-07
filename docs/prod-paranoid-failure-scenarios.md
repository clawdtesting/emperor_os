# OpenClaw Production Failure Scenarios (Real-Funds, Paranoid Mode)

This document enumerates high-risk edge cases and attack vectors for a deployed, real-funds OpenClaw workflow.

## 1) Wrong transaction can be signed

### Scenario A — Malicious/compromised MCP returns crafted transaction
- `apply_for_job` / `request_job_completion` may return a transaction whose `to` is not AGIJobManager, with arbitrary calldata.
- If operator signs blindly, funds can be drained or approvals granted to attacker contracts.
- Risk area: `tx-builder.js` package generation from untrusted MCP payload.

### Scenario B — Value-bearing tx sneaks in
- Prepared tx includes non-zero `value` (ETH transfer) and appears legitimate at a glance.
- Operator signs, sending ETH to attacker-controlled destination.

### Scenario C — Chain mismatch confusion
- Operator wallet signs tx on the wrong network due to local wallet state mismatch.
- Even if tx shape is valid, intended protocol action does not happen or funds move unexpectedly.

### Scenario D — JobId/data mismatch
- Transaction data encodes a different `jobId` than local state and artifact package.
- Completion submitted for wrong job, causing protocol penalties or locked stake.

## 2) Incorrect job submission

### Scenario E — Artifact/metadata URI mismatch
- Deliverable IPFS URI and completion metadata URI point to unrelated content (race, overwrite, stale file).
- On-chain completion references invalid artifact package.

### Scenario F — Wrong encoding semantics
- Binary payload treated as UTF-8 text and corrupted before upload.
- Validators reject artifact or mark as malformed.

### Scenario G — Stale local state reused
- A prior run leaves `deliverable_ready` with old artifact path; submit stage publishes stale output.

## 3) Invalid deliverables

### Scenario H — LLM output passes superficial checks but violates hidden acceptance criteria
- Prompt injection / spec ambiguity leads to plausible but non-compliant deliverable.
- Validation rules are insufficiently strict for contract/job-specific constraints.

### Scenario I — External dependency drift
- Model behavior changes across time/version and produces structurally different outputs.
- Determinism assumptions fail; same job may pass one day and fail the next.

### Scenario J — Partial write / artifact corruption
- Disk write interrupted or file replaced after validation but before upload.
- Submitted file is not what was validated.

## 4) Silent pipeline breakage

### Scenario K — Single job exception halts progress for all jobs
- Unhandled error inside one job processing loop bubbles out and delays entire cycle repeatedly.

### Scenario L — State pruning removes too little or wrong files
- Incorrect overflow math causes state to exceed retention limits.
- In worst case, storage pressure and degraded behavior accumulate unnoticed.

### Scenario M — MCP SSE shape drift
- MCP envelope format changes (still HTTP 200) but parser returns unexpected object/string.
- Pipeline continues with malformed states or repeatedly skips actionable jobs.

## 5) Recommended controls (must-have)

1. **Strict tx package validation before signing**
   - enforce `to == AGIJobManager`, `value == 0`, hex calldata, expected chain id.
   - reject package on mismatch.
2. **Two-source verification prior to sign**
   - compare local `jobId` with decoded calldata `jobId`.
   - compare completion URI in calldata with local generated metadata URI.
3. **Hash-chain artifacts**
   - store SHA-256 of deliverable + metadata in state before upload and after upload receipt.
4. **Per-job exception containment**
   - failures in one job must not block processing others in same cycle.
5. **Retention guardrails**
   - prune only terminal states; enforce TTL + max count correctly; emit metrics when pruning.
6. **Operator signing checklist**
   - explicit pre-sign checklist: contract, method selector, decoded params, chain, gas, nonce.

## 6) Recommended controls (next)

- Add decoded function selector + decoded params snapshot to unsigned tx package.
- Add immutable audit log (append-only) for every state transition.
- Add alerting on repeated cycle failures and repeated MCP parse failures.
- Pin exact OpenAI model version and add schema-constrained output mode where possible.
