# Prime System Map — Emperor_OS Repository Audit
_Audit date: 2026-04-01 | Branch: claude/prime-operational-upgrade-9vzxt_

---

> ⚠️ **Historical snapshot notice (updated 2026-04-03):**
> This document is an audit snapshot from before the Prime substrate was fully wired.
> Sections below are kept for forensic context, but several "missing" claims are now resolved.
> See **Current-State Corrections** immediately below for the live topology.

## Current-State Corrections (Live)

| Area | Current state |
|---|---|
| Prime ABI | `agent/abi/AGIJobDiscoveryPrime.json` exists and is used by Prime client modules. |
| Prime per-proc state | `agent/prime-state.js` persists per-procurement state at `artifacts/proc_<id>/state.json`. |
| Prime retrieval/archive | `agent/prime-retrieval.js` writes/reads `archive/index.json` and `archive/items/<id>.json`. |
| Prime artifact schemas | Implemented via `agent/prime-artifact-builder.js` bundles (inspection/application/reveal/finalist/trial/completion). |
| Prime orchestration | `agent/prime/prime-orchestrator.js` + `agent/prime-monitor.js` + `agent/prime-next-action.js` provide deterministic phase progression. |
| Unsigned Prime tx builders | Implemented in `agent/prime-tx-builder.js`; runtime remains unsigned-only. |

---

## 1. Repository Layout

```
emperor_OS/
├── .openclaw/workspace/          ← PRIMARY OPERATIONAL SUBSTRATE (workspace boundary)
│   ├── agent/                    ← Core execution modules
│   │   ├── abi/                  ← Contract ABI files
│   │   ├── state/jobs/           ← Per-job JSON state files
│   │   └── artifacts/            ← Per-job artifact directories
│   ├── docs/                     ← Workspace operational docs + reviews
│   └── openclaw/                 ← OpenClaw runtime config
│
├── agent/                        ← Main autonomous loop (top-level, EC2 runner)
├── agi-agent/                    ← Prime procurement agent (DOCTRINE VIOLATION — see §6)
│   └── data/                     ← Flat procurement_state.json (non-workspace)
├── mission-control/              ← React dashboard + Express proxy API
├── lobster/                      ← TypeScript deterministic workflow engine
├── tests/                        ← Local test fixtures
└── docs/                         ← (this directory) Operator documentation
```

---

## 2. Module Inventory

### 2.1 Job Discovery
| File | Layer | What it does |
|---|---|---|
| `agent/loop.js` | Main runner | discover → score → apply → work → submit loop |
| `.openclaw/workspace/agent/discover.js` | Workspace | MCP job list, classify, generate strategy |
| `.openclaw/workspace/agent/job-normalize.js` | Workspace | Normalize raw job spec to canonical form |
| `.openclaw/workspace/agent/strategy.js` | Workspace | Deterministic red-flag scoring, confidence calc |
| `.openclaw/workspace/agent/evaluate.js` | Workspace | Combined deterministic + optional LLM eval |

### 2.2 MCP / Chain Reads
| File | Layer | What it does |
|---|---|---|
| `.openclaw/workspace/agent/mcp.js` | Workspace | AGI Alpha MCP client with retry (JSON + SSE) |
| `agent/mcp.js` | Main runner | MCP client wrapper |
| `agi-agent/check_procurements.js` | AGI-agent | Read-only Contract 2 scanner (event logs + procurement struct) |

**MCP endpoint:** `process.env.AGI_ALPHA_MCP`  
**Supported calls:** `list_jobs`, `get_job`, `fetch_job_metadata`, `apply_for_job`, `request_job_completion`, `upload_to_ipfs`

**Chain RPC reads (ethers):**
- Contract 1: AGIJobManager `0xB3AAeb69b630f0299791679c063d68d6687481d1`
- Contract 2: AGIJobDiscoveryPrime `0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29`
- Token: $AGIALPHA `0xa61a3B3a130a9c20768EEBF97E21515A6046a1fA`

### 2.3 ABI Definitions
| File | Contents | Status |
|---|---|---|
| `.openclaw/workspace/agent/abi/AGIJobManager.json` | AGIJobManager ABI | Present |
| `.openclaw/workspace/agent/abi/ERC20.json` | ERC20 token ABI | Present |
| `.openclaw/workspace/agent/abi-registry.js` | ABI loader + interface cache | Present |
| `agi-agent/procurement_agent.js` lines 34–43 | Inline ABI2 fragments only | **Inline / not registered** |
| `.openclaw/workspace/agent/abi/AGIJobDiscoveryPrime.json` | Full Prime ABI | **Present (historical row previously marked missing)** |

