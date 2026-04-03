# Prime Operator Runbook — Emperor_OS
_For fresh operators running the Prime workflow end-to-end_

---

## Prerequisites

Before running any Prime workflow:

```bash
# Required env vars
export ETH_RPC_URL="https://your-rpc-endpoint"
export AGENT_ADDRESS="0x..."          # our agent wallet address
export AGENT_SUBDOMAIN="emperor-os.alpha.agent.agi.eth"
export AGENT_MERKLE_PROOF='["0x...","0x..."]'  # JSON array of bytes32
export PINATA_JWT="..."               # for IPFS pinning
export AGI_ALPHA_MCP="https://..."   # MCP endpoint

# Working directory (set to your runtime workspace root)
# Example:
export WORKSPACE_ROOT="$HOME/.openclaw/workspace"
```

**Never set `AGENT_PRIVATE_KEY` in any workspace module.**  
Signing is done exclusively via MetaMask + Ledger hardware key.

---

## Step 1: Inspect a Procurement

**Run the monitor to discover procurements:**
```js
import { startPrimeMonitor } from "./agent/prime-monitor.js";
await startPrimeMonitor({ agentAddress: process.env.AGENT_ADDRESS, once: true });
```

**Or inspect a specific procurement by ID:**
```js
import { inspectProcurement, printInspectionSummary } from "./agent/prime-inspector.js";

const bundle = await inspectProcurement({
  procurementId: 42,
  agentAddress:  process.env.AGENT_ADDRESS,
  writeArtifacts: true,
});
printInspectionSummary(bundle);
```

**Output files:** `artifacts/proc_42/inspection/`

---

## Step 2: Decide Fit

Read `artifacts/proc_42/inspection/fit_evaluation.json`.

If approved:
```js
import { transitionProcStatus } from "./agent/prime-state.js";
import { PROC_STATUS } from "./agent/prime-phase-model.js";
await transitionProcStatus(42, PROC_STATUS.FIT_APPROVED);
```

If rejected:
```js
await transitionProcStatus(42, PROC_STATUS.NOT_A_FIT);
```

---

## Step 3: Commit (Application Phase)

**Build the application:**
```js
import { generateSalt, computeCommitment } from "./agent/prime-client.js";
import { writeApplicationBundle } from "./agent/prime-artifact-builder.js";

// 1. Draft application markdown (one LLM call or manual)
const applicationMarkdown = "...";

// 2. Pin to IPFS via Pinata
const applicationURI = "ipfs://Qm...";

// 3. Generate commitment material
const salt           = generateSalt();
const commitmentHash = computeCommitment(42, process.env.AGENT_ADDRESS, applicationURI, salt);

// 4. Write application bundle
await writeApplicationBundle(42, {
  applicationMarkdown,
  applicationURI,
  commitmentSalt:  salt,
  commitmentHash,
  agentAddress:    process.env.AGENT_ADDRESS,
  agentSubdomain:  process.env.AGENT_SUBDOMAIN,
  merkleProof:     JSON.parse(process.env.AGENT_MERKLE_PROOF),
});
```

**Run the gate and build unsigned tx:**
```js
import { assertCommitGate } from "./agent/prime-review-gates.js";
import { buildCommitApplicationTx } from "./agent/prime-tx-builder.js";
import { fetchProcurement } from "./agent/prime-client.js";

const procStruct = await fetchProcurement(42);
await assertCommitGate({ procurementId: 42, procStruct });

const { path: txPath } = await buildCommitApplicationTx({
  procurementId: 42,
  linkedJobId:   procStruct.jobId,
  commitment:    commitmentHash,
  subdomain:     process.env.AGENT_SUBDOMAIN,
  merkleProof:   JSON.parse(process.env.AGENT_MERKLE_PROOF),
  applicationArtifactPath: "artifacts/proc_42/application/application_brief.md",
});

console.log(`Unsigned tx ready: ${txPath}`);
// Transition state
await transitionProcStatus(42, PROC_STATUS.COMMIT_READY);
```

**Operator action:**
1. Open `artifacts/proc_42/application/unsigned_commit_tx.json`
2. Verify all fields (see `prime_unsigned_handoff_spec.md`)
3. Sign and broadcast via MetaMask + Ledger
4. Record tx hash:
```js
await setProcState(42, { commitTxHash: "0x..." });
await transitionProcStatus(42, PROC_STATUS.COMMIT_SUBMITTED);
```

---

## Step 4: Reveal

Wait for the monitor to detect the reveal window opening.

