# Validation

Validation modules for the Emperor OS agent pipeline. Two distinct systems:

## Contract #1 — AGIJobManager v1 Dry-Run

**File:** `contract1-dryrun.js`

Simulates the complete validation → submit → reconcile pipeline for a v1 job without making on-chain calls or IPFS uploads. Produces a `dryrun_validation.json` report in the job's artifact directory.

### When to use

Run before signing any completion transaction. Catches missing artifacts, invalid content, broken IPFS URIs, malformed calldata, and illegal state transitions — before they reach the operator's Ledger.

### Checks

1. **Job state** — exists, valid status, consistent history
2. **Artifacts** — brief.json and deliverable.md present and readable
3. **Content** — length, structure, forbidden patterns, required sections
4. **Publication** — IPFS URI format, gateway URL constructibility
5. **Completion metadata** — all prerequisites met, schema valid
6. **Transaction** — calldata encodes correctly, selector `0x8d1bc00f`, target matches contract
7. **State transitions** — every step in the expected path is legal
8. **Pre-sign checks** — schema, chain ID, contract, selector, expiration
9. **Signing manifest** — buildable with complete review checklist

### Usage

```bash
# Single job
node validation/contract1-dryrun.js <jobId>

# Batch — all jobs
node validation/contract1-dryrun.js --batch

# Batch — filtered by status
node validation/contract1-dryrun.js --batch deliverable_ready
```

---

## Validator Role Lifecycle — AGIJobDiscoveryPrime

**Files:** `evidence-fetch.js`, `scoring-adjudicator.js`, `score-tx-handoff.js`, `settlement-reconciler.js`, `multi-validator-coord.js`, `dispute-resolver.js`, `lifecycle-branch.js`

Full validator pipeline for Prime procurements (Contract #2). Activates when the agent is assigned as a validator on-chain.

### Lifecycle states

```
IDLE → DISCOVERED → EVALUATING → COMMIT_READY → COMMIT_SUBMITTED
     → REVEAL_READY → REVEAL_SUBMITTED → SETTLED
```

### Modules

| Module | Purpose |
|---|---|
| `config.js` | Scoring thresholds, collusion detection, dispute settings |
| `evidence-fetch.js` | Fetches trial artifacts from IPFS + procurement state from chain |
| `scoring-adjudicator.js` | Multi-dimensional scoring: spec compliance (30%), artifact quality (25%), public verifiability (20%), deadline adherence (15%), reuse value (10%) |
| `score-tx-handoff.js` | Builds unsigned score commit/reveal tx packages with review manifests |
| `settlement-reconciler.js` | Aggregates on-chain scores, detects outliers, computes consensus winner, reconciles against on-chain winner event |
| `multi-validator-coord.js` | Score aggregation (mean/median/trimmed mean), collusion detection, consensus computation, reputation tracking |
| `dispute-resolver.js` | Dispute detection on score divergence, evidence collection workflow, lifecycle state machine |
| `lifecycle-branch.js` | 8-state validator state machine with transition validation and proc status mapping |

### Operator handoff points

- `VALIDATOR_SCORE_COMMIT_READY` → sign `unsigned_score_commit_tx.json`
- `VALIDATOR_SCORE_REVEAL_READY` → sign `unsigned_score_reveal_tx.json`

### Gates

Both commit and reveal pass through review gates in `prime-review-gates.js`:
- Chain phase must be SCORE_COMMIT / SCORE_REVEAL
- All scoring artifacts must exist (evidence bundle, adjudication result, payloads)
- Validator assignment must be chain-confirmed
- Commitment continuity verified (reveal hash matches prior commit)

---

## Tests

```bash
node validation/validation.test.js
```

41 tests covering scoring adjudication, multi-validator coordination, dispute resolution, lifecycle state machine, and Contract #1 dry-run tx encoding.