### 2.4 Artifact Handling
| File | What it does |
|---|---|
| `.openclaw/workspace/agent/artifact-manager.js` | Creates `artifacts/job_<id>/`, atomic writes, metadata paths |
| `.openclaw/workspace/agent/validate.js` | Validates deliverable, uploads to IPFS, generates publication_validation.json |
| `.openclaw/workspace/agent/ipfs-verify.js` | IPFS hash verification (fetch-back) |
| `.openclaw/workspace/agent/signing-manifest.js` | SHA256 manifest over all artifacts before signing |

**Artifact schema (AGIJobManager v1):**
```
artifacts/job_<jobId>/
  raw_spec.json
  normalized_spec.json
  strategy.json
  brief.json
  deliverable.md
  execution_validation.json
  publication_validation.json
  publishManifest.json
  jobCompletion.json
  unsignedApply.json
  unsignedCompletion.json
```

**Prime artifact schema:** Implemented in current code via `agent/prime-artifact-builder.js` bundles (historical note above is superseded).

### 2.5 State Persistence
| File | What it does |
|---|---|
| `.openclaw/workspace/agent/state.js` | Per-job JSON state, atomic writes, `state/jobs/<id>.json` |
| `.openclaw/workspace/agent/state-retention.js` | TTL-based cleanup, max file caps |
| `.openclaw/workspace/agent/lock.js` | Execution lock file (singleton guarantee) |
| `.openclaw/workspace/agent/recovery.js` | Crash recovery from lock + state |
| `agi-agent/data/procurement_state.json` | Flat global state (pending_reveals, pending_trials) |

**Per-job state fields:** jobId, status, attempts, createdAt, updatedAt, + custom per-phase fields.

**Per-procurement state:** Only the flat `procurement_state.json` in `agi-agent/data/`. **No workspace-boundary per-procurement state exists.**

### 2.6 Review / Package Handoff
| File | What it does |
|---|---|
| `.openclaw/workspace/agent/tx-builder.js` | Builds unsigned tx packages (schema `emperor-os/unsigned-tx/v1`) |
| `.openclaw/workspace/agent/tx-validator.js` | Validates tx fields |
| `.openclaw/workspace/agent/pre-sign-checks.js` | Pre-signing validation layer |
| `.openclaw/workspace/agent/signing-manifest.js` | Human-reviewable manifest (SHA256 hashes) |
| `.openclaw/workspace/agent/simulation.js` | Tx simulation |

**Unsigned tx schema (v1):**
```json
{
  "schema": "emperor-os/unsigned-tx/v1",
  "kind": "completion | apply",
  "jobId": 0,
  "contract": "0x...",
  "chainId": 1,
  "to": "0x...",
  "data": "0x...",
  "value": "0",
  "generatedAt": "ISO",
  "reviewMessage": "..."
}
```
This schema covers AGIJobManager v1 only. **Prime-specific fields are not defined.**

### 2.7 Prime Code (agi-agent/)
| File | Status | Notes |
|---|---|---|
| `agi-agent/procurement_agent.js` | **DOCTRINE VIOLATION** | Signs + broadcasts on-chain. Has private key in runtime. |
| `agi-agent/check_procurements.js` | Read-only scanner | Safe — no signing. Useful reference for RPC reads. |
| `agi-agent/register_agent.js` | Utility | Agent registration helper |
| `agi-agent/preflight.js` | Utility | Environment validation |

---

## 3. Contracts in Scope

### AGIJobManager (Contract 1)
- Address: `0xB3AAeb69b630f0299791679c063d68d6687481d1`
- Chain: Ethereum Mainnet (chainId 1)
- Purpose: Job posting, assignment, completion settlement, escrow
- ABI: Present in workspace registry

### AGIJobDiscoveryPrime (Contract 2)
- Address: `0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29`
- Chain: Ethereum Mainnet (chainId 1)
- Purpose: Procurement creation, commit-reveal application, shortlisting, finalist acceptance, trial submission, scoring, winner designation
- ABI: **Only inline fragments in `agi-agent/procurement_agent.js`. NOT in workspace registry.**

