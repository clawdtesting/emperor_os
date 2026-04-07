# instructions_final.md

## Purpose

This is the authoritative operations document for Emperor_OS autonomous execution with human-controlled, Ledger-only signing.

The system model is **strictly**:

- Autonomous off-chain execution by the worker.
- Human-reviewed, MetaMask-mediated, Ledger-approved on-chain signing and broadcast.

The worker **must never** sign or broadcast transactions.

---

## Root Constraint and Workspace

All active logic and artifacts must stay under:

`/home/ubuntu/emperor_OS/.openclaw/workspace`

Required workspace layout:

```text
/home/ubuntu/emperor_OS/.openclaw/workspace/
  agent/
  prompts/
  docs/
  artifacts/
  state/
  debug/
```

Per-job artifacts:

```text
/home/ubuntu/emperor_OS/.openclaw/workspace/artifacts/job_<jobId>/
```

Required per-job files:

- `raw_spec.json`
- `normalized_spec.json`
- `brief.json`
- `deliverable.md`
- `validation_report.json`
- `publish_manifest.json`
- `job_completion.json`
- `unsigned_apply.json`
- `unsigned_completion.json`
- `signing_manifest.json` (**required canonical review object**)

---

## Core Control Principles

1. **Never auto-sign, never auto-broadcast.**
   - Forbidden: hot wallet signing, private key signing for apply/completion, automatic broadcast.
   - Required signing boundary: MetaMask review -> Ledger approval by human operator.

2. **No execution before canonical assignment confirmation.**
   - Forbidden: `apply -> execute` without on-chain assignment check.
   - Required: `apply -> human sign/broadcast -> assigned confirmation -> execute`.

3. **Deterministic logic for control plane.**
   - Code decides filtering, scoring, validation, tx package construction checks, and state transitions.
   - LLM is used only for deliverable content generation.

4. **One LLM generation pass per job by default.**
   - No automatic multi-pass refinement unless explicitly enabled and reviewed.

---

## Pipeline (Required)

`discover -> fetch spec -> normalize spec -> strategy/score -> build unsigned apply package -> human review + Ledger sign + broadcast -> confirm assigned -> build brief -> generate deliverable -> validate -> publish artifacts -> build job_completion.json -> build unsigned completion package -> human review + Ledger sign + broadcast -> reconcile receipt and finalize state`

---

## Discover, Spec, and Strategy Rules

### Discover

The worker must:

- Call MCP `list_jobs`.
- Skip terminal jobs (e.g., Completed, Disputed, Cancelled, Closed, Expired).
- Skip jobs assigned to other agents.
- Track jobs already assigned to configured operator/agent when relevant.

### Spec

The worker must:

- Fetch `jobSpecURI`.
- Save raw payload as `raw_spec.json`.
- Normalize required fields into `normalized_spec.json` (title, category, details, constraints, deliverables, audience, format).

### Strategy

Use deterministic scoring/rules. Prefer skip over risky submission.

Hard-skip examples:

- Missing/unreadable spec.
- Unsupported requirements.
- Confidence below threshold.
- Red flags exceeding policy.

---

## MCP Write-Call Policy (Unsigned Builder Only)

MCP write-oriented methods such as `apply_for_job(...)` and `requestJobCompletion(...)` are allowed **only** as unsigned transaction builders.

### Runtime rejection rule (mandatory)

For every MCP write-call response:

1. Parse response as structured data.
2. Accept only if it conforms to the unsigned package schema in this document.
3. Reject immediately if response includes any send/sign/broadcast semantics.

### Allowed response class

Unsigned tx-construction payload only, e.g.:

- `to`
- `data`
- `value`
- `chainId`
- metadata fields defined by schema

### Forbidden response class (hard fail)

Any indication of side-effectful submission, including (non-exhaustive):

- `txHash`
- `signedRawTx`
- `rawSignedTransaction`
- broadcast result/receipt
- submit confirmation
- any field or message indicating transaction was sent, signed, or mined

If forbidden fields/semantics are present, mark job state as `rejected_non_unsigned_builder_response` and do not continue.

---

## Strict Unsigned Package Schema (Required)

All unsigned packages must declare:

- `schema: "emperor-os/unsigned-tx/v1"`

### Required fields

- `schema`
- `kind` (`requestJobApplication` or `requestJobCompletion`)
- `jobId`
- `contract`
- `chainId`
- `to`
- `data`
- `value`
- `generatedAt` (ISO-8601 UTC)
- **either** `expiresAt` (ISO-8601 UTC) **or** `maxAgeSeconds` (integer > 0)
- `reviewMessage`

### Optional fields

- `jobCompletionURI`
- `deliverableURI`
- `agentSubdomain`
- `abiRef`
- `expectedSelector`
- `nonce` (if present, still human-reviewed)
- additional non-side-effect metadata

### Value policy (hard fail closed)

