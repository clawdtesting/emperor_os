# Prime Unsigned Tx Handoff Spec — Emperor_OS
_Reference: `.openclaw/workspace/agent/prime-tx-builder.js`_

---

## Core Doctrine

Emperor_OS never signs or broadcasts transactions.  
Every write action produces a JSON file the operator reads, verifies, and executes
via **MetaMask + Ledger**.

This document specifies the exact schema and operator workflow for every Prime tx.

---

## Canonical Unsigned Tx Schema

Schema identifier: `"emperor-os/prime-unsigned-tx/v1"`

```json
{
  "schema":          "emperor-os/prime-unsigned-tx/v1",
  "chainId":         1,
  "target":          "0x<contract address>",
  "contractName":    "AGIJobDiscoveryPrime | AGIJobManager",
  "function":        "functionName",
  "args":            { "<argName>": "<argValue>" },
  "calldata":        "0x<abi-encoded hex>",
  "decodedCall":     "functionName(arg0=val0, arg1=val1, ...)",
  "generatedAt":     "ISO 8601 timestamp",
  "phase":           "COMMIT | REVEAL | FINALIST_ACCEPT | TRIAL | COMPLETION",
  "procurementId":   "123",
  "linkedJobId":     "456",
  "preconditions":   ["condition 1", "condition 2"],
  "artifactBindings": [
    { "file": "relative/path", "role": "description" }
  ],
  "reviewChecklist": ["checklist item 1", "checklist item 2"],
  "reviewMessage":   "Human-readable instruction",
  "safety": {
    "noPrivateKeyInRuntime": true,
    "noSigningInRuntime":    true,
    "noBroadcastInRuntime":  true
  }
}
```

### Mandatory safety fields

Every package must include:
- `chainId` — must be 1 (Ethereum Mainnet). Reject if different.
- `target` — the exact contract address to call. Verify against known addresses.
- `decodedCall` — human-readable decoded function call. Never rely on raw calldata alone.
- `preconditions` — list of conditions that must be true before signing.
- `artifactBindings` — which local artifact files back this tx.
- `reviewChecklist` — every item must be ticked before signing.

### Never sign a tx package that is missing `decodedCall`.

---

## Per-Action Handoff Files

### 1. commitApplication

**File:** `artifacts/proc_<id>/application/unsigned_commit_tx.json`  
**Contract:** AGIJobDiscoveryPrime (`0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29`)  
**Function:** `commitApplication(uint256 procurementId, bytes32 commitment, string subdomain, bytes32[] proof)`

**Review checklist:**
1. Confirm procurementId matches the intended procurement
2. Confirm commitment hash matches `application/commitment_material.json`
3. Confirm subdomain is our registered agent subdomain
4. Confirm merkle proof matches the registered proof
5. Confirm commit window is still open (check `inspection/deadlines_and_windows.json`)
6. Confirm chainId = 1

**Gate:** Run `assertCommitGate()` before building this tx.  
**Salt warning:** After broadcasting, the salt in `commitment_material.json` must remain
secret until the reveal phase.

---

### 2. revealApplication

**File:** `artifacts/proc_<id>/reveal/unsigned_reveal_tx.json`  
**Contract:** AGIJobDiscoveryPrime  
**Function:** `revealApplication(uint256 procurementId, string subdomain, bytes32[] proof, bytes32 salt, string applicationURI)`

**Review checklist:**
1. Confirm reveal window is open
2. Confirm salt in this tx matches `application/commitment_material.json`
3. Confirm applicationURI matches the URI used to compute the commitment
4. Confirm `reveal/commitment_verification.json` shows `verificationPassed = true`
5. Confirm subdomain and proof are correct
6. Confirm chainId = 1

**Gate:** Run `assertRevealGate()` before building this tx.

---

### 3. acceptFinalist

**File:** `artifacts/proc_<id>/finalist/unsigned_accept_finalist_tx.json`  
**Contract:** AGIJobDiscoveryPrime  
**Function:** `acceptFinalist(uint256 procurementId)`

**Review checklist:**
1. Confirm our agent address is in the ShortlistFinalized event finalists list
2. Confirm finalist accept window is open
3. Confirm stake requirements are reviewed (`finalist/stake_requirements.json`)
4. Confirm trial plan is feasible (`finalist/trial_execution_plan.json`)
5. Confirm chainId = 1

