<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=180&text=Emperor_OS&fontSize=52&fontAlignY=36&color=0:0f172a,100:1d4ed8&fontColor=ffffff&desc=Autonomous%20On-Chain%20Economic%20Agent&descAlignY=60&descSize=16" alt="Emperor_OS Banner" />
</p>

<p align="center">
  <a href="https://nodejs.org"><img alt="Node.js" src="https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white"></a>
  <a href="https://ethereum.org"><img alt="Ethereum Mainnet" src="https://img.shields.io/badge/Ethereum-Mainnet-627EEA?style=for-the-badge&logo=ethereum&logoColor=white"></a>
  <a href="https://ipfs.tech"><img alt="IPFS" src="https://img.shields.io/badge/IPFS-Enabled-65C2CB?style=for-the-badge&logo=ipfs&logoColor=white"></a>
  <a href="./.github/workflows/f0x-mcp-security.yml"><img alt="F0X MCP Security CI" src="https://img.shields.io/badge/F0X%20MCP%20Security-CI-0ea5e9?style=for-the-badge&logo=githubactions&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Proprietary-ef4444?style=for-the-badge"></a>
</p>

<p align="center">
  <strong>Emperor_OS</strong> is a production-grade off-chain execution runtime for the AGI Alpha marketplace:
  discover jobs, score deterministically, execute deliverables, validate outputs, publish artifacts, and hand off
  <em>unsigned</em> transaction packages for human signature.
</p>

<p align="center">
  <a href="#overview"><strong>Overview</strong></a> •
  <a href="#system-architecture"><strong>Architecture</strong></a> •
  <a href="#security-model"><strong>Security</strong></a> •
  <a href="#job-lifecycle"><strong>Lifecycle</strong></a> •
  <a href="#infrastructure--deployment"><strong>Deployment</strong></a> •
  <a href="#session-startup-protocol"><strong>Session Protocol</strong></a>
</p>

> **Hard invariant:** the runtime never signs and never broadcasts.  
> Every irreversible action is packaged as an unsigned envelope and handed to the operator.

---

## Table of Contents

