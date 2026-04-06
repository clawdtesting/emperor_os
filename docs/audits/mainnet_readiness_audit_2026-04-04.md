# Mainnet Readiness Audit — AGIJobManager + AGIJobDiscoveryPrime

Date: 2026-04-04  
Last updated: 2026-04-05  
Scope: `agent/`, `core/`, `mission-control/`, `AgiJobManager/`, `AgiPrimeDiscovery/`

---

> **This audit has been updated to reflect all fixes applied through 2026-04-05.**
> All 10 red-team vulnerabilities are resolved. AGIJobManager and Prime applicant
> gaps have been substantially closed. See "Change Log" at the bottom.

---

## Executive Verdict

| Area | Verdict | Rationale |
|---|---|---|
| AGIJobManager applicant readiness | **Ready (supervised)** | State machine validation, receipt checks, freshness guards, and idempotency all in place. |
| AGIJobManager validator readiness | Not ready | No canonical validator assignment/evidence/scoring action path exists in active runtime. |
| Prime applicant readiness | **Ready (supervised)** | All 7 phase transitions now receipt-driven. Reorg rollback, idempotency, and deadline guards active. |
| Prime validator readiness | Scaffolded | Validator commit/reveal handlers exist with idempotency + receipt ingestion, but end-to-end scoring pipeline not fully wired. |
| Unsigned transaction safety readiness | **Strong** | Prepared tx target validation, strict boolean gates, freshness enforcement (generatedAt + expiresAt), simulation checks on all tx types. |
| Restart/state-machine readiness | **Strong** | Atomic writes (unique temp filenames), SHA-256 hash chain, transition validation, reorg-aware rollback, idempotent replay guards. |
| Mission Control operator readiness | Partially ready | Useful observability and helper decoding, but not yet a robust signed-tx lifecycle control lane. |

## Canonical Runtime Path vs Stale Paths

- **Canonical runtime path (source of truth):** `agent/*` for orchestration/state/actions, with shared safety/utility modules via `core/*` re-exports.
- **Operator surface path:** `mission-control/*` (read/assist UI and API proxy).
- **Stale/legacy paths:** `AgiJobManager/*` and `AgiPrimeDiscovery/*` include historical direct-signing assumptions; currently disabled/inconsistent with unsigned-only doctrine.

---

## AGIJobManager Applicant Audit

### What exists (wired)
1. Job discovery + local state enqueue + artifact initialization.
2. Deterministic scoring/fit strategy and state transitions.
3. Unsigned apply package generation with approve/apply selector checks.
4. Assignment detection from remote job reads.
5. Execution pipeline with briefing + output validation.
6. Completion metadata/IPFS packaging + unsigned completion tx + pre-sign decode/sim checks.
7. Reconciliation polling for submitted/completed/disputed states.

### What was fixed
- **State machine validation** — `setJobState()` now validates status changes against `VALID_TRANSITIONS` map. Invalid transitions throw. Added `transitionJobStatus()` for explicit validated transitions.
- **Duplicate submission prevention** — `submit.js` checks for finalized completion receipt before staging a new unsigned package.
- **Package freshness** — `buildUnsignedApplyTxPackage()` now includes `expiresAt` (30 min TTL). `runPreSignChecks()` validates both `expiresAt` (not expired) and `generatedAt` (max 30 min age).
- **Idempotency keys** — Already present at every step (`claimJobStageIdempotency`).

### Remaining gaps
- Some stage advancement is still state-observation-based rather than receipt/finality-bound (notably execution → deliverable_ready).
- Recovery model is practical but not a full deterministic replay journal.

---

## AGIJobManager Validator Audit

### Current state
- Canonical `agent/` job pipeline contains no validator role lifecycle branch.
- No validator evidence fetch, scoring adjudication, score tx handoff, or validator settlement reconciliation found.

### Verdict
- **Not implemented (not ready)**.

---

## Prime Applicant Audit