Check: `artifacts/proc_42/chain_snapshot.json` → `chainPhase === "REVEAL_OPEN"`

**Build reveal bundle and unsigned tx:**
```js
import { writeRevealBundle } from "./agent/prime-artifact-builder.js";
import { assertRevealGate } from "./agent/prime-review-gates.js";
import { buildRevealApplicationTx } from "./agent/prime-tx-builder.js";
import { readProcCheckpoint } from "./agent/prime-state.js";

// Load commitment material (salt + URI)
const commitMat = await readProcCheckpoint(42, "application/commitment_material.json");
// note: readProcCheckpoint reads from the root, but commitment_material is in a subdir
// use readJson() directly:
import { readJson } from "./agent/prime-state.js";
const commitMat2 = await readJson("artifacts/proc_42/application/commitment_material.json");

// Re-verify commitment
import { computeCommitment } from "./agent/prime-client.js";
const recomputed = computeCommitment(42, process.env.AGENT_ADDRESS, commitMat2.applicationURI, commitMat2.salt);
const verificationPassed = recomputed === commitMat2.commitmentHash;

await writeRevealBundle(42, {
  commitmentSalt:    commitMat2.salt,
  commitmentHash:    commitMat2.commitmentHash,
  applicationURI:    commitMat2.applicationURI,
  agentAddress:      process.env.AGENT_ADDRESS,
  agentSubdomain:    process.env.AGENT_SUBDOMAIN,
  merkleProof:       JSON.parse(process.env.AGENT_MERKLE_PROOF),
  verificationPassed,
});

const procStruct = await fetchProcurement(42);
await assertRevealGate({ procurementId: 42, procStruct });
const { path: txPath } = await buildRevealApplicationTx({
  procurementId: 42,
  linkedJobId:   procStruct.jobId,
  subdomain:     process.env.AGENT_SUBDOMAIN,
  merkleProof:   JSON.parse(process.env.AGENT_MERKLE_PROOF),
  salt:          commitMat2.salt,
  applicationURI: commitMat2.applicationURI,
});
await transitionProcStatus(42, PROC_STATUS.REVEAL_READY);
```

**Operator action:** Sign and broadcast `reveal/unsigned_reveal_tx.json`.  
Record tx hash → transition to `REVEAL_SUBMITTED`.

---

## Step 5: Shortlist (Monitor)

The monitor polls for `ShortlistFinalized` events. When our agent is in the finalists list,
it sets `state.shortlisted = true` and the status transitions to `SHORTLISTED`.

Check status:
```js
import { getProcState } from "./agent/prime-state.js";
const state = await getProcState(42);
console.log(state.shortlisted, state.status);
```

If `NOT_SHORTLISTED`, no further action.

---

## Step 6: Finalist Acceptance

```js
import { writeFinalistBundle } from "./agent/prime-artifact-builder.js";
import { assertFinalistAcceptGate } from "./agent/prime-review-gates.js";
import { buildAcceptFinalistTx } from "./agent/prime-tx-builder.js";

await writeFinalistBundle(42, {
  stakeRequirements:  { requiredStake: "0", currency: "ETH", notes: "No stake required." },
  trialExecutionPlan: { approach: "Solve via existing job pipeline", timeline: "within trial window" },
});

const procStruct = await fetchProcurement(42);
await assertFinalistAcceptGate({ procurementId: 42, procStruct });
const { path: txPath } = await buildAcceptFinalistTx({
  procurementId: 42,
  linkedJobId:   procStruct.jobId,
});
await transitionProcStatus(42, PROC_STATUS.FINALIST_ACCEPT_READY);
```

**Operator action:** Sign and broadcast `finalist/unsigned_accept_finalist_tx.json`.  
Record tx hash → transition to `FINALIST_ACCEPT_SUBMITTED`.

---

## Step 7: Trial Submission

When trial window opens, execute the work:

```js
// 1. Fetch linked job spec
import { fetchLinkedJobSpec } from "./agent/prime-execution-bridge.js";
const specContent = await fetchLinkedJobSpec({ procurementId: 42, linkedJobId: procStruct.jobId });

// 2. Execute (use execute.js + validate.js from v1 pipeline)
// Max 1 LLM call. Deliverable must pass quality validation.

// 3. Pin to IPFS
const trialURI = "ipfs://Qm...";

// 4. Fetchback verify
const fetchbackVerification = { uri: trialURI, fetchedAt: new Date().toISOString(), verified: true };

// 5. Write trial bundle
await writeTrialBundle(42, {
  trialURI,
  publicationRecord:     { pinataHash: "Qm...", gatewayURL: "https://ipfs.io/ipfs/Qm..." },
  fetchbackVerification,
});

// 6. Gate + unsigned tx
const procStruct = await fetchProcurement(42);
await assertTrialSubmitGate({ procurementId: 42, procStruct });
const { path: txPath } = await buildSubmitTrialTx({ procurementId: 42, linkedJobId: procStruct.jobId, trialURI });
await transitionProcStatus(42, PROC_STATUS.TRIAL_READY);
```

