# Prime Gap Analysis — Emperor_OS
_Audit date: 2026-04-01 | Branch: claude/prime-operational-upgrade-9vzxt_

---

> ⚠️ **FINAL STATUS (updated 2026-04-04): ALL 35 GAPS RESOLVED**
>
> This file records a point-in-time pre-integration audit.
> All gaps have been closed. The Prime substrate is fully operational.
> See "Final Resolution Summary" at the bottom of this file.

---

## Final Resolution Summary

**Total gaps identified:** 35  
**Fully resolved:** 35  
**Open:** 0  

### Doctrine Violation Status

| Violation | Status | Resolution |
|---|---|---|
| DV-001 — Private key in runtime | **RESOLVED** | `procurement_agent.js` throws on line 3 — disabled. New substrate never loads keys. |
| DV-002 — Signing in runtime | **RESOLVED** | `prime-tx-builder.js` produces unsigned tx packages only. Operator signs externally. |
| DV-003 — No review gate | **RESOLVED** | `prime-review-gates.js` (258 lines) — hard-stop gates for every phase. |
| DV-004 — State outside workspace | **RESOLVED** | `prime-state.js` — atomic writes inside `artifacts/proc_<id>/`. |
| DV-005 — LLM before assignment | **RESOLVED** | `prime-evaluate.js` — deterministic fit gate before any LLM call. |
| DV-006 — Max 1 LLM call | **RESOLVED** | `prime-orchestrator.js` / `prime-content.js` — single LLM call discipline enforced. |

### Module Inventory (20 Prime modules)

All 11 modules called for in the original gap analysis exist, plus 9 additional modules:

| Module | Lines | Purpose |
|---|---|---|
| `prime-client.js` | 383 | Read-only typed RPC client for Contract 2 |
| `prime-inspector.js` | 264 | Procurement snapshot + phase derivation |
| `prime-phase-model.js` | 339 | State machine constants + transitions |
| `prime-next-action.js` | 446 | Deterministic next-action engine |
| `prime-state.js` | 379 | Per-procurement atomic persistence |
| `prime-artifact-builder.js` | 571 | Phase-specific artifact bundle builders |
| `prime-tx-builder.js` | 540 | Unsigned tx package builders (5 tx types) |
| `prime-review-gates.js` | 258 | Hard-stop precondition enforcement |
| `prime-monitor.js` | 376 | Restart-safe monitoring loop |
| `prime-execution-bridge.js` | 303 | Selection → job execution link |
| `prime-retrieval.js` | 330 | Retrieval-before-solve + archive writeback |
| `prime-tx-validator.js` | 55 | Unsigned tx validation against allowlist |
| `prime-receipts.js` | 26 | Operator-signed receipt ingestion |
| `prime-validator-engine.js` | 103 | Deterministic scoring + commitment |
| `prime-settlement.js` | 23 | Finality depth checks + winner reconciliation |
| `prime-presign-checks.js` | 70 | Pre-sign validation + simulation |
| `prime/prime-orchestrator.js` | 1176 | Central coordinator / action layer |
| `prime/prime-content.js` | 516 | Content generation + IPFS publishing |
| `prime/prime-first-job.js` | 38 | First-procurement dry-run helper |
| `prime/prime-evaluate.js` | 228 | Deterministic fit evaluation |

### ABI Registry

`AGIJobDiscoveryPrime` is registered in `core/abi-registry.js` alongside `AGI_JOB_MANAGER` and `AGIALPHA_TOKEN`. ABI file exists at `agent/abi/AGIJobDiscoveryPrime.json`.

---

## Resolved Since This Audit

- Prime read layer now exists (`agent/prime-client.js`, `agent/prime-inspector.js`).
- Prime phase model + deterministic next-action engine now exist (`agent/prime-phase-model.js`, `agent/prime-next-action.js`).
- Prime persistence now exists per procurement (`agent/prime-state.js`).
- Prime artifact bundle schemas are implemented (`agent/prime-artifact-builder.js`).
- Prime unsigned tx builders are implemented (`agent/prime-tx-builder.js`).
- Retrieval-before-solve and archive writeback are implemented (`agent/prime-retrieval.js`).
- Prime operator docs now exist (`docs/prime_operator_runbook.md`, `docs/prime_unsigned_handoff_spec.md`, `docs/prime_phase_model.md`).

---

## Capability Gap Table