**Gate:** Run `assertFinalistAcceptGate()` before building this tx.

---

### 4. submitTrial

**File:** `artifacts/proc_<id>/trial/unsigned_submit_trial_tx.json`  
**Contract:** AGIJobDiscoveryPrime  
**Function:** `submitTrial(uint256 procurementId, string trialURI)`

**Review checklist:**
1. Confirm trialURI matches `trial/publication_record.json` and is reachable
2. Confirm `trial/fetchback_verification.json` shows `verified = true`
3. Confirm trial window is open
4. Confirm procurementId is correct
5. Confirm chainId = 1

**Gate:** Run `assertTrialSubmitGate()` before building this tx.

---

### 5. requestJobCompletion (Prime-linked)

**File:** `artifacts/proc_<id>/completion/unsigned_request_completion_tx.json`  
**Contract:** AGIJobManager (`0xB3AAeb69b630f0299791679c063d68d6687481d1`)  
**Function:** `requestJobCompletion(uint256 jobId, string completionURI, string subdomain)`

**Review checklist:**
1. Confirm we are the selected agent (`selection/selected_agent_status.json`)
2. Confirm completionURI is reachable
3. Confirm `completion/fetchback_verification.json` shows `verified = true`
4. Confirm jobId is the correct linked job (not the procurementId)
5. Confirm target is AGIJobManager (Contract 1), not Prime contract
6. Confirm chainId = 1

**Gate:** Run `assertCompletionGate()` before building this tx.

---

## Operator Signing Workflow

1. Open the unsigned tx JSON file in a text editor or JSON viewer
2. Verify all fields match expectations (contract address, function, args)
3. Verify `decodedCall` matches what you expect
4. Tick every item in `reviewChecklist`
5. Simulate the tx in MetaMask before confirming (use "Simulation" tab if available)
6. Sign with Ledger hardware key
7. Broadcast via MetaMask
8. Record the resulting tx hash in the procurement state (`state.json`)
9. Transition the procurement status via `transitionProcStatus()`

---

## Key Addresses (Mainnet)

| Contract | Address |
|---|---|
| AGIJobDiscoveryPrime | `0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29` |
| AGIJobManager | `0xB3AAeb69b630f0299791679c063d68d6687481d1` |
| $AGIALPHA Token | `0xa61a3B3a130a9c20768EEBF97E21515A6046a1fA` |

Chain ID: **1** (Ethereum Mainnet)

---

## What a Valid Tx Package Looks Like (Annotated)

```json
{
  "schema": "emperor-os/prime-unsigned-tx/v1",
  "chainId": 1,
  "target": "0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29",
  "contractName": "AGIJobDiscoveryPrime",
  "function": "commitApplication",
  "args": {
    "procurementId": "42",
    "commitment": "0xabc123...def456",
    "subdomain": "emperor-os.alpha.agent.agi.eth",
    "proof": ["0x1234...", "0x5678..."]
  },
  "calldata": "0x...(hex)...",
  "decodedCall": "commitApplication(procurementId=42, commitment=0xabc123..., subdomain=emperor-os.alpha.agent.agi.eth, proof=[...])",
  "generatedAt": "2026-04-01T00:00:00.000Z",
  "phase": "COMMIT",
  "procurementId": "42",
  "linkedJobId": "99",
  "preconditions": [
    "Commitment hash computed correctly: keccak256(procurementId, agentAddress, applicationURI, salt)",
    "Application markdown pinned to IPFS and applicationURI recorded in commitment_material.json",
    "Commit window is currently open"
  ],
  "artifactBindings": [
    { "file": "application/application_brief.md", "role": "Application content" },
    { "file": "application/commitment_material.json", "role": "Salt and commitment hash source" }
  ],
  "reviewChecklist": [
    "Confirm procurementId matches the intended procurement",
    "Confirm commitment hash in this tx matches commitment_material.json",
    "Confirm commit window has not expired"
  ],
  "safety": {
    "noPrivateKeyInRuntime": true,
    "noSigningInRuntime": true,
    "noBroadcastInRuntime": true
  }
}
```
