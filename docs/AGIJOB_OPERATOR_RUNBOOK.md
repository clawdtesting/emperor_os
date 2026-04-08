# AGIJobManager Operator Runbook — Emperor_OS
_For operators running the AGIJobManager v1/v2 applicant lane end-to-end_

---

## Prerequisites

```bash
# Required env vars
export ETH_RPC_URL="https://your-rpc-endpoint"
export AGENT_ADDRESS="0x..."          # our agent wallet address
export AGENT_SUBDOMAIN="emperor-os.alpha.agent.agi.eth"
export PINATA_JWT="..."               # for IPFS pinning
export AGI_ALPHA_MCP="https://..."   # MCP endpoint
```

**Never set `WALLET_PRIVATE_KEY` or `AGENT_PRIVATE_KEY` in any env.**
Signing is done exclusively via MetaMask + Ledger hardware key.

---

## Lifecycle Overview

```
DISCOVER -> EVALUATE -> APPLY (unsigned) -> [OPERATOR SIGNS] -> ASSIGNED -> EXECUTE -> COMPLETE (unsigned) -> [OPERATOR SIGNS] -> DONE
```

### TX Lifecycle Lane (Mission Control)

Each unsigned transaction package follows:

```
READY  ->  SIGNED  ->  BROADCAST  ->  FINALIZED
  |           |            |              |
  |   Operator reviews     |    Operator confirms
  |   ABI decode +         |    receipt in block
  |   gas simulation       |    explorer
  |   in MetaMask/Ledger   |
  v           v            v              v
unsigned   signed tx    txHash        block receipt
  .json     captured    captured      finalized
```

---

## Step 1: Run the Monitor Loop

**v1 scheduled runner (GitHub Actions):**
```bash
node loops/AGIJobManager-v1/runner.js
```

**Or run one cycle manually:**
```js
import { runOneCycle } from "./loops/AGIJobManager-v1/runner.js";
await runOneCycle();
```

The runner performs preflight checks (RPC + MCP reachability), then discovers and evaluates open jobs.

---

## Step 2: Review Discovered Jobs

Check `agent/state/jobs/` for job state files:
```bash
ls agent/state/jobs/
cat agent/state/jobs/v1_42.json   # v1 job
cat agent/state/jobs/v2_123.json  # v2 job
```

Key fields:
- `status`: current lifecycle stage
- `jobId`: versioned ID (e.g., `v1_42` or `v2_123`)
- `_contractVersion`: which contract (`v1` or `v2`)

### v1 vs v2 Differences

| Aspect | v1 | v2 |
|--------|----|----|
| Job ID format | `v1_<n>` | `v2_<n>` |
| Contract | AGIJobManager (0xB3AA...) | AGIJobManager V2 (0x...) |
| Payout field | `payout` | `payoutAGIALPHA` |
| Spec field | `jobSpecURI` | `specURI` or `jobSpecUri` |

Both are normalized by `agent/job-normalize.js` to a common schema.

---

## Step 3: Apply to a Job (Unsigned TX)

The agent builds an unsigned `applyForJob` transaction package:

```bash
cat artifacts/job_v1_42/unsigned_apply.json
```

**Before signing, verify:**
1. Target contract address is in the allowlist (`agent/abi-registry.js`)
2. ABI-decode the calldata — confirm method name and parameters
3. Simulate the transaction (dry-run) to confirm it won't revert
4. Check gas estimate is reasonable for current network conditions

The `signing_manifest.json` contains all review information:
```bash
cat artifacts/job_v1_42/signing_manifest.json
```

---

## Step 4: Sign and Broadcast (Operator Action)

1. Open MetaMask with Ledger connected
2. Import the unsigned tx from the signing manifest
3. Verify: contract address, method, parameters, gas limit
4. Sign with Ledger hardware key
5. Broadcast the signed transaction
6. Record the txHash in state:

```js
// After broadcast, update job state with receipt
import { setJobState } from "./agent/state.js";
await setJobState("v1_42", {
  receipts: [{ action: "apply", txHash: "0x...", status: "pending", broadcastAt: new Date().toISOString() }],
});
```

---

## Step 5: Monitor Assignment

After apply tx is confirmed on-chain, the next monitor cycle will detect assignment:
- Job status transitions to `assigned` or `in_progress`
- The agent begins execution automatically (artifact generation, IPFS publication)

---

## Step 6: Complete Job (Unsigned TX)

When execution finishes, an unsigned `requestJobCompletion` tx is generated:

```bash
cat artifacts/job_v1_42/unsigned_completion.json
cat artifacts/job_v1_42/signing_manifest.json
```

**Pre-sign checklist:**
- [ ] `deliverable.md` exists and is substantive
- [ ] `validation_report.json` shows all checks passed
- [ ] `publish_manifest.json` has valid IPFS CID
- [ ] `job_completion.json` references correct completionURI
- [ ] ABI decode of unsigned tx confirms `requestJobCompletion(jobId, completionURI)`
- [ ] Dry-run simulation succeeds

Follow the same sign-and-broadcast procedure as Step 4.

---

## Go-Live Procedure

Before enabling unattended scheduled workflows:

1. **Verify preflight passes:**
   ```bash
   node -e "import('./agent/preflight.js').then(m => m.runPreflight())"
   ```

2. **Verify contract validation:**
   ```bash
   node scripts/validate-contracts.mjs
   ```

3. **Run one manual cycle and inspect output:**
   ```bash
   node loops/AGIJobManager-v1/runner.js  # observe logs
   ls agent/state/jobs/                    # check state files
   ```

4. **Enable GitHub Actions schedule** (`.github/workflows/autonomous.yml`)

5. **Monitor first 3 scheduled runs** in mission-control Operations Lane

---

## Rollback Procedure

If a scheduled run produces incorrect state or unexpected behavior:

1. **Disable the workflow immediately:**
   - Go to GitHub Actions > `autonomous.yml` > Disable workflow

2. **Inspect state on disk:**
   ```bash
   cat agent/state/jobs/<jobId>.json
   ls artifacts/job_<jobId>/
   ```

3. **Roll back job state if needed:**
   ```js
   import { setJobState } from "./agent/state.js";
   await setJobState("v1_42", { status: "discovered" });
   ```

4. **Never roll back an on-chain transaction.** If a tx was broadcast and confirmed, the on-chain state is authoritative. Adjust local state to match chain reality.

5. **Re-enable workflow** only after root cause is identified and fixed.

---

## Emergency Pause

For immediate halt of all autonomous execution:

1. **Disable both scheduled workflows** in GitHub Actions:
   - `autonomous.yml` (AGIJobManager loop)
   - `procurement.yml` (Prime procurement loop)

2. **Kill any running monitor processes:**
   ```bash
   pkill -f "runner.js"
   pkill -f "run_once.js"
   ```

3. **Do NOT delete state files** — they are needed for recovery analysis.

4. **Check mission-control** for any broadcast-pending transactions that need receipt confirmation.

5. **Post-incident:** Review `agent/state/jobs/` and `agent/artifacts/proc_*/` for any state that drifted from chain reality. Reconcile before re-enabling.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `rawJobId` returns NaN | Passing versioned ID directly to `Number()` | Use `rawJobId()` from `agent/state.js` |
| Preflight fails: RPC | Bad `ETH_RPC_URL` or provider down | Check URL, try `curl $ETH_RPC_URL` |
| Preflight fails: MCP | Bad `AGI_ALPHA_MCP` or service down | Check endpoint, verify with `get_protocol_info` |
| Unsigned tx expired | TX package too old, chain state changed | Re-run monitor cycle to regenerate |
| Contract not in allowlist | New contract address | Add to `agent/abi-registry.js` |
| v2 job not discovered | v2 adapter not registered | Check `contracts/registry.js` |
