# EMPEROR_OS → PRIME EXECUTION ORDER (MASTER)

Purpose: transform Emperor_OS into a Prime-capable, production-safe system using strict sequencing and safety doctrine.

This is an execution order, not a concept note.

---

## 0) Operating Principle

You are not redesigning the system.
You are here to:
- audit what exists
- preserve what is correct
- implement what is missing
- enforce safety doctrine
- make the system operational on a live Prime procurement

---

## 1) DO NOT TOUCH (CRITICAL)

### 1.1 Signing boundary
- NO private keys in runtime
- NO signing in code
- NO broadcasting in code

### 1.2 Workflow philosophy
- artifact-first
- deterministic evaluation
- explicit review gates
- unsigned-only tx handoff

### 1.3 Execution constraints
- no LLM before assignment
- max 1 LLM call per job
- persistent state per job/procurement
- crash recovery required
- singleton execution

### 1.4 Workspace boundary
Only operate inside:

`/home/ubuntu/emperor_OS/.openclaw/workspace`

---

## 2) AUDIT PHASE (MANDATORY FIRST)

Do not write code first.

### 2.1 Map existing structure
Identify:
- `agent/`
- `brain/`
- `pipelines/`
- MCP client (`mcp_dev.js` or equivalent)
- ABI registry
- artifact handling
- any Prime-related code (including partials)

### 2.2 Identify what exists vs missing
Build a capability table:

| Capability | Exists | Partial | Missing |
|---|---|---|---|
| Prime read layer | ? | ? | ? |
| Prime tx builders | ? | ? | ? |
| State machine | ? | ? | ? |
| Artifact system | ? | ? | ? |
| Unsigned tx format | ? | ? | ? |
| Monitoring loop | ? | ? | ? |
| Persistence | ? | ? | ? |

### 2.3 Validate doctrine enforcement
Check:
- any signing logic → MUST NOT exist
- any broadcasting → MUST NOT exist
- any hidden execution → MUST NOT exist

If found, mark as violation and do not expand those paths.

### Audit outputs (required)
- `docs/audits/PRIME_GAP_ANALYSIS_2026-04-01.md`
- `docs/audits/PRIME_SYSTEM_MAP_2026-04-01.md`

---

## 3) BUILD PHASE ORDER (STRICT)

Implement in this exact order.

### PHASE 1 — TRUTH LAYER (NO WRITES)
Goal: system understands Prime without acting.

Workstreams:
1. Prime read client (`procurement fetch`, deadlines, linked job id, applicant/finalist state, phase indicators)
2. Procurement inspector (`procurementId` in; normalized snapshot + human summary out)
3. Read-only state machine (COMMIT, REVEAL, SHORTLIST, FINALIST, TRIAL, SCORING, FINALIZED)
4. Read-only next-action engine (phase, next valid action, blocked reason)

Deliverables:
- `prime_client.js`
- `procurement_inspector.js`
- `state_machine.js`
- `next_action.js`

### PHASE 2 — PERSISTENCE LAYER
Goal: restart safety.

Workstreams:
1. Per-procurement directory: `artifacts/proc_<id>/`
2. Required files: `state.json`, `deadlines.json`, `next_action.json`, `chain_snapshot.json`
3. Commitment storage: salts, hashes, reveal bindings

Deliverables:
- `state_store.js`
- file schema definitions

### PHASE 3 — ARTIFACT CONTRACTS
Goal: standardized outputs.

Define structures for:
- inspection
- application
- reveal
- finalist
- trial
- completion

Each must include:
- data
- metadata
- review manifest

Deliverables:
- artifact builders
- JSON schemas

### PHASE 4 — UNSIGNED TX SYSTEM
Goal: all writes are reviewable packages.

Implement builders for:
- `commitApplication`
- `revealApplication`
- `acceptFinalist`
- `submitTrial`
- `requestJobCompletion`

Each package must include:
- decoded call
- args
- chain id
- contract address
- phase binding

Deliverables:
- `tx_builder_prime.js`
- `signing_manifest.json` generator

### PHASE 5 — REVIEW GATES
Goal: block invalid actions.

Before each phase, validate:
- required artifacts exist
- chain state
- deadlines
- previous phase completion

Deliverables:
- `review_engine.js`
- phase-specific checklists

### PHASE 6 — MONITORING LOOP
Goal: track live procurements.

Implement:
- polling loop
- deadline tracking
- state refresh
- transition detection
- restart resume

Deliverable:
- `prime_monitor.js`

### PHASE 7 — EXECUTION INTEGRATION
Goal: bridge Prime → Job execution.

When selected:
- transition into existing job execution flow
- reuse execution pipeline
- generate completion artifacts
- build unsigned completion tx

Deliverable:
- integration layer between Prime and AGIJobManager flow

### PHASE 8 — RETRIEVAL SYSTEM (MINIMAL)
Goal: avoid zero-state solving.

Implement:
- search previous artifacts
- generate `retrieval_packet.json`
- attach to application/trial/completion

Deliverable:
- `retrieval.js`

---

## 4) MILESTONE CHECKLIST

- **M1 — Visibility:** inspect procurement, derive phase, explain next action
- **M2 — Persistence:** survives restart, state remains correct
- **M3 — Action Packaging:** builds unsigned, decoded commit/reveal/trial packages
- **M4 — Monitoring:** detects deadlines and transitions
- **M5 — End-to-End Prime Flow:** application → reveal → trial → selection → completion

---

## 5) FAILURE CONDITIONS

System is broken if it:
- signs anything
- broadcasts anything
- loses state on restart
- produces tx without decode
- allows invalid phase transitions
- submits unverified artifacts

---

## 6) SUCCESS STATE

System is correct when:
- operator can run live Prime procurement safely
- system explains next operator action
- system produces complete artifact packages
- system produces unsigned tx for every action
- operator can sign safely via MetaMask + Ledger
- system resumes cleanly after restart

---

## 7) Final Directive

Do not optimize prematurely.  
Do not abstract prematurely.  
Do not add complexity before correctness.

Build in order:
truth → state → artifacts → transactions → monitoring → execution linkage.
