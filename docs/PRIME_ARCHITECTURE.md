# Prime Architecture — Emperor_OS
_Branch: claude/prime-operational-upgrade-9vzxt_

---

## System Overview

Emperor_OS is an **off-chain execution and packaging system** that supports on-chain
AGIJobManager settlement infrastructure. The Prime substrate added by this branch
extends the system to handle AGIJobDiscoveryPrime procurement flows while preserving
the core doctrine:

> **Autonomous off-chain job solving + human-signed on-chain execution**

---

## Four-Layer Model

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Governance / Operator Band                    │
│  review · approve · sign · broadcast · exception handle │
└───────────────────────────┬─────────────────────────────┘
                            │ human signs
┌───────────────────────────▼─────────────────────────────┐
│  Layer 3: Capability Archive                            │
│  prime-retrieval.js · archive/ · stepping stones        │
└───────────────────────────┬─────────────────────────────┘
                            │ retrieval-before-solve
┌───────────────────────────▼─────────────────────────────┐
│  Layer 2: Off-Chain Execution Layer (THIS REPO)         │
│                                                         │
│  Discovery    ┌──────────────────────────────────────┐  │
│  ─────────    │  Prime Substrate (new, this branch)  │  │
│  prime-       │  prime-client.js    (chain reads)    │  │
│  monitor.js   │  prime-inspector.js (snapshots)      │  │
│               │  prime-phase-model.js (state mach.)  │  │
│  Persistence  │  prime-next-action.js (what to do)   │  │
│  ─────────    │  prime-state.js     (persistence)    │  │
│  proc_<id>/   │  prime-artifact-builder.js           │  │
│  state.json   │  prime-tx-builder.js (unsigned txs)  │  │
│               │  prime-review-gates.js (hard stops)  │  │
│  Execution    │  prime-execution-bridge.js           │  │
│  ─────────    │  prime-retrieval.js  (archive)       │  │
│  execute.js   └──────────────────────────────────────┘  │
│  validate.js                                            │
│  submit.js (v1)                                         │
│                                                         │
│  Tx Handoff   unsigned tx JSON files → human review     │
└───────────────────────────┬─────────────────────────────┘
                            │ read-only RPC
┌───────────────────────────▼─────────────────────────────┐
│  Layer 1: On-Chain Environment                          │
│  AGIJobManager (0xB3AAeb69...)                          │
│  AGIJobDiscoveryPrime (0xd5EF1dde...)                   │
│  $AGIALPHA Token (0xa61a3B3a...)                        │
└─────────────────────────────────────────────────────────┘
```

---

## Module Map

All new Prime modules live under `.openclaw/workspace/agent/`:

| Module | Purpose |
|---|---|
| `prime-client.js` | Read-only typed RPC client for Contract 2. No signing. |
| `prime-phase-model.js` | Phase state machine constants, transitions, derivation. |
| `prime-inspector.js` | Produces inspection bundle from chain state. |
| `prime-next-action.js` | "What should operator do next?" engine. |
| `prime-state.js` | Per-procurement atomic state persistence. |
| `prime-artifact-builder.js` | Writes phase-specific artifact bundles. |
| `prime-tx-builder.js` | Builds unsigned tx packages (no signing). |
| `prime-review-gates.js` | Hard-stop precondition enforcement. |
| `prime-monitor.js` | Restart-safe monitoring loop. |
| `prime-execution-bridge.js` | Links Prime selection → AGIJobManager v1 execution. |
| `prime-retrieval.js` | Retrieval-before-solve, archive, stepping stones. |

---

## Artifact Directory Structure

```
.openclaw/workspace/artifacts/
├── job_<jobId>/                    ← AGIJobManager v1 artifacts (existing)
│   ├── raw_spec.json
│   ├── normalized_spec.json
│   ├── deliverable.md
│   ├── jobCompletion.json
│   ├── unsignedCompletion.json
│   └── procurement_provenance.json ← NEW: links back to proc_<id>
│
└── proc_<procurementId>/           ← NEW: Prime procurement artifacts
    ├── state.json                  ← Persistent state (PROC_STATUS machine)
    ├── chain_snapshot.json         ← Latest chain data (refreshed by monitor)
    ├── next_action.json            ← Latest next-action output
    ├── selection_to_execution_bridge.json
    ├── linked_job_execution_state.json
    │
    ├── inspection/                 ← Phase B artifacts
    │   ├── procurement_snapshot.json
    │   ├── linked_job_snapshot.json
    │   ├── normalized_job_spec.json
    │   ├── fit_evaluation.json
    │   ├── next_action.json
    │   └── review_manifest.json
    │
    ├── application/                ← Phase: commit
    │   ├── application_brief.md
    │   ├── application_payload.json
    │   ├── commitment_material.json ← SENSITIVE (salt)
    │   ├── unsigned_commit_tx.json
    │   └── review_manifest.json
    │
    ├── reveal/                     ← Phase: reveal
    │   ├── reveal_payload.json
    │   ├── commitment_verification.json
    │   ├── unsigned_reveal_tx.json
    │   └── review_manifest.json
    │
    ├── finalist/                   ← Phase: finalist acceptance
    │   ├── finalist_acceptance_packet.json
    │   ├── stake_requirements.json
    │   ├── trial_execution_plan.json
    │   ├── unsigned_accept_finalist_tx.json
    │   └── review_manifest.json
    │
    ├── trial/                      ← Phase: trial submission
    │   ├── trial_artifact_manifest.json
    │   ├── publication_record.json
    │   ├── fetchback_verification.json
    │   ├── unsigned_submit_trial_tx.json
    │   └── review_manifest.json
    │
    ├── selection/                  ← Phase: winner selection
    │   ├── selection_state_snapshot.json
    │   └── selected_agent_status.json
    │
    ├── completion/                 ← Phase: linked job completion
    │   ├── job_execution_plan.json
    │   ├── job_completion.json
    │   ├── completion_manifest.json
    │   ├── publication_record.json
    │   ├── fetchback_verification.json
    │   ├── unsigned_request_completion_tx.json
    │   └── review_manifest.json
    │
    └── retrieval/                  ← Archive + stepping stones
        ├── retrieval_packet_application.json
        ├── retrieval_packet_trial.json
        ├── stepping_stone_application.json
        └── stepping_stone_trial.json