### What exists (wired)
1. Procurement detection via event scans with persisted monitor cursors.
2. Deadline/phase derivation and next-action computation.
3. Inspection + fit evaluation artifacts and gates.
4. Commit/reveal/finalist/trial/completion unsigned tx builders + READY packets.
5. Trial publication + fetch-back verification prior to submission handoff.
6. Winner evidence collection + reconciliation helpers.

### What was fixed
- **Uniform receipt/finality ingestion** — All 7 phase transitions now require finalized receipts as the primary signal:
  - COMMIT_READY → COMMIT_SUBMITTED: receipt check (was already correct)
  - REVEAL_READY → REVEAL_SUBMITTED → SHORTLISTED: now requires finalized reveal receipt before advancing (was bypassed via chain phase inference)
  - FINALIST_ACCEPT_READY → FINALIST_ACCEPT_SUBMITTED → TRIAL_IN_PROGRESS: now requires finalized acceptFinalist receipt (was pure chain phase inference)
  - TRIAL_READY → TRIAL_SUBMITTED: receipt + chain phase corroboration (was already correct)
  - COMPLETION_READY → COMPLETION_SUBMITTED: now has explicit WAIT_COMPLETION action handler
  - SCORE_COMMIT/SCORE_REVEAL: receipt-driven via handleReceiptDrivenReadyTransitions (was already correct)
- **Reorg-aware cursor rollback/repair** — `checkProcurementReorgIntegrity()` verifies sync block hash on each refresh. Auto-rolls back `_SUBMITTED` → `_READY` states if reorg detected. Records `syncBlock` + `syncBlockHash` in chain_snapshot and state.
- **Strict idempotent, replay-safe orchestration** — `guardDeadline()` hard-rejects actions if on-chain window expired. `guardIdempotentStep()` extended to INSPECT, EVALUATE_FIT, DRAFT_APPLICATION. All 13 action handlers now have idempotency or deadline guards.

### Remaining gaps
- Validator scoring pipeline not fully wired end-to-end (see Prime Validator Audit below).

---

## Prime Validator Audit

### What exists
- Validator statuses and transitions are represented in phase model.
- Unsigned `scoreCommit` and `scoreReveal` package builders exist.
- Orchestrator contains validator action handlers with idempotency guards.
- `handleReceiptDrivenReadyTransitions()` maps validator score commit/reveal receipt ingestion.

### Critical missing wiring
- No canonical runtime producer found for `validatorScoreCommitPayload` / `validatorScoreRevealPayload` (payload generation depends on external scoring logic).
- No end-to-end deterministic validator scoring/evidence pipeline.

### Verdict
- **Scaffolded but not operationally ready**.

---

## Safety and Signing Audit

### Strong today
- Active path follows unsigned-handoff model.
- Legacy AGIJobManager broadcast helpers are disabled.
- Core decode/allowlist/simulation checks exist for AGIJobManager completion handoffs.
- Prepared tx target validation — `normalizePreparedTx()` asserts contract address match before packaging (Prime).
- All boolean gate fields use strict `=== true` checks (no truthy bypasses).
- Commit gate enforces `fit_evaluation.decision === "PASS"` exactly.
- Unsigned package freshness: `generatedAt` (max 30 min age) + `expiresAt` enforced in `runPreSignChecks()`.
- State integrity: SHA-256 hash chain on every read/write, with `assertStateIntegrity()` guards at 8 critical tx-building entry points.

### Partial today
- Repo-wide static/CI anti-signing enforcement is not fully hardened.
- Legacy folders still carry conflicting historical assumptions.

---

## State / Persistence / Orchestration Audit

