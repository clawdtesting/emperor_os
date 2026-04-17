# TOOLS.md — System Configuration and Tool Reference

This file contains the specific technical configuration for Emperor_OS. It is the agent's cheat sheet for infrastructure, contract addresses, module locations, capability boundaries, and operational notes that are unique to this deployment.

---

## On-Chain Infrastructure

### Contracts — Ethereum Mainnet (chainId: 1)

| Contract | Address | Interface |
|---|---|---|
| **AGIJobManager v1** | `0xB3AAeb69b630f0299791679c063d68d6687481d1` | Job posting, assignment, completion settlement, escrow |
| **AGIJobManager v2** | `0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2` | Updated v2 job-manager lane used by Op-control for contract-first v2 reads |
| **AGIJobDiscoveryPrime v1** | `0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29` | Procurement competitions: commit-reveal, shortlist, finalist, trial, winner designation |
| **AGIJobDiscoveryPrime v2** | `0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e` | Next-generation Prime procurement contract address reserved in the strict repo mapping |
| **$AGIALPHA Token** | `0xa61a3B3a130a9c20768EEBF97E21515A6046a1fA` | Native settlement and staking token |

### ABI Registry

ABIs live in `agent/abi/` and are loaded via `agent/abi-registry.js`:

| File | Contract |
|---|---|
| `agent/abi/AGIJobManager.json` | AGIJobManager (v1) |
| `agent/abi/AGIJobDiscoveryPrime.json` | Prime procurement contract |
| `agent/abi/ERC20.json` | Standard ERC20 (for $AGIALPHA) |

Also available at `core/AGIJobManager.json` and `core/ERC20.json` for legacy module compatibility.

---

## RPC and MCP Access

### Chain RPC
- Environment variable: `RPC_URL` (Ethereum mainnet endpoint)
- Access pattern: read-only at all times — no signing, no broadcasting
- Used by: `agent/prime-client.js`, `agent/config.js`, `core/rpc.js`

### AGI Alpha MCP Endpoint
- Environment variable: `AGI_ALPHA_MCP`
- Protocol: JSON-RPC + SSE
- Client: `agent/mcp.js` (with retry) and `core/mcp.js`
- Supported calls:
  - `list_jobs` — fetch available jobs from AGIJobManager
  - `get_job` — fetch specific job details
  - `fetch_job_metadata` — retrieve IPFS-pinned job spec metadata
  - `apply_for_job` — submit application (produces unsigned tx)
  - `request_job_completion` — submit completion (produces unsigned tx)
  - `upload_to_ipfs` — pin artifact to IPFS, returns CID

### IPFS
- Publish via MCP `upload_to_ipfs` call
- Fetch-back verification required after every publication: retrieve by CID, hash-compare against local artifact
- Verification module: `agent/ipfs-verify.js`
- Every IPFS publication is a potential binding submission — treat as consequential

---

## Core Execution Modules

### AGIJobManager v1 Flow

| Module | Path | Purpose |
|---|---|---|
| Orchestrator | `agent/orchestrator.js` | Top-level job lifecycle coordination |
| Discovery | `agent/discover.js` | Job listing, classification, strategy generation |
| Evaluate | `agent/evaluate.js` | Deterministic + optional LLM fit evaluation |
| Execute | `agent/execute.js` | Job work execution with handler dispatch |
| Validate | `agent/validate.js` | Deliverable validation, IPFS upload, publication record |
| Submit | `agent/submit.js` | Completion packaging and tx building |
| State | `agent/state.js` | Per-job atomic state persistence |
| Artifact Manager | `agent/artifact-manager.js` | Artifact directory management, canonical paths |
| Lock | `core/lock.js` | Singleton execution lock file |
| Recovery | `core/recovery.js` | Crash recovery from lock + state |

### Prime Procurement Flow (AGIJobDiscoveryPrime)

