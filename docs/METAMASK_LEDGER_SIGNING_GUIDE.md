# metamask_ledger_handoff.md

## Purpose

This document defines the mandatory human handoff for MetaMask + Ledger signing.

Model:

- Worker prepares artifacts and unsigned transaction packages only.
- Human operator performs review and Ledger approval.
- Human operator may broadcast through MetaMask after Ledger approval.

The worker must never sign or broadcast.

---

## Paths and Review Scope

Root workspace:

`/home/ubuntu/emperor_OS/.openclaw/workspace`

Per-job folder:

`/home/ubuntu/emperor_OS/.openclaw/workspace/artifacts/job_<jobId>/`

Canonical review object:

- `signing_manifest.json` (mandatory)

Supporting files:

- `deliverable.md`
- `validation_report.json`
- `publish_manifest.json`
- `job_completion.json`
- `unsigned_apply.json`
- `unsigned_completion.json`

---

## Actor and Authority Boundary (Explicit)

### Worker (allowed)

- Build unsigned packages.
- Build signing manifest.
- Run decode + simulation + freshness checks.
- Write artifacts.

### Worker (forbidden)

- Sign transaction.
- Broadcast transaction.
- Return or accept signed/broadcasted tx semantics.

### Human operator (required authority)

- Review manifest + artifacts.
- Verify MetaMask transaction matches reviewed package.
- Approve/reject on Ledger.
- Broadcast via MetaMask only after approval.

---

## Unsigned Package Acceptance Rules

MCP write calls (e.g., `apply_for_job(...)`, `requestJobCompletion(...)`) are valid only when they return unsigned tx builder data.

### Required package schema

Every unsigned package must include:

- `schema: "emperor-os/unsigned-tx/v1"`
- `kind`
- `jobId`
- `contract`
- `chainId`
- `to`
- `data`
- `value`
- `generatedAt`
- `expiresAt` or `maxAgeSeconds`
- `reviewMessage`

Optional fields (if applicable):

- `jobCompletionURI`
- `deliverableURI`
- `agentSubdomain`
- `abiRef`
- `expectedSelector`

### Hard reject conditions

Reject the response/package if any sign/send side effect appears, including:

- `txHash`
- `signedRawTx` / `rawSignedTransaction`
- broadcast result or submission confirmation
- any semantic evidence transaction was already sent/signed/mined

---

## Contract/Network Allowlist Source of Truth

Use only:

- `/home/ubuntu/emperor_OS/.openclaw/workspace/state/allowlists.json`

Human must verify chain/contract in MetaMask against package + allowlist.

Fail closed on mismatch.

---

## Mandatory Pre-Sign Review Sequence

Do not sign because a file exists. Sign only after this sequence passes.

### Step 1: Review `signing_manifest.json` (canonical)

Confirm:

- schema/version is expected.
- `jobId`, `kind`, `contract`, `chainId` are correct.
- `deliverableUri` and `jobCompletionUri` are expected.
- unsigned tx fields (`to`, `data`, `value`, `chainId`) match package.
- SHA-256 hashes in manifest match:
  - `deliverable.md`
  - `job_completion.json`
  - `publish_manifest.json`
  - `unsigned_apply.json` or `unsigned_completion.json`

If any hash mismatch occurs: stop, do not sign.

### Step 2: Calldata decode verification (mandatory)

Decoded calldata must match reviewed intent.

Required checks:

1. Function selector equals intended method (`kind`).
2. `to` equals allowlisted contract for `chainId`.
3. Decoded `jobId` equals folder + package + metadata `jobId`.
4. For completion, decoded `jobCompletionURI` equals reviewed completion URI.
5. Any decoded `subdomain` / `spender` / additional args equal reviewed values.

If decode fails or mismatch exists: do not sign.

### Step 3: Pre-sign simulation (mandatory must-pass)

Simulate exact tx (same from/to/data/value/chain).

Rules:

- If simulation would fail/revert: signing forbidden.
- Revert reason/failure must be written to job folder.
- Applies to both `unsigned_apply.json` and `unsigned_completion.json`.

### Step 4: Freshness and state re-check (mandatory)

Check package freshness:

- `generatedAt` present.
- Not older than `maxAgeSeconds` and/or not beyond `expiresAt`.

For completion signing additionally:

- Run immediate fresh canonical `get_job(jobId)` re-check.
- Confirm job still assigned/valid/not terminal.

If stale or state changed: reject and regenerate.

### Step 5: Value policy (hard fail closed)

- Expected `value` is `"0"`.
- Nonzero value is hard-fail unless protocol-required and explicitly documented in package.

Unexpected nonzero value => do not sign.

---

## MetaMask + Ledger Execution Flow

1. Select correct Ledger-backed account in MetaMask.
2. Select correct network (`chainId` must match package and allowlist).
3. Construct tx from unsigned package (`to`, `data`, `value`, chain context).
4. Compare MetaMask transaction details against reviewed `signing_manifest.json` and package.
5. Approve only on Ledger device after final verification.
6. Human may broadcast via MetaMask.

---

## Post-Broadcast Reconciliation (Mandatory)

After broadcast, operations are not complete until reconciliation succeeds.

Required actions:

1. Record tx hash in job artifacts/state.
2. Wait for and record receipt/confirmation outcome.
3. Advance local state only after confirmed successful chain outcome.
4. Handle non-success outcomes explicitly:
   - reverted
   - dropped
   - replaced
   - broadcast failure

No implicit success assumptions.

---

## Refusal Conditions

Do not sign if any of the following occur:

- wrong account/network/contract
- schema violation or malformed package
- package includes sign/send side effects
- manifest hash mismatch
- calldata decode mismatch
- simulation failure/revert
- stale package
- fresh `get_job(jobId)` indicates invalid/terminal state
- unexpected nonzero value
- reviewer cannot clearly explain what is being approved

When in doubt: reject and regenerate artifacts.

---

## Summary

Required architecture:

- worker prepares unsigned-only artifacts
- human reviews canonical manifest and evidence
- MetaMask presents transaction
- Ledger approves signature
- human broadcasts
- system reconciles on-chain outcome before state advance

This preserves the Ledger-only signing model and the human review boundary.