### Strong today
- Atomic JSON writes with unique temp filenames (race-safe) across 6 files.
- Process lock for singleton runtime.
- Monitor cursor persistence across restarts with reorg-aware reconciliation.
- Explicit transition validation in Prime status machine — all status writes validated.
- SHA-256 state integrity hash chain on every read/write — tamper detection active.
- State hash verification at 8 critical tx-building entry points (fail-closed).
- Append-only LLM call audit log replaces mutable counter (`llm_audit.json`).
- Monitor health tracking with escalating FATAL threshold (default 5 consecutive failures).
- Archive index written before any state file is pruned — provenance preserved.
- Job state machine validation with `VALID_TRANSITIONS` map and `transitionJobStatus()`.
- Idempotent replay guards on all Prime action handlers (`guardIdempotentStep`).
- Cross-deadline enforcement via `guardDeadline()` on commit/reveal/trial windows.

### Remaining gaps
- Recovery still includes heuristic corrections in crash recovery paths (rollback-only, no forward recovery).
- Exactly-once semantics not enforced uniformly across all edge cases.
- Unattended multi-day operation remains below strict production confidence threshold.

---

## Mission Control Audit

### Useful today
- Prime contract read views.
- Next-action helper reads and decoded guidance cards.
- Event scan tooling and quick context for job/procurement IDs.

### Gaps
- Primarily observational; not a full execution control plane for signed tx lifecycle.
- Some action-code mappings are inferred, which can mislead at high-stakes edges if not kept synchronized with protocol truth.

### Required upgrades for operational supervision
1. Add signed-tx lifecycle lane: `READY -> SIGNED -> BROADCAST -> FINALIZED` with timestamped acknowledgments.
2. Add per-procurement operator checklist completion + decision logging linked to ready packets.
3. Add alert rails for deadline-critical actions (<4h, <1h, expired) with acknowledgment requirement.
4. Add validation display for package freshness, simulation status, decoded selector, and artifact hash bindings.

---

## Top Mainnet Blockers (Priority)

1. ~~Prime validator payload generation and role-wired scoring flow absent end-to-end.~~ → **Partially resolved** (handlers exist, payload generation needs wiring).
2. AGIJobManager validator role pipeline absent in canonical runtime.
3. ~~Incomplete selector-policy enforcement for Prime `scoreCommit`/`scoreReveal` validation.~~ → **Resolved** (gate checks + idempotency in place).
4. ~~Non-uniform mandatory simulation/freshness enforcement across all Prime tx packages.~~ → **Resolved** (freshness checks in `runPreSignChecks()`).
5. ~~Receipt/finality ingestion not uniformly required before status progression.~~ → **Resolved** (all 7 transitions now receipt-driven).
6. ~~Reorg-resilient monitor cursor strategy incomplete.~~ → **Resolved** (block hash verification + auto-rollback).
7. ~~Cross-phase replay/idempotency guarantees incomplete for unattended operation.~~ → **Resolved** (guardIdempotentStep + guardDeadline on all handlers).
8. Mission Control lacks robust operator action lane for tx package lifecycle management.
9. Legacy path ambiguity (deprecated folders with conflicting assumptions) increases operational confusion risk.
10. ~~Artifact integrity binding not uniformly anchored for every irreversible handoff.~~ → **Resolved** (SHA-256 hash chain + provenance bundles).

---

## Build Plan

### Phase 1 — AGIJobManager applicant minimum ✅ COMPLETE
1. ~~Add required tx hash + receipt ingestion + finality checks for apply/completion handoffs.~~ → Done
2. ~~Add idempotency keys for each pipeline stage.~~ → Already present
3. ~~Harden completion reconciliation with deterministic provenance.~~ → Done (provenance bundle hash)
4. ~~Add state transition validation.~~ → Done (`VALID_TRANSITIONS` map)
5. ~~Add package freshness guards.~~ → Done (`expiresAt` + `generatedAt` + max-age check)

**Acceptance criteria**
- ✅ No state transition without associated finalized receipt reference (where applicable).
- ✅ Duplicate cycle replay does not generate duplicate side effects.
- ✅ Every completion handoff contains a deterministic provenance bundle hash.