Known ABI fragments (from `procurement_agent.js` lines 34–43 and `check_procurements.js`):
```
function commitApplication(uint256 procurementId, bytes32 commitment, string subdomain, bytes32[] proof)
function revealApplication(uint256 procurementId, string subdomain, bytes32[] proof, bytes32 salt, string applicationURI)
function acceptFinalist(uint256 procurementId)
function submitTrial(uint256 procurementId, string trialURI)
function procurements(uint256) returns (uint256 jobId, address employer, uint256 commitDeadline, uint256 revealDeadline, uint256 finalistAcceptDeadline, uint256 trialDeadline, uint256 scoreCommitDeadline, uint256 scoreRevealDeadline)
function applicationView(uint256, address) returns (uint8 phase, string applicationURI, bytes32 commitment, bool shortlisted)
event ProcurementCreated(uint256 indexed procurementId, uint256 indexed jobId, address indexed employer)
event ShortlistFinalized(uint256 indexed procurementId, address[] finalists)
```

---

## 4. Operational Boundaries

### Workspace boundary (hard)
All implementation must live under: `.openclaw/workspace/`

### Signing boundary (hard)
- No private keys in runtime
- No signing in worker code
- No broadcasting in worker code
- Unsigned tx packages → human MetaMask + Ledger

### LLM boundary
- Max 1 LLM call per job
- No LLM before confirmed assignment (v1 jobs)
- Deterministic evaluation preferred

---

## 5. What Prime Code Already Exists

### Exists and is usable (read-only parts)
- `check_procurements.js` — safe reference for scanning Contract 2 events and reading procurement struct
- ABI fragments for `procurements()` and `applicationView()` calls
- Phase labels: `None / Committed / Revealed / Shortlisted / TrialSubmitted`
- Deadline status logic (`procStatus()` function)

### Exists but violates doctrine (must NOT be called as-is)
- `procurement_agent.js` — actively signs and broadcasts. See §6 for full violation analysis.

### Completely missing
- Prime contract ABI file in workspace registry
- Per-procurement workspace-boundary state
- Prime phase state machine
- Next-action engine
- Phase-specific artifact bundles (application, reveal, finalist, trial, selection, completion)
- Unsigned Prime tx builders
- Review/precondition gates for Prime actions
- Monitoring loop with deadline tracking
- Restart-safe procurement resume
- Selection-to-execution bridge
- Retrieval-before-solve for Prime phases
- Operator runbooks for Prime end-to-end flow

---

## 6. Doctrine Violations in Existing Code

### CRITICAL: `agi-agent/procurement_agent.js`

**Violation 1 — Private key in runtime (line 57):**
```js
function wallet() {
  if (!_wallet) _wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider())
  return _wallet
}
```
The emperor_OS doctrine explicitly forbids private key handling in the worker/runtime.

**Violation 2 — Signing in runtime (lines 302, 327, 382, 427):**
```js
const tx = await contract().commitApplication(...)   // line 302
const tx = await contract().revealApplication(...)   // line 327
const tx = await contract().acceptFinalist(...)      // line 382
const tx = await contract().submitTrial(...)         // line 427
```
Each of these calls signs and broadcasts a transaction directly. The doctrine requires unsigned tx packages for human MetaMask + Ledger execution.

**Violation 3 — No review gate before on-chain action:**
No artifact check, no precondition validation, no operator review manifest before any of the above calls.

**Violation 4 — LLM called before commitment confirmation:**
`evaluate()` and `draftApplication()` are called as part of `handleNewProcurement()` which fires on new procurement discovery — not after any assignment confirmation.

**Violation 5 — State outside workspace boundary:**
State is stored in `agi-agent/data/procurement_state.json`, outside the `.openclaw/workspace/` boundary.

**Disposition:** This file must NOT be extended or called from the new Prime substrate. The new implementation in `.openclaw/workspace/agent/prime-*.js` supersedes it. The existing file is documented here for audit completeness.

---

## 7. Infrastructure Context

- EC2: `emperor-ec2`, 16GB RAM
- Services: Mission Control (nginx:3000), mc-api (:3001), OpenClaw (:18789)
- Deployment: GitHub Actions → systemd restart
- GitHub Actions workflows:
  - `autonomous.yml`: 15-min loop, **currently disabled**
  - `check_procurements.yml`: Prime procurement scanner (read-only, safe)
  - `register_agent.yml`, `check_auth.yml`: Agent identity