- [Overview](#overview)
- [Core Design Philosophy](#core-design-philosophy)
- [System Architecture](#system-architecture)
  - [The Four Layers](#the-four-layers)
  - [The Signing Boundary — Absolute](#the-signing-boundary--absolute)
  - [The Flywheel Model](#the-flywheel-model)
- [External Agent (BYO Agent / BYO LLM) Architecture](#external-agent-byo-agent--byo-llm-architecture)
  - [Deterministic Core vs External Agent Responsibilities](#deterministic-core-vs-external-agent-responsibilities)
  - [Candidate Packet/Result Schemas](#candidate-packetresult-schemas)
  - [Mission Control Agent API Surface](#mission-control-agent-api-surface)
- [On-Chain Infrastructure](#on-chain-infrastructure)
  - [Smart Contracts](#smart-contracts)
  - [Agent Identity](#agent-identity)
  - [Token Economics](#token-economics)
- [Repository Structure](#repository-structure)
- [Core Modules — Deep Dive](#core-modules--deep-dive)
  - [agent/ — Prime Execution Substrate](#agent--prime-execution-substrate)
  - [AgiJobManager/ — v1 Job Loop](#agijobmanager--v1-job-loop)
  - [AgiPrimeDiscovery/ — Procurement Agent](#agiprimediscovery--procurement-agent)
  - [core/ — Legacy Execution Layer](#core--legacy-execution-layer)
  - [lobster/ — Deterministic Workflow Engine](#lobster--deterministic-workflow-engine)
  - [.openclaw/ — Agent Gateway Configuration](#openclaw--agent-gateway-configuration)
  - [docs/ — Architecture Doctrine](#docs--architecture-doctrine)
  - [tests/ — Test Harness & Fixtures](#tests--test-harness--fixtures)
  - [scripts/ci/ — CI/CD Utilities](#scriptsci--cicd-utilities)
  - [memory/ — Session Continuity](#memory--session-continuity)
  - [workspace/ — Operational Home](#workspace--operational-home)
- [Job Lifecycle](#job-lifecycle)
  - [AGIJobManager v1 Flow](#agijobmanager-v1-flow)
  - [AGIJobDiscoveryPrime Procurement Flow](#agijobdiscoveryprime-procurement-flow)
- [Artifact System](#artifact-system)
  - [v1 Job Artifacts](#v1-job-artifacts)
  - [Prime Procurement Artifacts](#prime-procurement-artifacts)
  - [Unsigned Transaction Schema](#unsigned-transaction-schema)
- [Capability Archive & Flywheel](#capability-archive--flywheel)
- [Operational Doctrine (SOUL.md)](#operational-doctrine-soulmd)
- [Agent Identity (IDENTITY.md)](#agent-identity-identitymd)
- [Operator Contract (USER.md)](#operator-contract-usermd)
- [Heartbeat & Monitoring (HEARTBEAT.md)](#heartbeat--monitoring-heartbeatmd)
- [GitHub Actions Workflows](#github-actions-workflows)
- [Infrastructure & Deployment](#infrastructure--deployment)
  - [EC2 Environment](#ec2-environment)
  - [Service Stack](#service-stack)
  - [Environment Variables](#environment-variables)
- [LLM Cost Architecture](#llm-cost-architecture)
- [Security Model](#security-model)
- [Validated IPFS Runs](#validated-ipfs-runs)
- [Authority Hierarchy](#authority-hierarchy)
- [Session Startup Protocol](#session-startup-protocol)
- [Known Issues](#known-issues)
- [Roadmap](#roadmap)

---

## Overview

Emperor_OS is not a chatbot. It is not a script runner. It is a **principled autonomous economic agent** with real on-chain stakes, real deadlines, and real contracts that evaluate real outputs.

The system:
- **Discovers** jobs posted on the `AGIJobManager` contract (v1) and procurement competitions on `AGIJobDiscoveryPrime`
- **Evaluates** them using a deterministic heuristic scorer, with LLM invoked at most once per job for genuine reasoning tasks
- **Executes** the work via domain-specialized handlers (development, research, creative, default)
- **Validates** deliverables against contract-legible structural standards
- **Packages** everything into signed-ready unsigned tx envelopes with human-readable review manifests
- **Archives** reusable primitives from every job into a capability archive that compounds over time

The system never holds a private key. It never signs. It never broadcasts. Every irreversible on-chain action passes through an operator-controlled signing boundary (MetaMask + Ledger).

---

## Core Design Philosophy

Emperor_OS is built around five hard constraints that are non-negotiable:

| Constraint | Description |
|---|---|
| **Artifact-First** | Every stage of execution produces durable, disk-persisted artifacts. If it isn't written, it didn't happen. |
| **Explicit State** | All job and procurement progression lives in persisted JSON state files. No hidden transitions, no silent advancement. |
| **LLM as Proposal, Not Truth** | LLM output goes through deterministic validation before approaching any consequential boundary. One call per job, max. |
| **Hard Signing Boundary** | No private key in the runtime. All on-chain actions are unsigned JSON envelopes handed to the operator. No exceptions. |
| **Human Authority at Edges** | The operator reviews, approves, and signs every irreversible action. The system stops and waits. |

These constraints exist because **the stakes are real**: real Ethereum mainnet contracts, real $AGIALPHA token escrow, real competitive selection against other autonomous agents.

---

## System Architecture

### The Four Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4 ── Governance / Operator Band                          │
│  You review. You sign. You broadcast. You decide.               │
│  MetaMask + Ledger hardware signing only.                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │  human signs unsigned tx packages
┌──────────────────────────────▼──────────────────────────────────┐
│  LAYER 3 ── Capability Archive                                  │
│  archive/index.json · archive/items/                            │
│  Stepping stones, retrieval packets, domain checklists          │
│  Every job leaves reusable residue here — this is the engine.   │
└──────────────────────────────┬──────────────────────────────────┘
                               │  retrieval-before-solve
┌──────────────────────────────▼──────────────────────────────────┐
│  LAYER 2 ── Off-Chain Execution (this repository)               │
│  discover → evaluate → brief → execute → validate               │
│  → artifact → unsigned tx → review gate → handoff               │
│  73% JavaScript · 27% TypeScript                                │
└──────────────────────────────┬──────────────────────────────────┘
                               │  read-only RPC (no signing)
┌──────────────────────────────▼──────────────────────────────────┐
│  LAYER 1 ── On-Chain Environment                                │
│  AGIJobManager · AGIJobDiscoveryPrime · $AGIALPHA               │
│  Ethereum Mainnet (chainId: 1)                                  │
└─────────────────────────────────────────────────────────────────┘
```

### The Signing Boundary — Absolute

This is the most critical architectural invariant in the entire system.

**The runtime MUST NEVER:**
- Hold a private key in any form
- Call `ethers.Wallet` or any signing primitive
- Invoke `sendTransaction`, `commitApplication`, `revealApplication`, or any write contract method directly
- Broadcast any transaction to any network

**The runtime MUST:**
- Package all on-chain actions as unsigned JSON envelopes
- Produce a `reviewChecklist` with every tx package
- Hand off to the operator and wait

This boundary is not a preference. It is not subject to operator override. It is not bypassed under time pressure or deadline urgency. Any code path that violates it is a critical system failure.

### The Flywheel Model

Emperor_OS is designed to compound, not to produce isolated outputs.

```
                    ┌─────────────────────────────┐
                    │        JOB COMPLETED         │
                    └──────────────┬──────────────┘
                                   │
                          Extract residue
                                   │
              ┌────────────────────▼────────────────────┐
              │  Templates · Evaluators · Checklists     │
              │  Retrieval packets · Stepping stones      │
              └────────────────────┬────────────────────┘
                                   │
                           Index in archive
                                   │
              ┌────────────────────▼────────────────────┐
              │         archive/index.json               │
              │         archive/items/<id>.json          │
              └────────────────────┬────────────────────┘
                                   │
                   Retrieve BEFORE solving next job
                                   │
              ┌────────────────────▼────────────────────┐
              │    Next job faster · cheaper · better    │
              └─────────────────────────────────────────┘
```

A completed job that leaves nothing behind for the archive is a **half-finished job**. The deliverable is the minimum viable output.

---

## External Agent (BYO Agent / BYO LLM) Architecture

Emperor_OS now supports a **Bring Your Own Agent / Bring Your Own LLM** mode where users can connect external systems (webhooks, OpenAI, Ollama, Hermes/OpenClaw-compatible endpoints) to generate candidate work.

The key invariant is unchanged:
- external agents can propose candidate outputs
- Emperor_OS / Mission Control remains deterministic system-of-record
- all signing and broadcast authority remains human-only

### Deterministic Core vs External Agent Responsibilities

| Layer | Responsibilities |
|---|---|
| **Deterministic Core (Emperor_OS + Mission Control)** | Contract reads, job normalization, brief generation, required artifact definitions, acceptance checks, file-scope validation, authoritative hash inventory, canonical artifact bundling, signing manifest generation, unsigned tx preview generation |
| **External Agent** | Planning, reasoning, coding/writing/research, producing candidate deliverables and candidate result package only |
| **Human Operator** | Review deterministic checks, approve/reject, sign via MetaMask + Ledger, broadcast tx |

### Candidate Packet/Result Schemas

Canonical schemas are versioned in:

- `protocols/agent-job-packet.schema.json`
- `protocols/agent-job-result.schema.json`
- `protocols/agent-connection.schema.json`

External results are always treated as untrusted and must pass deterministic ingestion before any canonical publication/manifest/unsigned tx handoff occurs.

### Mission Control Agent API Surface

Mission Control exposes agent connection and run lifecycle APIs:

- `GET/POST/PATCH/DELETE /api/agent-connections`
- `POST /api/agent-connections/test`
- `POST /api/agent-runs/prepare`
- `POST /api/agent-runs/start`
- `GET /api/agent-runs/:runId`
- `POST /api/agent-runs/:runId/ingest`
- `POST /api/agent-runs/:runId/cancel`

Persistent state is stored at:
- `mission-control/state/agent-connections.json`
- `mission-control/state/agent-runs.json`

---

## On-Chain Infrastructure

### Smart Contracts

All contracts on **Ethereum Mainnet (chainId: 1)**. All chain access from the runtime is **read-only**.

| Contract | Address | Purpose |
|---|---|---|
| **AGIJobManager v1** | [`0xB3AAeb69b630f0299791679c063d68d6687481d1`](https://etherscan.io/address/0xB3AAeb69b630f0299791679c063d68d6687481d1) | Job posting, escrow, assignment, completion settlement, validator voting, NFT minting |
| **AGIJobManager v2** | [`0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2`](https://etherscan.io/address/0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2) | Updated v2 job-manager lane used by Op-control for contract-first v2 reads |
| **AGIJobDiscoveryPrime v1** | [`0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29`](https://etherscan.io/address/0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29) | Premium procurement layer: commit-reveal applications, finalist shortlisting, blind validator scoring, trial submission, winner designation |
| **AGIJobDiscoveryPrime v2** | [`0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e`](https://etherscan.io/address/0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e) | Next-generation Prime procurement contract address reserved in the strict repo mapping |
| **$AGIALPHA Token** | [`0xa61a3B3a130a9c20768EEBF97E21515A6046a1fA`](https://etherscan.io/address/0xa61a3B3a130a9c20768EEBF97E21515A6046a1fA) | Native settlement and staking token (18 decimals) |
| **AlphaAgentIdentity NFT** | `0x7811993CbcCa3b8bb35a3d919F3BA59eeFbeAA9a` | Required NFT — without it, `applyForJob()` reverts |

**ABI Registry** — loaded by `agent/abi-registry.js`:

| File | Contract |
|---|---|
| `agent/abi/AGIJobManager.json` | AGIJobManager (v1) |
| `agent/abi/AGIJobDiscoveryPrime.json` | Prime procurement contract |
| `agent/abi/ERC20.json` | Standard ERC20 ($AGIALPHA) |
| `core/AGIJobManager.json` | Legacy module compatibility |
| `core/ERC20.json` | Legacy module compatibility |

### Agent Identity

| Field | Value |
|---|---|
| **ENS Name** | `emperor-os.agi.eth` |
| **Agent Wallet** | `0x6484c5...` |
| **ENS Token Owner** | `0x6484c5...` (confirmed) |
| **Resolver** | ENS Public Resolver `0x231b0Ee1...` |
| **Addr Record** | Set and verified |
| **Authorization Path** | Path 3 — ENS-based authorization (`lobster0.alpha.agent.agi.eth`) |

The agent must hold the `AlphaAgentIdentity` NFT for `applyForJob()` to succeed on the contract level.

### Token Economics

| Parameter | Value |
|---|---|
| **AGIALPHA Balance** | 2,000 tokens |
| **Bond Requirement** | 1,000 tokens |
| **Payout Tier** | 60% |
| **Token Decimals** | 18 |

---

## Repository Structure

```
emperor_os_clean/
│
├── ⚙️  IDENTITY.md             Agent identity — who Emperor_OS is
├── 📜  SOUL.md                 Immutable operating principles (10 doctrines)
├── 🛠️  AGENTS.md               Session operational manual — read at every session start
├── 🔧  TOOLS.md                Infrastructure config, module reference, contract addresses
├── 👤  USER.md                 Operator profile — who runs this, what they expect
├── 💓  HEARTBEAT.md            Live agent status, IPFS run log, workflow table
├── .gitignore
│
├── agent/                      ◀ Prime execution substrate (JS, production)
│   ├── orchestrator.js         Top-level job lifecycle coordination
│   ├── discover.js             Job listing, classification, strategy generation
│   ├── evaluate.js             Deterministic + optional LLM fit evaluation
│   ├── execute.js              Work execution with handler dispatch
│   ├── validate.js             Deliverable validation, IPFS upload, publication record
│   ├── submit.js               Completion packaging and unsigned tx construction
│   ├── state.js                Per-job atomic state persistence (tmp+rename)
│   ├── artifact-manager.js     Artifact directory management, canonical path resolution
│   ├── mcp.js                  AGI Alpha MCP client with retry logic
│   ├── prime-client.js         Read-only typed RPC client for AGIJobDiscoveryPrime
│   ├── prime-phase-model.js    Phase state machine constants and legal transitions
│   ├── prime-inspector.js      Builds inspection bundle from on-chain state
│   ├── prime-next-action.js    "What should operator do next?" decision engine
│   ├── prime-state.js          Per-procurement atomic state persistence
│   ├── prime-artifact-builder.js  Phase-specific artifact bundles
│   ├── prime-tx-builder.js     Unsigned tx package construction (no signing ever)
│   ├── prime-review-gates.js   Hard-stop precondition enforcement
│   ├── prime-monitor.js        Restart-safe monitoring loop with deadline tracking
│   ├── prime-execution-bridge.js  Links Prime selection → v1 job execution
│   ├── prime-retrieval.js      Archive search, retrieval packets, stepping stones
│   ├── ipfs-verify.js          Fetch-back verification after every IPFS publication
│   ├── abi-registry.js         ABI loading and contract interface registry
│   ├── config.js               Environment variable resolution and RPC setup
│   ├── state-retention.js      State lifecycle and cleanup policy
│   ├── archive/
│   │   ├── index.json          Searchable capability archive index
│   │   └── items/              Individual stepping-stone and retrieval packets
│   ├── abi/
│   │   ├── AGIJobManager.json
│   │   ├── AGIJobDiscoveryPrime.json
│   │   └── ERC20.json
│   ├── artifacts/              Runtime-generated (gitignored or managed separately)
│   │   ├── job_<jobId>/        Per-job artifact directories
│   │   └── proc_<id>/          Per-procurement artifact directories
│   ├── state/
│   │   └── jobs/               Per-job JSON state files
│   ├── handlers/
│   │   ├── development.js      Code, software, technical build tasks
│   │   ├── research.js         Analysis, investigation, synthesis tasks
│   │   ├── creative.js         Writing, design, content tasks
│   │   └── default.js          Fallback for unclassified jobs
│   └── prime/
│       └── prime-orchestrator.js  Phase progression coordination
│
├── AgiJobManager/              ◀ v1 Job loop runtime
│   └── loop.js                 Main cron-triggered job discovery and execution loop
│
├── AgiPrimeDiscovery/          ◀ Prime procurement agent
│   └── procurement_agent.js   Commit-reveal flow, state-persisted procurement loop
│
├── core/                       ◀ Legacy execution layer (compatibility)
│   ├── rpc.js                  Ethereum RPC utilities
│   ├── mcp.js                  Legacy MCP client
│   ├── lock.js                 Singleton execution lock file
│   ├── recovery.js             Crash recovery from lock + state files
│   ├── AGIJobManager.json      Legacy ABI
│   └── ERC20.json              Legacy ABI
│   └── MASTER_EXECUTION_ORDER.md  Build sequencing and discipline doc
│
├── lobster/                    ◀ Deterministic workflow engine (TypeScript)
│   ├── bin/
│   │   └── lobster.js          CLI entrypoint
│   └── ...                     Pipeline definitions and runner
│
├── .openclaw/                  ◀ OpenClaw agent gateway configuration
│   └── openclaw.json           Model routing (Kimi K2.5 via NVIDIA API, merge mode)
│
├── docs/                       ◀ Architecture doctrine and runbooks
│   └── ARCHITECTURE_DOCTRINE.md  Non-negotiable architectural invariants (highest authority)
│
├── memory/                     ◀ Session continuity (gitignored or managed separately)
│   ├── YYYY-MM-DD.md           Daily operational logs
│   ├── MEMORY.md               Long-term distilled context (main sessions only)
│   └── heartbeat-state.json    Last-checked timestamps for periodic tasks
│
├── workspace/                  ◀ Agent's operational home
│   ├── README.md               Workspace orientation document
│   └── HEARTBEAT.md            Periodic task tracker
│
├── mission-control/            ◀ Operator dashboard (excluded from this analysis)
│   ├── (React + Vite frontend)
│   └── server.js               Express API proxy (port 3001)
│
├── tests/                      ◀ Test harness and job fixtures
│
├── scripts/ci/                 ◀ CI/CD utility scripts
│
├── github/workflows/           ◀ Additional workflow definitions
└── .github/workflows/          ◀ GitHub Actions CI/CD pipeline definitions
```

---

## Core Modules — Deep Dive

### `agent/` — Prime Execution Substrate

The `agent/` directory is the heart of Emperor_OS. It contains two parallel execution tracks: the **v1 job loop** and the **Prime procurement system**.

#### Orchestration & Lifecycle

**`agent/orchestrator.js`** — Top-level coordinator. Drives the full job lifecycle for AGIJobManager v1 jobs: discovery → evaluation → brief → execution → validation → submission. Delegates to the appropriate sub-modules at each stage. Enforces the artifact-first discipline: no stage is marked complete without confirming its output exists on disk.

**`agent/state.js`** — Atomic state persistence for v1 jobs. All writes use a `<path>.tmp` → rename pattern to guarantee atomicity. State files live at `agent/state/jobs/<jobId>.json`. The state file is the single source of truth for where any job is in its lifecycle — not memory, not logs, not the conversation context.

**`agent/artifact-manager.js`** — Manages the artifact directory structure for each job (`agent/artifacts/job_<jobId>/`). Resolves canonical artifact paths, creates directories on demand, and enforces the naming conventions that make artifacts machine-readable across sessions and recovery paths.

#### Discovery & Evaluation

**`agent/discover.js`** — Calls the AGI Alpha MCP endpoint (`list_jobs`, `get_job`, `fetch_job_metadata`) to retrieve available jobs. Classifies each job by domain (development / research / creative / default) and generates an initial strategy hint for the evaluator.

**`agent/evaluate.js`** — Two-phase evaluation:
1. **Deterministic phase**: Heuristic scoring via a rule-based evaluator (`scorer_dev.js` pattern). Checks domain fit, token budget, timeline, and capability match against known constraints. Zero LLM cost.
2. **LLM phase** (conditional): If the deterministic score is ambiguous and the job is assigned, a single LLM call produces a structured fit assessment. This call is cached in a Supabase decision cache to avoid recomputing for repeat patterns.

The target is **one LLM call per job**. The LLM is reserved for genuine reasoning that rules cannot resolve.

#### Execution & Handlers

**`agent/execute.js`** — Dispatches the confirmed job to the appropriate domain handler based on classification. Manages execution context, timeout handling, and artifact emission. Ensures the deliverable artifact is written before any state transition occurs.

**`agent/handlers/development.js`** — Handles code, software build, and technical tasks. Produces structured deliverables with section headers, code blocks, and implementation notes that meet validator-legibility requirements.

**`agent/handlers/research.js`** — Handles analysis, investigation, and synthesis tasks. Produces research reports with sourcing, structured arguments, and verifiable claims.

**`agent/handlers/creative.js`** — Handles writing, design, and content tasks. Formats output per job spec requirements (markdown, SVG, plain text, etc.).

**`agent/handlers/default.js`** — Fallback handler for unclassified jobs. Applies generic structure that satisfies baseline validator requirements.

#### Validation & Submission

**`agent/validate.js`** — Two-phase validation:
1. **Execution validation**: Checks deliverable structure, required sections, format compliance, and domain-specific constraints.
2. **Publication validation**: Publishes to IPFS via MCP `upload_to_ipfs`, then runs fetch-back verification (`agent/ipfs-verify.js`) to confirm the artifact is retrievable and hash-matches the local copy. A submission without verified fetch-back is an unverified submission.

**`agent/ipfs-verify.js`** — Fetches the published CID, hashes the retrieved content, and compares against the local artifact hash. Mandatory before any trial or completion submission. Failure here is a hard stop.

**`agent/submit.js`** — Packages the verified publication into an unsigned completion transaction envelope following the `emperor-os/unsigned-tx/v1` schema. Produces a `reviewChecklist` for the operator. Writes the unsigned tx package to `agent/artifacts/job_<jobId>/unsignedCompletion.json`.

#### Prime Procurement Modules

**`agent/prime-client.js`** — Read-only typed RPC client for `AGIJobDiscoveryPrime`. Provides typed accessors for all contract view functions: procurement listings, phase status, deadline data, finalist arrays, trial submission hashes. All calls are read-only — no signing or state mutation.

**`agent/prime-phase-model.js`** — Defines the complete procurement state machine:

```
DISCOVERED → INSPECTED → FIT_EVALUATED → COMMIT_READY → COMMIT_SUBMITTED
→ REVEAL_READY → REVEAL_SUBMITTED → SHORTLISTED → FINALIST_ACCEPT_READY
→ FINALIST_ACCEPT_SUBMITTED → TRIAL_READY → TRIAL_SUBMITTED → SELECTED
→ JOB_EXECUTION_IN_PROGRESS → COMPLETION_READY → DONE
```

Each state has defined legal next states and the conditions that gate each transition. No implicit advancement.

**`agent/prime-state.js`** — Atomic state persistence for procurements at `agent/artifacts/proc_<id>/state.json`. Same tmp+rename atomicity guarantee as v1 state. Stores the full procurement state including phase, timestamps, artifact paths, and chain snapshot references.

**`agent/prime-inspector.js`** — Queries the contract and builds a complete inspection bundle: linked job snapshot, normalized job spec, capability assessment, and next-action guidance. Output is written to `agent/artifacts/proc_<id>/inspection/`.

**`agent/prime-review-gates.js`** — Hard-stop precondition enforcement. Before any phase artifact is built or any unsigned tx is constructed, the review gate verifies that all required prior artifacts exist, are structurally valid, and agree with the state file. Failures here are loud and visible — they write a recovery note and surface to the operator.

**`agent/prime-tx-builder.js`** — Constructs unsigned tx packages for every Prime action:
- `commitApplication` — commit hash of application + salt
- `revealApplication` — reveal application content + salt
- `acceptFinalist` — accept finalist invitation with stake
- `submitTrial` — submit trial artifact IPFS CID
- `requestJobCompletion` — request completion after assignment

Every package includes a human-readable `reviewMessage` and `reviewChecklist`. The builder never signs.

**`agent/prime-artifact-builder.js`** — Produces the phase-specific artifact bundle for each procurement stage. Each bundle is a directory containing the evidence, the unsigned tx, and the review manifest needed for operator decision.

**`agent/prime-monitor.js`** — Restart-safe monitoring loop. Reads state from disk on every iteration. Tracks procurement deadlines and surfaces urgency flags when windows are closing (< 4 hours threshold). Reports `HEARTBEAT_OK` when nothing requires immediate attention.

**`agent/prime-execution-bridge.js`** — Bridges the Prime selection event to the v1 job execution system. When Emperor_OS wins a procurement on `AGIJobDiscoveryPrime`, the assigned job is handed off to the v1 execution flow for actual work delivery.

**`agent/prime-retrieval.js`** — Archive search and retrieval packet construction. Called before every new application draft or trial deliverable to surface prior validated work that could inform the current task.

**`agent/prime-orchestrator.js`** (`agent/prime/`) — Coordinates phase progression for the Prime track, delegating to the inspector, review gates, artifact builder, tx builder, and monitor in the correct sequence.

#### MCP & Infrastructure

**`agent/mcp.js`** — AGI Alpha MCP client with exponential retry. Supports: `list_jobs`, `get_job`, `fetch_job_metadata`, `apply_for_job` (produces unsigned tx), `request_job_completion` (produces unsigned tx), `upload_to_ipfs`. Environment variable: `AGI_ALPHA_MCP`.

**`agent/config.js`** — Central environment variable resolution. Reads `RPC_URL`, `AGI_ALPHA_MCP`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `ETHERSCAN_KEY`, `SUPABASE_KEY`, `PINATA_API_KEY`, etc. Fails fast with descriptive errors on missing required variables.

---

### `AgiJobManager/` — v1 Job Loop

**`AgiJobManager/loop.js`** — The main runtime for the AGIJobManager v1 track. Triggered by GitHub Actions `autonomous.yml` on a 15-minute cron schedule (currently paused pending full Prime integration). On each run:

1. Acquires the execution lock (`core/lock.js`) to prevent concurrent runs
2. Discovers open jobs via MCP `list_jobs`
3. Filters out jobs already in state (avoids duplicate processing)
4. Scores each new job with the deterministic evaluator
5. Applies to qualifying jobs via `apply_for_job` (produces unsigned apply tx)
6. Polls for assigned jobs and drives them through the full execution pipeline
7. Releases the lock and writes the run summary to memory

The loop is designed to be fully resumable: if it crashes at any point, the next run reads state from disk and continues from the correct phase.

---

### `AgiPrimeDiscovery/` — Procurement Agent

**`AgiPrimeDiscovery/procurement_agent.js`** — The main runtime for the `AGIJobDiscoveryPrime` track. Triggered by `procurement.yml` on a 15-minute cron. State is persisted in `data/procurement_state.json`, which is committed back to the repo after each run with `[skip ci]` to prevent infinite loops.

The procurement agent drives the commit-reveal cycle:
1. Scans for open procurements on Contract 2
2. Evaluates fit via `prime-inspector`
3. Builds application brief and commitment material (salt is treated as sensitive — never logged)
4. Produces `unsigned_commit_tx.json` and waits for operator to sign
5. After commit is on-chain, tracks reveal deadline
6. Produces `unsigned_reveal_tx.json` and waits for operator
7. Monitors shortlist status, finalist notification, and trial request
8. Produces trial deliverable, publishes to IPFS with fetch-back verification
9. Packages `unsigned_submit_trial_tx.json` for operator
10. On selection, bridges to v1 execution for job delivery

---

### `core/` — Legacy Execution Layer

The `core/` directory contains foundational utilities used by both the legacy execution path and by newer modules for compatibility.

**`core/rpc.js`** — Ethereum RPC utilities. Wraps `ethers.js` providers for read-only access. Connection pooling, retry logic, and error surface normalization.

**`core/mcp.js`** — Legacy MCP client. The newer `agent/mcp.js` is preferred for all new code; this module exists for backward compatibility.

**`core/lock.js`** — Singleton execution lock file. Prevents concurrent runs of the main loop by writing an `execution.lock` file. On startup, checks for stale locks (crashed process) and invokes `core/recovery.js` if a stale lock is found.

**`core/recovery.js`** — Crash recovery from lock + state files. Reads the lock file's metadata and all active state files to determine what was in progress, and constructs a recovery report for the operator (or resumes automatically if the recovery is deterministic).

**`core/MASTER_EXECUTION_ORDER.md`** — Build sequencing doctrine. Defines the order in which modules are expected to execute and the invariants that must hold at each handoff. Second-highest authority in the system after `docs/ARCHITECTURE_DOCTRINE.md`.

---

### `lobster/` — Deterministic Workflow Engine

Lobster is the TypeScript-based deterministic workflow runtime used for multi-step automations where LLM involvement is inappropriate or unnecessary.

```bash
# Standard invocation
lobster run --mode tool '<pipeline>'
lobster run --mode tool --file <workflow.lobster> --args-json '<json>'

# If not on PATH
node lobster/bin/lobster.js ...
```

Six pipeline types are defined:

| Pipeline | Purpose |
|---|---|
| **Job Discovery** | Scan and classify open jobs from chain |
| **Job Execution** | Drive a job through the full v1 execution lifecycle |
| **Validation** | Structural and publication validation of deliverables |
| **GitHub CI/CD** | Trigger and monitor GitHub Actions workflows |
| **SparkLog** | Field employee job record submission (separate project) |
| **RAG Ingestion** | Archive ingestion and indexing for retrieval |

**Critical Lobster rules:**
- `status: "needs_approval"` is a **hard stop** — never auto-approve on behalf of the operator
- Parse the full tool envelope: `ok`, `status`, `output`, `requiresApproval`, `error`
- On `ok: false` — surface the error and stop; do not retry blindly
- Use `LOBSTER_ARG_*` environment variables for untrusted values in workflow files

Lobster is installed at `~/.local/bin/lobster` (version `2026.1.21-1`) on the EC2 instance.

---

### `.openclaw/` — Agent Gateway Configuration

OpenClaw is the agent orchestration gateway running on EC2 at port `18789`. It routes prompts to LLM backends and maintains session state.

The production configuration uses **Kimi K2.5** via the NVIDIA API (`https://integrate.api.nvidia.com/v1`) with a `models.providers` block using `"mode": "merge"`. The `tools.profile` is set to `"full"` (not `"coding"`) to keep `llm-task` accessible.

Session data lives at `~/.openclaw/agents/main/sessions/`.

**LLM backend hierarchy:**
1. **Kimi K2.5** (via NVIDIA API) — primary for heavy reasoning tasks
2. **OpenAI API** — secondary LLM for specific task types
3. **Ollama `qwen2.5-coder:7b`** (local EC2) — zero-cost fallback for low-stakes classification

---

### `docs/` — Architecture Doctrine

**`docs/ARCHITECTURE_DOCTRINE.md`** — The highest-authority document in the repository. Contains non-negotiable architectural invariants that implementation code must obey. If any module contradicts this doctrine, the module is wrong, not the doctrine. Key invariants documented here: artifact-first discipline, explicit state machine requirements, the signing boundary, recovery architecture requirements, and capability archive obligations.

---

### `tests/` — Test Harness & Fixtures

Test fixtures and job harnesses for validating the execution pipeline without live on-chain interactions. Includes dry-run modes for both the v1 loop and the procurement agent, with manually triggerable `test_01.yml` (research report → IPFS → metadata) and `test_02.yml` (SVG logo → IPFS → metadata) workflow entries validated on mainnet.

---

### `scripts/ci/` — CI/CD Utilities

Utility scripts invoked by GitHub Actions workflows. Includes auth verification, ENS resolver checks, procurement scanning, and agent registration helpers.

---

### `memory/` — Session Continuity

The memory system is Emperor_OS's mechanism for persisting context across stateless LLM sessions.

| File | Purpose |
|---|---|
| `memory/YYYY-MM-DD.md` | Raw daily operational log — decisions made, context carried forward |
| `memory/MEMORY.md` | Long-term distilled context — curated lessons, operator preferences (main sessions only) |
| `memory/heartbeat-state.json` | Timestamps of last-checked items (email, calendar, procurement status) |

**Memory rules:**
- Write it or lose it. If something matters, write it to the daily file.
- Distill periodically. Every few days, update `MEMORY.md` and prune stale entries.
- `MEMORY.md` is for main sessions only — not shared contexts or group chats.
- Artifact directories are also memory. Never delete them casually.

---

### `workspace/` — Operational Home

The agent's home directory within the repository. Contains the orientation documents (`README.md`) and the heartbeat tracker (`HEARTBEAT.md`). Read first at session start; write operational state back here at session end.

---

## Job Lifecycle

### AGIJobManager v1 Flow

```
OPEN JOB DISCOVERED
       │
       ▼
[1] Deterministic Scoring
    domain fit · token budget · timeline · capability match
       │
       ├─── SKIP (score below threshold) ──────────────────────┐
       │                                                         │
       ▼                                                         │
[2] Apply for Job                                                │
    MCP: apply_for_job → unsigned tx → operator signs          │
       │                                                         │
       ▼                                                         │
[3] Await Assignment                                             │
    Prime monitor polls for state change                        │
       │                                                         │
       ▼                                                         │
[4] Normalize Spec → Build Brief                                │
    write: raw_spec.json · normalized_spec.json · brief.json   │
       │                                                         │
       ▼                                                         │
[5] Execute (handler dispatch)                                   │
    write: deliverable.md (or .svg, .json, etc.)               │
       │                                                         │
       ▼                                                         │
[6] Validate Deliverable                                         │
    structure · required sections · format · domain constraints │
    write: execution_validation.json                            │
       │                                                         │
       ▼                                                         │
[7] Publish to IPFS                                             │
    MCP: upload_to_ipfs → CID                                  │
    write: publication_record.json                              │
       │                                                         │
       ▼                                                         │
[8] Fetch-Back Verify                                           │
    retrieve CID · hash compare · hard stop if mismatch        │
    write: fetchback_verification.json                          │
       │                                                         │
       ▼                                                         │
[9] Build Unsigned Completion Tx                                │
    schema: emperor-os/unsigned-tx/v1                          │
    write: unsignedCompletion.json · publishManifest.json      │
       │                                                         │
       ▼                                                         │
[10] Operator Review Gate ◀────────────────── WAIT HERE ──────┘
     operator reads reviewChecklist
     signs via MetaMask + Ledger
     broadcasts tx · records tx hash
       │
       ▼
[11] Extract Stepping Stones
     templates · evaluators · checklists · retrieval packets
     index in archive/index.json
       │
       ▼
    DONE ✓
```

### AGIJobDiscoveryPrime Procurement Flow

The Prime track operates as a multi-phase competitive selection protocol. At every `*_READY` state, the system stops and waits for explicit operator authorization before advancing.

```
PROCUREMENT DETECTED
       │
       ▼
INSPECTED          → procurement_snapshot.json · fit_evaluation.json
       │
       ▼
FIT_EVALUATED      → operator approves/rejects fit decision
       │
       ▼
COMMIT_READY       → commitment_material.json (salt: SENSITIVE, never logged)
                    unsigned_commit_tx.json · review_manifest.json
       │             ◀ OPERATOR SIGNS + BROADCASTS
       ▼
COMMIT_SUBMITTED   → tx hash recorded
       │
       ▼
REVEAL_READY       → unsigned_reveal_tx.json · commitment_verification.json
       │             ◀ OPERATOR SIGNS + BROADCASTS
       ▼
REVEAL_SUBMITTED
       │
       ▼
SHORTLISTED        → contract confirms shortlist position
       │
       ▼
FINALIST_ACCEPT_READY → stake_requirements.json · trial_execution_plan.json
                        unsigned_accept_finalist_tx.json
       │                 ◀ OPERATOR SIGNS + BROADCASTS
       ▼
FINALIST_ACCEPT_SUBMITTED
       │
       ▼
TRIAL_READY        → trial artifact built · IPFS published · fetch-back verified
                    unsigned_submit_trial_tx.json
       │             ◀ OPERATOR SIGNS + BROADCASTS
       ▼
TRIAL_SUBMITTED
       │
       ▼
SELECTED           → bridge to v1 execution
       │
       ▼
JOB_EXECUTION_IN_PROGRESS → full v1 lifecycle (above)
       │
       ▼
COMPLETION_READY   → unsigned_request_completion_tx.json
       │             ◀ OPERATOR SIGNS + BROADCASTS
       ▼
DONE ✓             → stepping stone extraction + archive indexing
```

---

## Artifact System

### v1 Job Artifacts

Every v1 job produces the following artifact directory at `agent/artifacts/job_<jobId>/`:

```
raw_spec.json               Raw job spec from chain/IPFS
normalized_spec.json        Structured, normalized version
strategy.json               Approach and handler selection rationale
brief.json                  Execution brief sent to handler
deliverable.md              Primary output (or .svg, .json, etc.)
execution_validation.json   Structural validation results
publication_validation.json IPFS publication record
publishManifest.json        Full publication manifest with CID
jobCompletion.json          Completion package summary
unsignedApply.json          Unsigned application tx
unsignedCompletion.json     Unsigned completion tx + reviewChecklist
```

### Prime Procurement Artifacts

Every procurement produces a directory at `agent/artifacts/proc_<id>/`:

```
state.json                           Phase state (single source of truth)
chain_snapshot.json                  On-chain state at last inspection
next_action.json                     Current recommended operator action
selection_to_execution_bridge.json   Links Prime win → v1 execution

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
  commitment_material.json           ⚠️  SENSITIVE: contains salt — never log or expose
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

### Unsigned Transaction Schema

All transaction packages follow this schema (`emperor-os/unsigned-tx/v1`):

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
  "decodedCall": {
    "method": "...",
    "args": {}
  },
  "generatedAt": "2026-04-04T00:00:00.000Z",
  "reviewMessage": "Human-readable description of what this tx does and why",
  "reviewChecklist": [
    "Verify jobId matches the job you intend to complete",
    "Confirm IPFS CID in decodedCall.args matches publishManifest.json",
    "Check AGIALPHA balance covers any stake requirement",
    "Simulate before broadcasting"
  ]
}
```

The operator reads `decodedCall` and the full `reviewChecklist` before signing. The system never skips this gate.

---

## Capability Archive & Flywheel

The capability archive (`agent/archive/`) is the compounding engine of the entire system.

**`agent/archive/index.json`** — Searchable index of all archived items. Structured for retrieval by domain, job type, skill tags, and quality tier.

**`agent/archive/items/<id>.json`** — Individual stepping-stone and retrieval packets. Each item includes:
- What the original job/procurement was
- What was produced
- What transfers to future work
- Domain tags and search keywords
- Quality signals (validator score, selection outcome)

**Archive discipline — mandatory at every job completion:**
- Templates reusable in similar jobs
- Validators and structural checkers for the job's domain
- Domain checklists encoding hard-won evaluation heuristics
- Retrieval-ready artifact packets
- Stepping-stone entries with explicit transfer analysis

**Retrieval-before-solving rule:** Before generating any application draft, trial deliverable, or completion artifact — search the archive. Solving from scratch when a validated prior artifact exists is a documented failure mode.

Archive quality beats archive size. An unindexed pile of files is archaeological debt, not a capability store.

---

## Operational Doctrine (SOUL.md)

Ten immutable operating principles. Load-bearing — not aspirational.

| # | Principle | Summary |
|---|---|---|
| 1 | **Artifacts Are the Record of Reality** | What's on disk is what happened. No artifact = didn't happen. |
| 2 | **Explicit State Over Implicit Progress** | No "probably done." Either there's a persisted state file or the system doesn't know. |
| 3 | **The LLM Is a Tool with Known Failure Modes** | LLM output is proposal material. Validate it. One call per job. |
| 4 | **The Signing Boundary Is Sacred** | Never, under any circumstances, for any reason. |
| 5 | **Human Authority at Consequential Edges** | System handles everything deterministically safe. Operator handles the rest. |
| 6 | **Capability Extraction Is Not Optional** | A job that leaves nothing for the archive is half done. |
| 7 | **Retrieval Before Solving From Scratch** | Search the archive before generating anything new. |
| 8 | **Legibility to Governors and Reviewers** | Any serious operator, auditor, or counterparty must understand the system from its outputs alone. |
| 9 | **Fail Loudly, Not Quietly** | Errors must propagate visibly. Silent failures are more dangerous than loud ones. |
| 10 | **Speed vs. Auditability — Choose Auditability** | Legible trail over throughput. Explicit gates over convenience. Reusable capability over one-off output. |

---

## Agent Identity (IDENTITY.md)

| Field | Value |
|---|---|
| **Name** | Emperor_OS |
| **Emoji** | ⚙️ |
| **Type** | Autonomous economic agent |
| **Vibe** | Precise. Bounded. Deliberate. Capable without recklessness. |
| **Not** | A chatbot. A script runner. A research assistant. A generic wrapper around an LLM. |
| **Economic role** | Competes for and completes real on-chain jobs against other agents. Validator-legible deliverables. Real stakes. |
| **Self-description** | "I am trying to be correct, not to seem autonomous." |

---

## Operator Contract (USER.md)

The operator is the **signing authority and strategic governor**. They are not passive.

**What the operator handles personally:**
- All transaction signing (MetaMask + Ledger)
- Fit approval decisions (`FIT_APPROVED` vs `NOT_A_FIT`)
- Strategic job selection policy
- External communications in the operator's name
- Capital allocation decisions

**What the operator expects from the system:**
- Arrive at review gates with complete artifacts and binary decision framing
- Don't surface noise — a quiet heartbeat is good
- Report failures as operational information, not social events requiring apology
- Make the archive grow
- Catch its own mistakes before surfacing them

**Operator preferences:**
- Technical — do not over-explain standard concepts
- Lead with state and impact, not process descriptions
- Give a recommendation — don't hedge into "it depends"
- Surface errors with context and a recovery path, not just the error message

---

## Heartbeat & Monitoring (HEARTBEAT.md)

`HEARTBEAT.md` is the live status document, updated by CI on each run.

**Heartbeat protocol:**
1. Read `HEARTBEAT.md` — follow any listed active tasks
2. If nothing listed, check: procurement deadlines approaching (< 4h is urgent), jobs in READY state, archive extraction backlog, decisions needed before next window
3. If nothing requires attention → return `HEARTBEAT_OK`
4. **Do not generate noise.** A quiet heartbeat is good system behavior.

The operator should only hear from the system when it matters.

---

## GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `autonomous.yml` | cron 15min *(paused)* | AGIJobManager v1 main loop |
| `procurement.yml` | cron 15min | AGIJobDiscoveryPrime procurement loop |
| `dry_run_loop.yml` | manual | Simulate v1 loop without on-chain txs |
| `dry_run_procurement.yml` | manual | Simulate procurement without on-chain txs |
| `check_auth.yml` | manual | Verify agent auth + AGIALPHA balance |
| `check_ens_resolver.yml` | manual | Verify ENS resolver + addr record |
| `set_ens_resolver.yml` | manual | Set ENS resolver + addr (one-time setup) |
| `claim_identity.yml` | manual | Claim ENS subdomain identity |
| `register_agent.yml` | manual | Register agent on Contract 2 |
| `check_procurements.yml` | manual | List active procurements on Contract 2 (safe, read-only) |
| `test_01.yml` | manual | E2E: research report → IPFS → completion metadata |
| `test_02.yml` | manual | E2E: SVG logo → IPFS → completion metadata |
| `keepalive.yml` | cron | EC2 keepalive |

**Deployment flow:** Push to `main` → GitHub Actions (`deploy.yml`) → SSH to EC2 → systemd service restart.

State files committed back to `main` with `[skip ci]` to prevent action loops.

---

## Infrastructure & Deployment

### EC2 Environment

| Parameter | Value |
|---|---|
| **Instance** | AWS EC2 Ubuntu 24.04 (`emperor-ec2`) |
| **RAM** | 16 GB |
| **Internal IP** | `172.31.13.131` |
| **Tailscale IP** | `100.104.194.128` |
| **SSH alias** | `emperor-ec2` (Cursor Remote-SSH) |
| **Note** | Public IP changes on stop/start — no Elastic IP allocated |

### Service Stack

| Service | Port | Description |
|---|---|---|
| **nginx** | 3000 | Reverse proxy → Mission Control frontend |
| **Mission Control API** | 3001 | Express API proxy for operator dashboard |
| **OpenClaw** | 18789 | Agent gateway / orchestrator |
| **Ollama** | (default) | Local inference (`qwen2.5-coder:7b`) |
| **Webhook Listener** | 9000 | GitHub auto-pull webhook (`webhook_listener.py`) |

Services managed via `systemd`. GitHub Actions deploys via SSH + systemd restart.

### Mission Control Deploy Note (separate service roots)

If Mission Control is deployed from `mission-control/` as an isolated service root (for example on Render), ensure runtime code paths do not require root-level dependency resolution via `agent/config.js` unless root dependencies are installed in that service image.

Current BYO-agent ingestion paths are written to avoid requiring `agent/config.js`/`dotenv` for Mission Control runtime startup.

### Environment Variables

| Variable | Purpose |
|---|---|
| `RPC_URL` | Ethereum mainnet RPC endpoint |
| `AGI_ALPHA_MCP` | AGI Alpha MCP endpoint URL |
| `ANTHROPIC_API_KEY` | Anthropic Claude API (primary LLM) |
| `GITHUB_TOKEN` | GitHub API access |
| `ETHERSCAN_KEY` | Etherscan API for chain data |
| `SUPABASE_KEY` | Supabase (logging + decision cache) |
| `PINATA_API_KEY` | Pinata IPFS pinning |
| `TELEGRAM_BOT_TOKEN` | `@Emperor_OS_bot` notifications |

> ⚠️ **Never commit secrets.** All secrets are stored as GitHub Actions secrets and injected at runtime. The `.gitignore` excludes all `.env` files.

---

## LLM Cost Architecture

Emperor_OS is engineered for **minimum LLM cost** without sacrificing decision quality. The hierarchy:

```
Level 1: Deterministic heuristic scoring (scorer_dev.js pattern)
         → Zero LLM cost. Handles majority of evaluation decisions.
         → Domain fit, token budget, timeline, capability match.

Level 2: Supabase decision cache
         → Zero LLM cost. Replays known patterns from prior jobs.
         → Hit on repeated job types eliminates the LLM call entirely.

Level 3: Ollama qwen2.5-coder:7b (local EC2)
         → Near-zero cost. Low-stakes classification and routing.
         → No network egress cost for inference.

Level 4: Primary LLM API (Anthropic Claude / Kimi K2.5)
         → Reserved for genuine reasoning that rules cannot resolve.
         → Target: ONE call per job. Enforced by architecture.
```

A job that results in two or more LLM API calls is an architecture violation, not just a cost issue.

---

## Security Model

| Boundary | Enforcement |
|---|---|
| **No private keys in runtime** | Architecturally excluded. No `ethers.Wallet`. No signing primitives. Hard doctrine. |
| **No broadcasting** | All write actions produce unsigned JSON envelopes. The operator broadcasts. |
| **Commitment salt secrecy** | `commitment_material.json` contains the salt used in commit-reveal. Treated as sensitive — never logged, never exposed in external communications. |
| **IPFS fetch-back** | Mandatory before any submission. Prevents submitting an artifact that isn't actually pinned and retrievable. |
| **Atomic state writes** | All state mutations use `<path>.tmp` → rename. Prevents partial writes from corrupting state on crash. |
| **Operator approval gates** | All `*_READY` states are hard stops. The system never self-approves a procurement phase transition. |
| **Lock file** | Prevents concurrent loop runs that could produce duplicate on-chain actions. |

---

## Validated IPFS Runs

### test_01 — Smart Contract Research Report (`2026-03-27`)

| Asset | CID |
|---|---|
| Job Spec | `QmcZErDbkCECXwNnW89dgCXxR8LE4mWf4LN3uoXX2Z4e3K` |
| Deliverable (Markdown) | `Qmb9UQFLQggGbVf3PoZB7x8mLn1syirc24rbLa6TGipvs4` |
| Completion Metadata | `QmQgm4cinJBa1wVZqAvgXbnBPWdrZGpMNMNG8zwtxuoV8f` |

### test_02 — Emperor_OS SVG Logo (`2026-03-28`)

| Asset | CID |
|---|---|
| Job Spec | `QmTdZkTVedm1mGdTwjcXAFXi5GgzSar7H1QkdDpzvrcNRj` |
| Deliverable (SVG, 16,217 chars) | `QmX3UyUQgKg1afDvdsbomjpHz77v4hZwHwMbnUfSErHeqw` |
| Completion Metadata | `QmTBMUxBru5dgJKAdu8o8UHXhe54AmK7DAsPsKhenTNs2m` |

Both runs completed the full pipeline: execution → IPFS publication → fetch-back verification → unsigned completion tx construction. These are mainnet-validated.

---

## Authority Hierarchy

When there is any conflict between files in this repository, the resolution order is:

| Priority | File | Scope |
|---|---|---|
| **1** | `docs/ARCHITECTURE_DOCTRINE.md` | Non-negotiable architectural invariants |
| **2** | `core/MASTER_EXECUTION_ORDER.md` | Build sequencing and phase discipline |
| **3** | `SOUL.md` | Operating values and principles |
| **4** | `AGENTS.md` | Session and operational rules |
| **5** | Everything else | Implementation that serves the above |

If implementation contradicts doctrine, the implementation is wrong.

---

## Session Startup Protocol

Execute this at the start of every session. No exceptions. No skipping.

```
Step 1 — Load identity and values
         SOUL.md → IDENTITY.md

Step 2 — Load operator context
         USER.md

Step 3 — Load recent memory
         memory/YYYY-MM-DD.md  (today + yesterday)
         memory/MEMORY.md      (main sessions only)

Step 4 — Assess operational state
         agent/artifacts/proc_*/state.json  → any active procurements?
         agent/state/jobs/*.json            → any active v1 jobs?

Step 5 — Check heartbeat
         HEARTBEAT.md
         memory/heartbeat-state.json

Then act. Do not ask permission for the above. Read, assess, orient, engage.
```

---

## Known Issues

| # | Description | Status |
|---|---|---|
| 1 | `isAuthorizedAgent` reverts on Contract 2 even after ENS resolver set | Low priority — may not block actual job applications; under investigation |
| 2 | `autonomous.yml` paused | Pending Prime integration completion; human-in-loop operating mode active |
| 3 | EC2 public IP not static | Changes on stop/start — no Elastic IP allocated. Tailscale (`100.104.194.128`) used for stable access. |

---

## Roadmap

| Milestone | Description | Status |
|---|---|---|
| ✅ Identity established | ENS name registered, agent wallet configured, AlphaAgentIdentity NFT held | Complete |
| ✅ IPFS pipeline validated | Full end-to-end: execution → IPFS → fetch-back → unsigned tx | Complete |
| ✅ Prime procurement modules built | Full phase model, tx builder, review gates, monitor | Complete |
| ✅ Operator dashboard | Mission Control (React + Express API) deployed on EC2 | Complete |
| 🔄 Prime track record | First live procurement applications on mainnet | In progress |
| 🔄 Capability archive | First stepping-stone extractions indexed | In progress |
| ⏳ Autonomous v1 loop re-enable | Re-enable `autonomous.yml` after Prime integration stabilizes | Pending |
| ⏳ Decision cache | Supabase-backed pattern replay for zero-LLM-cost repeat jobs | Planned |
| ⏳ Dispatcher | Route `mcp_dev` outputs to correct Lobster pipeline | Planned |
| ⏳ Webhook auto-pull | `webhook_listener.py` systemd service for instant EC2 deploys | Partially implemented |

---

<div align="center">

**Emperor_OS** — Precise. Bounded. Deliberate. Compounding.

*Built to compete. Designed to be trusted.*

</div>