| Capability | Exists | Partial | Missing | Notes |
|---|:---:|:---:|:---:|---|
| Prime reads (procurement struct, applicationView) | | ✓ | | `check_procurements.js` does safe reads. Not in workspace boundary. |
| Prime read layer in workspace | | | ✓ | No `prime-client.js` in `.openclaw/workspace/agent/`. |
| Prime phase model | | | ✓ | Phase labels exist as strings in `check_procurements.js` but no state machine. |
| Prime phase derivation (live from chain) | | | ✓ | `procStatus()` exists in check script; not a reusable module. |
| Prime next-action engine | | | ✓ | No "what to do now" module anywhere. |
| Prime persistence (per-procurement, workspace) | | | ✓ | Only flat `agi-agent/data/procurement_state.json` outside workspace boundary. |
| Prime artifact schemas — inspection bundle | | | ✓ | No schema defined. |
| Prime artifact schemas — application bundle | | | ✓ | No schema defined. |
| Prime artifact schemas — reveal bundle | | | ✓ | No schema defined. |
| Prime artifact schemas — finalist bundle | | | ✓ | No schema defined. |
| Prime artifact schemas — trial bundle | | | ✓ | No schema defined. |
| Prime artifact schemas — selection bundle | | | ✓ | No schema defined. |
| Prime artifact schemas — completion bundle | | | ✓ | No schema defined. |
| Unsigned tx builder — commitApplication | | | ✓ | Not built. `procurement_agent.js` signs directly (doctrine violation). |
| Unsigned tx builder — revealApplication | | | ✓ | Not built. `procurement_agent.js` signs directly (doctrine violation). |
| Unsigned tx builder — acceptFinalist | | | ✓ | Not built. `procurement_agent.js` signs directly (doctrine violation). |
| Unsigned tx builder — submitTrial | | | ✓ | Not built. `procurement_agent.js` signs directly (doctrine violation). |
| Unsigned tx builder — requestJobCompletion (Prime-linked) | | ✓ | | v1 builder exists; needs procurement provenance fields. |
| Prime review manifests — commit gate | | | ✓ | No phase-specific review manifest. |
| Prime review manifests — reveal gate | | | ✓ | No phase-specific review manifest. |
| Prime review manifests — finalist accept gate | | | ✓ | No phase-specific review manifest. |
| Prime review manifests — trial submission gate | | | ✓ | No phase-specific review manifest. |
| Prime monitoring loop | | ✓ | | `check_procurements.yml` scans for events but: no deadline tracking, no restart resume, no transition detection. |
| Restart-safe procurement resume | | | ✓ | Not implemented. State is non-atomic flat file. |
| Selection detection / fallback promotion | | | ✓ | No winner detection or fallback logic. |
| Selection-to-execution bridge | | | ✓ | No bridge from Prime procurement → AGIJobManager v1 completion flow. |
| Retrieval-before-solve for Prime phases | ✓ | | | **Resolved post-audit** (`agent/prime-retrieval.js`). |
| Archive stepping-stone writeback | ✓ | | | **Resolved post-audit** (`agent/prime-retrieval.js`). |
| Publication verification (fetch-back) | ✓ | | | `ipfs-verify.js` + `validate.js` exist for v1. Not wired into Prime phases. |
| Operator runbook — Prime end-to-end | | | ✓ | No Prime-specific runbook. |
| Operator runbook — unsigned handoff spec | | | ✓ | Not written. |
| Operator runbook — phase model reference | | | ✓ | Not written. |
| Prime ABI registered in workspace | | | ✓ | Only inline fragments in `agi-agent/procurement_agent.js`. |
| AGIJobDiscoveryPrime ABI file in workspace | | | ✓ | `abi/AGIJobDiscoveryPrime.json` does not exist. |

---

## Doctrine Violation Inventory

### DV-001 — CRITICAL: Private key in runtime (`agi-agent/procurement_agent.js:57`)
**Severity:** CRITICAL  
**Description:** `new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider())` — private key is loaded into runtime and used to sign transactions.  
**Doctrine rule violated:** "private key handling in runtime — FORBIDDEN"  
**Remediation:** The new Prime substrate (`prime-tx-builder.js`) must build unsigned tx packages only. The wallet function must not exist in the new implementation.