.openclaw/workspace/archive/        ← Capability archive
├── index.json                      ← Searchable index of archive items
└── items/
    └── <id>.json                   ← Canonical extracted stepping-stone payload
```

---

## Canonical Flow

```
ProcurementCreated event
        │
        ▼
  prime-monitor.js discovers
  prime-inspector.js inspects → proc_<id>/inspection/
  prime-state.js creates state: DISCOVERED → INSPECTED
        │
        ▼ operator reviews fit_evaluation.json
  FIT_APPROVED or NOT_A_FIT
        │
        ▼ (if approved)
  prime-retrieval.js retrieval packet → search archive
  application markdown drafted + pinned to IPFS
  prime-artifact-builder.js writeApplicationBundle()
  prime-review-gates.js assertCommitGate()
  prime-tx-builder.js buildCommitApplicationTx()
  state: COMMIT_READY
        │
        ▼ operator signs unsigned_commit_tx.json (MetaMask + Ledger)
  state: COMMIT_SUBMITTED  [operator records tx hash]
        │
        ▼ monitor detects reveal window open
  prime-artifact-builder.js writeRevealBundle()
  prime-review-gates.js assertRevealGate()
  prime-tx-builder.js buildRevealApplicationTx()
  state: REVEAL_READY → REVEAL_SUBMITTED
        │
        ▼ monitor detects ShortlistFinalized
  state: SHORTLISTED or NOT_SHORTLISTED
        │
        ▼ (if shortlisted)
  prime-artifact-builder.js writeFinalistBundle()
  prime-review-gates.js assertFinalistAcceptGate()
  prime-tx-builder.js buildAcceptFinalistTx()
  state: FINALIST_ACCEPT_READY → FINALIST_ACCEPT_SUBMITTED
        │
        ▼ trial window opens
  prime-retrieval.js retrieval for trial phase
  trial deliverable executed (execute.js + validate.js)
  IPFS publication + fetchback verify
  prime-artifact-builder.js writeTrialBundle()
  prime-review-gates.js assertTrialSubmitGate()
  prime-tx-builder.js buildSubmitTrialTx()
  state: TRIAL_READY → TRIAL_SUBMITTED
        │
        ▼ scoring phase → winner designated
  state: SELECTED (or REJECTED)
        │
        ▼ (if selected)
  prime-execution-bridge.js activateBridge()
  fetchLinkedJobSpec() → completion/linked_job_spec.json
  state: JOB_EXECUTION_IN_PROGRESS
        │
        ▼ execute linked job (v1 pipeline)
  deliverable → IPFS → fetchback verify
  prime-artifact-builder.js writeCompletionBundle()
  prime-review-gates.js assertCompletionGate()
  prime-tx-builder.js buildRequestJobCompletionTx()
  state: COMPLETION_READY → COMPLETION_SUBMITTED → DONE
```

---

## Safety Properties

| Property | Implementation |
|---|---|
| No private key in runtime | No `ethers.Wallet` in any prime-*.js module |
| No signing in runtime | All prime-tx-builder outputs are unsigned JSON |
| No broadcasting in runtime | No `sendTransaction` anywhere in Prime substrate |
| Artifact-first | Every action writes artifacts before building tx |
| Review gates before tx | `assertXxxGate()` throws if preconditions not met |
| Atomic state writes | All state.json writes use tmp+rename pattern |
| Restart safe | Monitor resumes from persisted block cursors |
| Explicit transitions | `transitionProcStatus()` validates all moves |
| Human checklist | Every tx package includes reviewChecklist |

---

## What Was Superseded

`agi-agent/procurement_agent.js` violated the doctrine (signing, broadcasting, private key).
It is **not called** by the new Prime substrate. It is preserved for audit history only.
The new implementation is a complete, doctrine-compliant replacement.