| Module | Path | Purpose |
|---|---|---|
| Prime Client | `agent/prime-client.js` | Read-only typed RPC client for Contract 2 |
| Prime Phase Model | `agent/prime-phase-model.js` | Phase state machine constants and transitions |
| Prime Inspector | `agent/prime-inspector.js` | Produces inspection bundle from chain state |
| Prime Next Action | `agent/prime-next-action.js` | "What should operator do next?" engine |
| Prime State | `agent/prime-state.js` | Per-procurement atomic state persistence |
| Prime Artifact Builder | `agent/prime-artifact-builder.js` | Phase-specific artifact bundles |
| Prime TX Builder | `agent/prime-tx-builder.js` | Unsigned tx package construction (no signing) |
| Prime Review Gates | `agent/prime-review-gates.js` | Hard-stop precondition enforcement |
| Prime Monitor | `agent/prime-monitor.js` | Restart-safe monitoring loop with deadline tracking |
| Prime Execution Bridge | `agent/prime-execution-bridge.js` | Links Prime selection → v1 job execution |
| Prime Retrieval | `agent/prime-retrieval.js` | Archive search, retrieval packets, stepping stones |
| Prime Orchestrator | `agent/prime/prime-orchestrator.js` | Phase progression coordination |

### Job Handlers (by domain)

| Handler | Path | Applies To |
|---|---|---|
| Development | `agent/handlers/development.js` | Code, software, technical build tasks |
| Research | `agent/handlers/research.js` | Analysis, investigation, synthesis tasks |
| Creative | `agent/handlers/creative.js` | Writing, design, content tasks |
| Default | `agent/handlers/default.js` | Fallback for unclassified jobs |

---

## State Persistence Paths

| What | Path Pattern |
|---|---|
| Per-job state (v1) | `agent/state/jobs/<jobId>.json` |
| Per-procurement state (Prime) | `agent/artifacts/proc_<id>/state.json` |
| Per-procurement chain snapshot | `agent/artifacts/proc_<id>/chain_snapshot.json` |
| Per-procurement next action | `agent/artifacts/proc_<id>/next_action.json` |
| Per-job artifacts directory | `agent/artifacts/job_<jobId>/` |
| State retention config | `agent/state-retention.js` |
| Execution lock | `agent/execution.lock` (or as configured in `core/lock.js`) |

All state writes use atomic tmp + rename pattern. Never write directly to the final path.

---

## Artifact Directory Structure

### v1 Job Artifacts (`agent/artifacts/job_<jobId>/`)

```
raw_spec.json
normalized_spec.json
strategy.json
brief.json
deliverable.md          ← or .svg, .json, etc. depending on job type
execution_validation.json
publication_validation.json
publishManifest.json
jobCompletion.json
unsignedApply.json
unsignedCompletion.json
```

### Prime Procurement Artifacts (`agent/artifacts/proc_<id>/`)

```
state.json
chain_snapshot.json
next_action.json
selection_to_execution_bridge.json
linked_job_execution_state.json

inspection/
  procurement_snapshot.json
  linked_job_snapshot.json
  normalized_job_spec.json
  fit_evaluation.json
  next_action.json
  review_manifest.json

application/
  application_brief.md
  application_payload.json
  commitment_material.json    ← SENSITIVE: contains salt — do not log or expose
  unsigned_commit_tx.json
  review_manifest.json

reveal/
  reveal_payload.json
  commitment_verification.json
  unsigned_reveal_tx.json
  review_manifest.json

finalist/
  finalist_acceptance_packet.json
  stake_requirements.json
  trial_execution_plan.json
  unsigned_accept_finalist_tx.json
  review_manifest.json

trial/
  trial_artifact_manifest.json
  publication_record.json
  fetchback_verification.json
  unsigned_submit_trial_tx.json
  review_manifest.json

completion/
  job_execution_plan.json
  job_completion.json
  completion_manifest.json
  publication_record.json
  fetchback_verification.json
  unsigned_request_completion_tx.json
  review_manifest.json

retrieval/
  retrieval_packet_application.json
  retrieval_packet_trial.json
  stepping_stone_application.json
  stepping_stone_trial.json
```

---

## Capability Archive