### DV-002 — CRITICAL: Signing in runtime (`procurement_agent.js:302,327,382,427`)
**Severity:** CRITICAL  
**Description:** `contract().commitApplication()`, `revealApplication()`, `acceptFinalist()`, `submitTrial()` — each call signs and broadcasts a live transaction.  
**Doctrine rule violated:** "signing in worker/runtime — FORBIDDEN", "broadcasting in worker/runtime — FORBIDDEN"  
**Remediation:** Each action must produce an unsigned tx package JSON file, not broadcast. Human operator signs in MetaMask + Ledger.

### DV-003 — HIGH: No review gate before on-chain action (`procurement_agent.js`)
**Severity:** HIGH  
**Description:** No artifact completeness check, no review manifest, no precondition validation exists before any of the four on-chain actions.  
**Doctrine rule violated:** "Human approval is required for high-impact external decisions"  
**Remediation:** Implement `prime-review-gates.js` with hard stops and checklist manifests before each phase.

### DV-004 — MEDIUM: State outside workspace boundary (`agi-agent/data/`)
**Severity:** MEDIUM  
**Description:** `agi-agent/data/procurement_state.json` is a flat file outside `.openclaw/workspace/`. It uses non-atomic writes (`writeFileSync`).  
**Doctrine rule violated:** Workspace boundary; restart safety  
**Remediation:** `prime-state.js` in workspace uses atomic rename writes; `artifacts/proc_<id>/` structure.

### DV-005 — MEDIUM: LLM called before confirmed assignment
**Severity:** MEDIUM  
**Description:** `evaluate()` (LLM call) fires on discovery of any new procurement, not after confirmed assignment.  
**Doctrine rule violated:** "no LLM before confirmed assignment"  
**Remediation:** LLM evaluation may only be called after fit gate is passed and inspection bundle is prepared. Deterministic scoring must run first.

### DV-006 — LOW: Max 1 LLM call not enforced for Prime
**Severity:** LOW  
**Description:** `procurement_agent.js` makes separate LLM calls for evaluate, draftApplication, and draftTrial — three calls per procurement.  
**Doctrine rule violated:** "max one LLM call per job"  
**Remediation:** Enforce single consolidated LLM call gate in the new substrate.

---

## Code Paths Requiring Refactor vs Extension

### Must NOT be extended (doctrine violation)
- `agi-agent/procurement_agent.js` — signing/broadcasting code. **Must not be called from new Prime substrate.** Document and supersede.

### Can be safely used as reference / ported
- `agi-agent/check_procurements.js` — read-only Contract 2 scans. Logic should be ported into workspace `prime-client.js` and `prime-inspector.js`.
- `agi-agent/procurement_agent.js` — ABI fragments, `computeCommitment()` logic, `pinMarkdown()`, `fetchJobSpec()`. These pure functions can be ported.

### Extension points (no refactor needed)
- `.openclaw/workspace/agent/tx-builder.js` — extend with Prime kind support and procurementId fields
- `.openclaw/workspace/agent/artifact-manager.js` — extend with `proc_<id>/` path support
- `.openclaw/workspace/agent/state.js` — reuse `readJson`/`writeJson` utilities
- `.openclaw/workspace/agent/abi-registry.js` — add AGIJobDiscoveryPrime registration
- `.openclaw/workspace/agent/mcp.js` — reuse for spec fetches
- `.openclaw/workspace/agent/ipfs-verify.js` — reuse for Prime publication verification
- `.openclaw/workspace/agent/validate.js` — reuse for trial/completion artifact validation

### Needs new Prime-specific modules (no existing equivalent)
- `prime-client.js` — read-only typed RPC layer for Contract 2
- `prime-inspector.js` — procurement snapshot + phase derivation
- `prime-phase-model.js` — explicit state machine constants + transitions
- `prime-next-action.js` — next legal action engine
- `prime-state.js` — per-procurement workspace-boundary persistence
- `prime-artifact-builder.js` — phase-specific artifact bundle builders
- `prime-tx-builder.js` — Prime unsigned tx package builders
- `prime-review-gates.js` — precondition enforcement before each phase
- `prime-monitor.js` — restart-safe monitoring loop
- `prime-execution-bridge.js` — selection → job execution link
- `prime-retrieval.js` — retrieval-before-solve scaffolding

---

## Summary

**Total gaps identified:** 35  
**Critical doctrine violations:** 2 (signing + private key in runtime)  
**High violations:** 1 (no review gate)  
**Medium violations:** 2  
**Low violations:** 1  
**Files to create (new):** 11  
**Files to extend (existing):** 5  
**Files to supersede (doctrine violation):** 1 (`procurement_agent.js`)