**Operator action:** Sign and broadcast `trial/unsigned_submit_trial_tx.json`.  
Record tx hash → transition to `TRIAL_SUBMITTED` → `WAITING_SCORE_PHASE`.

---

## Step 8: Selection

Monitor detects scoring completion. If selected:
```js
import { writeSelectionBundle } from "./agent/prime-artifact-builder.js";
await writeSelectionBundle(42, { selected: true, selectedAgentAddress: process.env.AGENT_ADDRESS });
await setProcState(42, { selected: true, selectionBlock: "20000000" });
await transitionProcStatus(42, PROC_STATUS.SELECTED);
```

---

## Step 9: Execute Linked Job (v1 Pipeline)

```js
import { activateBridge } from "./agent/prime-execution-bridge.js";
const bridge = await activateBridge({
  procurementId: 42,
  agentAddress:  process.env.AGENT_ADDRESS,
});
// state transitions to JOB_EXECUTION_IN_PROGRESS
```

Follow the v1 AGIJobManager job execution pipeline:
- `discover.js` → `execute.js` → `validate.js` → `submit.js`
- All artifacts go in `artifacts/job_<linkedJobId>/`
- `procurement_provenance.json` links back to proc 42

---

## Step 10: Complete Linked Job

```js
import { recordLinkedJobCompletion } from "./agent/prime-execution-bridge.js";
import { writeCompletionBundle } from "./agent/prime-artifact-builder.js";
import { assertCompletionGate } from "./agent/prime-review-gates.js";
import { buildRequestJobCompletionTx } from "./agent/prime-tx-builder.js";

const completionURI = "ipfs://Qm...";
await recordLinkedJobCompletion({ procurementId: 42, completionURI });

await writeCompletionBundle(42, {
  jobExecutionPlan:      { approach: "..." },
  jobCompletion:         { jobId: linkedJobId, procurementId: 42 },
  completionURI,
  publicationRecord:     { pinataHash: "Qm...", gatewayURL: "https://ipfs.io/ipfs/Qm..." },
  fetchbackVerification: { verified: true },
});

await assertCompletionGate({ procurementId: 42 });
const { path: txPath } = await buildRequestJobCompletionTx({
  procurementId:  42,
  linkedJobId:    linkedJobId,
  completionURI,
  agentSubdomain: process.env.AGENT_SUBDOMAIN,
});
await transitionProcStatus(42, PROC_STATUS.COMPLETION_READY);
```

**Operator action:** Sign and broadcast `completion/unsigned_request_completion_tx.json`.  
Record tx hash → transition to `COMPLETION_SUBMITTED` → `DONE`.

---

## Restart Recovery

The monitor is restart-safe. On restart:
1. Load `prime_monitor_state.json` — picks up from last scanned block
2. `listActiveProcurements()` — reloads all in-progress procurements
3. For each: `computeNextAction()` — tells you exactly where you are

```js
const active = await listActiveProcurements();
for (const s of active) {
  const procStruct = await fetchProcurement(s.procurementId);
  const nextAction = computeNextAction({ procState: s, procStruct });
  console.log(`#${s.procurementId}: ${nextAction.action} — ${nextAction.summary}`);
}
```

---

## Fallback Promotion

If `status === SELECTION_EXPIRED` or `FALLBACK_PROMOTABLE`:
1. Inspect chain state: check if fallback promotion is possible
2. If yes, transition to `SELECTED` manually after confirming on chain
3. Proceed with execution bridge as normal

---

## Checking Next Action (at any time)

```js
import { getProcState } from "./agent/prime-state.js";
import { fetchProcurement } from "./agent/prime-client.js";
import { computeNextAction } from "./agent/prime-next-action.js";

const state      = await getProcState(42);
const procStruct = await fetchProcurement(42);
const next       = computeNextAction({ procState: state, procStruct });

console.log(`Action : ${next.action}`);
console.log(`Summary: ${next.summary}`);
console.log(`Blocked: ${next.blockedReason ?? "no"}`);
console.log(`Urgent : ${next.urgent}`);
```