### Phase 2 — Prime applicant minimum ✅ COMPLETE
1. ~~Make commit/reveal/finalist/trial/completion transitions receipt-driven.~~ → Done
2. ~~Enforce simulation + expiry checks for all Prime unsigned tx types.~~ → Done
3. ~~Add reorg-aware cursor reconciliation and rollback logic.~~ → Done
4. ~~Add idempotent replay guards and deadline enforcement.~~ → Done

**Acceptance criteria**
- ✅ READY→SUBMITTED transitions require explicit receipt ingestion.
- ✅ Any expired package is hard-rejected pre-handoff.
- ✅ Event index can recover deterministically after simulated reorg tests.

### Phase 3 — Prime validator minimum (IN PROGRESS)
1. Implement validator role discovery and persistence.
2. Implement deterministic scoring + payload artifact builder.
3. Wire score commit/reveal progression with strict continuity checks.

**Acceptance criteria**
- Validator actions only unlock when role assignment is chain-confirmed.
- Reveal payload must verify against previously committed score hash.
- Validator lifecycle can run end-to-end in restart simulation without manual state surgery.

### Phase 4 — Mainnet hardening
1. CI guardrails to forbid signing/broadcast primitives in runtime code.
2. Unified artifact-root hash binding in every ready packet.
3. Chaos/restart tests for missed windows, delayed polling, and partial-state recovery.

**Acceptance criteria**
- CI fails on signing primitive usage in canonical runtime paths.
- Every irreversible handoff has a single review-root hash.
- Multi-day unattended dry run passes with deterministic recovery logs.

---

## Bottom Line

- AGIJobManager apply reliability: **Ready (supervised)**.
- AGIJobManager complete reliability: **Ready (supervised)**.
- Prime applicant end-to-end reliability: **Ready (supervised)**.
- Prime validator end-to-end reliability: **Scaffolded** (handlers exist, pipeline needs wiring).
- Safe unattended mainnet operation under unsigned-only doctrine: **Approaching readiness for supervised operation**.

Supervised human-in-loop operation is now robust with explicit operator discipline, tight checklists, and automated safety guards. The system should not yet be treated as fully production-autonomous, but the gap has narrowed significantly.

---

## Red-Team Vulnerability Remediation Status

All 10 vulnerabilities from `red_team_attack_paths_2026-04-04.md` have been resolved:

| # | Severity | Issue | Resolution |
|---|---|---|---|
| 1 | Critical | Direct state patch bypasses transition validation | `setProcState()` validates transitions; `forceSetProcState()` logs overrides |
| 2 | Critical | State-machine bypass via raw state.json edit | SHA-256 hash chain + `assertStateIntegrity()` at 8 tx-building entry points |
| 3 | Critical | Atomic write collision (.tmp) race corruption | Unique temp filenames across 6 files |
| 4 | Critical | Commit gate accepts failed fit decisions | Enforces `decision === "PASS"` exactly |
| 5 | High | Reveal gate accepts string truthy | All boolean fields use `=== true` strict checks |
| 6 | High | Monitor marks MISSED_WINDOW from stale status | Uses `transitionProcStatus()` with validation |
| 7 | High | State pruning deletes forensic history | Archive index written before deletion |
| 8 | High | Unsigned tx trusts MCP-prepared tx target | `normalizePreparedTx()` asserts contract address match |
| 9 | Medium-High | LLM call budget reset by state tamper | Append-only `llm_audit.json` with hash entries |
| 10 | Medium | Monitor swallows failures silently | Persistent `monitor_health.json` with FATAL escalation |

**10/10 resolved. 0 open.**

---

## Change Log (2026-04-05 Updates)

| Commit | What Changed |
|---|---|
| `eedea96` | AGIJobManager: state machine validation, receipt checks, freshness guards |
| `3cd12a8` | Prime: receipt-driven transitions for reveal, accept, completion |
| `f890efb` | Prime: reorg-aware cursors, idempotency, deadline guards |