| Path | Purpose |
|---|---|
| `agent/archive/index.json` | Searchable index of all archived items |
| `agent/archive/items/<id>.json` | Individual stepping-stone and retrieval packets |

The archive is the compounding engine. Before generating any new application, trial deliverable, or domain artifact — search the archive. After completing any job or procurement — extract and index reusable primitives.

Archive quality beats archive size. A pile of unindexed files is not an archive — it is archaeological debt.

---

## Unsigned Transaction Schema

All tx packages produced by this system follow this schema:

```json
{
  "schema": "emperor-os/unsigned-tx/v1",
  "kind": "completion | apply | commitApplication | revealApplication | acceptFinalist | submitTrial",
  "jobId": 0,
  "procurementId": 0,
  "contract": "0x...",
  "chainId": 1,
  "to": "0x...",
  "data": "0x...",
  "value": "0",
  "decodedCall": { "method": "...", "args": {} },
  "generatedAt": "ISO8601",
  "reviewMessage": "Human-readable description of what this tx does",
  "reviewChecklist": ["..."]
}
```

Every tx package includes a `reviewChecklist` — a human-readable list of things to verify before signing. Operator is expected to read it.

---

## Signing Handoff

All unsigned tx packages are handed to the operator for:
1. Manual review of `decodedCall` and `reviewChecklist`
2. Simulation (if available via mission-control or manual)
3. Signing via MetaMask
4. Hardware confirmation via Ledger
5. Broadcast

After broadcast, the operator records the tx hash and updates the relevant state file to the SUBMITTED state.

---

## Lobster Workflow Engine

Lobster is the deterministic workflow runtime used for multi-step automations. It is TypeScript-based and lives in `lobster/`.

**Invocation:**
```bash
# If lobster is on PATH
lobster run --mode tool '<pipeline>'
lobster run --mode tool --file <workflow.lobster> --args-json '<json>'

# If not on PATH
node lobster/bin/lobster.js ...
```

**Key rules when invoking Lobster:**
- `status: "needs_approval"` is a hard stop — never auto-approve on behalf of the operator
- Parse the tool envelope: `ok`, `status`, `output`, `requiresApproval`, `error`
- On `ok: false` — surface the error and stop, do not retry blindly
- Use environment variables (`LOBSTER_ARG_*`) for untrusted values in workflow files

---

## Mission Control

React operator dashboard with Express API proxy.

- Dashboard: `mission-control/` (React + Vite)
- API proxy: `mission-control/server.js` (Express, port 3001)
- Nginx: port 3000 → mission-control

Mission control surfaces: job state, procurement status, wallet panel, GitHub workflow status, event log, test harness. It is the operator's primary real-time view of system state.

---

## Infrastructure Notes

- EC2 instance: `emperor-ec2` (16GB RAM)
- Services: Mission Control (nginx:3000), mc-api (:3001), OpenClaw (:18789)
- Deployment: GitHub Actions → systemd restart
- GitHub Actions workflows:
  - `autonomous.yml` — 15-min job loop (currently disabled pending Prime integration)
  - `procurement.yml` — Full Prime procurement flow
  - `check_procurements.yml` — Read-only procurement scanner (safe, runs frequently)
  - `check_auth.yml` — Agent identity verification
  - `register_agent.yml` — Agent registration
  - `keepalive.yml` — EC2 keepalive

---

## Notes and Operational Lessons

_Add environment-specific notes here as they emerge. If you discover something about the infrastructure that future sessions should know — SSH quirks, RPC endpoint behavior, IPFS pinning latency, commitment salt generation requirements — write it here._

- Commitment material (`commitment_material.json`) contains the salt used in commit-reveal. Treat as sensitive. Do not log. Do not expose in any external communication.
- IPFS fetchback verification is mandatory before any trial or completion submission. A submission without verified fetchback is an unverified submission — the validator cannot confirm the artifact exists.
- Atomic writes: always write to `<path>.tmp` first, then rename to final path. This is enforced in `prime-state.js` and `artifact-manager.js` — follow the same pattern in any new code.