- `value` must be `"0"` unless nonzero value is explicitly required by protocol.
- If nonzero value is required, package must include explicit rationale metadata and expected amount.
- Any unexpected nonzero value is a hard fail: do not sign.

---

## Contract/Network Allowlist Source of Truth

Allowlist source of truth must be maintained in:

- `/home/ubuntu/emperor_OS/.openclaw/workspace/state/allowlists.json`

Minimum structure:

```json
{
  "schema": "emperor-os/allowlists/v1",
  "networks": {
    "1": {
      "name": "ethereum-mainnet",
      "contracts": {
        "AGIJobManager": "0xB3AAeb69b630f0299791679c063d68d6687481d1"
      }
    }
  }
}
```

Pre-sign checks must use this allowlist and fail closed if chain/contract mismatch.

---

## Mandatory Signing Manifest (Canonical Review Object)

Before any signing attempt, the worker must produce:

- `artifacts/job_<jobId>/signing_manifest.json`

This file is the canonical review object and must bind reviewed artifacts to the exact unsigned payload.

Required manifest fields:

- `schema` (e.g., `emperor-os/signing-manifest/v1`)
- `generatedAt`
- `expiresAt`
- `kind`
- `jobId`
- `contract`
- `chainId`
- `deliverableUri`
- `jobCompletionUri`
- `unsignedTx` object (`to`, `data`, `value`, `chainId`, and `kind`)
- `hashes.sha256.deliverableMd`
- `hashes.sha256.jobCompletionJson`
- `hashes.sha256.publishManifestJson`
- `hashes.sha256.unsignedPackageJson` (`unsigned_apply.json` or `unsigned_completion.json`)

Human review before Ledger approval must be based on `signing_manifest.json`, not visual inspection alone.

---

## Mandatory ABI Decode Verification (Before Ledger Signing)

“Data is present” is insufficient.

Before signing any unsigned package, the transaction calldata must be ABI-decoded and verified against reviewed artifacts.

Required checks:

1. Function selector matches intended method for `kind`.
2. `to` / target contract matches allowlist for `chainId`.
3. Decoded `jobId` equals:
   - folder `job_<jobId>` value,
   - package `jobId`, and
   - metadata job id references.
4. For completion:
   - decoded `jobCompletionURI` equals reviewed completion URI.
5. Where applicable:
   - decoded `subdomain`, `spender`, and any additional arguments equal reviewed values.

If decode fails or any field mismatches: **do not sign**.

---

## Mandatory Pre-Sign Simulation (Must Pass)

Before MetaMask + Ledger signing, simulate the **exact** transaction:

- same `to`
- same `data`
- same `value`
- same `from`
- same chain

Applies to:

- `unsigned_apply.json`
- `unsigned_completion.json`

Rules:

- If simulation fails/would revert, signing is forbidden.
- Record simulation result in job folder.
- On failure, write revert reason/error into artifact (e.g., `simulation_report.json`) and stop.

---

## Freshness / Anti-Replay Policy

`generatedAt` alone is insufficient.

Unsigned packages must include expiration controls:

- `generatedAt`
- and `expiresAt` or `maxAgeSeconds`

Pre-sign freshness checks (mandatory):

1. Compute current age from `generatedAt`.
2. If expired by `expiresAt` or age exceeds `maxAgeSeconds`, reject as stale.
3. Immediately before completion signing, perform fresh canonical `get_job(jobId)`.
4. Confirm job is still assigned/valid and not terminal.

If stale or state changed, regenerate package and manifest. Never sign stale packages.

---

## Post-Sign / Post-Broadcast Reconciliation Policy

System state must not advance on assumption.

After human signs and broadcasts via MetaMask:

1. Record `txHash` in job artifacts/state.
2. Track until terminal chain outcome (confirmed success, reverted, dropped, or replaced).
3. Persist receipt/outcome artifact (e.g., `tx_receipt.json`).
4. Advance local job state only on confirmed successful chain outcome.
5. Handle failures explicitly:
   - **reverted**: mark failed_onchain_revert and capture revert details.
   - **dropped**: mark dropped_unconfirmed and require operator action/regeneration.
   - **replaced**: record replacement hash and follow replacement receipt.
   - **failed broadcast**: mark broadcast_failed with error details.

No silent success assumptions are allowed.

---

## Human Authority and Actor Scope

- Worker responsibilities: discovery, normalization, scoring, deliverable generation, artifact publication, unsigned package preparation, manifest + verification artifacts.
- Worker prohibitions: signing, broadcasting, bypassing review.
- Human operator responsibility: review `signing_manifest.json`, verify MetaMask transaction, approve/reject on Ledger, optionally broadcast via MetaMask.

This boundary is mandatory and must not be weakened.

---

## ABI Source-of-Truth Policy (Local, Pinned Only)

ABI used for selector and calldata decoding must come from local pinned files only.

Source of truth location:

- `/home/ubuntu/emperor_OS/.openclaw/workspace/state/abis/`

Required controls:

1. ABI files must be version-pinned and committed to workspace state management.
2. Runtime must not fetch ABI dynamically from explorers, RPC metadata, or unpinned remote endpoints during signing review.
3. Unsigned package `abiRef` (if present) must resolve to a local pinned ABI path/version.
4. If ABI cannot be resolved locally and deterministically, decode verification fails closed.

If pinned ABI is missing/mismatched, mark as `rejected_unpinned_or_missing_abi` and do not sign.

---

## Contract Allowlist Enforcement Rule (Hard Fail)

Allowlist presence is not advisory; it is mandatory enforcement.

Required runtime rule:

1. Resolve expected contract for (`chainId`, `kind`) from allowlist source of truth.
2. Normalize addresses to checksum-insensitive canonical form.
3. Compare both package `contract` and package `to` to expected allowlisted address.
4. Require equality across all three values.

If any mismatch occurs, mark `rejected_contract_allowlist_mismatch` and stop.

---

## Nonce and Pending-Transaction Policy

Before signing, the operator workflow must verify nonce safety.

Required checks:

1. Obtain latest account nonce state (`latest` and `pending`) for signing account.
2. If package includes `nonce`, it must not be lower than network pending nonce.
3. If package omits `nonce`, MetaMask-assigned nonce must be reviewed against pending state before final approval.
4. Detect nonce collisions with own pending transactions for the same account.

Collision handling:

- If collision is unintended, reject and regenerate package.
- If replacement is intentional, package/manifest must explicitly declare replacement intent and expected replaced tx hash.

Record nonce decision in job artifacts (e.g., `nonce_report.json`).

---

## Idempotency Guard Per Job Phase

Each job phase must be idempotency-protected to prevent duplicate submissions.

Phases:

- `apply`
- `completion`

Required guard key:

- (`jobId`, `phase`, `unsignedPackageHash`, `signingManifestHash`)

Rules:

1. If a successful confirmed tx already exists for (`jobId`, `phase`), block new signing attempt unless explicit operator override is recorded.
2. If same idempotency key is already in-flight, block duplicate broadcast.
3. Phase transition is allowed only after confirmed chain outcome.

Duplicate prevention failures must be marked `blocked_duplicate_phase_submission`.

---

## Gas Sanity Checks Before Signing

Gas settings must be sanity-checked before Ledger approval.

Required checks:

1. Estimate gas for exact tx payload; if estimate fails, do not sign.
2. Reject obvious outliers versus local policy bounds (too low likely stuck, too high likely unsafe).
3. For EIP-1559:
   - verify `maxFeePerGas >= maxPriorityFeePerGas`
   - verify fee values are within configured safety bounds
4. For legacy gas price mode:
   - verify `gasPrice` is within configured safety bounds
5. Verify gas limit is not below estimate-required minimum.

Record results in `gas_report.json`.

If sanity checks fail, mark `rejected_gas_sanity_failure` and stop.

---

## IPFS Content Verification Before Signing

For completion transactions, referenced IPFS content must be verified before signing.

Required checks:

1. Resolve each reviewed URI from `publish_manifest.json` and `job_completion.json`.
2. Retrieve content bytes for referenced deliverable/completion metadata.
3. Compute local SHA-256 and compare to `signing_manifest.json` hashes.
4. Confirm URI-to-content mapping matches reviewed files (`deliverable.md`, `job_completion.json`, `publish_manifest.json`).

If content cannot be fetched, hash mismatch occurs, or URI mapping differs, reject signing and mark `rejected_ipfs_content_mismatch`.

---

## Failure Classification States (Required)

The worker must classify and persist failures explicitly using deterministic states.

Minimum required states:

- `rejected_non_unsigned_builder_response`
- `rejected_unpinned_or_missing_abi`
- `rejected_contract_allowlist_mismatch`
- `rejected_decode_mismatch`
- `rejected_simulation_failure`
- `rejected_stale_unsigned_package`
- `rejected_nonzero_value_unexpected`
- `rejected_gas_sanity_failure`
- `rejected_ipfs_content_mismatch`
- `blocked_duplicate_phase_submission`
- `broadcast_failed`
- `failed_onchain_revert`
- `dropped_unconfirmed`
- `replaced_tracking_active`
- `confirmed_onchain_success`

Each state transition must include timestamp, reason, and evidence artifact references.

---

## Operator Transaction Handling Rules

Operator actions must follow strict transaction handling rules for safety and traceability.

Required operator rules:

1. Never sign more than one unresolved tx per (`jobId`, `phase`) unless intentional replacement is documented.
2. If MetaMask proposes modified fields (nonce/gas/value/data/to), compare against manifest/package and reject unexpected drift.
3. After signing, capture tx hash immediately in job artifacts.
4. Monitor confirmation until terminal outcome; do not advance local phase state manually before reconciliation.
5. For dropped/replaced txs, update tracking records and require explicit next-step decision.
6. For revert outcomes, require remediation record before any retry.

Operator decision artifacts should be recorded in `operator_tx_log.json`.
